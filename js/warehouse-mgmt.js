// =====================================================
// 창고 재고 관리 시스템 (warehouse-mgmt.js)
// 저온창고(C) / 일반창고(W)
// 위치 코드: C-[구역번호]-[단]-[파렛트] / W-[구역번호]-[단]-[파렛트]
// v2.0 성능 최적화: whCalcStock 중복 호출 제거, new Date() 단일화, HTML 캐싱
// =====================================================

// ── 전역 상태 ──────────────────────────────────────
let whInboundData = [];
let whOutboundData = [];
let whStocktakeData = [];
let whCurrentMap = 'cold';

// ── 배치도 HTML 캐시 ──────────────────────────────
// 재고 데이터가 변경되지 않으면 이전 렌더링 결과를 재사용
let _whMapCache = { cold: null, warm: null, stockHash: null };
function whInvalidateMapCache() { _whMapCache.stockHash = null; }

// ── 저온창고(냉장창고) 위치 정의 ─────────────────────────────
// A구역: A1~A4, B구역: B1~B5, C구역: C1~C4, D구역: D1~D4, E구역: E1~E4
// 구역당 파렛트 2개 (예외: A1, B5 → 1개), 3단 적재 → 총 120PT
const COLD_ZONE_COUNTS = { A:4, B:5, C:4, D:4, E:4 };
const COLD_SINGLE_PALLET = ['A1','B5'];
const COLD_LOCATIONS = (function() {
  const locs = [];
  Object.entries(COLD_ZONE_COUNTS).forEach(function(entry) {
    var zone = entry[0], count = entry[1];
    for (var n = 1; n <= count; n++) {
      var zoneKey = zone + n;
      var pallets = COLD_SINGLE_PALLET.indexOf(zoneKey) >= 0 ? 1 : 2;
      for (var d = 1; d <= 3; d++) {
        for (var p = 1; p <= pallets; p++) {
          locs.push({
            code: 'C-' + zoneKey + '-' + d + '-' + p,
            zone: zone, zoneNo: n, zoneKey: zoneKey,
            level: d, slot: p, type: 'cold', capacity: 1
          });
        }
      }
    }
  });
  return locs;
})();

// ── 일반창고 위치 정의 ─────────────────────────────
// A구역: A1~A12, B구역: B1~B6, C구역: C1~C7, D구역: D1~D7, E구역: E1~E4
// 구역당 파렛트 2개, 예외(1개): A12, C4, D4, E4, 3단 적재 → 총 204PT
const WARM_ZONE_COUNTS = { A:12, B:6, C:7, D:7, E:4 };
const WARM_SINGLE_PALLET = ['A12','C4','D4','E4'];
const WARM_LOCATIONS = (function() {
  const locs = [];
  Object.entries(WARM_ZONE_COUNTS).forEach(function(entry) {
    var zone = entry[0], count = entry[1];
    for (var n = 1; n <= count; n++) {
      var zoneKey = zone + n;
      var pallets = WARM_SINGLE_PALLET.indexOf(zoneKey) >= 0 ? 1 : 2;
      for (var d = 1; d <= 3; d++) {
        for (var p = 1; p <= pallets; p++) {
          locs.push({
            code: 'W-' + zoneKey + '-' + d + '-' + p,
            zone: zone, zoneNo: n, zoneKey: zoneKey,
            level: d, slot: p, type: 'warm', capacity: 1
          });
        }
      }
    }
  });
  return locs;
})();

// ── 초기화 ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  var today = new Date().toISOString().split('T')[0];
  ['whin_date','whout_date','whst_date'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = today;
  });
  await whLoadAll();
  whInitLotNos();
});

async function whLoadAll() {
  try {
    var results = await Promise.all([
      apiGetAll('wh_inbound'),
      apiGetAll('wh_outbound'),
      apiGetAll('wh_stocktake')
    ]);
    whInboundData = results[0] || [];
    whOutboundData = results[1] || [];
    whStocktakeData = results[2] || [];

    // ── 최적화: stockMap을 1회만 계산하여 모든 함수에 전달 ──
    whInvalidateMapCache(); // 데이터 변경 시 캐시 무효화
    var stockMap = whCalcStock();
    whUpdateMapKpi(stockMap);
    whUpdateDashKpi(stockMap);
    whRenderInTable();
    whRenderOutTable();
    whRenderLedger(stockMap);
    whRenderStocktakeTable();

    var mapTab = document.getElementById('tabContent_wh_map');
    if (mapTab && mapTab.classList.contains('active')) {
      whShowMap(whCurrentMap, stockMap);
    }
  } catch(e) {
    console.error('[warehouse-mgmt] 데이터 로드 실패:', e);
  }
}

// ── Lot No 생성 ───────────────────────────────────
async function whInitLotNos() {
  var today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  var inPrefix = 'WH-IN-' + today;
  var outPrefix = 'WH-OUT-' + today;
  var inSeq = String((whInboundData.filter(function(r){ return r.lot_no && r.lot_no.startsWith(inPrefix); }).length) + 1).padStart(3,'0');
  var outSeq = String((whOutboundData.filter(function(r){ return r.lot_no && r.lot_no.startsWith(outPrefix); }).length) + 1).padStart(3,'0');
  var inEl = document.getElementById('whInLotDisplay');
  var outEl = document.getElementById('whOutLotDisplay');
  if (inEl) { inEl.textContent = inPrefix + '-' + inSeq; inEl.dataset.lot = inPrefix + '-' + inSeq; }
  if (outEl) { outEl.textContent = outPrefix + '-' + outSeq; outEl.dataset.lot = outPrefix + '-' + outSeq; }
}

async function whRefreshInLot() {
  var today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  var prefix = 'WH-IN-' + today;
  var fresh = await apiGetAll('wh_inbound');
  var seq = String((fresh.filter(function(r){ return r.lot_no && r.lot_no.startsWith(prefix); }).length) + 1).padStart(3,'0');
  var lot = prefix + '-' + seq;
  var el = document.getElementById('whInLotDisplay');
  if (el) { el.textContent = lot; el.dataset.lot = lot; }
}

async function whRefreshOutLot() {
  var today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  var prefix = 'WH-OUT-' + today;
  var fresh = await apiGetAll('wh_outbound');
  var seq = String((fresh.filter(function(r){ return r.lot_no && r.lot_no.startsWith(prefix); }).length) + 1).padStart(3,'0');
  var lot = prefix + '-' + seq;
  var el = document.getElementById('whOutLotDisplay');
  if (el) { el.textContent = lot; el.dataset.lot = lot; }
}

// ── 위치 선택 드롭다운 빌드 ───────────────────────
function whBuildLocationSelect(prefix) {
  var whEl = document.getElementById(prefix + '_warehouse');
  var locEl = document.getElementById(prefix + '_location');
  if (!whEl || !locEl) return;
  var wh = whEl.value;
  locEl.innerHTML = '<option value="">위치 선택</option>';
  if (!wh) return;
  var locs = wh === 'C' ? COLD_LOCATIONS : WARM_LOCATIONS;
  var zoneKeys = [];
  locs.forEach(function(l) { if (zoneKeys.indexOf(l.zoneKey) < 0) zoneKeys.push(l.zoneKey); });
  zoneKeys.forEach(function(zk) {
    var group = document.createElement('optgroup');
    group.label = (wh === 'C' ? '저온' : '일반') + ' ' + zk + '구역';
    locs.filter(function(l){ return l.zoneKey === zk; }).forEach(function(l) {
      var opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.code + '  (' + l.level + '단 ' + l.slot + '번파렛트)';
      group.appendChild(opt);
    });
    locEl.appendChild(group);
  });
}

// ── 재고 계산 ─────────────────────────────────────
function whCalcStock() {
  var stockMap = {};
  whInboundData.forEach(function(r) {
    if (!r.location) return;
    if (!stockMap[r.location]) stockMap[r.location] = {};
    var key = r.item_name || '미상';
    if (!stockMap[r.location][key]) {
      stockMap[r.location][key] = { qty: 0, unit: r.unit || '', expiry: r.expiry_date || '', lot: r.lot_no || '', inDate: r.inbound_date || '' };
    }
    stockMap[r.location][key].qty += Number(r.qty) || 0;
    if ((r.inbound_date || '') > stockMap[r.location][key].inDate) {
      stockMap[r.location][key].expiry = r.expiry_date || '';
      stockMap[r.location][key].lot = r.lot_no || '';
      stockMap[r.location][key].inDate = r.inbound_date || '';
    }
  });
  whOutboundData.forEach(function(r) {
    if (!r.location || !stockMap[r.location]) return;
    var key = r.item_name || '미상';
    if (stockMap[r.location][key]) {
      stockMap[r.location][key].qty -= Number(r.qty) || 0;
    }
  });
  return stockMap;
}

// ── 대시보드 KPI (전체현황 탭) ──────────────────────
// 최적화: stockMap을 인수로 받아 중복 계산 방지 (없으면 자체 계산)
function whUpdateDashKpi(stockMap) {
  stockMap = stockMap || whCalcStock();
  var today = new Date();
  var soon30 = new Date(today); soon30.setDate(today.getDate() + 30);
  var coldUsed = Object.keys(stockMap).filter(function(k) {
    return k.startsWith('C-') && Object.values(stockMap[k]).some(function(v){ return v.qty > 0; });
  }).length;
  var warmUsed = Object.keys(stockMap).filter(function(k) {
    return k.startsWith('W-') && Object.values(stockMap[k]).some(function(v){ return v.qty > 0; });
  }).length;
  var coldExpiry = 0, warmExpiry = 0;
  whInboundData.forEach(function(r) {
    if (!r.expiry_date) return;
    var exp = new Date(r.expiry_date);
    if (exp <= soon30 && exp >= today) {
      if ((r.warehouse || r.location || '').startsWith('C')) coldExpiry++;
      else warmExpiry++;
    }
  });
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  set('dashColdUsed', coldUsed);
  set('dashColdTotal', COLD_LOCATIONS.length);
  set('dashColdExpiry', coldExpiry);
  set('dashWarmUsed', warmUsed);
  set('dashWarmTotal', WARM_LOCATIONS.length);
  set('dashWarmExpiry', warmExpiry);
}

// ── KPI 업데이트 (창고현황 탭) ──────────────────────
// 최적화: stockMap을 인수로 받아 중복 계산 방지 (없으면 자체 계산)
function whUpdateMapKpi(stockMap) {
  stockMap = stockMap || whCalcStock();
  var today = new Date();
  var soon30 = new Date(today); soon30.setDate(today.getDate() + 30);
  var coldUsed = Object.keys(stockMap).filter(function(k) {
    return k.startsWith('C-') && Object.values(stockMap[k]).some(function(v){ return v.qty > 0; });
  }).length;
  var warmUsed = Object.keys(stockMap).filter(function(k) {
    return k.startsWith('W-') && Object.values(stockMap[k]).some(function(v){ return v.qty > 0; });
  }).length;
  var expirySoon = 0;
  var allItems = {};
  whInboundData.forEach(function(r) {
    if (r.item_name) allItems[r.item_name] = 1;
    if (r.expiry_date) {
      var exp = new Date(r.expiry_date);
      if (exp <= soon30 && exp >= today) expirySoon++;
    }
  });
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  set('whKpiColdUsed', coldUsed + ' / ' + COLD_LOCATIONS.length);
  set('whKpiWarmUsed', warmUsed + ' / ' + WARM_LOCATIONS.length);
  set('whKpiExpirySoon', expirySoon);
  set('whKpiTotalItems', Object.keys(allItems).length);
  var alertEl = document.getElementById('whExpiryAlert');
  var alertList = document.getElementById('whExpiryAlertList');
  if (alertEl && alertList) {
    var expItems = whInboundData.filter(function(r) {
      if (!r.expiry_date) return false;
      var exp = new Date(r.expiry_date);
      var diff = Math.ceil((exp - today) / (1000*60*60*24));
      return diff >= 0 && diff <= 30;
    }).sort(function(a,b){ return (a.expiry_date||'').localeCompare(b.expiry_date||''); });
    if (expItems.length > 0) {
      alertEl.style.display = '';
      alertList.innerHTML = expItems.slice(0,5).map(function(r) {
        var diff = Math.ceil((new Date(r.expiry_date) - today) / (1000*60*60*24));
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,193,7,0.3);font-size:13px">' +
          '<span><strong>' + (r.item_name||'-') + '</strong> (' + (r.location||'-') + ')</span>' +
          '<span style="color:#e74c3c;font-weight:700">D-' + diff + ' (' + r.expiry_date + ')</span>' +
          '</div>';
      }).join('');
    } else {
      alertEl.style.display = 'none';
    }
  }
}

