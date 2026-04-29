// =====================================================
// 창고 재고 관리 시스템 (warehouse-mgmt.js)
// 저온창고(C) / 일반창고(W)
// 위치 코드: C-[구역]-[렉]-[단]-[칸] / W-[구역][렉]-[칸]
// =====================================================

// ── 전역 상태 ──────────────────────────────────────
let whInboundData = [];
let whOutboundData = [];
let whStocktakeData = [];
let whCurrentMap = 'cold'; // 'cold' | 'warm'

// ── 저온창고 위치 정의 ─────────────────────────────
// 구역 A~F, 각 구역번호 A1~A6, B1~B4, C1~C6, D1~D4, E1~E6, F1~F6
// 구역당 파렛트 2개 (예외: A1, F1 → 1개), 4단 적재
// 코드: C-A1-1-1 (저온창고 A1구역 1단 1번 파렛트)
const COLD_ZONE_COUNTS = { A:6, B:4, C:6, D:4, E:6, F:6 };
const COLD_SINGLE_PALLET = ['A1','F1']; // 파렛트 1개인 예외 구역
const COLD_LOCATIONS = (function() {
  const locs = [];
  Object.entries(COLD_ZONE_COUNTS).forEach(([zone, count]) => {
    for (let n = 1; n <= count; n++) {
      const zoneKey = `${zone}${n}`;
      const pallets = COLD_SINGLE_PALLET.includes(zoneKey) ? 1 : 2;
      for (let d = 1; d <= 4; d++) {
        for (let p = 1; p <= pallets; p++) {
          locs.push({
            code: `C-${zoneKey}-${d}-${p}`,
            zone, zoneNo: n, zoneKey,
            level: d, slot: p,
            type: 'cold', capacity: 1
          });
        }
      }
    }
  });
  return locs;
})();

// ── 일반창고 위치 정의 ─────────────────────────────
// A:1~6, B:1~4, C:1~10, D:1~4, E:1~7, F:1~7
// 구역당 파렛트 2개, 예외(1개): A5, C10, E4, F4
// 3단 적재
// 코드: W-A1-1-1 (일반창고 A1구역 1단 1번 파렛트)
const WARM_ZONE_COUNTS = { A:6, B:4, C:10, D:4, E:7, F:7 };
const WARM_SINGLE_PALLET = ['A5','C10','E4','F4']; // 파렛트 1개인 예외 구역
const WARM_LOCATIONS = (function() {
  const locs = [];
  Object.entries(WARM_ZONE_COUNTS).forEach(([zone, count]) => {
    for (let n = 1; n <= count; n++) {
      const zoneKey = `${zone}${n}`;
      const pallets = WARM_SINGLE_PALLET.includes(zoneKey) ? 1 : 2;
      for (let d = 1; d <= 3; d++) {
        for (let p = 1; p <= pallets; p++) {
          locs.push({
            code: `W-${zoneKey}-${d}-${p}`,
            zone, zoneNo: n, zoneKey,
            level: d, slot: p,
            type: 'warm', capacity: 1
          });
        }
      }
    }
  });
  return locs;
})();

// ── 초기화 ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date().toISOString().split('T')[0];
  ['whin_date', 'whout_date', 'whst_date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  await whLoadAll();
  whInitLotNos();
});

async function whLoadAll() {
  try {
    const [inData, outData, stData] = await Promise.all([
      apiGetAll('wh_inbound'),
      apiGetAll('wh_outbound'),
      apiGetAll('wh_stocktake'),
    ]);
    whInboundData = inData || [];
    whOutboundData = outData || [];
    whStocktakeData = stData || [];
    whUpdateMapKpi();
    whRenderInTable();
    whRenderOutTable();
    whRenderLedger();
    whRenderStocktakeTable();
    // 현재 탭이 wh_map이면 지도 렌더
    if (document.getElementById('tabContent_wh_map')?.classList.contains('active')) {
      whShowMap(whCurrentMap);
    }
  } catch(e) {
    console.error('[warehouse-mgmt] 데이터 로드 실패:', e);
  }
}

// ── Lot No 생성 ───────────────────────────────────
async function whInitLotNos() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  const inPrefix = `WH-IN-${today}`;
  const outPrefix = `WH-OUT-${today}`;
  const inSeq = String((whInboundData.filter(r => r.lot_no && r.lot_no.startsWith(inPrefix)).length) + 1).padStart(3,'0');
  const outSeq = String((whOutboundData.filter(r => r.lot_no && r.lot_no.startsWith(outPrefix)).length) + 1).padStart(3,'0');
  const inEl = document.getElementById('whInLotDisplay');
  const outEl = document.getElementById('whOutLotDisplay');
  if (inEl) { inEl.textContent = `${inPrefix}-${inSeq}`; inEl.dataset.lot = `${inPrefix}-${inSeq}`; }
  if (outEl) { outEl.textContent = `${outPrefix}-${outSeq}`; outEl.dataset.lot = `${outPrefix}-${outSeq}`; }
}

async function whRefreshInLot() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  const prefix = `WH-IN-${today}`;
  const fresh = await apiGetAll('wh_inbound');
  const seq = String((fresh.filter(r => r.lot_no && r.lot_no.startsWith(prefix)).length) + 1).padStart(3,'0');
  const lot = `${prefix}-${seq}`;
  const el = document.getElementById('whInLotDisplay');
  if (el) { el.textContent = lot; el.dataset.lot = lot; }
}

async function whRefreshOutLot() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g,'').slice(2);
  const prefix = `WH-OUT-${today}`;
  const fresh = await apiGetAll('wh_outbound');
  const seq = String((fresh.filter(r => r.lot_no && r.lot_no.startsWith(prefix)).length) + 1).padStart(3,'0');
  const lot = `${prefix}-${seq}`;
  const el = document.getElementById('whOutLotDisplay');
  if (el) { el.textContent = lot; el.dataset.lot = lo// ── 위치 선택 드롭다운 빌드 ───────────────────────────────
// 구역번호 그룹화: C-A1, C-A2 ... / W-A1, W-A2 ...
function whBuildLocationSelect(prefix) {
  const whEl = document.getElementById(`${prefix}_warehouse`);
  const locEl = document.getElementById(`${prefix}_location`);
  if (!whEl || !locEl) return;
  const wh = whEl.value;
  locEl.innerHTML = '<option value="">위치 선택</option>';
  if (!wh) return;
  const locs = wh === 'C' ? COLD_LOCATIONS : WARM_LOCATIONS;
  // 구역번호(zoneKey)별로 그룹화
  const zoneKeys = [...new Set(locs.map(l => l.zoneKey))];
  zoneKeys.forEach(zk => {
    const group = document.createElement('optgroup');
    group.label = `${wh === 'C' ? '저온' : '일반'} ${zk}구역`;
    locs.filter(l => l.zoneKey === zk).forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      const levels = wh === 'C' ? 4 : 3;
      opt.textContent = `${l.code}  (${l.level}단 ${l.slot}번파렛트)`;
      group.appendChild(opt);
    });
    locEl.appendChild(group);
  });
}

