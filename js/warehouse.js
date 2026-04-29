// =====================================================
// 물류관리 JS (warehouse.js)
// - 창고/로케이션 관리
// - 입고관리 (생산입고/구매입고, 검수, 적치)
// - 출고관리 (FIFO 자동배정, 피킹리스트, 상차정보)
// - 재고수불 (기초+입고-출고=기말, Lot별)
// - 재고실사 (전산↔실제 차이 조정)
// - 대시보드 (창고 가동률, 소비기한 임박, 부족 알림)
// =====================================================

let allLocations = [];
let allInbound = [];
let allOutbound = [];
let allStocktake = [];
let currentEditType = '';
let currentEditId = null;
let ibPage = 1, obPage = 1;
const pageSize = 15;

document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date().toISOString().split('T')[0];
  ['ib_date', 'ob_date', 'st_date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  await loadAll();
  await initLotNos();
});

// =====================================================
// 전체 데이터 로드
// =====================================================
async function loadAll() {
  try {
    const [locs, inb, outb, st] = await Promise.all([
      apiGetAll('wh_locations').catch(() => []),
      apiGetAll('wh_inbound').catch(() => []),
      apiGetAll('wh_outbound').catch(() => []),
      apiGetAll('wh_stocktake').catch(() => []),
    ]);
    allLocations = locs.sort((a, b) => (a.loc_code || '').localeCompare(b.loc_code || ''));
    allInbound = inb.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    allOutbound = outb.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    allStocktake = st.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    renderDashboard();
    renderLocations();
    renderInbound();
    renderOutbound();
    renderLedger();
    renderStocktake();
    buildLocationSelect();
  } catch(e) {
    console.error('물류 데이터 로드 실패:', e);
  }
}

// =====================================================
// Lot No 초기화
// =====================================================
async function initLotNos() {
  try {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
    const ibData = await apiGetAll('wh_inbound').catch(() => []);
    const ibSeq = String(ibData.filter(r => r.lot_no && r.lot_no.startsWith(`WH-IN-${dateStr}`)).length + 1).padStart(3, '0');
    const ibLot = `WH-IN-${dateStr}-${ibSeq}`;
    const ibEl = document.getElementById('inboundLotDisplay');
    if (ibEl) { ibEl.textContent = ibLot; ibEl.dataset.lot = ibLot; }

    const obData = await apiGetAll('wh_outbound').catch(() => []);
    const obSeq = String(obData.filter(r => r.lot_no && r.lot_no.startsWith(`WH-OUT-${dateStr}`)).length + 1).padStart(3, '0');
    const obLot = `WH-OUT-${dateStr}-${obSeq}`;
    const obEl = document.getElementById('outboundLotDisplay');
    if (obEl) { obEl.textContent = obLot; obEl.dataset.lot = obLot; }
  } catch(e) {}
}