// ── 창고 배치도 시각화 ────────────────────────────
// 최적화: stockMap 인수 전달 + HTML 캐싱 + 로딩 스켈레톤
function whShowMap(type, stockMap) {
  whCurrentMap = type;
  var container = document.getElementById('whMapContainer');
  if (!container) return;

  // 버튼 스타일 업데이트
  var coldBtn = document.getElementById('btnColdMap');
  var warmBtn = document.getElementById('btnWarmMap');
  if (coldBtn && warmBtn) {
    if (type === 'cold') {
      coldBtn.style.cssText = 'background:#e8f4fd;color:#2980b9;border:2px solid #2980b9;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer';
      warmBtn.style.cssText = 'background:#f8f9fa;color:#555;border:2px solid #ddd;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer';
    } else {
      warmBtn.style.cssText = 'background:#eafaf1;color:#27ae60;border:2px solid #27ae60;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer';
      coldBtn.style.cssText = 'background:#f8f9fa;color:#555;border:2px solid #ddd;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer';
    }
  }

  // ── 최적화 1: 로딩 스켈레톤 즉시 표시 ──
  container.innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:#aaa">' +
    '<i class="fas fa-spinner fa-spin" style="font-size:24px;color:#2980b9"></i>' +
    '<div style="margin-top:10px;font-size:13px">배치도 렌더링 중...</div>' +
    '</div>';

  // ── 최적화 2: stockMap을 외부에서 받아 중복 계산 방지 ──
  stockMap = stockMap || whCalcStock();

  // ── 최적화 3: 재고 변경이 없으면 캐시된 HTML 재사용 ──
  var hash = JSON.stringify(stockMap);
  if (_whMapCache.stockHash !== hash) {
    // 데이터가 변경된 경우에만 HTML 재생성
    _whMapCache.cold = whBuildColdMap(stockMap);
    _whMapCache.warm = whBuildWarmMap(stockMap);
    _whMapCache.stockHash = hash;
  }

  // requestAnimationFrame으로 렌더링을 브라우저 페인트 사이클에 맞춤
  requestAnimationFrame(function() {
    container.innerHTML = type === 'cold' ? _whMapCache.cold : _whMapCache.warm;
    whUpdateMapKpi(stockMap);
  });
}

function whGetSlotColor(stockMap, code) {
  var items = stockMap[code] || {};
  var hasStock = Object.values(items).some(function(v){ return (v.qty||0) > 0; });
  if (!hasStock) return { bg: '#e0e0e0', text: '#999', label: '공실' };
  var today = new Date();
  var hasExpiring = Object.values(items).some(function(v) {
    if (!v.expiry) return false;
    var diff = Math.ceil((new Date(v.expiry) - today) / (1000*60*60*24));
    return diff >= 0 && diff <= 30;
  });
  if (hasExpiring) return { bg: '#fff3cd', text: '#856404', label: '임박' };
  return { bg: '#d4edda', text: '#155724', label: '적재' };
}

function whBuildColdMap(stockMap) {
  // ── 최적화: new Date()를 함수 상단에서 1회만 생성 ──
  var today = new Date();

  function zoneBlock(zone, count) {
    var html = '';
    for (var n = 1; n <= count; n++) {
      var zk = zone + n;
      var pallets = COLD_SINGLE_PALLET.indexOf(zk) >= 0 ? 1 : 2;
      var totalSlots = pallets * 4;
      var used = 0;
      var hasExpiry = false;
      for (var d = 1; d <= 4; d++) {
        for (var p = 1; p <= pallets; p++) {
          var code = 'C-' + zk + '-' + d + '-' + p;
          var locItems = stockMap[code] || {};
          if (Object.values(locItems).some(function(v){ return (v.qty||0) > 0; })) used++;
          if (Object.values(locItems).some(function(v) {
            if (!v.expiry) return false;
            return Math.ceil((new Date(v.expiry) - today) / 86400000) <= 30;
          })) hasExpiry = true;
        }
      }
      var ratio = totalSlots > 0 ? used / totalSlots : 0;
      var bg = ratio === 0 ? '#e0e0e0' : ratio < 0.5 ? '#27ae60' : ratio < 1 ? '#f39c12' : '#e74c3c';
      var textColor = ratio === 0 ? '#999' : '#fff';
      var expiryDot = hasExpiry ? '<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:#e74c3c;border-radius:50%;display:block"></span>' : '';
      html += '<div onclick="whShowLocDetail(\'C-' + zk + '-1-1\')" title="' + zk + ': ' + used + '/' + totalSlots + '"' +
        ' style="position:relative;cursor:pointer;background:' + bg + ';border-radius:6px;padding:5px 7px;min-width:52px;text-align:center;border:2px solid transparent;transition:all 0.2s;margin:2px"' +
        ' onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.2)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        expiryDot +
        '<div style="font-size:11px;font-weight:700;color:' + textColor + '">' + zk + '</div>' +
        '<div style="font-size:9px;color:' + (ratio===0?'#bbb':'rgba(255,255,255,0.85)') + '">' + used + '/' + totalSlots + '</div>' +
        '</div>';
    }
    return html;
  }

  var totalSlots = COLD_LOCATIONS.length;
  var usedSlots = COLD_LOCATIONS.filter(function(l) {
    var items = stockMap[l.code] || {};
    return Object.values(items).some(function(v){ return (v.qty||0) > 0; });
  }).length;

  return '<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">' +
    '<div style="font-size:14px;font-weight:700;color:#2980b9;margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
    '<i class="fas fa-snowflake"></i> 저온창고(냉장창고) (C) — 3단 적재 · 총 ' + totalSlots + '슬롯 · 사용 ' + usedSlots + '슬롯</div>' +
    '<div style="background:#f0f7ff;border:2px solid #2980b9;border-radius:10px;padding:14px;position:relative">' +
    '<div style="margin-bottom:12px;background:#e3f2fd;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#1565c0;margin-bottom:6px">A구역 (1~4)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('A', 4) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#e8f4fd;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#2980b9;margin-bottom:6px">B구역 (1~5)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('B', 5) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#e0f0ff;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#0e6da8;margin-bottom:6px">C구역 (1~4)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('C', 4) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#d6eaf8;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#1a5276;margin-bottom:6px">D구역 (1~4)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('D', 4) + '</div></div>' +
    '<div style="margin-bottom:4px;background:#cce5f6;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#154360;margin-bottom:6px">E구역 (1~4)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('E', 4) + '</div></div>' +
    '<div style="position:absolute;bottom:-13px;left:50%;transform:translateX(-50%);background:#2C5F2E;color:#fff;font-size:11px;font-weight:700;padding:2px 14px;border-radius:20px">🚪 입구</div>' +
    '</div>' +
    '<div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;font-size:12px">' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e0e0e0;border-radius:3px;display:inline-block"></span>공실</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#27ae60;border-radius:3px;display:inline-block"></span>적재(50%미만)</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f39c12;border-radius:3px;display:inline-block"></span>여유(50~99%)</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e74c3c;border-radius:3px;display:inline-block"></span>만재</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#e74c3c;border-radius:50%;display:inline-block"></span>소비기한임박</span>' +
    '</div>' +
    '<div style="margin-top:6px;font-size:11px;color:#888">※ 각 구역 클릭 시 단별 상세 재고 확인 가능</div>' +
    '</div>';
}

function whBuildWarmMap(stockMap) {
  // ── 최적화: new Date()를 함수 상단에서 1회만 생성 ──
  var today = new Date();

  function zoneBlock(zone, count) {
    var html = '';
    for (var n = 1; n <= count; n++) {
      var zk = zone + n;
      var pallets = WARM_SINGLE_PALLET.indexOf(zk) >= 0 ? 1 : 2;
      var totalSlots = pallets * 3;
      var used = 0;
      var hasExpiry = false;
      for (var d = 1; d <= 3; d++) {
        for (var p = 1; p <= pallets; p++) {
          var code = 'W-' + zk + '-' + d + '-' + p;
          var locItems = stockMap[code] || {};
          if (Object.values(locItems).some(function(v){ return (v.qty||0) > 0; })) used++;
          if (Object.values(locItems).some(function(v) {
            if (!v.expiry) return false;
            return Math.ceil((new Date(v.expiry) - today) / 86400000) <= 30;
          })) hasExpiry = true;
        }
      }
      var ratio = totalSlots > 0 ? used / totalSlots : 0;
      var bg = ratio === 0 ? '#e0e0e0' : ratio < 0.5 ? '#27ae60' : ratio < 1 ? '#f39c12' : '#e74c3c';
      var textColor = ratio === 0 ? '#999' : '#fff';
      var expiryDot = hasExpiry ? '<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:#e74c3c;border-radius:50%;display:block"></span>' : '';
      html += '<div onclick="whShowLocDetail(\'W-' + zk + '-1-1\')" title="' + zk + ': ' + used + '/' + totalSlots + '"' +
        ' style="position:relative;cursor:pointer;background:' + bg + ';border-radius:6px;padding:5px 7px;min-width:52px;text-align:center;border:2px solid transparent;transition:all 0.2s;margin:2px"' +
        ' onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.2)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        expiryDot +
        '<div style="font-size:11px;font-weight:700;color:' + textColor + '">' + zk + '</div>' +
        '<div style="font-size:9px;color:' + (ratio===0?'#bbb':'rgba(255,255,255,0.85)') + '">' + used + '/' + totalSlots + '</div>' +
        '</div>';
    }
    return html;
  }

  var totalSlots = WARM_LOCATIONS.length;
  var usedSlots = WARM_LOCATIONS.filter(function(l) {
    var items = stockMap[l.code] || {};
    return Object.values(items).some(function(v){ return (v.qty||0) > 0; });
  }).length;

  return '<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">' +
    '<div style="font-size:14px;font-weight:700;color:#27ae60;margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
    '<i class="fas fa-warehouse"></i> 일반창고 (W) — 3단 적재 · 총 ' + totalSlots + '슬롯 · 사용 ' + usedSlots + '슬롯</div>' +
    '<div style="background:#f0fff4;border:2px solid #27ae60;border-radius:10px;padding:14px;position:relative">' +
    '<div style="margin-bottom:12px;background:#e8f5e9;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#1b5e20;margin-bottom:6px">A구역 (1~12)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('A', 12) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#e3f2fd;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#0d47a1;margin-bottom:6px">B구역 (1~6)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('B', 6) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#fff3e0;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#e65100;margin-bottom:6px">C구역 (1~7)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('C', 7) + '</div></div>' +
    '<div style="margin-bottom:12px;background:#f3e5f5;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#4a148c;margin-bottom:6px">D구역 (1~7)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('D', 7) + '</div></div>' +
    '<div style="margin-bottom:4px;background:#e0f7fa;border-radius:8px;padding:10px">' +
    '<div style="font-size:11px;font-weight:700;color:#006064;margin-bottom:6px">E구역 (1~4)</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + zoneBlock('E', 4) + '</div></div>' +
    '<div style="position:absolute;bottom:-13px;left:50%;transform:translateX(-50%);background:#2C5F2E;color:#fff;font-size:11px;font-weight:700;padding:2px 14px;border-radius:20px">🚪 입구</div>' +
    '</div>' +
    '<div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;font-size:12px">' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e0e0e0;border-radius:3px;display:inline-block"></span>공실</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#27ae60;border-radius:3px;display:inline-block"></span>적재(50%미만)</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f39c12;border-radius:3px;display:inline-block"></span>여유(50~99%)</span>' +
    '<span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e74c3c;border-radius:3px;display:inline-block"></span>만재</span>' +
    '</div>' +
    '<div style="margin-top:6px;font-size:11px;color:#888">※ 각 구역 클릭 시 단별 상세 재고 확인 가능</div>' +
    '</div>';
}