// ── 재고 계산 (위치별 현재 재고) ─────────────────
function whCalcStock() {
  // 위치별 품목별 재고 맵: { locCode: { itemName: { qty, unit, expiry, lot, inDate } } }
  const stockMap = {};
  whInboundData.forEach(r => {
    if (!r.location) return;
    if (!stockMap[r.location]) stockMap[r.location] = {};
    const key = r.item_name || '미상';
    if (!stockMap[r.location][key]) {
      stockMap[r.location][key] = { qty: 0, unit: r.unit || '', expiry: r.expiry_date || '', lot: r.lot_no || '', inDate: r.inbound_date || '' };
    }
    stockMap[r.location][key].qty += Number(r.qty) || 0;
    // 가장 최근 입고 정보 유지
    if ((r.inbound_date || '') > stockMap[r.location][key].inDate) {
      stockMap[r.location][key].expiry = r.expiry_date || '';
      stockMap[r.location][key].lot = r.lot_no || '';
      stockMap[r.location][key].inDate = r.inbound_date || '';
    }
  });
  whOutboundData.forEach(r => {
    if (!r.location) return;
    if (!stockMap[r.location]) return;
    const key = r.item_name || '미상';
    if (stockMap[r.location][key]) {
      stockMap[r.location][key].qty -= Number(r.qty) || 0;
    }
  });
  return stockMap;
}
// ── 대시보드 KPI (전체현황 탭) ──────────────────────────────
function whUpdateDashKpi() {
  const stockMap = whCalcStock();
  const today = new Date();
  const soon30 = new Date(today); soon30.setDate(today.getDate() + 30);

  const coldUsed = Object.keys(stockMap).filter(k => k.startsWith('C-') && Object.values(stockMap[k]).some(v => v.qty > 0)).length;
  const warmUsed = Object.keys(stockMap).filter(k => k.startsWith('W-') && Object.values(stockMap[k]).some(v => v.qty > 0)).length;

  let coldExpiry = 0, warmExpiry = 0;
  whInboundData.forEach(r => {
    if (!r.expiry_date) return;
    const exp = new Date(r.expiry_date);
    if (exp <= soon30 && exp >= today) {
      if ((r.warehouse || r.location || '').startsWith('C')) coldExpiry++;
      else warmExpiry++;
    }
  });

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('dashColdUsed', coldUsed);
  set('dashColdTotal', COLD_LOCATIONS.length);
  set('dashColdExpiry', coldExpiry);
  set('dashWarmUsed', warmUsed);
  set('dashWarmTotal', WARM_LOCATIONS.length);
  set('dashWarmExpiry', warmExpiry);
}