// =====================================================
// 탭 전환
// =====================================================
function switchWhTab(tab) {
  document.querySelectorAll('.wh-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.wh-tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.querySelector(`.wh-tab[onclick*="${tab}"]`);
  const content = document.getElementById(`tab-${tab}`);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');
}

// =====================================================
// 대시보드
// =====================================================
function renderDashboard() {
  // 창고 가동률 계산
  const normalLocs = allLocations.filter(l => l.warehouse_type === '일반');
  const coldLocs = allLocations.filter(l => l.warehouse_type === '냉장');
  const normalOccupied = normalLocs.filter(l => l.current_qty > 0).length;
  const coldOccupied = coldLocs.filter(l => l.current_qty > 0).length;
  const normalRate = normalLocs.length > 0 ? Math.round((normalOccupied / normalLocs.length) * 100) : 0;
  const coldRate = coldLocs.length > 0 ? Math.round((coldOccupied / coldLocs.length) * 100) : 0;

  const kpiNormal = document.getElementById('kpi_normal_rate');
  const kpiCold = document.getElementById('kpi_cold_rate');
  const gaugeNormal = document.getElementById('gauge_normal');
  const gaugeCold = document.getElementById('gauge_cold');
  if (kpiNormal) kpiNormal.textContent = `${normalRate}%`;
  if (kpiCold) kpiCold.textContent = `${coldRate}%`;
  if (gaugeNormal) gaugeNormal.style.width = `${normalRate}%`;
  if (gaugeCold) gaugeCold.style.width = `${coldRate}%`;

  // 소비기한 임박 (30일 이내)
  const today = new Date();
  const expiryItems = allInbound.filter(r => {
    if (!r.expiry_date) return false;
    const exp = new Date(r.expiry_date);
    const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    return daysLeft <= 30 && daysLeft >= 0;
  });
  const kpiExpiry = document.getElementById('kpi_expiry_count');
  if (kpiExpiry) kpiExpiry.textContent = expiryItems.length;

  // 재고 부족 (하한선 미만 - 현재재고 0 이하)
  const stockMap = calcLedgerMap();
  const lowStockItems = Object.values(stockMap).filter(s => s.balance <= 0);
  const kpiLow = document.getElementById('kpi_low_stock');
  if (kpiLow) kpiLow.textContent = lowStockItems.length;

  // 소비기한 임박 알림
  const expirySection = document.getElementById('expiryAlertSection');
  const expiryList = document.getElementById('expiryAlertList');
  if (expiryItems.length > 0 && expirySection && expiryList) {
    expirySection.style.display = 'block';
    expiryList.innerHTML = expiryItems.slice(0, 10).map(r => {
      const daysLeft = Math.ceil((new Date(r.expiry_date) - today) / (1000 * 60 * 60 * 24));
      const color = daysLeft <= 7 ? '#e74c3c' : daysLeft <= 14 ? '#e67e22' : '#f39c12';
      return `<div class="stock-alert-item">
        <span><strong>${r.item_name || '-'}</strong> <small style="color:#888">${r.lot_no || ''}</small></span>
        <span style="color:${color};font-weight:700">D-${daysLeft} (${r.expiry_date})</span>
      </div>`;
    }).join('');
  }

  // 재고 부족 알림
  const lowSection = document.getElementById('lowStockSection');
  const lowList = document.getElementById('lowStockList');
  if (lowStockItems.length > 0 && lowSection && lowList) {
    lowSection.style.display = 'block';
    lowList.innerHTML = lowStockItems.slice(0, 10).map(s =>
      `<div class="stock-alert-item">
        <span><strong>${s.name}</strong></span>
        <span style="color:#e74c3c;font-weight:700">현재재고: ${numFormat(s.balance, 2)} ${s.unit}</span>
      </div>`
    ).join('');
  }

  // 오늘 입출고 현황판
  const todayStr = new Date().toISOString().split('T')[0];
  const todayIn = allInbound.filter(r => r.inbound_date === todayStr);
  const todayOut = allOutbound.filter(r => r.outbound_date === todayStr);

  const inList = document.getElementById('todayInboundList');
  const outList = document.getElementById('todayOutboundList');

  if (inList) {
    inList.innerHTML = todayIn.length
      ? todayIn.map(r => `<div class="today-card-item">
          <span><strong>${r.item_name || '-'}</strong> <small style="color:#888">${r.inbound_type || ''}</small></span>
          <span style="color:#27ae60;font-weight:700">${numFormat(r.qty, 2)} ${r.unit || ''}</span>
        </div>`).join('')
      : '<div class="empty-msg" style="font-size:12px">오늘 입고 없음</div>';
  }

  if (outList) {
    outList.innerHTML = todayOut.length
      ? todayOut.map(r => `<div class="today-card-item">
          <span><strong>${r.item_name || '-'}</strong></span>
          <span style="color:#e74c3c;font-weight:700">${numFormat(r.qty, 2)} ${r.unit || ''}</span>
        </div>`).join('')
      : '<div class="empty-msg" style="font-size:12px">오늘 출고 없음</div>';
  }
}

// =====================================================
// 로케이션 관리
// =====================================================
function buildLocationSelect() {
  const sel = document.getElementById('ib_location');
  if (!sel) return;
  sel.innerHTML = '<option value="">로케이션 선택</option>';
  allLocations.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.loc_code || '';
    opt.textContent = `[${l.loc_code || '-'}] ${l.loc_name || ''} (${l.warehouse_type || ''})`;
    sel.appendChild(opt);
  });
}

async function saveLocation() {
  const record = {
    warehouse_type: document.getElementById('loc_warehouse_type')?.value || '일반',
    loc_code: document.getElementById('loc_code')?.value?.trim() || '',
    loc_name: document.getElementById('loc_name')?.value?.trim() || '',
    capacity: parseFloat(document.getElementById('loc_capacity')?.value) || 0,
    stock_status: document.getElementById('loc_stock_status')?.value || '가용재고',
    notes: document.getElementById('loc_notes')?.value?.trim() || '',
    current_qty: 0,
  };
  if (!record.loc_code) { showToast('로케이션 코드를 입력하세요.', 'warning'); return; }
  try {
    await apiPost('wh_locations', record);
    showToast(`✅ 로케이션 [${record.loc_code}] 등록 완료`, 'success');
    document.getElementById('loc_code').value = '';
    document.getElementById('loc_name').value = '';
    document.getElementById('loc_capacity').value = '';
    document.getElementById('loc_notes').value = '';
    await loadAll();
  } catch(e) {
    showToast('등록 실패: ' + e.message, 'error');
  }
}