// ── 위치 상세 팝업 ────────────────────────────────
function whShowLocDetail(locCode) {
  // 최적화: stockMap 1회 계산
  var stockMap = whCalcStock();
  var parts = locCode.split('-');
  var wh = parts[0];
  var zoneKey = parts[1];
  var allLocs = wh === 'C' ? COLD_LOCATIONS : WARM_LOCATIONS;
  var zoneLocs = allLocs.filter(function(l){ return l.zoneKey === zoneKey; });
  var modal = document.getElementById('whLocDetailModal');
  var title = document.getElementById('whLocDetailTitle');
  var body = document.getElementById('whLocDetailBody');
  if (!modal || !title || !body) return;
  var whName = wh === 'C' ? '저온창고' : '일반창고';
  title.innerHTML = '<i class="fas fa-map-marker-alt"></i> ' + whName + ' ' + zoneKey + '구역 상세';
  var levels = 3; // 저온창고/일반창고 모두 3단 적재
  // 최적화: today를 루프 밖에서 1회 생성
  var today = new Date();
  var bodyHtml = '<div style="font-size:12px;color:#555;margin-bottom:12px"><b>' + whName + '</b> · <b>' + zoneKey + '구역</b> · ' + '3단' + ' 적재</div>';
  for (var d = 1; d <= levels; d++) {
    var lvLocs = zoneLocs.filter(function(l){ return l.level === d; });
    bodyHtml += '<div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:8px">';
    bodyHtml += '<div style="font-weight:700;font-size:12px;color:#555;margin-bottom:6px">' + d + '단</div>';
    bodyHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    lvLocs.forEach(function(l) {
      var items = stockMap[l.code] || {};
      var hasStock = Object.values(items).some(function(v){ return (v.qty||0) > 0; });
      var bg = hasStock ? '#d4edda' : '#f8f9fa';
      var border = hasStock ? '#27ae60' : '#dee2e6';
      var itemList = Object.entries(items).filter(function(e){ return (e[1].qty||0) > 0; }).map(function(e) {
        var diff = e[1].expiry ? Math.ceil((new Date(e[1].expiry) - today) / 86400000) : null;
        var expiryColor = diff !== null && diff <= 30 ? '#e74c3c' : '#555';
        return '<div style="font-size:11px"><b>' + e[0] + '</b> ' + e[1].qty + (e[1].unit||'') +
          (e[1].expiry ? ' <span style="color:' + expiryColor + '">(' + e[1].expiry + ')</span>' : '') +
          (e[1].lot ? ' <span style="color:#888">Lot:' + e[1].lot + '</span>' : '') + '</div>';
      }).join('');
      bodyHtml += '<div style="flex:1;min-width:120px;background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;padding:8px">' +
        '<div style="font-size:10px;font-weight:700;color:#555;margin-bottom:4px">' + l.code + '</div>' +
        (itemList || '<div style="font-size:11px;color:#aaa">공실</div>') +
        '</div>';
    });
    bodyHtml += '</div></div>';
  }
  body.innerHTML = bodyHtml;
  modal.classList.add('show');
}

// ── 입고 등록 ─────────────────────────────────────
async function whSubmitInbound() {
  var fields = ['whin_warehouse','whin_location','whin_item_name','whin_qty','whin_unit','whin_date'];
  var data = {};
  var valid = true;
  fields.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || !el.value.trim()) { valid = false; return; }
    data[id.replace('whin_','')] = el.value.trim();
  });
  if (!valid) { showToast('필수 항목을 모두 입력해주세요.', 'warning'); return; }
  var lotEl = document.getElementById('whInLotDisplay');
  data.lot_no = lotEl ? lotEl.dataset.lot || lotEl.textContent : '';
  data.inbound_date = data.date;
  data.expiry_date = (document.getElementById('whin_expiry') || {}).value || '';
  data.lot_no_product = (document.getElementById('whin_lot_no') || {}).value || '';
  data.supplier = (document.getElementById('whin_supplier') || {}).value || '';
  data.memo = (document.getElementById('whin_memo') || {}).value || '';
  try {
    await apiPost('wh_inbound', data);
    showToast('입고 등록 완료: ' + data.lot_no, 'success');
    whInvalidateMapCache(); // 캐시 무효화
    await whLoadAll();
    whRefreshInLot();
    var form = document.getElementById('whInboundForm');
    if (form) form.reset();
    var today = new Date().toISOString().split('T')[0];
    var dateEl = document.getElementById('whin_date');
    if (dateEl) dateEl.value = today;
  } catch(e) {
    showToast('입고 등록 실패: ' + e.message, 'error');
  }
}