// ── KPI 업데이트 (창고현황 탭) ──────────────────────────────
function whUpdateMapKpi() {
  const stockMap = whCalcStock();
  const coldUsed = Object.keys(stockMap).filter(k => k.startsWith('C-') && Object.values(stockMap[k]).some(v => v.qty > 0)).length;
  const warmUsed = Object.keys(stockMap).filter(k => k.startsWith('W-') && Object.values(stockMap[k]).some(v => v.qty > 0)).length;

  const today = new Date();
  const soon30 = new Date(today); soon30.setDate(today.getDate() + 30);
  let expirySoon = 0;
  const allItems = new Set();
  whInboundData.forEach(r => { if (r.item_name) allItems.add(r.item_name); });
  whInboundData.forEach(r => {
    if (r.expiry_date) {
      const exp = new Date(r.expiry_date);
      if (exp <= soon30 && exp >= today) expirySoon++;
    }
  });

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('whKpiColdUsed', `${coldUsed} / ${COLD_LOCATIONS.length}`);
  set('whKpiWarmUsed', `${warmUsed} / ${WARM_LOCATIONS.length}`);
  set('whKpiExpirySoon', expirySoon);
  set('whKpiTotalItems', allItems.size);

  // 소비기한 임박 알림
  const alertEl = document.getElementById('whExpiryAlert');
  const alertList = document.getElementById('whExpiryAlertList');
  if (alertEl && alertList) {
    const expItems = whInboundData.filter(r => {
      if (!r.expiry_date) return false;
      const exp = new Date(r.expiry_date);
      const diff = Math.ceil((exp - today) / (1000*60*60*24));
      return diff >= 0 && diff <= 30;
    }).sort((a,b) => (a.expiry_date||'').localeCompare(b.expiry_date||''));
    if (expItems.length > 0) {
      alertEl.style.display = '';
      alertList.innerHTML = expItems.slice(0,5).map(r => {
        const diff = Math.ceil((new Date(r.expiry_date) - today) / (1000*60*60*24));
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,193,7,0.3);font-size:13px">
          <span><strong>${r.item_name||'-'}</strong> (${r.location||'-'})</span>
          <span style="color:#e74c3c;font-weight:700">D-${diff} (${r.expiry_date})</span>
        </div>`;
      }).join('');
    } else {
      alertEl.style.display = 'none';
    }
  }
}

// ── 창고 배치도 시각화 ────────────────────────────
function whShowMap(type) {
  whCurrentMap = type;
  const container = document.getElementById('whMapContainer');
  if (!container) return;

  // 버튼 스타일 토글
  const coldBtn = document.getElementById('btnColdMap');
  const warmBtn = document.getElementById('btnWarmMap');
  if (coldBtn && warmBtn) {
    if (type === 'cold') {
      coldBtn.style.cssText = 'background:#e8f4fd;color:#2980b9;border:2px solid #2980b9;font-weight:700';
      warmBtn.style.cssText = 'background:#f8f9fa;color:#555;border:2px solid #ddd;font-weight:700';
    } else {
      warmBtn.style.cssText = 'background:#eafaf1;color:#27ae60;border:2px solid #27ae60;font-weight:700';
      coldBtn.style.cssText = 'background:#f8f9fa;color:#555;border:2px solid #ddd;font-weight:700';
    }
  }

  const stockMap = whCalcStock();
  if (type === 'cold') {
    container.innerHTML = whBuildColdMap(stockMap);
  } else {
    container.innerHTML = whBuildWarmMap(stockMap);
  }
}

function whGetLocColor(locCode, stockMap) {
  const items = stockMap[locCode] || {};
  const totalQty = Object.values(items).reduce((s, v) => s + (v.qty || 0), 0);
  if (totalQty <= 0) return { bg: '#f0f0f0', border: '#ddd', label: '공실', text: '#aaa' };
  // 소비기한 임박 체크
  const today = new Date();
  const hasExpiring = Object.values(items).some(v => {
    if (!v.expiry) return false;
    const diff = Math.ceil((new Date(v.expiry) - today) / (1000*60*60*24));
    return diff >= 0 && diff <= 30;
  });
  if (hasExpiring) return { bg: '#fff3cd', border: '#ffc107', label: '임박', text: '#856404' };
  return { bg: '#d4edda', border: '#27ae60', label: '적재', text: '#155724' };
}

function whBuildColdMap(stockMap) {
  // 저온창고 도면 기반 UI
  // 상단: A구역 (A1~A6)
  // 좌측: B구역 (B1~B4) 세로
  // 중앙좌: C구역 (C1~C6) 세로
  // 중앙우: D구역 (D1~D4) 세로
  // 우측: E구역 (E1~E6) 세로
  // 하단: F구역 (F1~F6)

  function zoneBlock(zone, count, wh, isVertical) {
    const items = [];
    for (let n = 1; n <= count; n++) {
      const zk = `${zone}${n}`;
      const pallets = COLD_SINGLE_PALLET.includes(zk) ? 1 : 2;
      const totalSlots = pallets * 4;
      let used = 0;
      let hasExpiry = false;
      for (let d = 1; d <= 4; d++) {
        for (let p = 1; p <= pallets; p++) {
          const code = `C-${zk}-${d}-${p}`;
          const locItems = stockMap[code] || {};
          if (Object.values(locItems).some(v => (v.qty||0) > 0)) used++;
          if (Object.values(locItems).some(v => {
            if (!v.expiry) return false;
            return Math.ceil((new Date(v.expiry) - new Date()) / 86400000) <= 30;
          })) hasExpiry = true;
        }
      }
      const ratio = totalSlots > 0 ? used / totalSlots : 0;
      const bg = ratio === 0 ? '#e0e0e0' : ratio < 0.5 ? '#27ae60' : ratio < 1 ? '#f39c12' : '#e74c3c';
      const textColor = ratio === 0 ? '#999' : '#fff';
      const expiryDot = hasExpiry ? `<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:#e74c3c;border-radius:50%;display:block"></span>` : '';
      items.push(`<div onclick="whShowLocDetail('C-${zk}-1-1')" title="${zk}: ${used}/${totalSlots}"
        style="position:relative;cursor:pointer;background:${bg};border-radius:6px;padding:5px 7px;min-width:${isVertical?'58px':'50px'};text-align:center;border:2px solid transparent;transition:all 0.2s"
        onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)'" onmouseout="this.style.boxShadow='none'">
        ${expiryDot}
        <div style="font-size:11px;font-weight:700;color:${textColor}">${zk}</div>
        <div style="font-size:9px;color:${ratio===0?'#bbb':'rgba(255,255,255,0.85)'}">${used}/${totalSlots}</div>
      </div>`);
    }
    return items.join('');
  }

  const totalSlots = COLD_LOCATIONS.length;
  const usedSlots = COLD_LOCATIONS.filter(l => {
    const items = stockMap[l.code] || {};
    return Object.values(items).some(v => (v.qty||0) > 0);
  }).length;

  return `
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="font-size:14px;font-weight:700;color:#2980b9;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <i class="fas fa-snowflake"></i> 저온창고 (C) — 4단 적재 · 총 ${totalSlots}슬롯 · 사용 ${usedSlots}슬롯
    </div>
    <div style="background:#f0f7ff;border:2px solid #2980b9;border-radius:10px;padding:14px;position:relative">

      <!-- 상단 A구역 -->
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:#2980b9;font-weight:700;margin-bottom:5px">▲ A구역 (상단)</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${zoneBlock('A',6,'C',false)}</div>
      </div>

      <!-- 중앙 영역 -->
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <!-- B구역 좌측 -->
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <div style="font-size:10px;color:#2980b9;font-weight:700">B구역</div>
          ${zoneBlock('B',4,'C',true)}
        </div>

        <!-- 통로1 -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);border-radius:6px;border:1px dashed #aaa;min-height:120px">
          <div style="font-size:11px;color:#aaa;writing-mode:vertical-rl">통 로</div>
        </div>

        <!-- C구역 중앙좌 -->
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <div style="font-size:10px;color:#2980b9;font-weight:700">C구역</div>
          ${zoneBlock('C',6,'C',true)}
        </div>

        <!-- 통로2 -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);border-radius:6px;border:1px dashed #aaa;min-height:120px">
          <div style="font-size:11px;color:#aaa;writing-mode:vertical-rl">통 로</div>
        </div>

        <!-- D구역 중앙우 -->
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <div style="font-size:10px;color:#2980b9;font-weight:700">D구역</div>
          ${zoneBlock('D',4,'C',true)}
        </div>

        <!-- 통로3 -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);border-radius:6px;border:1px dashed #aaa;min-height:120px">
          <div style="font-size:11px;color:#aaa;writing-mode:vertical-rl">통 로</div>
        </div>

        <!-- E구역 우측 -->
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <div style="font-size:10px;color:#2980b9;font-weight:700">E구역</div>
          ${zoneBlock('E',6,'C',true)}
        </div>
      </div>

      <!-- 하단 F구역 -->
      <div>
        <div style="font-size:10px;color:#2980b9;font-weight:700;margin-bottom:5px">▼ F구역 (하단)</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${zoneBlock('F',6,'C',false)}</div>
      </div>

      <!-- 입구 -->
      <div style="position:absolute;bottom:-13px;left:50%;transform:translateX(-50%);background:#2C5F2E;color:#fff;font-size:11px;font-weight:700;padding:2px 14px;border-radius:20px">🚪 입구</div>
    </div>

    <!-- 범례 -->
    <div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;font-size:12px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e0e0e0;border-radius:3px;display:inline-block"></span>공실</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#27ae60;border-radius:3px;display:inline-block"></span>적재(50%미만)</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f39c12;border-radius:3px;display:inline-block"></span>여유(50~99%)</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e74c3c;border-radius:3px;display:inline-block"></span>만재</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#e74c3c;border-radius:50%;display:inline-block"></span>소비기한임박</span>
    </div>
    <div style="margin-top:6px;font-size:11px;color:#888">※ 각 구역 클릭 시 단별 상세 재고 확인 가능 · 숫자: 사용/전체 슬롯</div>
  </div>`;
}

function whBuildWarmMap(stockMap) {
  // 일반창고 도면 기반 UI
  // A:1~6, B:1~4, C:1~10, D:1~4, E:1~7, F:1~7
  // 구역당 2파렛트, 예외(1파렛트): A5, C10, E4, F4
  // 3단 적재

  function zoneBlock(zone, count, color, bg) {
    let html = `<div style="background:${bg};border:1.5px solid ${color}40;border-radius:8px;padding:10px;margin-bottom:8px">`;
    html += `<div style="font-size:12px;font-weight:700;color:${color};margin-bottom:8px">${zone}구역</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px">`;
    for (let n = 1; n <= count; n++) {
      const zk = `${zone}${n}`;
      const pallets = WARM_SINGLE_PALLET.includes(zk) ? 1 : 2;
      const totalSlots = pallets * 3;
      let used = 0;
      let hasExpiry = false;
      for (let d = 1; d <= 3; d++) {
        for (let p = 1; p <= pallets; p++) {
          const code = `W-${zk}-${d}-${p}`;
          const locItems = stockMap[code] || {};
          if (Object.values(locItems).some(v => (v.qty||0) > 0)) used++;
          if (Object.values(locItems).some(v => {
            if (!v.expiry) return false;
            return Math.ceil((new Date(v.expiry) - new Date()) / 86400000) <= 30;
          })) hasExpiry = true;
        }
      }
      const ratio = totalSlots > 0 ? used / totalSlots : 0;
      const cellBg = ratio === 0 ? '#e0e0e0' : ratio < 0.5 ? '#27ae60' : ratio < 1 ? '#f39c12' : '#e74c3c';
      const textColor = ratio === 0 ? '#999' : '#fff';
      const expiryDot = hasExpiry ? `<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:#e74c3c;border-radius:50%;display:block"></span>` : '';
      html += `<div onclick="whShowLocDetail('W-${zk}-1-1')" title="${zk}: ${used}/${totalSlots}"
        style="position:relative;cursor:pointer;background:${cellBg};border-radius:6px;padding:5px 7px;min-width:50px;text-align:center;border:2px solid transparent;transition:all 0.2s"
        onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)'" onmouseout="this.style.boxShadow='none'">
        ${expiryDot}
        <div style="font-size:11px;font-weight:700;color:${textColor}">${zk}</div>
        <div style="font-size:9px;color:${ratio===0?'#bbb':'rgba(255,255,255,0.85)'}">${used}/${totalSlots}</div>
      </div>`;
    }
    html += `</div></div>`;
    return html;
  }

  const totalSlots = WARM_LOCATIONS.length;
  const usedSlots = WARM_LOCATIONS.filter(l => {
    const items = stockMap[l.code] || {};
    return Object.values(items).some(v => (v.qty||0) > 0);
  }).length;

  return `
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="font-size:14px;font-weight:700;color:#2C5F2E;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <i class="fas fa-warehouse"></i> 일반창고 (W) — 3단 적재 · 총 ${totalSlots}슬롯 · 사용 ${usedSlots}슬롯
    </div>
    <div style="background:#f0fff4;border:2px solid #27ae60;border-radius:10px;padding:14px;position:relative">

      <!-- A, B 구역 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        ${zoneBlock('A',6,'#2C5F2E','#eafaf1')}
        ${zoneBlock('B',4,'#8e44ad','#f5eef8')}
      </div>

      <!-- C 구역 (가장 큰 구역) -->
      ${zoneBlock('C',10,'#e67e22','#fef9e7')}

      <!-- D, E 구역 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        ${zoneBlock('D',4,'#2980b9','#e8f4fd')}
        ${zoneBlock('E',7,'#16a085','#e8f8f5')}
      </div>

      <!-- F 구역 -->
      ${zoneBlock('F',7,'#c0392b','#fdedec')}

      <!-- 입구 -->
      <div style="position:absolute;bottom:-13px;left:50%;transform:translateX(-50%);background:#2C5F2E;color:#fff;font-size:11px;font-weight:700;padding:2px 14px;border-radius:20px">🚪 입구</div>
    </div>

    <!-- 범례 -->
    <div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;font-size:12px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e0e0e0;border-radius:3px;display:inline-block"></span>공실</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#27ae60;border-radius:3px;display:inline-block"></span>적재(50%미만)</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f39c12;border-radius:3px;display:inline-block"></span>여유(50~99%)</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#e74c3c;border-radius:3px;display:inline-block"></span>만재</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#e74c3c;border-radius:50%;display:inline-block"></span>소비기한임박</span>
    </div>
    <div style="margin-top:6px;font-size:11px;color:#888">※ 각 구역 클릭 시 단별 상세 재고 확인 가능 · 숫자: 사용/전체 슬롯</div>
  </div>`;// ── 위치 상세 팝업 ────────────────────────────────────
// 구역 클릭 시: 해당 구역의 모든 슬롯 표시
function whShowLocDetail(locCode) {
  const stockMap = whCalcStock();
  // 구역코드 추출: C-A1 또는 W-A1 형태
  const parts = locCode.split('-');
  const wh = parts[0]; // C 또는 W
  const zoneKey = parts[1]; // A1, B2 등
  const isZoneClick = parts.length === 3 && parts[2] === '1' && parts[3] === '1' ||
                      (parts.length === 4 && parts[2] === '1' && parts[3] === '1');
  // 해당 구역의 모든 위치 가져오기
  const allLocs = wh === 'C' ? COLD_LOCATIONS : WARM_LOCATIONS;
  const zoneLocs = allLocs.filter(l => l.zoneKey === zoneKey);
  const modal = document.getElementById('whLocDetailModal');
  const title = document.getElementById('whLocDetailTitle');
  const body = document.getElementById('whLocDetailBody');
  if (!modal || !title || !body) return;

  const whName = wh === 'C' ? '저온창고' : '일반창고';
  title.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${whName} ${zoneKey}구역 상세`;

  const levels = wh === 'C' ? 4 : 3;
  const today = new Date();
  let bodyHtml = `<div style="font-size:12px;color:#555;margin-bottom:12px">
    <b>${whName}</b> · <b>${zoneKey}구역</b> · ${wh==='C'?'4단':'3단'} 적재
  </div>`;

  // 단별로 그룹화
  for (let d = 1; d <= levels; d++) {
    const lvLocs = zoneLocs.filter(l => l.level === d);
    bodyHtml += `<div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="font-weight:700;color:#333;margin-bottom:8px;font-size:12px">${d}단</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">`;
    lvLocs.forEach(loc => {
      const items = stockMap[loc.code] || {};
      const activeItems = Object.entries(items).filter(([,v]) => (v.qty||0) > 0);
      const hasExpiry = activeItems.some(([,v]) => {
        if (!v.expiry) return false;
        return Math.ceil((new Date(v.expiry) - today) / 86400000) <= 30;
      });
      const bg = activeItems.length === 0 ? '#e0e0e0' : hasExpiry ? '#fff3cd' : '#d4edda';
      const border = hasExpiry ? '#ffc107' : activeItems.length === 0 ? '#ddd' : '#27ae60';
      bodyHtml += `<div onclick="whShowSlotDetail('${loc.code}')" style="cursor:pointer;background:${bg};border:1.5px solid ${border};border-radius:6px;padding:8px 12px;min-width:130px;transition:all 0.2s"
        onmouseover="this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='none'">
        <div style="font-size:11px;font-weight:700;color:#333">${loc.code}</div>
        <div style="font-size:11px;color:#666;margin-top:2px">
          ${activeItems.length === 0 ? '공실' : `${activeItems[0][0]} · ${activeItems[0][1].qty}${activeItems[0][1].unit||''}`}
        </div>
        ${hasExpiry ? '<div style="font-size:10px;color:#e74c3c;margin-top:2px">⚠️ 소비기한임박</div>' : ''}
      </div>`;
    });
    bodyHtml += `</div></div>`;
  }

  bodyHtml += `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" onclick="whPrintLocLabel('${wh}-${zoneKey}')" style="background:#e8f4fd;color:#2980b9;border:1px solid #2980b9;font-size:12px"><i class="fas fa-qrcode"></i> 위치 라벨 출력</button>
  </div>`;

  body.innerHTML = bodyHtml;
  modal.classList.add('show');
}

// 슬롯 상세 팝업
function whShowSlotDetail(locCode) {
  const stockMap = whCalcStock();
  const items = stockMap[locCode] || {};
  const modal = document.getElementById('whLocDetailModal');
  const title = document.getElementById('whLocDetailTitle');
  const body = document.getElementById('whLocDetailBody');
  if (!modal || !title || !body) return;

  title.innerHTML = `<i class="fas fa-map-marker-alt"></i> 슬롯 상세: ${locCode}`;
  const today = new Date();
  const activeItems = Object.entries(items).filter(([,v]) => (v.qty||0) > 0);

  if (activeItems.length === 0) {
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#aaa"><i class="fas fa-inbox" style="font-size:32px;margin-bottom:10px"></i><br>현재 재고 없음 (공실)</div>`;
  } else {
    body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8f9fa">
        <th style="padding:8px;border:1px solid #ddd">품목명</th>
        <th style="padding:8px;border:1px solid #ddd">수량</th>
        <th style="padding:8px;border:1px solid #ddd">단위</th>
        <th style="padding:8px;border:1px solid #ddd">소비기한</th>
        <th style="padding:8px;border:1px solid #ddd">입고 Lot</th>
        <th style="padding:8px;border:1px solid #ddd">D-Day</th>
      </tr></thead>
      <tbody>
        ${activeItems.map(([name, v]) => {
          let dday = '-';
          if (v.expiry) {
            const diff = Math.ceil((new Date(v.expiry) - today) / (1000*60*60*24));
            if (diff < 0) dday = `<span style="color:#e74c3c;font-weight:700">만료</span>`;
            else if (diff <= 30) dday = `<span style="color:#f39c12;font-weight:700">D-${diff}</span>`;
            else dday = `D-${diff}`;
          }
          return `<tr>
            <td style="padding:8px;border:1px solid #ddd"><strong>${name}</strong></td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right">${v.qty}</td>
            <td style="padding:8px;border:1px solid #ddd">${v.unit||'-'}</td>
            <td style="padding:8px;border:1px solid #ddd">${v.expiry||'-'}</td>
            <td style="padding:8px;border:1px solid #ddd;font-size:11px">${v.lot||'-'}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center">${dday}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="whPrintLocLabel('${locCode}')" style="background:#e8f4fd;color:#2980b9;border:1px solid #2980b9;font-size:12px"><i class="fas fa-qrcode"></i> 위치 라벨 출력</button>
    </div>`;
  }
  modal.classList.add('show');
}

// ── 입고 처리 ─────────────────────────────────────
async function whHandleInSubmit(e) {
  e.preventDefault();
  const sv = id => document.getElementById(id)?.value?.trim() || '';
  const nv = id => parseFloat(document.getElementById(id)?.value) || 0;

  const lot = document.getElementById('whInLotDisplay')?.dataset?.lot || '';
  const wh = sv('whin_warehouse');
  const loc = sv('whin_location');
  const itemName = sv('whin_item_name');
  const qty = nv('whin_qty');
  const manager = sv('whin_manager');
  const expiry = sv('whin_expiry_date');

  if (!wh) { showToast('창고구분을 선택하세요.', 'warning'); return; }
  if (!loc) { showToast('보관위치를 선택하세요.', 'warning'); return; }
  if (!itemName) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (qty <= 0) { showToast('수량을 입력하세요.', 'warning'); return; }
  if (!expiry) { showToast('소비기한을 입력하세요.', 'warning'); return; }
  if (!manager) { showToast('담당자를 입력하세요.', 'warning'); return; }

  const record = {
    lot_no: lot,
    warehouse: wh,
    location: loc,
    inbound_date: sv('whin_date'),
    inbound_type: sv('whin_type'),
    item_name: itemName,
    qty: qty,
    unit: sv('whin_unit'),
    mfg_date: sv('whin_mfg_date'),
    expiry_date: expiry,
    ref_lot: sv('whin_ref_lot'),
    supplier: sv('whin_supplier'),
    temp: sv('whin_temp'),
    manager: manager,
    notes: sv('whin_notes'),
  };

  const btn = document.querySelector('#whInForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    await apiPost('wh_inbound', record);
    showToast(`✅ 입고 등록 완료! Lot: ${lot} | 위치: ${loc}`, 'success');
    whResetInForm();
    await whLoadAll();
    await whRefreshInLot();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 입고 등록'; }
  }
}

function whResetInForm() {
  const form = document.getElementById('whInForm');
  if (form) form.reset();
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('whin_date');
  if (dateEl) dateEl.value = today;
}

// ── 출고 처리 ─────────────────────────────────────
async function whHandleOutSubmit(e) {
  e.preventDefault();
  const sv = id => document.getElementById(id)?.value?.trim() || '';
  const nv = id => parseFloat(document.getElementById(id)?.value) || 0;

  const lot = document.getElementById('whOutLotDisplay')?.dataset?.lot || '';
  const wh = sv('whout_warehouse');
  const loc = sv('whout_location');
  const itemName = sv('whout_item_name');
  const qty = nv('whout_qty');
  const manager = sv('whout_manager');

  if (!wh) { showToast('창고구분을 선택하세요.', 'warning'); return; }
  if (!loc) { showToast('출고위치를 선택하세요.', 'warning'); return; }
  if (!itemName) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (qty <= 0) { showToast('수량을 입력하세요.', 'warning'); return; }
  if (!manager) { showToast('담당자를 입력하세요.', 'warning'); return; }

  // 재고 확인
  const stockMap = whCalcStock();
  const locStock = stockMap[loc] || {};
  const itemStock = locStock[itemName] || { qty: 0 };
  if (itemStock.qty < qty) {
    showToast(`⚠️ 재고 부족! 현재 재고: ${itemStock.qty} (출고 요청: ${qty})`, 'warning');
    return;
  }

  const record = {
    lot_no: lot,
    warehouse: wh,
    location: loc,
    outbound_date: sv('whout_date'),
    item_name: itemName,
    qty: qty,
    unit: sv('whout_unit'),
    destination: sv('whout_destination'),
    ref_lot: sv('whout_ref_lot'),
    manager: manager,
    notes: sv('whout_notes'),
  };

  const btn = document.querySelector('#whOutForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    await apiPost('wh_outbound', record);
    showToast(`✅ 출고 등록 완료! Lot: ${lot} | 위치: ${loc}`, 'success');
    whResetOutForm();
    await whLoadAll();
    await whRefreshOutLot();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 출고 등록'; }
  }
}

function whResetOutForm() {
  const form = document.getElementById('whOutForm');
  if (form) form.reset();
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('whout_date');
  if (dateEl) dateEl.value = today;
}

// ── FIFO 가이드 렌더링 ────────────────────────────
function whRenderFifo() {
  const query = (document.getElementById('whFifoSearch')?.value || '').trim().toLowerCase();
  const whFilter = document.getElementById('whFifoWarehouse')?.value || '';
  const container = document.getElementById('whFifoList');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<div style="color:#aaa;font-size:13px">품목명을 입력하면 FIFO 순서로 출고 위치를 안내합니다.</div>';
    return;
  }

  const stockMap = whCalcStock();
  const today = new Date();

  // 품목명으로 재고 있는 위치 찾기
  const candidates = [];
  Object.entries(stockMap).forEach(([locCode, items]) => {
    if (whFilter && !locCode.startsWith(whFilter + '-')) return;
    Object.entries(items).forEach(([name, v]) => {
      if (name.toLowerCase().includes(query) && (v.qty || 0) > 0) {
        const daysLeft = v.expiry ? Math.ceil((new Date(v.expiry) - today) / (1000*60*60*24)) : 9999;
        candidates.push({ locCode, name, qty: v.qty, unit: v.unit, expiry: v.expiry, lot: v.lot, daysLeft });
      }
    });
  });

  if (candidates.length === 0) {
    container.innerHTML = '<div style="color:#e74c3c;font-size:13px"><i class="fas fa-exclamation-circle"></i> 해당 품목의 재고가 없습니다.</div>';
    return;
  }

  // FIFO: 소비기한 임박 순 정렬
  candidates.sort((a, b) => a.daysLeft - b.daysLeft);

  container.innerHTML = candidates.map((c, i) => {
    const isFirst = i === 0;
    const ddayColor = c.daysLeft <= 7 ? '#e74c3c' : c.daysLeft <= 30 ? '#f39c12' : '#27ae60';
    const ddayText = c.daysLeft >= 9999 ? '기한없음' : c.daysLeft < 0 ? '만료' : `D-${c.daysLeft}`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:${isFirst ? '2px solid #27ae60' : '1px solid #ddd'};border-radius:8px;margin-bottom:6px;background:${isFirst ? '#eafaf1' : '#fff'}">
      <div style="background:${isFirst ? '#27ae60' : '#e0e0e0'};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${i+1}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${c.name}</div>
        <div style="font-size:12px;color:#666">${c.locCode} | 재고: ${c.qty} ${c.unit||''} | Lot: ${c.lot||'-'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:${ddayColor};font-size:13px">${ddayText}</div>
        <div style="font-size:11px;color:#888">${c.expiry||'기한없음'}</div>
      </div>
      ${isFirst ? '<div style="background:#27ae60;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700">우선출고</div>' : ''}
    </div>`;
  }).join('');
}

// ── 입고 이력 테이블 ──────────────────────────────
function whRenderInTable() {
  const tbody = document.getElementById('whInTableBody');
  if (!tbody) return;
  const q = (document.getElementById('whInSearch')?.value || '').toLowerCase();
  const data = whInboundData.filter(r => !q || (r.item_name||'').toLowerCase().includes(q));
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-msg"><i class="fas fa-inbox"></i> 입고 내역이 없습니다.</td></tr>`;
    return;
  }
  const today = new Date();
  tbody.innerHTML = data.map(r => {
    let expiryHtml = r.expiry_date || '-';
    if (r.expiry_date) {
      const diff = Math.ceil((new Date(r.expiry_date) - today) / (1000*60*60*24));
      if (diff <= 30 && diff >= 0) expiryHtml = `<span style="color:#f39c12;font-weight:700">${r.expiry_date} <small>(D-${diff})</small></span>`;
      else if (diff < 0) expiryHtml = `<span style="color:#e74c3c;font-weight:700">${r.expiry_date} <small>(만료)</small></span>`;
    }
    const whBadge = r.warehouse === 'C'
      ? `<span style="background:#e8f4fd;color:#2980b9;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">❄️ 저온</span>`
      : `<span style="background:#eafaf1;color:#27ae60;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🏭 일반</span>`;
    return `<tr>
      <td style="font-size:11px">${r.lot_no||'-'}</td>
      <td>${whBadge}</td>
      <td><strong>${r.location||'-'}</strong></td>
      <td>${r.inbound_date||'-'}</td>
      <td><strong>${r.item_name||'-'}</strong></td>
      <td style="text-align:right">${r.qty||0}</td>
      <td>${r.unit||'-'}</td>
      <td>${expiryHtml}</td>
      <td>${r.supplier||'-'}</td>
      <td>${r.manager||'-'}</td>
      <td>
        <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="whDeleteInbound('${r.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function whDeleteInbound(id) {
  if (!confirm('이 입고 내역을 삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_inbound', id);
    showToast('삭제 완료', 'success');
    await whLoadAll();
  } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
}

// ── 출고 이력 테이블 ──────────────────────────────
function whRenderOutTable() {
  const tbody = document.getElementById('whOutTableBody');
  if (!tbody) return;
  const q = (document.getElementById('whOutSearch')?.value || '').toLowerCase();
  const data = whOutboundData.filter(r => !q || (r.item_name||'').toLowerCase().includes(q));
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-msg"><i class="fas fa-inbox"></i> 출고 내역이 없습니다.</td></tr>`;
    return;
  }
  const whBadgeFn = wh => wh === 'C'
    ? `<span style="background:#e8f4fd;color:#2980b9;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">❄️ 저온</span>`
    : `<span style="background:#eafaf1;color:#27ae60;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🏭 일반</span>`;
  tbody.innerHTML = data.map(r => `<tr>
    <td style="font-size:11px">${r.lot_no||'-'}</td>
    <td>${whBadgeFn(r.warehouse)}</td>
    <td><strong>${r.location||'-'}</strong></td>
    <td>${r.outbound_date||'-'}</td>
    <td><strong>${r.item_name||'-'}</strong></td>
    <td style="text-align:right">${r.qty||0}</td>
    <td>${r.unit||'-'}</td>
    <td>${r.destination||'-'}</td>
    <td>${r.manager||'-'}</td>
    <td>
      <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="whDeleteOutbound('${r.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

async function whDeleteOutbound(id) {
  if (!confirm('이 출고 내역을 삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_outbound', id);
    showToast('삭제 완료', 'success');
    await whLoadAll();
  } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
}

// ── 재고수불 (Ledger) ─────────────────────────────
function whRenderLedger() {
  const tbody = document.getElementById('whLedgerBody');
  if (!tbody) return;
  const whFilter = document.getElementById('whLedgerWarehouse')?.value || '';
  const q = (document.getElementById('whLedgerSearch')?.value || '').toLowerCase();
  const stockMap = whCalcStock();
  const today = new Date();

  // 위치별 집계
  const rows = [];
  const allLocs = [...COLD_LOCATIONS, ...WARM_LOCATIONS];
  allLocs.forEach(loc => {
    if (whFilter && !loc.code.startsWith(whFilter + '-')) return;
    const items = stockMap[loc.code] || {};
    Object.entries(items).forEach(([name, v]) => {
      if (q && !name.toLowerCase().includes(q)) return;
      const inQty = whInboundData.filter(r => r.location === loc.code && (r.item_name||'') === name).reduce((s,r) => s + (Number(r.qty)||0), 0);
      const outQty = whOutboundData.filter(r => r.location === loc.code && (r.item_name||'') === name).reduce((s,r) => s + (Number(r.qty)||0), 0);
      const curQty = inQty - outQty;
      if (curQty <= 0 && inQty === 0) return;
      let status = '정상';
      let statusColor = '#27ae60';
      if (curQty <= 0) { status = '재고없음'; statusColor = '#e74c3c'; }
      else if (v.expiry) {
        const diff = Math.ceil((new Date(v.expiry) - today) / (1000*60*60*24));
        if (diff < 0) { status = '기한만료'; statusColor = '#e74c3c'; }
        else if (diff <= 30) { status = `D-${diff}`; statusColor = '#f39c12'; }
      }
      rows.push({ wh: loc.type === 'cold' ? '저온' : '일반', loc: loc.code, name, inQty, outQty, curQty, unit: v.unit||'', expiry: v.expiry||'-', status, statusColor });
    });
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-msg"><i class="fas fa-inbox"></i> 재고 내역이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td><span style="background:${r.wh==='저온'?'#e8f4fd':'#eafaf1'};color:${r.wh==='저온'?'#2980b9':'#27ae60'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${r.wh}</span></td>
    <td><strong>${r.loc}</strong></td>
    <td>${r.name}</td>
    <td style="text-align:right;color:#27ae60">${r.inQty}</td>
    <td style="text-align:right;color:#e74c3c">${r.outQty}</td>
    <td style="text-align:right;font-weight:700">${r.curQty}</td>
    <td>${r.unit}</td>
    <td>${r.expiry}</td>
    <td><span style="color:${r.statusColor};font-weight:700">${r.status}</span></td>
  </tr>`).join('');
}

// ── 재고 실사 ─────────────────────────────────────
function whLookupSystemQty() {
  const wh = document.getElementById('whst_warehouse')?.value || '';
  const loc = document.getElementById('whst_location')?.value || '';
  const itemName = (document.getElementById('whst_item_name')?.value || '').trim();
  if (!loc || !itemName) { showToast('위치와 품목명을 먼저 입력하세요.', 'warning'); return; }
  const stockMap = whCalcStock();
  const items = stockMap[loc] || {};
  const qty = (items[itemName] || { qty: 0 }).qty;
  const sysEl = document.getElementById('whst_system_qty');
  if (sysEl) sysEl.value = qty;
  whCalcDiff();
  showToast(`전산 재고: ${qty}`, 'info');
}

function whCalcDiff() {
  const sys = parseFloat(document.getElementById('whst_system_qty')?.value) || 0;
  const actual = parseFloat(document.getElementById('whst_actual_qty')?.value) || 0;
  const diffEl = document.getElementById('whst_diff_qty');
  if (diffEl) {
    const diff = actual - sys;
    diffEl.value = diff;
    diffEl.style.color = diff < 0 ? '#e74c3c' : diff > 0 ? '#f39c12' : '#27ae60';
  }
}

async function whHandleStocktakeSubmit(e) {
  e.preventDefault();
  const sv = id => document.getElementById(id)?.value?.trim() || '';
  const nv = id => parseFloat(document.getElementById(id)?.value) || 0;

  const record = {
    stocktake_date: sv('whst_date'),
    warehouse: sv('whst_warehouse'),
    location: sv('whst_location'),
    item_name: sv('whst_item_name'),
    system_qty: nv('whst_system_qty'),
    actual_qty: nv('whst_actual_qty'),
    diff_qty: nv('whst_actual_qty') - nv('whst_system_qty'),
    reason: sv('whst_reason'),
    manager: sv('whst_manager'),
    notes: sv('whst_notes'),
  };

  if (!record.item_name) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (!record.manager) { showToast('담당자를 입력하세요.', 'warning'); return; }

  try {
    await apiPost('wh_stocktake', record);
    showToast('✅ 재고 실사 등록 완료!', 'success');
    document.getElementById('whStocktakeForm')?.reset();
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('whst_date');
    if (dateEl) dateEl.value = today;
    await whLoadAll();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

function whRenderStocktakeTable() {
  const tbody = document.getElementById('whStocktakeBody');
  if (!tbody) return;
  if (!whStocktakeData.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-msg"><i class="fas fa-inbox"></i> 실사 내역이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = whStocktakeData.map(r => {
    const diff = r.diff_qty || 0;
    const diffColor = diff < 0 ? '#e74c3c' : diff > 0 ? '#f39c12' : '#27ae60';
    return `<tr>
      <td>${r.stocktake_date||'-'}</td>
      <td>${r.warehouse||'-'}</td>
      <td>${r.location||'-'}</td>
      <td>${r.item_name||'-'}</td>
      <td style="text-align:right">${r.system_qty||0}</td>
      <td style="text-align:right">${r.actual_qty||0}</td>
      <td style="text-align:right;font-weight:700;color:${diffColor}">${diff > 0 ? '+' : ''}${diff}</td>
      <td>${r.reason||'-'}</td>
      <td>${r.manager||'-'}</td>
      <td><button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="whDeleteStocktake('${r.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
}

async function whDeleteStocktake(id) {
  if (!confirm('이 실사 내역을 삭제하시겠습니까?')) return;
  try {
    await apiDelete('wh_stocktake', id);
    showToast('삭제 완료', 'success');
    await whLoadAll();
  } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
}

// ── 실사 조정 보고서 출력 ─────────────────────────
function whPrintStocktakeReport() {
  const data = whStocktakeData.filter(r => (r.diff_qty || 0) !== 0);
  if (!data.length) { showToast('차이가 있는 실사 내역이 없습니다.', 'info'); return; }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>재고 조정 보고서</title>
  <style>body{font-family:'Noto Sans KR',sans-serif;padding:20px}h2{color:#2C5F2E}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f8f9fa}tr:nth-child(even){background:#f9f9f9}.neg{color:#e74c3c;font-weight:700}.pos{color:#f39c12;font-weight:700}</style>
  </head><body>
  <h2>📋 재고 실사 조정 보고서</h2>
  <p>출력일시: ${new Date().toLocaleString('ko-KR')}</p>
  <table><thead><tr><th>실사일</th><th>창고</th><th>위치</th><th>품목명</th><th>전산수량</th><th>실제수량</th><th>차이</th><th>사유</th><th>담당자</th></tr></thead>
  <tbody>${data.map(r => `<tr>
    <td>${r.stocktake_date||'-'}</td><td>${r.warehouse||'-'}</td><td>${r.location||'-'}</td><td>${r.item_name||'-'}</td>
    <td>${r.system_qty||0}</td><td>${r.actual_qty||0}</td>
    <td class="${(r.diff_qty||0)<0?'neg':'pos'}">${(r.diff_qty||0)>0?'+':''}${r.diff_qty||0}</td>
    <td>${r.reason||'-'}</td><td>${r.manager||'-'}</td>
  </tr>`).join('')}</tbody></table>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── QR 라벨 출력 ─────────────────────────────────
function whPrintLabel() {
  const sv = id => document.getElementById(id)?.value?.trim() || '';
  const lot = document.getElementById('whInLotDisplay')?.dataset?.lot || '';
  const loc = sv('whin_location');
  const item = sv('whin_item_name');
  const qty = sv('whin_qty');
  const unit = sv('whin_unit');
  const expiry = sv('whin_expiry_date');
  const mfg = sv('whin_mfg_date');
  const supplier = sv('whin_supplier');
  const manager = sv('whin_manager');

  if (!item) { showToast('품목명을 먼저 입력하세요.', 'warning'); return; }

  // QR 코드 데이터: JSON 형태로 입고 정보 전체 포함
  const qrPayload = JSON.stringify({ lot, loc, item, qty: Number(qty), unit, expiry, mfg, supplier });
  const qrData = encodeURIComponent(qrPayload);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

  // ZPL 코드 생성 (제브라 ZPL II 표준)
  const zplCode = [
    '^XA',
    '^CI28',
    '^FO20,10^A0N,20,20^FD\ub77c이프컸처 입고라벨^FS',
    `^FO20,35^A0N,18,18^FD\ud488목: ${item}^FS`,
    `^FO20,58^A0N,18,18^FD\uc704치: ${loc}^FS`,
    `^FO20,81^A0N,18,18^FD\uc218량: ${qty} ${unit}^FS`,
    `^FO20,104^A0N,18,18^FD\uc18c\ube44\uae30\ud55c: ${expiry}^FS`,
    `^FO20,127^A0N,16,16^FDLot: ${lot}^FS`,
    `^FO280,10^BQN,2,4^FDQA,${qrPayload}^FS`,
    '^XZ'
  ].join('\n');

  // ESC/POS 텍스트 (빅솔론)
  const escPosText = [
    '=== 라이프컸처 입고라벨 ===',
    `\ud488\ubaa9: ${item}`,
    `\uc704\uce58: ${loc}`,
    `\uc218\ub7c9: ${qty} ${unit}`,
    `\uc18c\ube44\uae30\ud55c: ${expiry}`,
    `Lot: ${lot}`,
    '========================'
  ].join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>입고 라벨</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Noto Sans KR',sans-serif;background:#f5f5f5;padding:10px}
    .controls{background:#fff;border-radius:8px;padding:12px;margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .btn-print{padding:8px 20px;background:#2C5F2E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700}
    .btn-zpl{padding:8px 16px;background:#e67e22;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700}
    .btn-escpos{padding:8px 16px;background:#8e44ad;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700}
    .label-wrap{display:flex;justify-content:center;margin-bottom:12px}
    .label{width:100mm;background:#fff;border:2px solid #333;padding:8px;page-break-after:always}
    .label-title{font-size:13px;font-weight:700;text-align:center;border-bottom:1.5px solid #333;padding-bottom:5px;margin-bottom:7px;color:#2C5F2E}
    .label-body{display:flex;gap:8px}
    .label-info{flex:1}
    .label-row{display:flex;font-size:11px;margin-bottom:3px;line-height:1.4}
    .label-key{color:#888;width:52px;flex-shrink:0}
    .label-val{font-weight:600;flex:1;word-break:break-all}
    .label-val.expiry{color:#e74c3c;font-weight:700}
    .label-qr{display:flex;flex-direction:column;align-items:center;justify-content:center}
    .lot{font-size:9px;color:#777;text-align:center;margin-top:6px;border-top:1px solid #eee;padding-top:4px}
    .printer-info{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px;font-size:12px;color:#856404;margin-bottom:12px}
    .code-area{background:#1a1a2e;color:#00ff41;font-family:monospace;font-size:11px;padding:12px;border-radius:6px;white-space:pre;overflow-x:auto;margin-top:8px;display:none}
    @media print{.controls,.printer-info,.code-area{display:none!important}.label-wrap{margin:0}.label{border:1.5px solid #333;margin:0 auto}}
  </style></head><body>
  <div class="controls">
    <button class="btn-print" onclick="window.print()">🖸️ 일반 프린터 출력</button>
    <button class="btn-zpl" onclick="copyCode('zpl')">📱 제브라 ZPL 코드 복사</button>
    <button class="btn-escpos" onclick="copyCode('escpos')">📱 빅솔론 ESC/POS 코드 복사</button>
  </div>
  <div class="printer-info">
    <b>휴대용 라벨 프린터 연동 방법</b><br>
    ① <b>제브라 (Zebra ZQ520/ZQ630 등)</b>: "제브라 ZPL 코드 복사" 클릭 → Zebra Browser Print 앱 또는 Zebra Designer에 붙여넣기<br>
    ② <b>빅솔론 (Bixolon SPP-R310 등)</b>: "빅솔론 ESC/POS 코드 복사" 클릭 → 빅솔론 앱에 붙여넣기<br>
    ③ <b>일반 프린터</b>: "일반 프린터 출력" 클릭 후 A4 또는 라벨지에 출력
  </div>
  <div class="label-wrap">
    <div class="label">
      <div class="label-title">📦 입고 라벨 — 라이프컸처</div>
      <div class="label-body">
        <div class="label-info">
          <div class="label-row"><span class="label-key">품목명</span><span class="label-val">${item}</span></div>
          <div class="label-row"><span class="label-key">보관위치</span><span class="label-val">${loc||'-'}</span></div>
          <div class="label-row"><span class="label-key">수량</span><span class="label-val">${qty} ${unit}</span></div>
          <div class="label-row"><span class="label-key">제조일</span><span class="label-val">${mfg||'-'}</span></div>
          <div class="label-row"><span class="label-key">소비기한</span><span class="label-val expiry">${expiry||'-'}</span></div>
          <div class="label-row"><span class="label-key">공급업체</span><span class="label-val">${supplier||'-'}</span></div>
          <div class="label-row"><span class="label-key">담당자</span><span class="label-val">${manager||'-'}</span></div>
        </div>
        <div class="label-qr">
          <img src="${qrUrl}" alt="QR" style="width:80px;height:80px" />
          <div style="font-size:9px;color:#888;margin-top:3px">스캔하면 재고확인</div>
        </div>
      </div>
      <div class="lot">Lot No: ${lot}</div>
    </div>
  </div>
  <div id="codeArea" class="code-area"></div>
  <script>
  const ZPL = ${JSON.stringify(zplCode)};
  const ESCPOS = ${JSON.stringify(escPosText)};
  function copyCode(type) {
    const code = type === 'zpl' ? ZPL : ESCPOS;
    const area = document.getElementById('codeArea');
    area.style.display = 'block';
    area.textContent = (type === 'zpl' ? '[ ZPL 코드 - 제브라 ]\n' : '[ ESC/POS 텍스트 - 빅솔론 ]\n') + code;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        alert('✅ ' + (type === 'zpl' ? 'ZPL 코드' : 'ESC/POS 코드') + '가 클립보드에 복사되었습니다.\n프린터 소프트웨어에 붙여넣기 하세요.');
      });
    }
  }
  <\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function whPrintLocLabel(locCode) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(locCode)}`;
  const wh = locCode.startsWith('C-') ? '저온창고 (C)' : '일반창고 (W)';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>위치 라벨</title>
  <style>body{font-family:'Noto Sans KR',sans-serif;padding:20px}
  .label{width:80mm;border:2px solid #2C5F2E;padding:12px;margin:0 auto;text-align:center}
  .loc-code{font-size:22px;font-weight:900;color:#2C5F2E;margin:10px 0}
  .wh-name{font-size:13px;color:#555}
  @media print{button{display:none}}</style></head><body>
  <div style="text-align:center;margin-bottom:10px"><button onclick="window.print()" style="padding:8px 20px;background:#2C5F2E;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ 출력</button></div>
  <div class="label">
    <div class="wh-name">라이프컬처 ${wh}</div>
    <div class="loc-code">${locCode}</div>
    <img src="${qrUrl}" alt="QR" style="width:120px;height:120px;margin:10px 0" />
    <div style="font-size:11px;color:#888">이 위치의 재고를 확인하려면 QR을 스캔하세요.</div>
  </div>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── 엑셀 내보내기 ─────────────────────────────────
function whExport(type) {
  let data = [], headers = [], rows = [];
  if (type === 'in') {
    data = whInboundData;
    headers = ['Lot No','창고','위치코드','입고일','품목명','수량','단위','소비기한','공급업체','담당자','비고'];
    rows = data.map(r => [r.lot_no||'',r.warehouse||'',r.location||'',r.inbound_date||'',r.item_name||'',r.qty||0,r.unit||'',r.expiry_date||'',r.supplier||'',r.manager||'',r.notes||'']);
  } else if (type === 'out') {
    data = whOutboundData;
    headers = ['Lot No','창고','위치코드','출고일','품목명','수량','단위','출고처','담당자','비고'];
    rows = data.map(r => [r.lot_no||'',r.warehouse||'',r.location||'',r.outbound_date||'',r.item_name||'',r.qty||0,r.unit||'',r.destination||'',r.manager||'',r.notes||'']);
  } else {
    data = whStocktakeData;
    headers = ['실사일','창고','위치','품목명','전산수량','실제수량','차이','사유','담당자'];
    rows = data.map(r => [r.stocktake_date||'',r.warehouse||'',r.location||'',r.item_name||'',r.system_qty||0,r.actual_qty||0,r.diff_qty||0,r.reason||'',r.manager||'']);
  }
  const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `창고_${type}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('엑셀 다운로드 완료!', 'success');
}

// ── QR/바코드 스캔 출고 연동 ─────────────────────────
// 스마트폰 카메라로 QR 스캔 후 출고 폼 자동 입력
function whOpenQrScanner() {
  // 모바일 환경: 카메라 파일 선택 또는 URL 스킴 활용
  // 웹 표준 BarcodeDetector API 지원 여부 확인
  if ('BarcodeDetector' in window) {
    // BarcodeDetector API 지원 브라우저 (Chrome Android 등)
    whStartBarcodeDetector();
  } else {
    // 폴백: 이미지 파일 업로드로 QR 스캔
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // 후면 카메라
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // QR 서버 API로 이미지 디코딩
      const formData = new FormData();
      formData.append('file', file);
      try {
        showToast('QR 코드 분석 중...', 'info');
        const res = await fetch('https://api.qrserver.com/v1/read-qr-code/', {
          method: 'POST', body: formData
        });
        const data = await res.json();
        const qrText = data?.[0]?.symbol?.[0]?.data;
        if (qrText) {
          whProcessScan(qrText);
        } else {
          showToast('QR 코드를 인식하지 못했습니다. 다시 시도해 주세요.', 'warning');
        }
      } catch(err) {
        showToast('QR 스캔 오류: ' + err.message, 'error');
      }
    };
    input.click();
  }
}

async function whStartBarcodeDetector() {
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const img = await createImageBitmap(file);
      const barcodes = await detector.detect(img);
      if (barcodes.length > 0) {
        whProcessScan(barcodes[0].rawValue);
      } else {
        showToast('QR 코드를 인식하지 못했습니다.', 'warning');
      }
    };
    input.click();
  } catch(err) {
    showToast('스캔 오류: ' + err.message, 'error');
  }
}

// QR 스캔 결과 처리 - 출고 폼 자동 입력
function whProcessScan(rawValue) {
  if (!rawValue || !rawValue.trim()) {
    showToast('스캔 값이 없습니다.', 'warning');
    return;
  }
  const val = rawValue.trim();
  let parsed = null;

  // JSON 형태 QR (입고 라벨에서 생성된 형태)
  try {
    parsed = JSON.parse(val);
  } catch(e) {
    // JSON이 아닌 경우: Lot No. 또는 위치코드로 처리
    parsed = null;
  }

  const resultEl = document.getElementById('whScanResult');

  if (parsed && parsed.lot) {
    // 입고 라벨 QR: 출고 폼에 자동 입력
    const sv = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    const whEl = document.getElementById('whout_warehouse');
    if (whEl && parsed.loc) {
      const wh = parsed.loc.startsWith('C-') ? 'C' : 'W';
      whEl.value = wh;
      whBuildLocationSelect('whout');
      setTimeout(() => { sv('whout_location', parsed.loc); }, 100);
    }
    sv('whout_item_name', parsed.item);
    sv('whout_qty', parsed.qty);
    sv('whout_unit', parsed.unit);
    sv('whout_ref_lot', parsed.lot);

    // 스캔 결과 표시
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div style="font-weight:700;color:#27ae60;margin-bottom:6px">✅ QR 스캔 성공 — 출고 폼에 자동 입력됨</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;font-size:12px">
          <div><span style="color:#888">품목명:</span> <strong>${parsed.item||'-'}</strong></div>
          <div><span style="color:#888">위치:</span> <strong>${parsed.loc||'-'}</strong></div>
          <div><span style="color:#888">수량:</span> <strong>${parsed.qty||'-'} ${parsed.unit||''}</strong></div>
          <div><span style="color:#888">소비기한:</span> <strong style="color:#e74c3c">${parsed.expiry||'-'}</strong></div>
          <div><span style="color:#888">Lot No.:</span> <strong>${parsed.lot||'-'}</strong></div>
        </div>`;
    }
    showToast(`✅ ${parsed.item} 스캔 완료 — 출고 폼 자동 입력`, 'success');
  } else if (val.startsWith('C-') || val.startsWith('W-')) {
    // 위치 QR 스캔: 해당 위치 재고 조회
    const stockMap = whCalcStock();
    const items = stockMap[val] || {};
    const itemList = Object.entries(items).filter(([,v]) => v.qty > 0);
    if (resultEl) {
      resultEl.style.display = '';
      if (itemList.length === 0) {
        resultEl.innerHTML = `<div style="color:#888">📍 위치 <strong>${val}</strong> — 현재 재고 없음</div>`;
      } else {
        resultEl.innerHTML = `
          <div style="font-weight:700;color:#2980b9;margin-bottom:6px">📍 위치 ${val} 재고 현황</div>
          ${itemList.map(([name, v]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:12px">
              <span><strong>${name}</strong></span>
              <span>${v.qty} ${v.unit} | 소비기한: <span style="color:#e74c3c">${v.expiry||'-'}</span></span>
              <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" 
                onclick="document.getElementById('whout_item_name').value='${name}';document.getElementById('whout_qty').value='${v.qty}'">출고 선택</button>
            </div>`).join('')}`;
      }
    }
    // 위치 드롭다운 자동 선택
    const wh = val.startsWith('C-') ? 'C' : 'W';
    const whEl = document.getElementById('whout_warehouse');
    if (whEl) { whEl.value = wh; whBuildLocationSelect('whout'); }
    setTimeout(() => {
      const locEl = document.getElementById('whout_location');
      if (locEl) locEl.value = val;
    }, 100);
  } else {
    // Lot No. 직접 입력: 해당 입고 기록 조회
    const record = whInboundData.find(r => r.lot_no === val);
    if (record) {
      const sv = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
      const wh = (record.warehouse || (record.location||'').startsWith('C') ? 'C' : 'W');
      const whEl = document.getElementById('whout_warehouse');
      if (whEl) { whEl.value = wh; whBuildLocationSelect('whout'); }
      setTimeout(() => { sv('whout_location', record.location); }, 100);
      sv('whout_item_name', record.item_name);
      sv('whout_qty', record.qty);
      sv('whout_unit', record.unit);
      sv('whout_ref_lot', record.lot_no);
      if (resultEl) {
        resultEl.style.display = '';
        resultEl.innerHTML = `<div style="font-weight:700;color:#27ae60">✅ Lot No. ${val} 조회 성공 — 출고 폼 자동 입력됨</div>`;
      }
      showToast(`✅ Lot No. ${val} 조회 완료`, 'success');
    } else {
      if (resultEl) {
        resultEl.style.display = '';
        resultEl.innerHTML = `<div style="color:#e74c3c">⚠️ "${val}"에 해당하는 입고 기록을 찾을 수 없습니다.</div>`;
      }
      showToast('해당 Lot No. 또는 QR 코드를 찾을 수 없습니다.', 'warning');
    }
  }
}