function renderLocations() {
  const grid = document.getElementById('locationGrid');
  if (!grid) return;
  const filter = document.getElementById('locWarehouseFilter')?.value || '';
  const data = filter ? allLocations.filter(l => l.warehouse_type === filter) : allLocations;

  if (!data.length) {
    grid.innerHTML = '<div class="empty-msg">등록된 로케이션이 없습니다.</div>';
    return;
  }

  grid.innerHTML = data.map(l => {
    const pct = l.capacity > 0 ? Math.round((l.current_qty / l.capacity) * 100) : 0;
    const cls = l.current_qty > 0 ? (pct > 80 ? 'low' : 'occupied') : 'empty';
    const barColor = pct > 80 ? '#e74c3c' : pct > 50 ? '#f39c12' : '#27ae60';
    const whIcon = l.warehouse_type === '냉장' ? '❄️' : l.warehouse_type === '냉동' ? '🧊' : '📦';
    const statusBadge = l.stock_status === '불량재고' ? '<span style="font-size:9px;background:#fdedec;color:#e74c3c;border-radius:3px;padding:1px 4px">불량</span>'
      : l.stock_status === '보류재고' ? '<span style="font-size:9px;background:#fff3cd;color:#856404;border-radius:3px;padding:1px 4px">보류</span>' : '';
    return `<div class="location-card ${cls}" onclick="showLocationDetail('${l.id}')">
      <div class="location-code">${whIcon} ${l.loc_code || '-'}</div>
      <div class="location-item">${l.loc_name || ''} ${statusBadge}</div>
      <div class="location-qty">${numFormat(l.current_qty || 0, 1)}</div>
      <div style="font-size:10px;color:#888">용량: ${numFormat(l.capacity || 0, 0)}</div>
      ${l.capacity > 0 ? `<div class="gauge-bar" style="margin-top:6px"><div class="gauge-fill" style="background:${barColor};width:${pct}%"></div></div><div style="font-size:10px;color:${barColor};font-weight:700">${pct}%</div>` : ''}
    </div>`;
  }).join('');
}

function showLocationDetail(id) {
  const loc = allLocations.find(l => l.id === id);
  if (!loc) return;
  const items = allInbound.filter(r => r.location === loc.loc_code);
  showToast(`[${loc.loc_code}] ${loc.loc_name || ''} - 현재수량: ${numFormat(loc.current_qty || 0, 2)} / 용량: ${numFormat(loc.capacity || 0, 0)}`, 'info');
}

// =====================================================
// 입고관리
// =====================================================
function onInboundTypeChange() {
  const type = document.getElementById('ib_type')?.value;
  const supplierEl = document.getElementById('ib_supplier');
  if (supplierEl) {
    supplierEl.placeholder = type === '생산입고' ? '생산라인명 (예: 로스팅라인)' : '공급업체명';
  }
}

async function saveInbound() {
  const lot = document.getElementById('inboundLotDisplay')?.dataset?.lot || '';
  const record = {
    lot_no: lot,
    inbound_date: document.getElementById('ib_date')?.value || '',
    inbound_type: document.getElementById('ib_type')?.value || '',
    item_name: document.getElementById('ib_item_name')?.value?.trim() || '',
    qty: parseFloat(document.getElementById('ib_qty')?.value) || 0,
    unit: document.getElementById('ib_unit')?.value || 'ea',
    mfg_date: document.getElementById('ib_mfg_date')?.value || '',
    expiry_date: document.getElementById('ib_expiry_date')?.value || '',
    temp: parseFloat(document.getElementById('ib_temp')?.value) || null,
    location: document.getElementById('ib_location')?.value || '',
    supplier: document.getElementById('ib_supplier')?.value?.trim() || '',
    manager: document.getElementById('ib_manager')?.value?.trim() || '',
    ref_lot: document.getElementById('ib_ref_lot')?.value?.trim() || '',
    stock_status: document.getElementById('ib_stock_status')?.value || '가용재고',
    notes: document.getElementById('ib_notes')?.value?.trim() || '',
  };

  if (!record.inbound_type) { showToast('입고 구분을 선택하세요.', 'warning'); return; }
  if (!record.item_name) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (!record.qty) { showToast('수량을 입력하세요.', 'warning'); return; }
  if (!record.expiry_date) { showToast('소비기한을 입력하세요.', 'warning'); return; }

  try {
    await apiPost('wh_inbound', record);
    // 로케이션 현재 수량 업데이트
    if (record.location) {
      const loc = allLocations.find(l => l.loc_code === record.location);
      if (loc) {
        await apiPut('wh_locations', loc.id, { ...loc, current_qty: (parseFloat(loc.current_qty) || 0) + record.qty });
      }
    }
    showToast(`✅ 입고 등록 완료! Lot: ${lot}`, 'success');
    resetInboundForm();
    await loadAll();
    await initLotNos();
  } catch(e) {
    showToast('입고 등록 실패: ' + e.message, 'error');
  }
}