// ── 입고 테이블 렌더 ──────────────────────────────
function whRenderInTable() {
  var tbody = document.getElementById('whInTableBody');
  if (!tbody) return;
  var data = whInboundData.slice().sort(function(a,b){ return (b.inbound_date||'').localeCompare(a.inbound_date||''); });
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:30px"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>등록된 입고 내역이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(function(r) {
    var rid = (r.id||'').replace(/'/g,"\\'");
    var rlot = (r.lot_no||'').replace(/'/g,"\\'");
    return '<tr>' +
      '<td>' + (r.lot_no||'-') + '</td>' +
      '<td>' + (r.inbound_date||'-') + '</td>' +
      '<td><span style="background:#e8f4fd;color:#2980b9;padding:2px 8px;border-radius:12px;font-size:11px">' + (r.warehouse==='C'?'저온':'일반') + '</span></td>' +
      '<td><code style="font-size:11px">' + (r.location||'-') + '</code></td>' +
      '<td><b>' + (r.item_name||'-') + '</b></td>' +
      '<td>' + (r.qty||0) + ' ' + (r.unit||'') + '</td>' +
      '<td>' + (r.expiry_date||'-') + '</td>' +
      '<td>' + (r.lot_no_product||'-') + '</td>' +
      '<td>' + (r.supplier||'-') + '</td>' +
      '<td>' + (r.manager||'-') + '</td>' +
      '<td>' +
        '<button class="btn btn-sm" onclick="whOpenInEditModal(\'' + rid + '\')" style="background:#eafaf1;color:#27ae60;border:1px solid #27ae60;padding:3px 8px;font-size:11px"><i class="fas fa-edit"></i></button>' +
        '<button class="btn btn-sm" onclick="whPrintLabel(\'' + rlot + '\')" style="background:#f8f9fa;color:#555;border:1px solid #ddd;padding:3px 8px;font-size:11px;margin-left:4px"><i class="fas fa-print"></i></button>' +
        '<button class="btn btn-sm" onclick="whDeleteInbound(\'' + rid + '\')" style="background:#fdedec;color:#e74c3c;border:1px solid #e74c3c;padding:3px 8px;font-size:11px;margin-left:4px"><i class="fas fa-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

async function whDeleteInbound(id) {
  if (!confirm('이 입고 기록을 삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_inbound', id);
    showToast('삭제 완료', 'success');
    whInvalidateMapCache();
    await whLoadAll();
    whRenderInTable();
  } catch(e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

// 입고 수정 모달 열기
function whOpenInEditModal(id) {
  var record = whInboundData.find(function(r){ return r.id === id; });
  if (!record) { showToast('해당 입고 기록을 찾을 수 없습니다.', 'warning'); return; }

  var sv = function(eid, v) {
    var el = document.getElementById(eid);
    if (el) el.value = v !== undefined && v !== null ? v : '';
  };

  sv('whInEditId', record.id);
  sv('whInEdit_date', record.inbound_date || '');
  sv('whInEdit_item_name', record.item_name || '');
  sv('whInEdit_qty', record.qty || '');
  sv('whInEdit_mfg_date', record.mfg_date || '');
  sv('whInEdit_expiry_date', record.expiry_date || '');
  sv('whInEdit_ref_lot', record.lot_no_product || '');
  sv('whInEdit_supplier', record.supplier || '');
  sv('whInEdit_temp', record.temp || '');
  sv('whInEdit_manager', record.manager || '');
  sv('whInEdit_memo', record.memo || '');

  // 창고구분 설정
  var whEl = document.getElementById('whInEdit_warehouse');
  if (whEl) {
    whEl.value = record.warehouse || 'C';
    whBuildLocationSelect('whInEdit');
  }
  // 위치 선택 (setTimeout으로 드롭다운 렌더링 후 설정)
  setTimeout(function() {
    sv('whInEdit_location', record.location || '');
  }, 150);

  // 입고유형 설정
  var typeEl = document.getElementById('whInEdit_type');
  if (typeEl) {
    var tv = record.inbound_type || record.type || '';
    for (var i = 0; i < typeEl.options.length; i++) {
      if (typeEl.options[i].value === tv) { typeEl.selectedIndex = i; break; }
    }
  }

  // 단위 설정
  var unitEl = document.getElementById('whInEdit_unit');
  if (unitEl) {
    for (var j = 0; j < unitEl.options.length; j++) {
      if (unitEl.options[j].value === (record.unit||'pallet')) { unitEl.selectedIndex = j; break; }
    }
  }

  var modal = document.getElementById('whInEditModal');
  if (modal) modal.classList.add('show');
}

function whCloseInEditModal() {
  var modal = document.getElementById('whInEditModal');
  if (modal) modal.classList.remove('show');
}

async function whSaveInEdit() {
  var id = (document.getElementById('whInEditId') || {}).value;
  if (!id) { showToast('수정할 기록을 찾을 수 없습니다.', 'warning'); return; }

  var required = [
    { id: 'whInEdit_warehouse', label: '창고구분' },
    { id: 'whInEdit_location', label: '보관위치' },
    { id: 'whInEdit_item_name', label: '품목명' },
    { id: 'whInEdit_qty', label: '수량' },
    { id: 'whInEdit_date', label: '입고일자' },
    { id: 'whInEdit_expiry_date', label: '소비기한' },
    { id: 'whInEdit_manager', label: '담당자' }
  ];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById(required[i].id);
    if (!el || !el.value.trim()) {
      showToast(required[i].label + '을(를) 입력해주세요.', 'warning');
      if (el) el.focus();
      return;
    }
  }

  var data = {
    warehouse: document.getElementById('whInEdit_warehouse').value,
    location: document.getElementById('whInEdit_location').value,
    inbound_date: document.getElementById('whInEdit_date').value,
    inbound_type: document.getElementById('whInEdit_type').value,
    item_name: document.getElementById('whInEdit_item_name').value.trim(),
    qty: Number(document.getElementById('whInEdit_qty').value),
    unit: document.getElementById('whInEdit_unit').value,
    mfg_date: (document.getElementById('whInEdit_mfg_date') || {}).value || '',
    expiry_date: document.getElementById('whInEdit_expiry_date').value,
    lot_no_product: (document.getElementById('whInEdit_ref_lot') || {}).value || '',
    supplier: (document.getElementById('whInEdit_supplier') || {}).value || '',
    temp: (document.getElementById('whInEdit_temp') || {}).value || '',
    manager: document.getElementById('whInEdit_manager').value.trim(),
    memo: (document.getElementById('whInEdit_memo') || {}).value || '',
    updated_at: Date.now()
  };

  var saveBtn = document.querySelector('#whInEditModal .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }
  try {
    await apiPut('wh_inbound', id, data);
    showToast('입고 정보가 수정되었습니다.', 'success');
    whCloseInEditModal();
    whInvalidateMapCache();
    await whLoadAll();
    whRenderInTable();
  } catch(err) {
    showToast('수정 실패: ' + err.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
  }
}

// ── 출고 등록 ─────────────────────────────────────
async function whSubmitOutbound() {
  var fields = ['whout_warehouse','whout_location','whout_item_name','whout_qty','whout_unit','whout_date'];
  var data = {};
  var valid = true;
  fields.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || !el.value.trim()) { valid = false; return; }
    data[id.replace('whout_','')] = el.value.trim();
  });
  if (!valid) { showToast('필수 항목을 모두 입력해주세요.', 'warning'); return; }
  var lotEl = document.getElementById('whOutLotDisplay');
  data.lot_no = lotEl ? lotEl.dataset.lot || lotEl.textContent : '';
  data.outbound_date = data.date;
  data.ref_lot = (document.getElementById('whout_ref_lot') || {}).value || '';
  data.destination = (document.getElementById('whout_destination') || {}).value || '';
  data.memo = (document.getElementById('whout_memo') || {}).value || '';
  // FIFO 재고 검증
  var stockMap = whCalcStock();
  var locStock = stockMap[data.location] || {};
  var itemStock = locStock[data.item_name] || { qty: 0 };
  if (itemStock.qty < Number(data.qty)) {
    showToast('재고 부족! 현재 재고: ' + itemStock.qty + (data.unit||''), 'warning');
    return;
  }
  try {
    await apiPost('wh_outbound', data);
    showToast('출고 등록 완료: ' + data.lot_no, 'success');
    whInvalidateMapCache(); // 캐시 무효화
    await whLoadAll();
    whRefreshOutLot();
    var form = document.getElementById('whOutboundForm');
    if (form) form.reset();
    var today = new Date().toISOString().split('T')[0];
    var dateEl = document.getElementById('whout_date');
    if (dateEl) dateEl.value = today;
  } catch(e) {
    showToast('출고 등록 실패: ' + e.message, 'error');
  }
}

// ── FIFO 가이드 ───────────────────────────────────
function whFifoGuide() {
  var itemName = (document.getElementById('whout_item_name') || {}).value || '';
  var resultEl = document.getElementById('whFifoResult');
  if (!resultEl) return;
  if (!itemName.trim()) { resultEl.style.display = 'none'; return; }
  var stockMap = whCalcStock();
  var candidates = [];
  Object.entries(stockMap).forEach(function(entry) {
    var locCode = entry[0], items = entry[1];
    if (items[itemName] && (items[itemName].qty||0) > 0) {
      candidates.push({ code: locCode, qty: items[itemName].qty, unit: items[itemName].unit, expiry: items[itemName].expiry, lot: items[itemName].lot });
    }
  });
  if (candidates.length === 0) {
    resultEl.style.display = '';
    resultEl.innerHTML = '<div style="color:#e74c3c">⚠️ "' + itemName + '" 재고가 없습니다.</div>';
    return;
  }
  candidates.sort(function(a,b){ return (a.expiry||'9999').localeCompare(b.expiry||'9999'); });
  var today = new Date();
  var html = '<div style="font-weight:700;color:#27ae60;margin-bottom:8px"><i class="fas fa-sort-amount-up"></i> FIFO 출고 권장 순서</div>';
  candidates.forEach(function(c, i) {
    var diff = c.expiry ? Math.ceil((new Date(c.expiry) - today) / 86400000) : null;
    var badge = i === 0 ? '<span style="background:#e74c3c;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px">우선출고</span>' : '';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">' +
      '<span style="font-size:13px;font-weight:700;color:#555">' + (i+1) + '.</span>' +
      '<code style="font-size:12px;background:#f0f7ff;padding:2px 6px;border-radius:4px">' + c.code + '</code>' +
      '<span style="font-size:12px">' + c.qty + (c.unit||'') + '</span>' +
      (c.expiry ? '<span style="font-size:11px;color:' + (diff!==null&&diff<=30?'#e74c3c':'#888') + '">소비기한: ' + c.expiry + (diff!==null?' (D-'+diff+')':'') + '</span>' : '') +
      badge +
      '<button onclick="document.getElementById(\'whout_location\').value=\'' + c.code + '\';document.getElementById(\'whFifoResult\').style.display=\'none\'" style="margin-left:auto;background:#27ae60;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">선택</button>' +
      '</div>';
  });
  resultEl.style.display = '';
  resultEl.innerHTML = html;
}

// ── 출고 테이블 렌더 ──────────────────────────────
function whRenderOutTable() {
  var tbody = document.getElementById('whOutTableBody');
  if (!tbody) return;
  var data = whOutboundData.slice().sort(function(a,b){ return (b.outbound_date||'').localeCompare(a.outbound_date||''); });
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#aaa;padding:30px"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>등록된 출고 내역이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(function(r) {
    return '<tr>' +
      '<td>' + (r.lot_no||'-') + '</td>' +
      '<td>' + (r.outbound_date||'-') + '</td>' +
      '<td><span style="background:#fef9e7;color:#f39c12;padding:2px 8px;border-radius:12px;font-size:11px">' + (r.warehouse==='C'?'저온':'일반') + '</span></td>' +
      '<td><code style="font-size:11px">' + (r.location||'-') + '</code></td>' +
      '<td><b>' + (r.item_name||'-') + '</b></td>' +
      '<td>' + (r.qty||0) + ' ' + (r.unit||'') + '</td>' +
      '<td>' + (r.ref_lot||'-') + '</td>' +
      '<td>' + (r.destination||'-') + '</td>' +
      '<td><button class="btn btn-sm" onclick="whDeleteOutbound(\'' + (r.id||'') + '\')" style="background:#fdedec;color:#e74c3c;border:1px solid #e74c3c;padding:3px 8px;font-size:11px"><i class="fas fa-trash"></i></button></td>' +
      '</tr>';
  }).join('');
}

async function whDeleteOutbound(id) {
  if (!confirm('이 출고 기록을 삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_outbound', id);
    showToast('삭제 완료', 'success');
    whInvalidateMapCache(); // 캐시 무효화
    await whLoadAll();
  } catch(e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

// ── 수불부 렌더 ───────────────────────────────────
// 최적화: stockMap을 인수로 받아 중복 계산 방지 (없으면 자체 계산)
function whRenderLedger(stockMap) {
  var tbody = document.getElementById('whLedgerBody');
  if (!tbody) return;
  stockMap = stockMap || whCalcStock();
  var rows = [];
  Object.entries(stockMap).forEach(function(entry) {
    var locCode = entry[0], items = entry[1];
    Object.entries(items).forEach(function(e) {
      var itemName = e[0], info = e[1];
      var inQty = 0, outQty = 0;
      whInboundData.filter(function(r){ return r.location === locCode && (r.item_name||'미상') === itemName; }).forEach(function(r){ inQty += Number(r.qty)||0; });
      whOutboundData.filter(function(r){ return r.location === locCode && (r.item_name||'미상') === itemName; }).forEach(function(r){ outQty += Number(r.qty)||0; });
      rows.push({ locCode: locCode, itemName: itemName, inQty: inQty, outQty: outQty, currentQty: info.qty, unit: info.unit, expiry: info.expiry, lot: info.lot });
    });
  });
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:30px">등록된 재고가 없습니다.</td></tr>';
    return;
  }
  // 최적화: today를 루프 밖에서 1회 생성
  var today = new Date();
  tbody.innerHTML = rows.map(function(r) {
    var diff = r.expiry ? Math.ceil((new Date(r.expiry) - today) / 86400000) : null;
    var expiryColor = diff !== null && diff <= 30 ? '#e74c3c' : '#555';
    return '<tr>' +
      '<td><code style="font-size:11px">' + r.locCode + '</code></td>' +
      '<td><b>' + r.itemName + '</b></td>' +
      '<td style="color:#27ae60">' + r.inQty + ' ' + (r.unit||'') + '</td>' +
      '<td style="color:#e74c3c">' + r.outQty + ' ' + (r.unit||'') + '</td>' +
      '<td style="font-weight:700">' + r.currentQty + ' ' + (r.unit||'') + '</td>' +
      '<td style="color:' + expiryColor + '">' + (r.expiry||'-') + (diff!==null?' (D-'+diff+')':'') + '</td>' +
      '<td>' + (r.lot||'-') + '</td>' +
      '</tr>';
  }).join('');
}

// ── 재고 실사 ─────────────────────────────────────
function whLoadStocktakeData() {
  var stockMap = whCalcStock();
  var tbody = document.getElementById('whStocktakeBody');
  if (!tbody) return;
  var allLocs = COLD_LOCATIONS.concat(WARM_LOCATIONS);
  var usedLocs = allLocs.filter(function(l) {
    var items = stockMap[l.code] || {};
    return Object.values(items).some(function(v){ return (v.qty||0) > 0; });
  });
  if (usedLocs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:30px">재고가 있는 위치가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = usedLocs.map(function(l) {
    var items = stockMap[l.code] || {};
    return Object.entries(items).filter(function(e){ return (e[1].qty||0) > 0; }).map(function(e) {
      var itemName = e[0], info = e[1];
      return '<tr>' +
        '<td><code style="font-size:11px">' + l.code + '</code></td>' +
        '<td><b>' + itemName + '</b></td>' +
        '<td style="font-weight:700;color:#2980b9">' + info.qty + ' ' + (info.unit||'') + '</td>' +
        '<td><input type="number" min="0" placeholder="실제수량" style="width:90px;padding:4px;border:1px solid #ddd;border-radius:4px" id="st_' + l.code.replace(/-/g,'_') + '_' + itemName.replace(/\s/g,'_') + '" /></td>' +
        '<td id="st_diff_' + l.code.replace(/-/g,'_') + '_' + itemName.replace(/\s/g,'_') + '" style="font-weight:700">-</td>' +
        '<td>' + (info.expiry||'-') + '</td>' +
        '</tr>';
    }).join('');
  }).join('');
}

function whCalcStocktakeDiff() {
  var rows = document.querySelectorAll('#whStocktakeBody tr');
  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length < 5) return;
    var sysQtyText = cells[2].textContent.trim().split(' ')[0];
    var sysQty = parseFloat(sysQtyText) || 0;
    var input = cells[3].querySelector('input');
    if (!input || input.value === '') return;
    var actualQty = parseFloat(input.value) || 0;
    var diff = actualQty - sysQty;
    var diffEl = cells[4];
    diffEl.textContent = (diff > 0 ? '+' : '') + diff;
    diffEl.style.color = diff === 0 ? '#27ae60' : '#e74c3c';
  });
}

async function whSubmitStocktake() {
  var dateEl = document.getElementById('whst_date');
  var date = dateEl ? dateEl.value : new Date().toISOString().split('T')[0];
  var rows = document.querySelectorAll('#whStocktakeBody tr');
  var records = [];
  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length < 5) return;
    var locCode = cells[0].textContent.trim();
    var itemName = cells[1].textContent.trim();
    var sysQty = parseFloat(cells[2].textContent.trim().split(' ')[0]) || 0;
    var input = cells[3].querySelector('input');
    if (!input || input.value === '') return;
    var actualQty = parseFloat(input.value) || 0;
    records.push({ location: locCode, item_name: itemName, sys_qty: sysQty, actual_qty: actualQty, diff: actualQty - sysQty, stocktake_date: date });
  });
  if (records.length === 0) { showToast('실사 수량을 입력해주세요.', 'warning'); return; }
  try {
    for (var i = 0; i < records.length; i++) {
      await apiPost('wh_stocktake', records[i]);
    }
    showToast('재고 실사 저장 완료 (' + records.length + '건)', 'success');
    whInvalidateMapCache(); // 캐시 무효화
    await whLoadAll();
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'error');
  }
}

function whRenderStocktakeTable() {
  var tbody = document.getElementById('whStocktakeHistBody');
  if (!tbody) return;
  var data = whStocktakeData.slice().sort(function(a,b){ return (b.stocktake_date||'').localeCompare(a.stocktake_date||''); });
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">실사 내역이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(function(r) {
    var diff = Number(r.diff) || 0;
    return '<tr>' +
      '<td>' + (r.stocktake_date||'-') + '</td>' +
      '<td><code style="font-size:11px">' + (r.location||'-') + '</code></td>' +
      '<td>' + (r.item_name||'-') + '</td>' +
      '<td>' + (r.sys_qty||0) + '</td>' +
      '<td>' + (r.actual_qty||0) + '</td>' +
      '<td style="font-weight:700;color:' + (diff===0?'#27ae60':'#e74c3c') + '">' + (diff>0?'+':'') + diff + '</td>' +
      '</tr>';
  }).join('');
}

async function whDeleteStocktake(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_stocktake', id);
    showToast('삭제 완료', 'success');
    await whLoadAll();
  } catch(e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

function whPrintStocktakeReport() {
  var rows = document.querySelectorAll('#whStocktakeBody tr');
  var diffRows = [];
  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length < 5) return;
    var diffText = cells[4].textContent.trim();
    if (diffText !== '-' && diffText !== '0') diffRows.push(row.outerHTML);
  });
  if (diffRows.length === 0) { showToast('차이가 발생한 항목이 없습니다.', 'info'); return; }
  var isMobile = window.innerWidth <= 768;
  // 데스크탑: 기존 window.open 방식 유지
  if (!isMobile) {
    var win = window.open('', '_blank');
    win.document.write('<html><head><title>재고 실사 조정 보고서</title>' +
      '<style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f8f9fa}h2{color:#2C5F2E}</style></head><body>' +
      '<h2>재고 실사 조정 보고서</h2>' +
      '<p>작성일: ' + new Date().toLocaleDateString('ko-KR') + ' | 차이 발생 항목: ' + diffRows.length + '건</p>' +
      '<table><thead><tr><th>위치코드</th><th>품목명</th><th>전산수량</th><th>실제수량</th><th>차이</th><th>소비기한</th></tr></thead><tbody>' +
      diffRows.join('') + '</tbody></table></body></html>');
    win.document.close();
    win.print();
    return;
  }
  // 모바일: 모달 내 미리보기
  var modalId = 'whStocktakeReportModal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();
  var m = document.createElement('div');
  m.id = modalId;
  m.className = 'modal-overlay show';
  m.innerHTML = '<div class="modal-dialog" style="max-width:700px">' +
    '<div class="modal-header"><h3><i class="fas fa-clipboard-check"></i> 재고 실사 조정 보고서</h3>' +
    '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove()"><i class="fas fa-times"></i></button></div>' +
    '<div class="modal-body" style="padding:16px">' +
    '<div style="font-size:12px;color:#666;margin-bottom:12px">작성일: ' + new Date().toLocaleDateString('ko-KR') + ' | 차이 발생 항목: ' + diffRows.length + '건</div>' +
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="background:#f8f9fa">' +
    '<th style="border:1px solid #ddd;padding:8px">위치코드</th>' +
    '<th style="border:1px solid #ddd;padding:8px">품목명</th>' +
    '<th style="border:1px solid #ddd;padding:8px">전산수량</th>' +
    '<th style="border:1px solid #ddd;padding:8px">실제수량</th>' +
    '<th style="border:1px solid #ddd;padding:8px">차이</th>' +
    '<th style="border:1px solid #ddd;padding:8px">소비기한</th>' +
    '</tr></thead><tbody>' + diffRows.join('') + '</tbody></table></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="window.print()" style="flex:1;padding:10px;background:#2C5F2E;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700"><i class="fas fa-print"></i> 인쇄</button>' +
    '<button onclick="document.getElementById(\'' + modalId + '\').remove()" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ddd;border-radius:8px;cursor:pointer">닫기</button>' +
    '</div></div></div>';
  document.body.appendChild(m);
}

// ── 라벨 출력 (제브라/빅솔론) ────────────────────
function whPrintLabel(lotNo) {
  var record = whInboundData.find(function(r){ return r.lot_no === lotNo; });
  if (!record) { showToast('해당 Lot No. 기록을 찾을 수 없습니다.', 'warning'); return; }
  var modal = document.getElementById('whLabelModal');
  if (!modal) {
    var m = document.createElement('div');
    m.id = 'whLabelModal';
    m.className = 'modal-overlay show';
    m.innerHTML = '<div class="modal-dialog" style="max-width:500px">' +
      '<div class="modal-header"><h3><i class="fas fa-print"></i> 라벨 출력</h3>' +
      '<button class="modal-close" onclick="document.getElementById(\'whLabelModal\').remove()"><i class="fas fa-times"></i></button></div>' +
      '<div class="modal-body" id="whLabelModalBody"></div></div>';
    document.body.appendChild(m);
  } else {
    modal.classList.add('show');
  }
  var body = document.getElementById('whLabelModalBody');
  if (!body) return;
  var qrData = encodeURIComponent(JSON.stringify({ lot: record.lot_no, loc: record.location, item: record.item_name, expiry: record.expiry_date }));
  body.innerHTML = '<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">' +
    '<div style="font-size:13px;margin-bottom:8px"><b>Lot No:</b> ' + (record.lot_no||'-') + '</div>' +
    '<div style="font-size:13px;margin-bottom:8px"><b>품목명:</b> ' + (record.item_name||'-') + '</div>' +
    '<div style="font-size:13px;margin-bottom:8px"><b>위치:</b> <code>' + (record.location||'-') + '</code></div>' +
    '<div style="font-size:13px;margin-bottom:8px"><b>수량:</b> ' + (record.qty||0) + ' ' + (record.unit||'') + '</div>' +
    '<div style="font-size:13px;margin-bottom:8px"><b>소비기한:</b> ' + (record.expiry_date||'-') + '</div>' +
    '<div style="font-size:13px;margin-bottom:8px"><b>공급업체:</b> ' + (record.supplier||'-') + '</div>' +
    '<div style="text-align:center;margin:12px 0"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + qrData + '" alt="QR" style="border-radius:4px"></div>' +
    '</div>' +
    '<div style="margin-bottom:12px">' +
    '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">프린터 선택</label>' +
    '<div style="display:flex;gap:8px">' +
    '<button onclick="whSendZplLabel(\'' + lotNo + '\')" style="flex:1;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700"><i class="fas fa-print"></i> 제브라 (ZPL)</button>' +
    '<button onclick="whSendEscPosLabel(\'' + lotNo + '\')" style="flex:1;padding:10px;background:#27ae60;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700"><i class="fas fa-print"></i> 빅솔론 (ESC/POS)</button>' +
    '</div></div>' +
    '<button onclick="whPrintBrowserLabel(\'' + lotNo + '\')" style="width:100%;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ddd;border-radius:8px;cursor:pointer"><i class="fas fa-globe"></i> 브라우저 인쇄</button>';
}