function resetInboundForm() {
  ['ib_type','ib_item_name','ib_qty','ib_mfg_date','ib_expiry_date','ib_temp','ib_location','ib_supplier','ib_manager','ib_ref_lot','ib_notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const statusEl = document.getElementById('ib_stock_status');
  if (statusEl) statusEl.value = '가용재고';
}

function filterInbound() {
  const q = (document.getElementById('ibSearch')?.value || '').toLowerCase();
  const data = allInbound.filter(r =>
    !q || (r.item_name || '').toLowerCase().includes(q) || (r.lot_no || '').toLowerCase().includes(q)
  );
  renderInboundTable(data);
}

function renderInbound() {
  renderInboundTable(allInbound);
}

function renderInboundTable(data) {
  const tbody = document.getElementById('inboundTableBody');
  const countEl = document.getElementById('ibCount');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="empty-msg">입고 내역이 없습니다.</td></tr>';
    if (countEl) countEl.textContent = '0건';
    return;
  }
  const today = new Date();
  tbody.innerHTML = data.slice(0, 100).map(r => {
    const daysLeft = r.expiry_date ? Math.ceil((new Date(r.expiry_date) - today) / (1000 * 60 * 60 * 24)) : null;
    const expiryHtml = daysLeft !== null
      ? (daysLeft <= 30 ? `<span style="color:${daysLeft<=7?'#e74c3c':'#e67e22'};font-weight:700">${r.expiry_date} (D-${daysLeft})</span>` : r.expiry_date)
      : '-';
    const typeColor = r.inbound_type === '생산입고' ? '#27ae60' : '#3498db';
    const statusBadge = r.stock_status === '불량재고' ? '<span style="font-size:10px;background:#fdedec;color:#e74c3c;border-radius:4px;padding:1px 6px">불량</span>'
      : r.stock_status === '보류재고' ? '<span style="font-size:10px;background:#fff3cd;color:#856404;border-radius:4px;padding:1px 6px">보류</span>'
      : '<span style="font-size:10px;background:#eafaf1;color:#27ae60;border-radius:4px;padding:1px 6px">가용</span>';
    return `<tr>
      <td><span class="badge badge-lot" style="background:#eafaf1;color:#27ae60;border:1px solid #a9dfbf;font-size:11px">${r.lot_no||'-'}</span></td>
      <td>${r.inbound_date||'-'}</td>
      <td><span style="color:${typeColor};font-weight:700;font-size:12px">${r.inbound_type||'-'}</span></td>
      <td><strong>${r.item_name||'-'}</strong></td>
      <td style="text-align:right;font-weight:700;color:#27ae60">${numFormat(r.qty,2)}</td>
      <td>${r.unit||'-'}</td>
      <td>${r.mfg_date||'-'}</td>
      <td>${expiryHtml}</td>
      <td>${r.temp != null ? r.temp + '℃' : '-'}</td>
      <td>${r.location||'-'}</td>
      <td>${statusBadge}</td>
      <td>${r.manager||'-'}</td>
      <td>
        <button class="edit-row-btn" onclick="openEditModal('inbound','${r.id}')"><i class="fas fa-edit"></i></button>
        <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="deleteRecord('inbound','${r.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  if (countEl) countEl.textContent = `${data.length}건`;
}

function exportInbound() {
  const headers = ['Lot No','입고일','구분','품목명','수량','단위','제조일','소비기한','온도','로케이션','재고상태','담당자','비고'];
  const rows = allInbound.map(r => [r.lot_no||'',r.inbound_date||'',r.inbound_type||'',r.item_name||'',r.qty||0,r.unit||'',r.mfg_date||'',r.expiry_date||'',r.temp||'',r.location||'',r.stock_status||'',r.manager||'',r.notes||'']);
  downloadCsv(headers, rows, `입고이력_${new Date().toISOString().split('T')[0]}.csv`);
}

// =====================================================
// 출고관리
// =====================================================
function loadFifoSuggestion() {
  const itemName = (document.getElementById('ob_item_name')?.value || '').trim();
  const qty = parseFloat(document.getElementById('ob_qty')?.value) || 0;
  const box = document.getElementById('fifoSuggestionBox');
  const list = document.getElementById('fifoSuggestionList');
  if (!box || !list || !itemName) { if (box) box.style.display = 'none'; return; }

  // 해당 품목 입고 Lot (소비기한 오름차순 - 임박한 것 우선)
  const inLots = allInbound
    .filter(r => r.item_name === itemName && r.stock_status === '가용재고')
    .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

  if (!inLots.length) { box.style.display = 'none'; return; }

  // 출고된 수량 차감
  const usedMap = {};
  allOutbound.filter(r => r.item_name === itemName).forEach(r => {
    if (r.fifo_consumed) {
      try {
        const fc = JSON.parse(r.fifo_consumed);
        Object.entries(fc).forEach(([lot, q]) => { usedMap[lot] = (usedMap[lot] || 0) + parseFloat(q); });
      } catch(e) {}
    }
  });

  const available = inLots.map(r => {
    const used = usedMap[r.lot_no] || 0;
    const remaining = Math.max(0, (parseFloat(r.qty) || 0) - used);
    return { ...r, remaining };
  }).filter(r => r.remaining > 0);

  box.style.display = 'block';

  let remainQty = qty;
  list.innerHTML = available.map(r => {
    const take = Math.min(r.remaining, remainQty);
    remainQty -= take;
    const today = new Date();
    const daysLeft = r.expiry_date ? Math.ceil((new Date(r.expiry_date) - today) / (1000 * 60 * 60 * 24)) : null;
    const urgentColor = daysLeft !== null && daysLeft <= 30 ? '#e74c3c' : '#27ae60';
    return `<div class="picking-list-item">
      <span class="lot-tag">${r.lot_no}</span>
      <span style="flex:1;font-size:13px">${r.item_name}</span>
      <span style="font-size:12px;color:#888">${r.expiry_date || '-'}</span>
      ${daysLeft !== null ? `<span style="color:${urgentColor};font-size:12px;font-weight:700">D-${daysLeft}</span>` : ''}
      <span style="font-size:13px;color:#2C5F2E;font-weight:700">배정: ${numFormat(take, 2)} ${r.unit||''}</span>
    </div>`;
  }).join('');
}

async function saveOutbound() {
  const lot = document.getElementById('outboundLotDisplay')?.dataset?.lot || '';
  const itemName = (document.getElementById('ob_item_name')?.value || '').trim();
  const qty = parseFloat(document.getElementById('ob_qty')?.value) || 0;

  if (!itemName) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (!qty) { showToast('출고 수량을 입력하세요.', 'warning'); return; }

  // FIFO 계산
  const inLots = allInbound
    .filter(r => r.item_name === itemName && r.stock_status === '가용재고')
    .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
  const usedMap = {};
  allOutbound.filter(r => r.item_name === itemName).forEach(r => {
    if (r.fifo_consumed) {
      try {
        const fc = JSON.parse(r.fifo_consumed);
        Object.entries(fc).forEach(([l, q]) => { usedMap[l] = (usedMap[l] || 0) + parseFloat(q); });
      } catch(e) {}
    }
  });
  const available = inLots.map(r => {
    const used = usedMap[r.lot_no] || 0;
    const remaining = Math.max(0, (parseFloat(r.qty) || 0) - used);
    return { ...r, remaining };
  }).filter(r => r.remaining > 0);

  let remainQty = qty;
  const fifoConsumed = {};
  for (const r of available) {
    if (remainQty <= 0) break;
    const take = Math.min(r.remaining, remainQty);
    fifoConsumed[r.lot_no] = take;
    remainQty -= take;
  }

  if (remainQty > 0.001) {
    showToast(`재고 부족! 가용 재고가 부족합니다.`, 'error');
    return;
  }

  const record = {
    lot_no: lot,
    outbound_date: document.getElementById('ob_date')?.value || '',
    item_name: itemName,
    qty: qty,
    unit: available[0]?.unit || 'ea',
    expiry_date: available[0]?.expiry_date || '',
    vehicle_no: document.getElementById('ob_vehicle_no')?.value?.trim() || '',
    driver_contact: document.getElementById('ob_driver_contact')?.value?.trim() || '',
    temp: parseFloat(document.getElementById('ob_temp')?.value) || null,
    manager: document.getElementById('ob_manager')?.value?.trim() || '',
    destination: document.getElementById('ob_destination')?.value?.trim() || '',
    notes: document.getElementById('ob_notes')?.value?.trim() || '',
    fifo_consumed: JSON.stringify(fifoConsumed),
  };

  try {
    await apiPost('wh_outbound', record);
    showToast(`✅ 출고 등록 완료! Lot: ${lot}`, 'success');
    resetOutboundForm();
    await loadAll();
    await initLotNos();
  } catch(e) {
    showToast('출고 등록 실패: ' + e.message, 'error');
  }
}

function resetOutboundForm() {
  ['ob_item_name','ob_qty','ob_vehicle_no','ob_driver_contact','ob_temp','ob_manager','ob_destination','ob_notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const box = document.getElementById('fifoSuggestionBox');
  if (box) box.style.display = 'none';
}

function filterOutbound() {
  const q = (document.getElementById('obSearch')?.value || '').toLowerCase();
  const data = allOutbound.filter(r =>
    !q || (r.item_name || '').toLowerCase().includes(q) || (r.lot_no || '').toLowerCase().includes(q)
  );
  renderOutboundTable(data);
}

function renderOutbound() {
  renderOutboundTable(allOutbound);
  renderPickingList();
}

function renderOutboundTable(data) {
  const tbody = document.getElementById('outboundTableBody');
  const countEl = document.getElementById('obCount');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-msg">출고 내역이 없습니다.</td></tr>';
    if (countEl) countEl.textContent = '0건';
    return;
  }
  tbody.innerHTML = data.slice(0, 100).map(r => `<tr>
    <td><span class="badge badge-lot" style="background:#fdedec;color:#e74c3c;border:1px solid #f5b7b1;font-size:11px">${r.lot_no||'-'}</span></td>
    <td>${r.outbound_date||'-'}</td>
    <td><strong>${r.item_name||'-'}</strong></td>
    <td style="text-align:right;font-weight:700;color:#e74c3c">${numFormat(r.qty,2)}</td>
    <td>${r.unit||'-'}</td>
    <td>${r.expiry_date||'-'}</td>
    <td>${r.vehicle_no||'-'}</td>
    <td>${r.driver_contact||'-'}</td>
    <td>${r.temp != null ? r.temp + '℃' : '-'}</td>
    <td>${r.destination||'-'}</td>
    <td>${r.manager||'-'}</td>
    <td>
      <button class="edit-row-btn" onclick="openEditModal('outbound','${r.id}')"><i class="fas fa-edit"></i></button>
      <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="deleteRecord('outbound','${r.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
  if (countEl) countEl.textContent = `${data.length}건`;
}

function renderPickingList() {
  const container = document.getElementById('pickingListContainer');
  if (!container) return;
  const today = new Date().toISOString().split('T')[0];
  const todayOut = allOutbound.filter(r => r.outbound_date === today);
  if (!todayOut.length) {
    container.innerHTML = '<div class="empty-msg">오늘 출고 예정 내역이 없습니다.</div>';
    return;
  }
  container.innerHTML = todayOut.map(r => `
    <div class="picking-list-item">
      <span class="lot-tag">${r.lot_no||'-'}</span>
      <span style="flex:1;font-weight:700">${r.item_name||'-'}</span>
      <span style="color:#e74c3c;font-weight:700">${numFormat(r.qty,2)} ${r.unit||''}</span>
      <span style="font-size:12px;color:#888">${r.destination||''}</span>
      <span style="font-size:12px;color:#888">${r.vehicle_no||''}</span>
    </div>
  `).join('');
}

function exportOutbound() {
  const headers = ['Lot No','출고일','품목명','수량','단위','소비기한','차량번호','기사연락처','온도','거래처','담당자','비고'];
  const rows = allOutbound.map(r => [r.lot_no||'',r.outbound_date||'',r.item_name||'',r.qty||0,r.unit||'',r.expiry_date||'',r.vehicle_no||'',r.driver_contact||'',r.temp||'',r.destination||'',r.manager||'',r.notes||'']);
  downloadCsv(headers, rows, `출고이력_${new Date().toISOString().split('T')[0]}.csv`);
}

// =====================================================
// 재고수불 (Lot별 기초+입고-출고=기말)
// =====================================================
function calcLedgerMap() {
  const stockMap = {};
  allInbound.forEach(r => {
    const key = r.lot_no || r.item_name;
    if (!stockMap[key]) stockMap[key] = { name: r.item_name, lot: r.lot_no, unit: r.unit || '', balance: 0, inQty: 0, outQty: 0, expiry: r.expiry_date, location: r.location, status: r.stock_status };
    stockMap[key].inQty += parseFloat(r.qty || 0);
    stockMap[key].balance += parseFloat(r.qty || 0);
  });
  allOutbound.forEach(r => {
    if (r.fifo_consumed) {
      try {
        const fc = JSON.parse(r.fifo_consumed);
        Object.entries(fc).forEach(([lot, q]) => {
          if (stockMap[lot]) {
            stockMap[lot].outQty += parseFloat(q);
            stockMap[lot].balance -= parseFloat(q);
          }
        });
      } catch(e) {}
    } else {
      const key = r.lot_no || r.item_name;
      if (stockMap[key]) {
        stockMap[key].outQty += parseFloat(r.qty || 0);
        stockMap[key].balance -= parseFloat(r.qty || 0);
      }
    }
  });
  // 실사 조정 반영
  allStocktake.forEach(r => {
    if (r.lot_no && stockMap[r.lot_no]) {
      stockMap[r.lot_no].balance = parseFloat(r.actual_qty || 0);
    }
  });
  return stockMap;
}

function renderLedger() {
  const tbody = document.getElementById('ledgerTableBody');
  const countEl = document.getElementById('ledgerCount');
  if (!tbody) return;
  const q = (document.getElementById('ledgerSearch')?.value || '').toLowerCase();
  const stockMap = calcLedgerMap();
  const items = Object.values(stockMap).filter(s => !q || s.name.toLowerCase().includes(q));

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">데이터가 없습니다.</td></tr>';
    if (countEl) countEl.textContent = '0건';
    return;
  }

  const today = new Date();
  tbody.innerHTML = items.map(s => {
    const daysLeft = s.expiry ? Math.ceil((new Date(s.expiry) - today) / (1000 * 60 * 60 * 24)) : null;
    const expiryHtml = daysLeft !== null
      ? (daysLeft <= 30 ? `<span style="color:${daysLeft<=7?'#e74c3c':'#e67e22'};font-weight:700">${s.expiry} (D-${daysLeft})</span>` : s.expiry)
      : '-';
    const balColor = s.balance <= 0 ? '#e74c3c' : s.balance < 10 ? '#f39c12' : '#1e8449';
    const statusBadge = s.status === '불량재고' ? '<span style="font-size:10px;background:#fdedec;color:#e74c3c;border-radius:4px;padding:1px 6px">불량</span>'
      : s.status === '보류재고' ? '<span style="font-size:10px;background:#fff3cd;color:#856404;border-radius:4px;padding:1px 6px">보류</span>'
      : '<span style="font-size:10px;background:#eafaf1;color:#27ae60;border-radius:4px;padding:1px 6px">가용</span>';
    return `<tr>
      <td><span class="badge badge-lot" style="font-size:11px">${s.lot||'-'}</span></td>
      <td><strong>${s.name||'-'}</strong></td>
      <td>${s.inbound_date||'-'}</td>
      <td>${expiryHtml}</td>
      <td style="text-align:right">0</td>
      <td style="text-align:right;color:#27ae60;font-weight:700">${numFormat(s.inQty,2)}</td>
      <td style="text-align:right;color:#e74c3c">${numFormat(s.outQty,2)}</td>
      <td style="text-align:right;font-weight:800;color:${balColor}">${numFormat(s.balance,2)}</td>
      <td>${s.unit||'-'}</td>
      <td>${s.location||'-'}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
  if (countEl) countEl.textContent = `${items.length}건`;
}

function exportLedger() {
  const stockMap = calcLedgerMap();
  const headers = ['Lot No','품목명','소비기한','기초재고','입고','출고','기말재고','단위','로케이션','재고상태'];
  const rows = Object.values(stockMap).map(s => [s.lot||'',s.name||'',s.expiry||'',0,s.inQty||0,s.outQty||0,s.balance||0,s.unit||'',s.location||'',s.status||'']);
  downloadCsv(headers, rows, `재고수불부_${new Date().toISOString().split('T')[0]}.csv`);
}

// =====================================================
// 재고실사
// =====================================================
function calcStocktakeDiff() {
  const system = parseFloat(document.getElementById('st_system_qty')?.value) || 0;
  const actual = parseFloat(document.getElementById('st_actual_qty')?.value) || 0;
  const diffEl = document.getElementById('st_diff_qty');
  if (diffEl) {
    const diff = actual - system;
    diffEl.value = diff.toFixed(2);
    diffEl.style.color = diff < 0 ? '#e74c3c' : diff > 0 ? '#27ae60' : '#333';
  }
}

async function saveStocktake() {
  const record = {
    stocktake_date: document.getElementById('st_date')?.value || '',
    item_name: document.getElementById('st_item_name')?.value?.trim() || '',
    lot_no: document.getElementById('st_lot_no')?.value?.trim() || '',
    system_qty: parseFloat(document.getElementById('st_system_qty')?.value) || 0,
    actual_qty: parseFloat(document.getElementById('st_actual_qty')?.value) || 0,
    diff_qty: parseFloat(document.getElementById('st_diff_qty')?.value) || 0,
    manager: document.getElementById('st_manager')?.value?.trim() || '',
    reason: document.getElementById('st_reason')?.value?.trim() || '',
  };

  if (!record.item_name) { showToast('품목명을 입력하세요.', 'warning'); return; }
  if (!record.actual_qty && record.actual_qty !== 0) { showToast('실제 재고를 입력하세요.', 'warning'); return; }

  try {
    await apiPost('wh_stocktake', record);
    showToast('✅ 재고 실사 조정 등록 완료', 'success');
    await loadAll();
  } catch(e) {
    showToast('등록 실패: ' + e.message, 'error');
  }
}

function renderStocktake() {
  const tbody = document.getElementById('stocktakeTableBody');
  if (!tbody) return;
  if (!allStocktake.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-msg">실사 이력이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = allStocktake.map(r => {
    const diffColor = r.diff_qty < 0 ? '#e74c3c' : r.diff_qty > 0 ? '#27ae60' : '#333';
    return `<tr>
      <td>${r.stocktake_date||'-'}</td>
      <td><strong>${r.item_name||'-'}</strong></td>
      <td><span class="badge badge-lot" style="font-size:11px">${r.lot_no||'-'}</span></td>
      <td style="text-align:right">${numFormat(r.system_qty,2)}</td>
      <td style="text-align:right;font-weight:700">${numFormat(r.actual_qty,2)}</td>
      <td style="text-align:right;color:${diffColor};font-weight:700">${r.diff_qty > 0 ? '+' : ''}${numFormat(r.diff_qty,2)}</td>
      <td>${r.reason||'-'}</td>
      <td>${r.manager||'-'}</td>
      <td><button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="deleteRecord('stocktake','${r.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
}

// =====================================================
// 수정/삭제 모달
// =====================================================
function openEditModal(type, id) {
  currentEditType = type;
  currentEditId = id;
  let rec;
  if (type === 'inbound') rec = allInbound.find(r => r.id === id);
  else if (type === 'outbound') rec = allOutbound.find(r => r.id === id);
  if (!rec) return;

  const body = document.getElementById('editModalBody');
  if (type === 'inbound') {
    body.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="form-group"><label>입고일자</label><input type="date" id="e_date" value="${rec.inbound_date||''}" /></div>
        <div class="form-group"><label>품목명</label><input type="text" id="e_item_name" value="${rec.item_name||''}" /></div>
        <div class="form-group"><label>수량</label><input type="number" id="e_qty" value="${rec.qty||0}" step="0.01" /></div>
        <div class="form-group"><label>소비기한</label><input type="date" id="e_expiry" value="${rec.expiry_date||''}" /></div>
        <div class="form-group"><label>온도(℃)</label><input type="number" id="e_temp" value="${rec.temp||''}" step="0.1" /></div>
        <div class="form-group"><label>로케이션</label><input type="text" id="e_location" value="${rec.location||''}" /></div>
        <div class="form-group"><label>재고상태</label>
          <select id="e_stock_status">${['가용재고','불량재고','보류재고'].map(s=>`<option ${rec.stock_status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label>비고</label><input type="text" id="e_notes" value="${rec.notes||''}" /></div>
      </div>`;
  } else if (type === 'outbound') {
    body.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="form-group"><label>출고일자</label><input type="date" id="e_date" value="${rec.outbound_date||''}" /></div>
        <div class="form-group"><label>품목명</label><input type="text" id="e_item_name" value="${rec.item_name||''}" /></div>
        <div class="form-group"><label>수량</label><input type="number" id="e_qty" value="${rec.qty||0}" step="0.01" /></div>
        <div class="form-group"><label>차량번호</label><input type="text" id="e_vehicle_no" value="${rec.vehicle_no||''}" /></div>
        <div class="form-group"><label>기사연락처</label><input type="text" id="e_driver_contact" value="${rec.driver_contact||''}" /></div>
        <div class="form-group"><label>온도(℃)</label><input type="number" id="e_temp" value="${rec.temp||''}" step="0.1" /></div>
        <div class="form-group"><label>거래처</label><input type="text" id="e_destination" value="${rec.destination||''}" /></div>
        <div class="form-group"><label>비고</label><input type="text" id="e_notes" value="${rec.notes||''}" /></div>
      </div>`;
  }
  document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
  currentEditType = '';
  currentEditId = null;
}

async function saveCurrentEdit() {
  let rec, updated;
  if (currentEditType === 'inbound') {
    rec = allInbound.find(r => r.id === currentEditId);
    updated = { ...rec, inbound_date: document.getElementById('e_date').value, item_name: document.getElementById('e_item_name').value, qty: parseFloat(document.getElementById('e_qty').value)||0, expiry_date: document.getElementById('e_expiry').value, temp: parseFloat(document.getElementById('e_temp').value)||null, location: document.getElementById('e_location').value, stock_status: document.getElementById('e_stock_status').value, notes: document.getElementById('e_notes').value };
    await apiPut('wh_inbound', currentEditId, updated);
  } else if (currentEditType === 'outbound') {
    rec = allOutbound.find(r => r.id === currentEditId);
    updated = { ...rec, outbound_date: document.getElementById('e_date').value, item_name: document.getElementById('e_item_name').value, qty: parseFloat(document.getElementById('e_qty').value)||0, vehicle_no: document.getElementById('e_vehicle_no').value, driver_contact: document.getElementById('e_driver_contact').value, temp: parseFloat(document.getElementById('e_temp').value)||null, destination: document.getElementById('e_destination').value, notes: document.getElementById('e_notes').value };
    await apiPut('wh_outbound', currentEditId, updated);
  }
  showToast('수정 완료!', 'success');
  closeEditModal();
  await loadAll();
}

async function deleteRecord(type, id) {
  const tableMap = { inbound: 'wh_inbound', outbound: 'wh_outbound', stocktake: 'wh_stocktake', location: 'wh_locations' };
  showConfirm('이 기록을 삭제하시겠습니까?', async () => {
    try {
      await apiDelete(tableMap[type] || type, id || currentEditId);
      showToast('삭제 완료!', 'success');
      closeEditModal();
      await loadAll();
    } catch(e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}

function deleteCurrentRecord() { deleteRecord(currentEditType, currentEditId); }

// =====================================================
// CSV 다운로드 헬퍼
// =====================================================
function downloadCsv(headers, rows, filename) {
  const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('엑셀 다운로드 완료!', 'success');
}

// =====================================================
// 헬퍼
// =====================================================
function numFormat(v, d = 0) {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