function whSendZplLabel(lotNo) {
  var record = whInboundData.find(function(r){ return r.lot_no === lotNo; });
  if (!record) return;
  var zpl = '^XA\n' +
    '^FO20,20^A0N,28,28^FD' + (record.item_name||'') + '^FS\n' +
    '^FO20,55^A0N,22,22^FDLot: ' + (record.lot_no||'') + '^FS\n' +
    '^FO20,80^A0N,22,22^FD위치: ' + (record.location||'') + '^FS\n' +
    '^FO20,105^A0N,22,22^FD소비기한: ' + (record.expiry_date||'') + '^FS\n' +
    '^FO20,130^A0N,22,22^FD수량: ' + (record.qty||0) + ' ' + (record.unit||'') + '^FS\n' +
    '^FO200,20^BQN,2,4^FDQA,' + lotNo + '^FS\n' +
    '^XZ';
  var blob = new Blob([zpl], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'label_' + lotNo + '.zpl'; a.click();
  URL.revokeObjectURL(url);
  showToast('ZPL 파일 다운로드 완료. 제브라 프린터로 전송하세요.', 'success');
}

function whSendEscPosLabel(lotNo) {
  var record = whInboundData.find(function(r){ return r.lot_no === lotNo; });
  if (!record) return;
  var text = '================================\n' +
    '  ' + (record.item_name||'') + '\n' +
    '--------------------------------\n' +
    'Lot: ' + (record.lot_no||'') + '\n' +
    '위치: ' + (record.location||'') + '\n' +
    '소비기한: ' + (record.expiry_date||'') + '\n' +
    '수량: ' + (record.qty||0) + ' ' + (record.unit||'') + '\n' +
    '================================\n';
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'label_' + lotNo + '.txt'; a.click();
  URL.revokeObjectURL(url);
  showToast('ESC/POS 파일 다운로드 완료. 빅솔론 프린터로 전송하세요.', 'success');
}

function whPrintBrowserLabel(lotNo) {
  var record = whInboundData.find(function(r){ return r.lot_no === lotNo; });
  if (!record) return;
  var qrData = encodeURIComponent(JSON.stringify({ lot: record.lot_no, loc: record.location, item: record.item_name, expiry: record.expiry_date }));
  var isMobile = window.innerWidth <= 768;
  // 데스크탑: 기존 window.open 방식 유지
  if (!isMobile) {
    var win = window.open('', '_blank', 'width=400,height=500');
    win.document.write('<html><head><title>창고 라벨</title>' +
      '<style>body{font-family:sans-serif;padding:20px;width:300px}h3{color:#2C5F2E;margin:0 0 10px}table{width:100%;font-size:13px}td{padding:3px 0}td:first-child{font-weight:700;width:80px}.qr{text-align:center;margin:10px 0}hr{border:1px dashed #ccc}</style></head><body>' +
      '<h3>📦 입고 라벨</h3><hr>' +
      '<table><tr><td>품목명</td><td>' + (record.item_name||'-') + '</td></tr>' +
      '<tr><td>Lot No.</td><td>' + (record.lot_no||'-') + '</td></tr>' +
      '<tr><td>위치</td><td>' + (record.location||'-') + '</td></tr>' +
      '<tr><td>수량</td><td>' + (record.qty||0) + ' ' + (record.unit||'') + '</td></tr>' +
      '<tr><td>소비기한</td><td>' + (record.expiry_date||'-') + '</td></tr>' +
      '<tr><td>공급업체</td><td>' + (record.supplier||'-') + '</td></tr></table>' +
      '<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=' + qrData + '" alt="QR"></div>' +
      '<hr><div style="font-size:10px;color:#888;text-align:center">라이프컬처 창고관리시스템</div>' +
      '</body></html>');
    win.document.close();
    setTimeout(function(){ win.print(); }, 500);
    return;
  }
  // 모바일: 모달 내 미리보기 + 인쇄 버튼
  var modalId = 'whBrowserLabelModal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();
  var m = document.createElement('div');
  m.id = modalId;
  m.className = 'modal-overlay show';
  m.innerHTML = '<div class="modal-dialog" style="max-width:380px">' +
    '<div class="modal-header"><h3><i class="fas fa-print"></i> 입고 라벨 미리보기</h3>' +
    '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove()"><i class="fas fa-times"></i></button></div>' +
    '<div class="modal-body" style="padding:16px">' +
    '<div style="border:2px dashed #2C5F2E;border-radius:8px;padding:16px;background:#fff;font-family:sans-serif">' +
    '<div style="font-size:14px;font-weight:700;color:#2C5F2E;margin-bottom:8px">📦 입고 라벨</div>' +
    '<table style="width:100%;font-size:13px;border-collapse:collapse">' +
    '<tr><td style="font-weight:700;width:80px;padding:3px 0">품목명</td><td>' + (record.item_name||'-') + '</td></tr>' +
    '<tr><td style="font-weight:700;padding:3px 0">Lot No.</td><td style="font-family:monospace">' + (record.lot_no||'-') + '</td></tr>' +
    '<tr><td style="font-weight:700;padding:3px 0">위치</td><td>' + (record.location||'-') + '</td></tr>' +
    '<tr><td style="font-weight:700;padding:3px 0">수량</td><td>' + (record.qty||0) + ' ' + (record.unit||'') + '</td></tr>' +
    '<tr><td style="font-weight:700;padding:3px 0">소비기한</td><td>' + (record.expiry_date||'-') + '</td></tr>' +
    '<tr><td style="font-weight:700;padding:3px 0">공급업체</td><td>' + (record.supplier||'-') + '</td></tr>' +
    '</table>' +
    '<div style="text-align:center;margin:12px 0"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + qrData + '" alt="QR" style="border-radius:4px"></div>' +
    '<div style="font-size:10px;color:#888;text-align:center">라이프컬처 창고관리시스템</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="window.print()" style="flex:1;padding:10px;background:#2C5F2E;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700"><i class="fas fa-print"></i> 인쇄</button>' +
    '<button onclick="document.getElementById(\'' + modalId + '\').remove()" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ddd;border-radius:8px;cursor:pointer">닫기</button>' +
    '</div></div></div>';
  document.body.appendChild(m);
}

// ── 위치 라벨 출력 ────────────────────────────────
function whPrintLocLabel(locCode) {
  var qrData = encodeURIComponent(locCode);
  var isMobile = window.innerWidth <= 768;
  // 데스크탑: 기존 window.open 방식 유지
  if (!isMobile) {
    var win = window.open('', '_blank', 'width=350,height=400');
    win.document.write('<html><head><title>위치 라벨</title>' +
      '<style>body{font-family:sans-serif;padding:20px;text-align:center}h3{color:#2980b9}.code{font-size:24px;font-weight:700;color:#2C5F2E;margin:10px 0}hr{border:1px dashed #ccc}</style></head><body>' +
      '<h3>📍 위치 라벨</h3><hr>' +
      '<div class="code">' + locCode + '</div>' +
      '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + qrData + '" alt="QR" style="margin:10px 0">' +
      '<hr><div style="font-size:10px;color:#888">라이프컬처 창고관리시스템</div>' +
      '</body></html>');
    win.document.close();
    setTimeout(function(){ win.print(); }, 500);
    return;
  }
  // 모바일: 모달 내 미리보기
  var modalId = 'whLocLabelModal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();
  var m = document.createElement('div');
  m.id = modalId;
  m.className = 'modal-overlay show';
  m.innerHTML = '<div class="modal-dialog" style="max-width:320px">' +
    '<div class="modal-header"><h3><i class="fas fa-map-marker-alt"></i> 위치 라벨 미리보기</h3>' +
    '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove()"><i class="fas fa-times"></i></button></div>' +
    '<div class="modal-body" style="padding:16px">' +
    '<div style="border:2px dashed #2980b9;border-radius:8px;padding:16px;background:#fff;text-align:center">' +
    '<div style="font-size:14px;font-weight:700;color:#2980b9;margin-bottom:8px">📍 위치 라벨</div>' +
    '<div style="font-size:28px;font-weight:700;color:#2C5F2E;margin:10px 0;font-family:monospace">' + locCode + '</div>' +
    '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + qrData + '" alt="QR" style="margin:10px 0;border-radius:4px">' +
    '<div style="font-size:10px;color:#888">라이프컬처 창고관리시스템</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="window.print()" style="flex:1;padding:10px;background:#2980b9;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700"><i class="fas fa-print"></i> 인쇄</button>' +
    '<button onclick="document.getElementById(\'' + modalId + '\').remove()" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ddd;border-radius:8px;cursor:pointer">닫기</button>' +
    '</div></div></div>';
  document.body.appendChild(m);
}

// ── 엑셀 내보내기 ─────────────────────────────────
function whExport(type) {
  var data = type === 'in' ? whInboundData : whOutboundData;
  if (data.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
  var headers = type === 'in' ?
    ['Lot No','입고일','창고','위치','품목명','수량','단위','소비기한','제조번호','공급업체','메모'] :
    ['Lot No','출고일','창고','위치','품목명','수량','단위','참조Lot','출고처','메모'];
  var rows = data.map(function(r) {
    if (type === 'in') return [r.lot_no,r.inbound_date,r.warehouse,r.location,r.item_name,r.qty,r.unit,r.expiry_date,r.lot_no_product,r.supplier,r.memo];
    return [r.lot_no,r.outbound_date,r.warehouse,r.location,r.item_name,r.qty,r.unit,r.ref_lot,r.destination,r.memo];
  });
  var csv = [headers].concat(rows).map(function(r){ return r.map(function(c){ return '"'+(c||'')+'"'; }).join(','); }).join('\n');
  var blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = (type==='in'?'입고':'출고') + '_' + new Date().toISOString().split('T')[0] + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── QR 스캔 출고 연동 ─────────────────────────────
function whOpenQrScanner() {
  var modal = document.getElementById('whQrScanModal');
  if (!modal) {
    var m = document.createElement('div');
    m.id = 'whQrScanModal';
    m.className = 'modal-overlay show';
    m.innerHTML = '<div class="modal-dialog" style="max-width:400px">' +
      '<div class="modal-header"><h3><i class="fas fa-qrcode"></i> QR/바코드 스캔</h3>' +
      '<button class="modal-close" onclick="whCloseQrScanner()"><i class="fas fa-times"></i></button></div>' +
      '<div class="modal-body">' +
      '<div id="whQrVideo" style="width:100%;background:#000;border-radius:8px;overflow:hidden;margin-bottom:12px;min-height:200px;display:flex;align-items:center;justify-content:center">' +
      '<video id="whQrVideoEl" style="width:100%" autoplay playsinline></video></div>' +
      '<div style="text-align:center;color:#555;font-size:13px;margin-bottom:12px">카메라로 QR코드 또는 바코드를 스캔하세요</div>' +
      '<div style="border-top:1px solid #eee;padding-top:12px">' +
      '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">직접 입력</label>' +
      '<div style="display:flex;gap:8px">' +
      '<input type="text" id="whQrManualInput" placeholder="Lot No. 또는 QR 데이터 입력" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px">' +
      '<button onclick="whProcessScan(document.getElementById(\'whQrManualInput\').value)" style="padding:8px 16px;background:#2C5F2E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700">확인</button>' +
      '</div></div>' +
      '<div id="whQrScanResult" style="display:none;margin-top:12px"></div>' +
      '</div></div>';
    document.body.appendChild(m);
    whStartBarcodeDetector();
  } else {
    modal.classList.add('show');
    whStartBarcodeDetector();
  }
}

function whCloseQrScanner() {
  var modal = document.getElementById('whQrScanModal');
  if (modal) modal.classList.remove('show');
  var video = document.getElementById('whQrVideoEl');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(function(t){ t.stop(); });
    video.srcObject = null;
  }
}

async function whStartBarcodeDetector() {
  var video = document.getElementById('whQrVideoEl');
  if (!video) return;
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    if ('BarcodeDetector' in window) {
      var detector = new BarcodeDetector({ formats: ['qr_code','code_128','code_39','ean_13','ean_8'] });
      var scan = async function() {
        if (!video.srcObject) return;
        try {
          var barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            whProcessScan(barcodes[0].rawValue);
            return;
          }
        } catch(e) {}
        requestAnimationFrame(scan);
      };
      video.addEventListener('loadedmetadata', function(){ requestAnimationFrame(scan); });
    }
  } catch(e) {
    var container = document.getElementById('whQrVideo');
    if (container) container.innerHTML = '<div style="color:#fff;padding:20px;text-align:center;font-size:13px">카메라 접근 불가<br>직접 입력을 이용해주세요</div>';
  }
}

function whProcessScan(rawValue) {
  if (!rawValue || !rawValue.trim()) return;
  var val = rawValue.trim();
  var resultEl = document.getElementById('whQrScanResult');
  try {
    var parsed = JSON.parse(decodeURIComponent(val));
    if (parsed.lot) {
      whCloseQrScanner();
      var locEl = document.getElementById('whout_location');
      var itemEl = document.getElementById('whout_item_name');
      var refEl = document.getElementById('whout_ref_lot');
      if (locEl) locEl.value = parsed.loc || '';
      if (itemEl) itemEl.value = parsed.item || '';
      if (refEl) refEl.value = parsed.lot || '';
      var whEl = document.getElementById('whout_warehouse');
      if (whEl && parsed.loc) {
        whEl.value = parsed.loc.startsWith('C') ? 'C' : 'W';
        whBuildLocationSelect('whout');
        setTimeout(function(){ if (locEl) locEl.value = parsed.loc; }, 100);
      }
      showToast('QR 스캔 완료: ' + parsed.lot, 'success');
      return;
    }
  } catch(e) {}
  var record = whInboundData.find(function(r){ return r.lot_no === val; });
  if (record) {
    whCloseQrScanner();
    var sv = function(id, v) { var el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    var wh = (record.location||'').startsWith('C') ? 'C' : 'W';
    var whEl2 = document.getElementById('whout_warehouse');
    if (whEl2) { whEl2.value = wh; whBuildLocationSelect('whout'); }
    setTimeout(function(){ sv('whout_location', record.location); }, 100);
    sv('whout_item_name', record.item_name);
    sv('whout_qty', record.qty);
    sv('whout_unit', record.unit);
    sv('whout_ref_lot', record.lot_no);
    showToast('Lot No. ' + val + ' 조회 완료', 'success');
  } else {
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = '<div style="color:#e74c3c">⚠️ "' + val + '"에 해당하는 입고 기록을 찾을 수 없습니다.</div>';
    }
    showToast('해당 Lot No. 또는 QR 코드를 찾을 수 없습니다.', 'warning');
  }
}

// ── 품목명 자동완성 (제품마스터 연동) ─────────────────
// 제품마스터 캐시
var _whProductMasterCache = null;
var _whProductMasterLoading = false;

async function whLoadProductMaster() {
  if (_whProductMasterCache !== null) return _whProductMasterCache;
  if (_whProductMasterLoading) {
    // 로딩 중이면 잠시 대기 후 재시도
    await new Promise(function(r){ setTimeout(r, 300); });
    return _whProductMasterCache || [];
  }
  _whProductMasterLoading = true;
  try {
    _whProductMasterCache = await apiGetAll('products');
  } catch(e) {
    _whProductMasterCache = [];
  }
  _whProductMasterLoading = false;
  return _whProductMasterCache || [];
}

// 입고유형 매핑: 제품마스터 product_type → whin_type 옵션값
var _whTypeMap = {
  '수입제품': '수입제품',
  '수입제품 (IMP)': '수입제품',
  'OEM': 'OEM제품',
  'OEM제품': 'OEM제품',
  '자체생산': '자체생산',
  '자체생산 (OWN)': '자체생산'
};

async function whItemNameFilter(query) {
  var dropdown = document.getElementById('whin_item_dropdown');
  if (!dropdown) return;

  var products = await whLoadProductMaster();
  var q = (query || '').trim().toLowerCase();

  // 검색어가 없으면 전체 목록 표시, 있으면 필터링
  var filtered = q
    ? products.filter(function(p) {
        return (p.product_name || '').toLowerCase().includes(q) ||
               (p.product_code || '').toLowerCase().includes(q);
      })
    : products;

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding:12px 14px;color:#aaa;font-size:13px">검색 결과 없음</div>';
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = filtered.slice(0, 30).map(function(p) {
    var typeBadge = '';
    var pt = p.product_type || '';
    if (pt.includes('수입')) typeBadge = '<span style="font-size:10px;background:#e8f4fd;color:#2980b9;padding:1px 6px;border-radius:8px;margin-left:6px">수입</span>';
    else if (pt.includes('OEM')) typeBadge = '<span style="font-size:10px;background:#fef9e7;color:#d68910;padding:1px 6px;border-radius:8px;margin-left:6px">OEM</span>';
    else if (pt.includes('자체')) typeBadge = '<span style="font-size:10px;background:#eafaf1;color:#1e8449;padding:1px 6px;border-radius:8px;margin-left:6px">자체</span>';

    var codeTxt = p.product_code ? '<span style="font-size:10px;color:#aaa;margin-left:4px">[' + p.product_code + ']</span>' : '';

        var nameAttr = (p.product_name || '').replace(/"/g, '&quot;');
    var typeAttr = (p.product_type || '').replace(/"/g, '&quot;');
    return '<div onclick="whSelectItemName(this)"' +
      ' data-name="' + nameAttr + '"' +
      ' data-type="' + typeAttr + '"' +
      ' style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:4px"' +
      ' onmouseover="this.style.background=\'#f0fff4\'" onmouseout="this.style.background=\'#fff\'">' +
      '<span style="font-weight:600;color:#222">' + (p.product_name || '-') + '</span>' +
      codeTxt + typeBadge +
      '</div>';
  }).join('');
  dropdown.style.display = 'block';
}

function whSelectItemName(el) {
  var productName = el ? el.getAttribute('data-name') : '';
  var productType = el ? el.getAttribute('data-type') : '';

  // 품목명 입력란에 선택한 제품명 설정
  var nameEl = document.getElementById('whin_item_name');
  if (nameEl) nameEl.value = productName;

  // 입고유형 자동 설정
  var typeEl = document.getElementById('whin_type');
  if (typeEl && productType) {
    var mapped = _whTypeMap[productType] || '';
    if (mapped) {
      for (var i = 0; i < typeEl.options.length; i++) {
        if (typeEl.options[i].value === mapped) {
          typeEl.selectedIndex = i;
          break;
        }
      }
    }
  }

  // 드롭다운 닫기
  var dropdown = document.getElementById('whin_item_dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

// ── 입고 폼 제출 핸들러 ────────────────────────────
async function whHandleInSubmit(e) {
  if (e) e.preventDefault();
  var required = [
    { id: 'whin_warehouse', label: '창고구분' },
    { id: 'whin_location', label: '보관위치' },
    { id: 'whin_item_name', label: '품목명' },
    { id: 'whin_qty', label: '수량' },
    { id: 'whin_date', label: '입고일자' },
    { id: 'whin_expiry_date', label: '소비기한' },
    { id: 'whin_manager', label: '담당자' }
  ];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById(required[i].id);
    if (!el || !el.value.trim()) {
      showToast(required[i].label + '을(를) 입력해주세요.', 'warning');
      if (el) el.focus();
      return;
    }
  }
  var lotEl = document.getElementById('whInLotDisplay');
  var data = {
    lot_no: lotEl ? (lotEl.dataset.lot || lotEl.textContent) : '',
    warehouse: document.getElementById('whin_warehouse').value,
    location: document.getElementById('whin_location').value,
    item_name: document.getElementById('whin_item_name').value.trim(),
    qty: Number(document.getElementById('whin_qty').value),
    unit: document.getElementById('whin_unit').value,
    inbound_date: document.getElementById('whin_date').value,
    inbound_type: document.getElementById('whin_type').value,
    mfg_date: (document.getElementById('whin_mfg_date') || {}).value || '',
    expiry_date: document.getElementById('whin_expiry_date').value,
    lot_no_product: (document.getElementById('whin_ref_lot') || {}).value || '',
    supplier: (document.getElementById('whin_supplier') || {}).value || '',
    temp: (document.getElementById('whin_temp') || {}).value || '',
    manager: document.getElementById('whin_manager').value.trim(),
    memo: (document.getElementById('whin_notes') || {}).value || ''
  };
  var submitBtn = document.querySelector('#whInForm button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }
  try {
    await apiPost('wh_inbound', data);
    showToast('입고 등록 완료: ' + data.lot_no, 'success');
    whInvalidateMapCache();
    await whLoadAll();
    whRefreshInLot();
    whResetInForm();
  } catch(err) {
    showToast('입고 등록 실패: ' + err.message, 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> 입고 등록'; }
  }
}

// ── 입고 폼 초기화 ────────────────────────────────
function whResetInForm() {
  var form = document.getElementById('whInForm');
  if (form) form.reset();
  // 날짜 기본값 복원
  var today = new Date().toISOString().split('T')[0];
  var dateEl = document.getElementById('whin_date');
  if (dateEl) dateEl.value = today;
  // 위치 드롭다운 초기화
  var locEl = document.getElementById('whin_location');
  if (locEl) locEl.innerHTML = '<option value="">창고 먼저 선택</option>';
  // 드롭다운 닫기
  var dropdown = document.getElementById('whin_item_dropdown');
  if (dropdown) dropdown.style.display = 'none';
  // 제품마스터 캐시 무효화 (최신 데이터 반영)
  _whProductMasterCache = null;
}

// ══════════════════════════════════════════════════
// 일괄 입고 등록 (인라인 테이블 + 엑셀 업로드)
// ══════════════════════════════════════════════════

var _whBulkRowCount = 0;

// 위치코드 목록 (창고 선택에 따라 동적 생성)
function _whGetLocOptions(wh) {
  var locs = wh === 'C' ? COLD_LOCATIONS : (wh === 'W' ? WARM_LOCATIONS : []);
  if (!locs || locs.length === 0) return '<option value="">위치 선택</option>';
  var html = '<option value="">위치 선택</option>';
  var zoneKeys = [];
  locs.forEach(function(l) { if (zoneKeys.indexOf(l.zoneKey) < 0) zoneKeys.push(l.zoneKey); });
  zoneKeys.forEach(function(zk) {
    html += '<optgroup label="' + (wh === 'C' ? '저온' : '일반') + ' ' + zk + '구역">';
    locs.filter(function(l){ return l.zoneKey === zk; }).forEach(function(l) {
      html += '<option value="' + l.code + '">' + l.code + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
}

// 행 HTML 생성
function _whBulkRowHtml(idx, data) {
  data = data || {};
  var wh = data.warehouse || '';
  var locOpts = _whGetLocOptions(wh);
  var today = new Date().toISOString().split('T')[0];
  var typeOpts = ['수입제품','OEM제품','자체생산','기타'].map(function(t) {
    return '<option value="' + t + '"' + (data.inbound_type === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');
  var unitOpts = ['pallet','box','ea','kg'].map(function(u) {
    return '<option value="' + u + '"' + ((data.unit||'pallet') === u ? ' selected' : '') + '>' + u + '</option>';
  }).join('');

  // 구역 자동 계산
  var zoneLabel = '';
  if (data.location) {
    var allLocs2 = (wh === 'C' ? COLD_LOCATIONS : WARM_LOCATIONS);
    var foundLoc = allLocs2.find(function(l){ return l.code === data.location; });
    if (foundLoc) zoneLabel = foundLoc.zoneKey + '구역';
  }

  return '<tr id="whBulkRow_' + idx + '" style="vertical-align:middle">' +
    '<td style="padding:4px 6px;border:1px solid #ddd;text-align:center;color:#aaa;font-size:11px">' + (idx + 1) + '</td>' +
    // 창고
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<select onchange="whBulkWarehouseChange(this,' + idx + ')" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px">' +
        '<option value=""' + (!wh ? ' selected' : '') + '>선택</option>' +
        '<option value="C"' + (wh === 'C' ? ' selected' : '') + '>❄️ 저온(C)</option>' +
        '<option value="W"' + (wh === 'W' ? ' selected' : '') + '>🏭 일반(W)</option>' +
      '</select>' +
    '</td>' +
    // 위치코드
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<select id="whBulkLoc_' + idx + '" onchange="whBulkUpdateZone(this,' + idx + ')" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px">' + locOpts + '</select>' +
    '</td>' +
    // 구역 (자동표시, 읽기전용)
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="text" id="whBulkZone_' + idx + '" value="' + zoneLabel + '" readonly placeholder="자동" style="width:100%;padding:4px;border:1px solid #e0e0e0;border-radius:4px;font-size:12px;background:#f8f9fa;color:#555;cursor:default" />' +
    '</td>' +
    // 입고일
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="date" value="' + (data.inbound_date || today) + '" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 품목명
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="text" value="' + (data.item_name || '') + '" placeholder="품목명" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 수량
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="number" value="' + (data.qty || '') + '" min="1" placeholder="0" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 단위
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<select style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px">' + unitOpts + '</select>' +
    '</td>' +
    // 소비기한
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="date" value="' + (data.expiry_date || '') + '" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 공급업체
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="text" value="' + (data.supplier || '') + '" placeholder="공급업체" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 담당자
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<input type="text" value="' + (data.manager || '') + '" placeholder="담당자" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px" />' +
    '</td>' +
    // 입고유형
    '<td style="padding:3px 4px;border:1px solid #ddd">' +
      '<select style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px">' + typeOpts + '</select>' +
    '</td>' +
    // 관리 (복사 + 삭제)
    '<td style="padding:3px 6px;border:1px solid #ddd;text-align:center;white-space:nowrap">' +
      '<button onclick="whBulkCopyRow(' + idx + ')" title="이 행 복사" style="background:#e8f4fd;color:#2980b9;border:1px solid #2980b9;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:11px"><i class="fas fa-copy"></i></button>' +
      '<button onclick="whBulkDeleteRow(' + idx + ')" title="행 삭제" style="background:#fdedec;color:#e74c3c;border:1px solid #e74c3c;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:11px;margin-left:3px"><i class="fas fa-times"></i></button>' +
    '</td>' +
    '</tr>';
}

// 행 추가
function whBulkAddRow(data) {
  var tbody = document.getElementById('whBulkBody');
  if (!tbody) return;
  var idx = _whBulkRowCount++;
  var div = document.createElement('tbody');
  div.innerHTML = _whBulkRowHtml(idx, data || {});
  var tr = div.firstChild;
  tbody.appendChild(tr);
  // 위치코드 선택 복원 (데이터 있을 때 - setTimeout 없이 즉시 설정)
  if (data && data.location) {
    var locEl = document.getElementById('whBulkLoc_' + idx);
    if (locEl) {
      locEl.value = data.location;
      // 구역도 즉시 업데이트
      var zoneEl = document.getElementById('whBulkZone_' + idx);
      if (zoneEl) {
        var allLocs = COLD_LOCATIONS.concat(WARM_LOCATIONS);
        var found = allLocs.find(function(l){ return l.code === data.location; });
        zoneEl.value = found ? found.zoneKey + '구역' : '';
      }
    }
  }
}

// 창고 변경 시 위치코드 드롭다운 재빌드 + 구역 초기화
function whBulkWarehouseChange(sel, idx) {
  var wh = sel.value;
  var locEl = document.getElementById('whBulkLoc_' + idx);
  if (locEl) locEl.innerHTML = _whGetLocOptions(wh);
  var zoneEl = document.getElementById('whBulkZone_' + idx);
  if (zoneEl) zoneEl.value = '';
}

// 위치코드 선택 시 구역 자동 표시
function whBulkUpdateZone(locSel, idx) {
  var code = locSel.value;
  var zoneEl = document.getElementById('whBulkZone_' + idx);
  if (!zoneEl) return;
  if (!code) { zoneEl.value = ''; return; }
  // 두 창고 모두에서 검색
  var allLocs = COLD_LOCATIONS.concat(WARM_LOCATIONS);
  var found = allLocs.find(function(l){ return l.code === code; });
  zoneEl.value = found ? found.zoneKey + '구역' : '';
}

// 행 복사
function whBulkCopyRow(idx) {
  var tr = document.getElementById('whBulkRow_' + idx);
  if (!tr) return;
  // td 인덱스 기반으로 읽기
  var d = _whBulkReadRow(tr);
  whBulkAddRow(d);
  showToast('행이 복사되었습니다.', 'success');
}

// 행 삭제
function whBulkDeleteRow(idx) {
  var tr = document.getElementById('whBulkRow_' + idx);
  if (tr) tr.remove();
}

// 전체 초기화
function whBulkClearAll() {
  if (!confirm('일괄 입력 내용을 모두 초기화하시겠습니까?')) return;
  var tbody = document.getElementById('whBulkBody');
  if (tbody) tbody.innerHTML = '';
  _whBulkRowCount = 0;
  whBulkAddRow();
}

// 행에서 데이터 읽기 - td 인덱스 기반 (가장 안전한 방식)
// TD 순서: 0=#, 1=창고, 2=위치코드, 3=구역, 4=입고일, 5=품목명, 6=수량, 7=단위, 8=소비기한, 9=공급업체, 10=담당자, 11=입고유형, 12=관리
function _whBulkReadRow(tr) {
  var tds = tr.querySelectorAll('td');
  function getVal(tdIdx) {
    if (!tds[tdIdx]) return '';
    var el = tds[tdIdx].querySelector('input, select');
    return el ? el.value : '';
  }
  function getValTrim(tdIdx) {
    return getVal(tdIdx).trim();
  }
  return {
    warehouse:    getVal(1),
    location:     getVal(2),
    // td[3] = 구역 (readonly, 저장 불필요)
    inbound_date: getVal(4),
    item_name:    getValTrim(5),
    qty:          Number(getVal(6)) || 0,
    unit:         getVal(7) || 'pallet',
    expiry_date:  getVal(8),
    supplier:     getValTrim(9),
    manager:      getValTrim(10),
    inbound_type: getVal(11) || '수입제품'
  };
}

// 전체 등록
async function whBulkSubmitAll() {
  var tbody = document.getElementById('whBulkBody');
  if (!tbody) return;
  var rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) { showToast('등록할 행이 없습니다.', 'warning'); return; }

  var records = [];
  var errors = [];
  rows.forEach(function(tr, i) {
    var d = _whBulkReadRow(tr);
    if (!d.warehouse) { errors.push((i+1) + '행: 창고구분 필수'); return; }
    if (!d.location) { errors.push((i+1) + '행: 위치코드 필수'); return; }
    if (!d.inbound_date) { errors.push((i+1) + '행: 입고일 필수'); return; }
    if (!d.item_name) { errors.push((i+1) + '행: 품목명 필수'); return; }
    if (!d.qty || d.qty < 1) { errors.push((i+1) + '행: 수량 필수(1 이상)'); return; }
    if (!d.expiry_date) { errors.push((i+1) + '행: 소비기한 필수'); return; }
    if (!d.manager) { errors.push((i+1) + '행: 담당자 필수'); return; }
    records.push(d);
  });

  if (errors.length > 0) {
    showToast('입력 오류:\n' + errors.slice(0,3).join('\n') + (errors.length > 3 ? '\n...외 ' + (errors.length-3) + '건' : ''), 'warning');
    return;
  }

  if (!confirm(records.length + '건을 일괄 등록하시겠습니까?')) return;

  var btn = document.querySelector('[onclick="whBulkSubmitAll()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }

  // Lot No 시작 번호 계산
  var today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  var prefix = 'WH-IN-' + today;
  var fresh = await apiGetAll('wh_inbound');
  var seq = (fresh.filter(function(r){ return r.lot_no && r.lot_no.startsWith(prefix); }).length) + 1;

  var successCount = 0;
  var failCount = 0;
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var lotNo = prefix + '-' + String(seq + i).padStart(3, '0');
    var payload = {
      lot_no: lotNo,
      warehouse: r.warehouse,
      location: r.location,
      inbound_date: r.inbound_date,
      inbound_type: r.inbound_type,
      item_name: r.item_name,
      qty: r.qty,
      unit: r.unit,
      expiry_date: r.expiry_date,
      supplier: r.supplier,
      manager: r.manager,
      created_at: Date.now()
    };
    try {
      await apiPost('wh_inbound', payload);
      successCount++;
    } catch(e) {
      failCount++;
    }
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 전체 등록'; }

  if (successCount > 0) {
    showToast(successCount + '건 등록 완료' + (failCount > 0 ? ' (' + failCount + '건 실패)' : ''), 'success');
    whInvalidateMapCache();
    await whLoadAll();
    whRenderInTable();
    whRefreshInLot();
    // 등록 완료 후 테이블 초기화
    var tbody2 = document.getElementById('whBulkBody');
    if (tbody2) tbody2.innerHTML = '';
    _whBulkRowCount = 0;
    whBulkAddRow();
  } else {
    showToast('등록에 실패했습니다.', 'error');
  }
}

// ── 엑셀 양식 다운로드 ────────────────────────────
function whBulkDownloadTemplate() {
  if (typeof XLSX === 'undefined') { showToast('엑셀 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'warning'); return; }

    var headers = ['창고(C=저온/W=일반)', '위치코드', '구역', '입고일(YYYY-MM-DD)', '품목명', '수량', '단위(pallet/box/ea/kg)', '소비기한(YYYY-MM-DD)', '공급업체', '담당자', '입고유형(수입제품/OEM제품/자체생산/기타)'];
  var examples = [
    ['C', 'C-A1-1-1', 'A구역', '2026-06-12', '제품명 예시', 10, 'pallet', '2027-06-12', '공급업체명', '홍길동', '수입제품'],
    ['W', 'W-A1-1-1', 'A구역', '2026-06-12', '제품명 예시2', 5, 'box', '2027-12-31', '공급업체명2', '김철수', 'OEM제품']
  ];
  var wb = XLSX.utils.book_new();
  var wsData = [headers].concat(examples);
  var ws = XLSX.utils.aoa_to_sheet(wsData);
  // 열 너비 설정 (11열)
  ws['!cols'] = [
    {wch:16},{wch:14},{wch:10},{wch:18},{wch:24},{wch:8},{wch:20},{wch:18},{wch:16},{wch:12},{wch:30}
  ];

  // 헤더 스타일 (배경색)
  var range = XLSX.utils.decode_range(ws['!ref']);
  for (var c = range.s.c; c <= range.e.c; c++) {
    var cellAddr = XLSX.utils.encode_cell({r: 0, c: c});
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      fill: { fgColor: { rgb: 'D5F5E3' } },
      font: { bold: true },
      alignment: { horizontal: 'center' }
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, '창고입고양식');

  // 위치코드 안내 시트
  var locHeaders = ['창고', '위치코드', '구역'];
  var locData = [locHeaders];
  COLD_LOCATIONS.forEach(function(l) { locData.push(['C (저온)', l.code, l.zoneKey + '구역']); });
  WARM_LOCATIONS.forEach(function(l) { locData.push(['W (일반)', l.code, l.zoneKey + '구역']); });
  var wsLoc = XLSX.utils.aoa_to_sheet(locData);
  wsLoc['!cols'] = [{wch:12},{wch:16},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsLoc, '위치코드목록');

  XLSX.writeFile(wb, '창고입고양식_' + new Date().toISOString().split('T')[0] + '.xlsx');
  showToast('엑셀 양식이 다운로드되었습니다.', 'success');
}

// ── 엑셀 파일 드롭/업로드 처리 ───────────────────
function whBulkHandleDrop(event) {
  event.preventDefault();
  var zone = document.getElementById('whBulkDropZone');
  if (zone) zone.classList.remove('dragover');
  var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) whBulkHandleFile(file);
}

function whBulkHandleFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('엑셀 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'warning'); return; }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) { showToast('데이터가 없습니다. 양식을 확인해주세요.', 'warning'); return; }

      // 헤더 행 제거 후 데이터 파싱
      var dataRows = rows.slice(1).filter(function(r) {
        return r.some(function(c){ return c !== '' && c !== null && c !== undefined; });
      });

      if (dataRows.length === 0) { showToast('입력된 데이터가 없습니다.', 'warning'); return; }

      // 기존 테이블 초기화
      var tbody = document.getElementById('whBulkBody');
      if (tbody) tbody.innerHTML = '';
      _whBulkRowCount = 0;

      var added = 0;
      dataRows.forEach(function(r) {
        // 날짜 처리 (Date 객체 또는 문자열)
        function fmtDate(v) {
          if (!v) return '';
          if (v instanceof Date) return v.toISOString().split('T')[0];
          var s = String(v).trim();
          // YYYYMMDD 형식 처리
          if (/^\d{8}$/.test(s)) return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
          return s;
        }
        // 콜럼 순서: A=창고(0), B=위치코드(1), C=구역(2), D=입고일(3), E=품목명(4), F=수량(5), G=단위(6), H=소비기한(7), I=공급업체(8), J=담당자(9), K=입고유형(10)
        var d = {
          warehouse: String(r[0] || '').trim().toUpperCase(),
          location: String(r[1] || '').trim().toUpperCase(),
          // r[2] = 구역 (자동표시용, 저장에 불필요)
          inbound_date: fmtDate(r[3]),
          item_name: String(r[4] || '').trim(),
          qty: Number(r[5]) || '',
          unit: String(r[6] || 'pallet').trim(),
          expiry_date: fmtDate(r[7]),
          supplier: String(r[8] || '').trim(),
          manager: String(r[9] || '').trim(),
          inbound_type: String(r[10] || '수입제품').trim()
        };
        whBulkAddRow(d);
        added++;
      });

      showToast(added + '건의 데이터를 불러왔습니다. 확인 후 [전체 등록]을 눌러주세요.', 'success');
    } catch(err) {
      showToast('파일 읽기 오류: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);

  // input 초기화 (같은 파일 재업로드 가능하도록)
  var fi = document.getElementById('whBulkFileInput');
  if (fi) fi.value = '';
}

// 탭 전환 시 일괄 입력 테이블 초기화 (첫 진입 시 빈 행 1개 추가)
function whInitBulkTable() {
  var tbody = document.getElementById('whBulkBody');
  if (tbody && tbody.children.length === 0) {
    _whBulkRowCount = 0;
    whBulkAddRow();
  }
}
