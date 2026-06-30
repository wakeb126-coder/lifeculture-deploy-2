// =====================================================
// 물류관리 JS (수입제품 / OEM제품 / 자체생산 구분)
// =====================================================

let allLogisticsData = [];
let lgEditingId = null;
let lgEditingSource = 'logistics'; // 'logistics' | 'wh_outbound'
let allWhInboundData = [];   // 창고 입고 데이터 (wh_inbound)
let allWhOutboundData = [];  // 창고 출고 데이터 (wh_outbound)

document.addEventListener('DOMContentLoaded', async () => {
  // new Date() 1회 생성 후 재사용
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  const dateEl = document.getElementById('lg_date');
  if (dateEl) dateEl.value = today;
  // 전체현황 기본 기간 (이번달)
  const fromEl = document.getElementById('allDateFrom');
  const toEl = document.getElementById('allDateTo');
  if (fromEl) fromEl.value = `${y}-${m}-01`;
  if (toEl) toEl.value = today;

  // LotNo 생성 (날짜기반 임시 LotNo, 데이터 로드 없이 즉시 생성)
  await lgRefreshLotNoFast();
  // loadLogisticsData는 warehouse-mgmt.js의 whLoadAll() 완료 후 호출됨
  // (wh_inbound, wh_outbound 데이터가 채워진 상태 보장)

  const form = document.getElementById('logisticsForm');
  if (form) form.addEventListener('submit', lgHandleSubmit);
});

// =====================================================
// Lot No 자동생성
// =====================================================
// 빠른 버전: Firestore 조회 없이 날짜+랜덤으로 임시 LotNo 생성 (데이터 로드 후 정확한 번호로 교체)
async function lgRefreshLotNoFast() {
  const display = document.getElementById('lgLotDisplay');
  if (!display) return;
  display.textContent = '생성 중...';
  const type = document.getElementById('lg_transaction_type')?.value || 'IN';
  const prodType = document.getElementById('lg_product_type')?.value || '';
  const typeCode = type === '입고' ? 'IN' : type === '출고' ? 'OUT' : type === '반품' ? 'RET' : 'ADJ';
  const prodCode = prodType === '수입제품' ? 'IMP' : prodType === 'OEM제품' ? 'OEM' : prodType === '자체생산' ? 'OWN' : 'LOG';
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
  const rand = String(Math.floor(Math.random() * 900) + 100);
  const lot = `LG-${prodCode}-${typeCode}-${dateStr}-${rand}`;
  display.textContent = lot;
  display.dataset.lot = lot;
}

async function lgRefreshLotNo() {
  const display = document.getElementById('lgLotDisplay');
  if (!display) return;
  display.textContent = '생성 중...';
  const lot = await lgGenerateLotNo();
  display.textContent = lot;
  display.dataset.lot = lot;
}

async function lgGenerateLotNo() {
  try {
    const type = document.getElementById('lg_transaction_type')?.value || 'IN';
    const prodType = document.getElementById('lg_product_type')?.value || '';
    const typeCode = type === '입고' ? 'IN' : type === '출고' ? 'OUT' : type === '반품' ? 'RET' : 'ADJ';
    const prodCode = prodType === '수입제품' ? 'IMP' : prodType === 'OEM제품' ? 'OEM' : prodType === '자체생산' ? 'OWN' : 'LOG';
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
    // 캐시 사용 (Firestore 재조회 없음 - 성능 최적화)
    const data = (typeof allLogisticsData !== 'undefined') ? allLogisticsData : [];
    const prefix = `LG-${prodCode}-${typeCode}-${dateStr}`;
    const todayLots = data.filter(r => r.lot_no && r.lot_no.startsWith(prefix));
    const seq = String(todayLots.length + 1).padStart(3, '0');
    return `${prefix}-${seq}`;
  } catch(e) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `LG-LOG-IN-${dateStr}-${rand}`;
  }
}

// =====================================================
// 거래유형 변경
// =====================================================
async function lgHandleTransactionType() {
  await lgRefreshLotNo();
  const type = document.getElementById('lg_transaction_type')?.value;
  const statusEl = document.getElementById('lg_status');
  if (statusEl) {
    if (type === '입고') statusEl.value = '입고완료';
    else if (type === '출고') statusEl.value = '출고완료';
    else if (type === '반품') statusEl.value = '반품';
  }
}

// =====================================================
// 제품유형 변경 → 전용 섹션 표시
// =====================================================
function lgShowProductSections() {
  const prodType = document.getElementById('lg_product_type')?.value;
  const importSec = document.getElementById('lg_import_section');
  const oemSec = document.getElementById('lg_oem_section');
  const ownSec = document.getElementById('lg_own_section');
  if (importSec) importSec.style.display = prodType === '수입제품' ? '' : 'none';
  if (oemSec) oemSec.style.display = prodType === 'OEM제품' ? '' : 'none';
  if (ownSec) ownSec.style.display = prodType === '자체생산' ? '' : 'none';
}

// =====================================================
// 금액 자동계산
// =====================================================
function lgCalcAmount() {
  const qty = parseFloat(document.getElementById('lg_quantity')?.value) || 0;
  const price = parseFloat(document.getElementById('lg_unit_price')?.value) || 0;
  const totalEl = document.getElementById('lg_total_amount');
  if (totalEl) totalEl.value = (qty * price).toFixed(0);
}

// =====================================================
// 데이터 로드
// =====================================================
// 스켈레톤 행 생성 헬퍼
function lgSkeletonRows(cols, count) {
  count = count || 5;
  var rows = '';
  for (var i = 0; i < count; i++) {
    rows += '<tr class="skeleton-row">';
    for (var j = 0; j < cols; j++) {
      var w = (j === 0) ? '60%' : (j === cols-1) ? '40%' : '80%';
      rows += '<td><div class="skeleton skeleton-cell" style="width:' + w + '"></div></td>';
    }
    rows += '</tr>';
  }
  return rows;
}

async function loadLogisticsData() {
  // allTableBody만 스켈레톤 표시 (stockTableBody는 lgRenderStockTable이 직접 채움)
  var allTbody = document.getElementById('allTableBody');
  if (allTbody) allTbody.innerHTML = lgSkeletonRows(11, 5);
  try {
    // wh_inbound, wh_outbound는 warehouse-mgmt.js의 whLoadAll()이 이미 조회하므로
    // 중복 Firestore 요청 방지를 위해 logistics만 단독 조회
    const res = await apiGetAll('logistics');
    allLogisticsData = (res || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    // warehouse-mgmt.js 전역 변수 재사용 (없으면 빈 배열)
    allWhInboundData = (typeof whInboundData !== 'undefined' ? whInboundData : []);
    allWhOutboundData = (typeof whOutboundData !== 'undefined' ? whOutboundData : []);
    lgUpdateKpiCards();
    // 성능 개선: 현재 활성 탭만 렌더링 (비활성 탭은 탭 전환 시 렌더링)
    const activeTab = document.querySelector('.tab-btn.active');
    const activeTabId = activeTab ? activeTab.id : 'tabAll';
    const tabMap = { 'tabImport': 'import', 'tabOem': 'oem', 'tabOwn': 'own', 'tabAll': 'all',
                     'tabWhMap': 'wh_map', 'tabWhIn': 'wh_in', 'tabWhOut': 'wh_out', 'tabWhStocktake': 'wh_stocktake' };
    const currentTab = tabMap[activeTabId] || 'all';
    if (['import','oem','own','all'].includes(currentTab)) {
      lgFilterTable(currentTab);
    }
    // 재고현황은 탭에 관계없이 항상 갱신 (스켈레톤 상태로 멈추는 문제 해결)
    if (typeof lgRenderStockTable === 'function') lgRenderStockTable();
    // LotNo는 캐시 기반으로만 갱신 (Firestore 재조회 없음)
  } catch(e) {
    console.error('[logistics] 데이터 로드 실패:', e);
    // 오류 시 스켈레톤 제거 - 로딩 고착 방지
    var stockTbodyErr = document.getElementById('stockTableBody');
    var allTbodyErr = document.getElementById('allTableBody');
    if (stockTbodyErr) {
      stockTbodyErr.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e74c3c;padding:30px"><i class="fas fa-exclamation-triangle"></i> 데이터 로드 실패. 새로고침을 시도해 주세요.</td></tr>';
    }
    if (allTbodyErr) {
      allTbodyErr.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#e74c3c;padding:30px"><i class="fas fa-exclamation-triangle"></i> 데이터 로드 실패. 새로고침을 시도해 주세요.</td></tr>';
    }
  }
}

// =====================================================
// KPI 카드 업데이트
// =====================================================
function lgUpdateKpiCards() {
  // logistics 콜렉션 기준 (WH-IN- 동기화 기록 제외)
  const lgFiltered = allLogisticsData.filter(r => !(r.lot_no || '').startsWith('WH-IN-'));
  // wh_inbound 데이터를 logistics 형식으로 변환
  const whInRows = (allWhInboundData || []).map(r => ({
    product_type: r.inbound_type || '수입제품',
    status: '입고완료',
    transaction_type: '입고'
  }));
  const allCombined = [...lgFiltered, ...whInRows];
  const importCount = allCombined.filter(r => r.product_type === '수입제품').length;
  const oemCount = allCombined.filter(r => r.product_type === 'OEM제품' || r.product_type === 'OEM').length;
  const ownCount = allCombined.filter(r => r.product_type === '자체생산').length;
  const pendingCount = allLogisticsData.filter(r => r.status === '입고대기').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kpi_import', importCount.toLocaleString());
  set('kpi_oem', oemCount.toLocaleString());
  set('kpi_own', ownCount.toLocaleString());
  set('kpi_pending', pendingCount.toLocaleString());
}

// =====================================================
// 테이블 필터 및 렌더링
// =====================================================
function lgFilterTable(tab) {
  const isMobile = window.innerWidth <= 768;
  if (tab === 'import') {
    const q = (document.getElementById('importSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('importStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === '수입제품' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (isMobile) {
      lgShowMobileCard('importCardView', 'importTableWrap', data, 'import');
    } else {
      lgShowDesktopTable('importCardView', 'importTableWrap');
      lgRenderTable('importTableBody', data, 'import');
    }
    const el = document.getElementById('importCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'oem') {
    const q = (document.getElementById('oemSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('oemStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === 'OEM제품' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (isMobile) {
      lgShowMobileCard('oemCardView', 'oemTableWrap', data, 'oem');
    } else {
      lgShowDesktopTable('oemCardView', 'oemTableWrap');
      lgRenderTable('oemTableBody', data, 'oem');
    }
    const el = document.getElementById('oemCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'own') {
    const q = (document.getElementById('ownSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('ownStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === '자체생산' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (isMobile) {
      lgShowMobileCard('ownCardView', 'ownTableWrap', data, 'own');
    } else {
      lgShowDesktopTable('ownCardView', 'ownTableWrap');
      lgRenderTable('ownTableBody', data, 'own');
    }
    const el = document.getElementById('ownCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'all') {
    const q = (document.getElementById('allSearch')?.value || '').toLowerCase();
    const typeF = document.getElementById('allTypeFilter')?.value || '';
    const txF = document.getElementById('allTxFilter')?.value || '';
    const from = document.getElementById('allDateFrom')?.value || '';
    const to = document.getElementById('allDateTo')?.value || '';
    // logistics 콜렉션에서 WH-OUT- / WH-IN- 창고 동기화 기록 제외
    // 창고 입/출고는 wh_inbound / wh_outbound에서만 표시 (단일 진실 공급원)
    const lgFiltered = allLogisticsData.filter(r => !(r.lot_no || '').startsWith('WH-OUT-') && !(r.lot_no || '').startsWith('WH-IN-'));
    // wh_inbound 전체를 logistics 형식으로 변환
    const whInRows = (allWhInboundData || []).map(r => ({
      id: r.id,
      lot_no: r.lot_no || r.id || '',
      product_type: r.inbound_type || '수입제품',
      transaction_type: '입고',
      date: r.inbound_date || r.date || '',
      product_name: r.item_name || '',
      quantity: Number(r.qty) || 0,
      unit: r.unit || 'ea',
      total_amount: null,
      expiry_date: r.expiry_date || '',
      status: '입고완료',
      manager: r.manager || '',
      notes: r.memo || '',
      _from_wh_inbound: true
    }));
    // wh_outbound 전체를 logistics 형식으로 변환
    const whOutRows = (allWhOutboundData || []).map(r => ({
      id: r.id,
      lot_no: r.lot_no || r.id || '',
      product_type: r.product_type || '수입제품',
      transaction_type: '출고',
      date: r.outbound_date || r.out_date || r.date || '',
      product_name: r.item_name || '',
      quantity: r.qty,
      unit: r.unit || 'ea',
      total_amount: null,
      expiry_date: r.expiry_date || '',
      status: '출고완료',
      manager: r.manager || '',
      notes: r.destination || r.memo || '',
      _from_wh_outbound: true
    }));
    const combined = [...lgFiltered, ...whInRows, ...whOutRows];
    const data = combined.filter(r =>
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!typeF || r.product_type === typeF) &&
      (!txF || r.transaction_type === txF) &&
      (!from || (r.date || '') >= from) &&
      (!to || (r.date || '') <= to)
    ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (isMobile) {
      lgShowMobileCard('allCardView', 'allTableWrap', data, 'all');
    } else {
      lgShowDesktopTable('allCardView', 'allTableWrap');
      lgRenderTable('allTableBody', data, 'all');
    }
    const el = document.getElementById('allCount');
    const el2 = document.getElementById('allResultCount');
    if (el) el.textContent = `${data.length}건`;
    if (el2) el2.textContent = `${data.length}건 조회됨`;
  }
}

function lgShowMobileCard(cardId, tableWrapId, data, tab) {
  const card = document.getElementById(cardId);
  const wrap = document.getElementById(tableWrapId);
  if (card) { card.style.display = 'block'; lgRenderCardView(cardId, data, tab); }
  if (wrap) wrap.style.display = 'none';
}

function lgShowDesktopTable(cardId, tableWrapId) {
  const card = document.getElementById(cardId);
  const wrap = document.getElementById(tableWrapId);
  if (card) card.style.display = 'none';
  if (wrap) wrap.style.display = 'block';
}

// ── 모바일 카드뷰 렌더링 (데스크탑은 기존 테이블 유지) ──
function lgRenderCardView(containerId, data, tab) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data.length) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:8px"></i>등록된 내역이 없습니다.</div>';
    return;
  }
  const txColor = { '입고': '#27ae60', '출고': '#e74c3c', '반품': '#e67e22', '조정': '#8e44ad' };
  const statusClass = { '입고대기': 'status-입고대기', '입고완료': 'status-입고완료', '출고중': 'status-출고중', '출고완료': 'status-출고완료', '반품': 'status-반품' };
  const typeClass = { '수입제품': 'type-import', 'OEM제품': 'type-oem', '자체생산': 'type-own' };
  const now = new Date();
  container.innerHTML = data.map(r => {
    const txBadge = `<span style="color:${txColor[r.transaction_type]||'#555'};font-weight:700;font-size:12px">${r.transaction_type||'-'}</span>`;
    const statusBadge = `<span class="status-badge ${statusClass[r.status]||''}" style="font-size:11px">${r.status||'-'}</span>`;
    const typeBadge = tab === 'all' ? `<span class="product-type-badge ${typeClass[r.product_type]||''}" style="font-size:11px">${r.product_type||'-'}</span>` : '';
    let expiryHtml = r.expiry_date || '-';
    if (r.expiry_date) {
      const daysLeft = Math.ceil((new Date(r.expiry_date) - now) / 86400000);
      if (daysLeft <= 30 && daysLeft > 0) expiryHtml = `<span style="color:#e67e22;font-weight:700">${r.expiry_date} <small>(D-${daysLeft})</small></span>`;
      else if (daysLeft <= 0) expiryHtml = `<span style="color:#e74c3c;font-weight:700">${r.expiry_date} <small>(만료)</small></span>`;
    }
    const totalFmt = r.total_amount ? Number(r.total_amount).toLocaleString() + '원' : '-';
    const extraInfo = tab === 'import' ? `<div style="font-size:11px;color:#666">원산지: ${r.origin||'-'}</div>` :
      tab === 'oem' ? `<div style="font-size:11px;color:#666">OEM제조사: ${r.oem_manufacturer||'-'}</div>` :
      tab === 'own' ? `<div style="font-size:11px;color:#666">공정: ${r.process||'-'} | 생산Lot: ${r.production_lot||'-'}</div>` :
      `<div style="font-size:11px;color:#666">${typeBadge}</div>`;
    return `<div style="background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:3px solid ${txColor[r.transaction_type]||'#ddd'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div>
          <div style="font-weight:700;font-size:13px">${r.product_name||'-'}</div>
          <div style="font-size:10px;color:#888;font-family:monospace;margin-top:2px">${r.lot_no||'-'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">${txBadge}${statusBadge}</div>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;color:#555;flex-wrap:wrap;margin-bottom:6px">
        <span><i class="fas fa-calendar" style="color:#aaa"></i> ${r.date||'-'}</span>
        <span><i class="fas fa-boxes" style="color:#aaa"></i> ${r.quantity!=null?Number(r.quantity).toLocaleString():'-'} ${r.unit||''}</span>
        <span style="color:#1e8449;font-weight:700">${totalFmt}</span>
      </div>
      ${extraInfo}
      <div style="font-size:11px;color:#666;margin-top:4px">소비기한: ${expiryHtml} | 담당: ${r.manager||'-'}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}')" style="flex:1;padding:6px;font-size:12px"><i class="fas fa-edit"></i> 수정</button>
        <button class="edit-row-btn" style="flex:1;padding:6px;font-size:12px;color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}')"><i class="fas fa-trash"></i> 삭제</button>
      </div>
    </div>`;
  }).join('');
}

function lgRenderTable(tbodyId, data, tab) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!data.length) {
    const colCount = tab === 'all' ? 11 : 13;
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-msg"><i class="fas fa-inbox"></i> 등록된 내역이 없습니다.</td></tr>`;
    return;
  }

  const txColor = { '입고': '#27ae60', '출고': '#e74c3c', '반품': '#e67e22', '조정': '#8e44ad' };
  const statusClass = { '입고대기': 'status-입고대기', '입고완료': 'status-입고완료', '출고중': 'status-출고중', '출고완료': 'status-출고완료', '반품': 'status-반품' };
  const typeClass = { '수입제품': 'type-import', 'OEM제품': 'type-oem', '자체생산': 'type-own' };

  tbody.innerHTML = data.map(r => {
    const txBadge = `<span style="color:${txColor[r.transaction_type]||'#555'};font-weight:700">${r.transaction_type || '-'}</span>`;
    const statusBadge = `<span class="status-badge ${statusClass[r.status] || ''}">${r.status || '-'}</span>`;
    const typeBadge = `<span class="product-type-badge ${typeClass[r.product_type] || ''}">${r.product_type || '-'}</span>`;

    let expiryHtml = r.expiry_date || '-';
    if (r.expiry_date) {
      const daysLeft = Math.ceil((new Date(r.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30 && daysLeft > 0) {
        expiryHtml = `<span style="color:#e67e22;font-weight:700">${r.expiry_date} <small>(D-${daysLeft})</small></span>`;
      } else if (daysLeft <= 0) {
        expiryHtml = `<span style="color:#e74c3c;font-weight:700">${r.expiry_date} <small>(만료)</small></span>`;
      }
    }

    const qcVal = r.oem_qc || r.own_qc || '';
    const qcBadge = qcVal === '합격' ? '✅ 합격' : qcVal === '불합격' ? '❌ 불합격' : qcVal === '특채' ? '⚠️ 특채' : '-';
    const totalFmt = r.total_amount ? Number(r.total_amount).toLocaleString() + '원' : '-';

    if (tab === 'import') {
      return `<tr>
        <td style="font-size:11px">${r.lot_no || '-'}</td>
        <td>${txBadge}</td>
        <td>${r.date || '-'}</td>
        <td><strong>${r.product_name || '-'}</strong></td>
        <td style="text-align:right">${r.quantity != null ? Number(r.quantity).toLocaleString() : '-'}</td>
        <td>${r.unit || '-'}</td>
        <td style="text-align:right;color:#1e8449">${totalFmt}</td>
        <td>${r.origin || '-'}</td>
        <td>${expiryHtml}</td>
        <td>${statusBadge}</td>
        <td>${r.manager || '-'}</td>
        <td>${r.notes || '-'}</td>
        <td>
          <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}')"><i class="fas fa-edit"></i></button>
          <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    } else if (tab === 'oem') {
      return `<tr>
        <td style="font-size:11px">${r.lot_no || '-'}</td>
        <td>${txBadge}</td>
        <td>${r.date || '-'}</td>
        <td><strong>${r.product_name || '-'}</strong></td>
        <td style="text-align:right">${r.quantity != null ? Number(r.quantity).toLocaleString() : '-'}</td>
        <td>${r.unit || '-'}</td>
        <td style="text-align:right;color:#1e8449">${totalFmt}</td>
        <td>${r.oem_manufacturer || '-'}</td>
        <td>${expiryHtml}</td>
        <td>${qcBadge}</td>
        <td>${statusBadge}</td>
        <td>${r.manager || '-'}</td>
        <td>
          <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}')"><i class="fas fa-edit"></i></button>
          <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    } else if (tab === 'own') {
      return `<tr>
        <td style="font-size:11px">${r.lot_no || '-'}</td>
        <td>${txBadge}</td>
        <td>${r.date || '-'}</td>
        <td><strong>${r.product_name || '-'}</strong></td>
        <td style="text-align:right">${r.quantity != null ? Number(r.quantity).toLocaleString() : '-'}</td>
        <td>${r.unit || '-'}</td>
        <td style="text-align:right;color:#1e8449">${totalFmt}</td>
        <td>${r.process || '-'}</td>
        <td style="font-size:11px">${r.production_lot || '-'}</td>
        <td>${expiryHtml}</td>
        <td>${statusBadge}</td>
        <td>${r.manager || '-'}</td>
        <td>
          <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}')"><i class="fas fa-edit"></i></button>
          <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    } else {
      // 소스 파악 (wh_inbound / wh_outbound / logistics)
      const rowSrc = r._from_wh_inbound ? 'wh_inbound' : r._from_wh_outbound ? 'wh_outbound' : 'logistics';
      // 수량 표시: box 단위이면 박스 수량 표시, ea이면 낙개 표시
      const qty = r.quantity != null ? Number(r.quantity) : null;
      const qtyDisplay = qty != null
        ? (r.unit === 'box' ? `<span style="font-weight:700">${qty.toLocaleString()}</span><small style="color:#888;margin-left:3px">box</small>`
          : r.unit === 'pallet' ? `<span style="font-weight:700">${qty.toLocaleString()}</span><small style="color:#888;margin-left:3px">pallet</small>`
          : `<span style="font-weight:700">${qty.toLocaleString()}</span><small style="color:#888;margin-left:3px">${r.unit||'ea'}</small>`)
        : '-';
      return `<tr>
        <td style="font-size:11px">${r.lot_no || '-'}</td>
        <td>${typeBadge}</td>
        <td>${txBadge}</td>
        <td>${r.date || '-'}</td>
        <td><strong>${r.product_name || '-'}</strong></td>
        <td style="text-align:right">${qtyDisplay}</td>
        <td>${expiryHtml}</td>
        <td>${statusBadge}</td>
        <td>${r.manager || '-'}</td>
        <td>${r.notes || '-'}</td>
        <td>
          <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}','${rowSrc}')"><i class="fas fa-edit"></i></button>
          <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}','${rowSrc}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }
  }).join('');
}

// =====================================================
// 폼 제출
// =====================================================
async function lgHandleSubmit(e) {
  e.preventDefault();

  const strVal = (id) => document.getElementById(id)?.value?.trim() || '';
  const numVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;

  const lot = document.getElementById('lgLotDisplay')?.dataset?.lot || document.getElementById('lgLotDisplay')?.textContent || '';
  const prodType = strVal('lg_product_type');
  const txType = strVal('lg_transaction_type');

  if (!txType) { showToast('거래유형을 선택하세요.', 'warning'); return; }
  if (!prodType) { showToast('제품유형을 선택하세요.', 'warning'); return; }
  if (!strVal('lg_product_name')) { showToast('제품명을 입력하세요.', 'warning'); return; }
  if (!strVal('lg_manager')) { showToast('담당자를 입력하세요.', 'warning'); return; }

  const record = {
    lot_no: lot,
    transaction_type: txType,
    product_type: prodType,
    date: strVal('lg_date'),
    product_name: strVal('lg_product_name'),
    product_code: strVal('lg_product_code'),
    quantity: numVal('lg_quantity'),
    unit: strVal('lg_unit'),
    unit_price: numVal('lg_unit_price'),
    total_amount: numVal('lg_total_amount'),
    expiry_date: strVal('lg_expiry_date'),
    storage_location: strVal('lg_storage_location'),
    manager: strVal('lg_manager'),
    vendor: strVal('lg_vendor'),
    destination: strVal('lg_destination'),
    status: strVal('lg_status'),
    notes: strVal('lg_notes'),
  };

  // 제품유형별 추가 필드
  if (prodType === '수입제품') {
    record.origin = strVal('lg_origin');
    record.importer = strVal('lg_importer');
    record.customs_no = strVal('lg_customs_no');
    record.arrival_date = strVal('lg_arrival_date');
  } else if (prodType === 'OEM제품') {
    record.oem_manufacturer = strVal('lg_oem_manufacturer');
    record.oem_contract_no = strVal('lg_oem_contract_no');
    record.oem_delivery_date = strVal('lg_oem_delivery_date');
    record.oem_qc = strVal('lg_oem_qc');
  } else if (prodType === '자체생산') {
    record.production_lot = strVal('lg_production_lot');
    record.process = strVal('lg_process');
    record.production_date = strVal('lg_production_date');
    record.own_qc = strVal('lg_own_qc');
  }

  const btn = document.querySelector('#logisticsForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    await apiPost('logistics', record);
    showToast(`✅ ${prodType} ${txType} 등록 완료! Lot: ${lot}`, 'success');
    lgResetForm();
    await loadLogisticsData();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 등록'; }
  }
}

// =====================================================
// 폼 초기화
// =====================================================
function lgResetForm() {
  const form = document.getElementById('logisticsForm');
  if (form) form.reset();
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('lg_date');
  if (dateEl) dateEl.value = today;
  // 제품유형 섹션 숨기기
  ['lg_import_section', 'lg_oem_section', 'lg_own_section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  lgRefreshLotNo();
}

// =====================================================
// 엑셀 내보내기
// =====================================================
function lgExport(tab) {
  // tab === 'all' 일 때: 현재 재고 현황 테이블 데이터를 출력
  if (tab === 'all') {
    // lgRenderStockTable과 동일한 로직으로 stockMap 집계
    var stockMap = {};
    var today = new Date();

    // 1패스: logistics 입고 (WH-IN- 제외)
    allLogisticsData.forEach(function(r) {
      if ((r.lot_no || '').startsWith('WH-IN-')) return;
      if (r.transaction_type !== '입고') return;
      var name = r.product_name || '미상'; var expiry = r.expiry_date || ''; var unit = r.unit || 'ea'; var ptype = r.product_type || '';
      var key = name + '|' + expiry;
      if (!stockMap[key]) stockMap[key] = { name: name, expiry: expiry, unit: unit, ptype: ptype, inQty: 0, outQty: 0 };
      stockMap[key].inQty += Number(r.quantity) || 0;
    });
    // 2패스: logistics 출고 (WH-OUT- 제외)
    allLogisticsData.forEach(function(r) {
      if ((r.lot_no || '').startsWith('WH-OUT-')) return;
      if (r.transaction_type !== '출고') return;
      var name = r.product_name || '미상'; var expiry = r.expiry_date || '';
      var key = name + '|' + expiry;
      if (stockMap[key]) { stockMap[key].outQty += Number(r.quantity) || 0; }
      else {
        var matchedKey = null;
        Object.keys(stockMap).forEach(function(k) {
          if (stockMap[k].name === name) { if (!matchedKey || (stockMap[k].expiry||'9999') < (stockMap[matchedKey].expiry||'9999')) matchedKey = k; }
        });
        if (matchedKey) stockMap[matchedKey].outQty += Number(r.quantity) || 0;
        else stockMap[key] = { name: name, expiry: expiry, unit: (r.unit||'ea'), ptype: (r.product_type||''), inQty: 0, outQty: Number(r.quantity)||0 };
      }
    });
    // 3패스: wh_inbound 전체
    if (typeof allWhInboundData !== 'undefined') {
      allWhInboundData.forEach(function(r) {
        var name = r.item_name || '미상'; var expiry = r.expiry_date || ''; var unit = r.unit || 'ea'; var ptype = r.product_type || '';
        var key = name + '|' + expiry;
        if (!stockMap[key]) stockMap[key] = { name: name, expiry: expiry, unit: unit, ptype: ptype, inQty: 0, outQty: 0 };
        stockMap[key].inQty += Number(r.qty) || 0;
        if (!stockMap[key].ptype) stockMap[key].ptype = ptype;
      });
    }
    // 4패스: wh_outbound 전체
    if (typeof allWhOutboundData !== 'undefined') {
      allWhOutboundData.forEach(function(r) {
        var name = r.item_name || '미상'; var expiry = r.expiry_date || '';
        var key = name + '|' + expiry;
        if (stockMap[key]) { stockMap[key].outQty += Number(r.qty) || 0; }
        else {
          var matchedKey = null;
          Object.keys(stockMap).forEach(function(k) {
            if (stockMap[k].name === name) { if (!matchedKey || (stockMap[k].expiry||'9999') < (stockMap[matchedKey].expiry||'9999')) matchedKey = k; }
          });
          if (matchedKey) stockMap[matchedKey].outQty += Number(r.qty) || 0;
        }
      });
    }

    var rows = Object.values(stockMap);
    // 필터 (전체현황 탭 필터 조건 적용)
    var typeF = document.getElementById('allTypeFilter') ? document.getElementById('allTypeFilter').value : '';
    var q = document.getElementById('stockSearch') ? document.getElementById('stockSearch').value.toLowerCase() : '';
    if (q) rows = rows.filter(function(r) { return r.name.toLowerCase().indexOf(q) !== -1; });
    if (typeF) rows = rows.filter(function(r) { return r.ptype === typeF; });
    rows.sort(function(a, b) {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return (a.expiry || '').localeCompare(b.expiry || '');
    });

    var headers = ['제품명', '제품유형', '소비기한', '입고 수량', '출고 수량', '현재고', '단위', '상태'];
    var csvRows = rows.map(function(r) {
      var stock = r.inQty - r.outQty;
      var status = stock <= 0 ? '재고없음' : stock <= 10 ? '부족' : '정상';
      if (r.expiry) {
        var diff = Math.floor((new Date(r.expiry) - today) / (1000 * 60 * 60 * 24));
        if (diff < 0) status = '기한만료';
        else if (diff <= 30) status = '임박(' + diff + '일)';
      }
      return [r.name, r.ptype || '-', r.expiry || '-', r.inQty, r.outQty, stock, r.unit, status];
    });
    var csvContent = [headers, ...csvRows].map(function(row) { return row.map(function(cell) { return '"' + cell + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '현재재고현황_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('현재 재고 현황 엑셀 다운로드 완료!', 'success');
    return;
  }

  // import / oem / own 탭: 거래이력 출력
  let data = [];
  if (tab === 'import') data = allLogisticsData.filter(r => r.product_type === '수입제품');
  else if (tab === 'oem') data = allLogisticsData.filter(r => r.product_type === 'OEM제품');
  else if (tab === 'own') data = allLogisticsData.filter(r => r.product_type === '자체생산');
  else data = allLogisticsData;

  const headers = ['Lot No', '제품유형', '거래유형', '거래일자', '제품명', '수량', '단위', '소비기한', '상태', '담당자', '비고'];
  const rows = data.map(r => [
    r.lot_no || '', r.product_type || '', r.transaction_type || '', r.date || '',
    r.product_name || '', r.quantity || 0, r.unit || '',
    r.expiry_date || '', r.status || '', r.manager || '', r.notes || ''
  ]);
  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `물류현황_${tab}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('엑셀 파일 다운로드 완료!', 'success');
}

// =====================================================
// 수정 모달
// =====================================================
async function lgOpenEditModal(id, source) {
  // source: 'wh_inbound' | 'wh_outbound' | undefined(logistics)
  // wh_inbound 행 → 기존 창고 입고 수정 모달로 라우팅
  if (source === 'wh_inbound' || (!source && !allLogisticsData.find(r => r.id === id) && allWhInboundData.find(r => r.id === id))) {
    const rec = allWhInboundData.find(r => r.id === id);
    if (!rec) { showToast('입고 기록을 찾을 수 없습니다.', 'warning'); return; }
    // whInboundData가 logistics.js에서 접근 가능하도록 allWhInboundData 활용
    // warehouse-mgmt.js의 whOpenInEditModal은 whInboundData를 사용하므로 직접 모달 채우기
    const sv = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v != null ? v : ''; };
    sv('whInEditId', rec.id);
    sv('whInEdit_date', rec.inbound_date || '');
    sv('whInEdit_item_name', rec.item_name || '');
    sv('whInEdit_qty', rec.qty || '');
    sv('whInEdit_mfg_date', rec.mfg_date || '');
    sv('whInEdit_expiry_date', rec.expiry_date || '');
    sv('whInEdit_ref_lot', rec.lot_no_product || '');
    sv('whInEdit_supplier', rec.supplier || '');
    sv('whInEdit_temp', rec.temp || '');
    sv('whInEdit_manager', rec.manager || '');
    sv('whInEdit_memo', rec.memo || '');
    const whEl = document.getElementById('whInEdit_warehouse');
    if (whEl) { whEl.value = rec.warehouse || 'C'; if (typeof whBuildLocationSelect === 'function') whBuildLocationSelect('whInEdit'); }
    setTimeout(() => { sv('whInEdit_location', rec.location || ''); }, 150);
    const typeEl = document.getElementById('whInEdit_type');
    if (typeEl) { const tv = rec.inbound_type || rec.type || ''; Array.from(typeEl.options).forEach((o,i)=>{ if(o.value===tv) typeEl.selectedIndex=i; }); }
    const unitEl = document.getElementById('whInEdit_unit');
    if (unitEl) { Array.from(unitEl.options).forEach((o,i)=>{ if(o.value===(rec.unit||'pallet')) unitEl.selectedIndex=i; }); }
    const modal = document.getElementById('whInEditModal');
    if (modal) modal.classList.add('show');
    return;
  }
  // wh_outbound 행 → 출고 수정 모달
  if (source === 'wh_outbound' || (!source && !allLogisticsData.find(r => r.id === id) && allWhOutboundData.find(r => r.id === id))) {
    const rec = allWhOutboundData.find(r => r.id === id);
    if (!rec) { showToast('출고 기록을 찾을 수 없습니다.', 'warning'); return; }
    lgEditingId = id;
    lgEditingSource = 'wh_outbound';
    document.getElementById('lgEditModalBody').innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="form-group"><label>출고일자</label><input type="date" id="le_date" value="${rec.outbound_date||rec.date||''}" /></div>
        <div class="form-group"><label>단위</label>
          <select id="le_unit">${['ea','box','kg','L','pallet'].map(u=>`<option ${(rec.unit||'ea')===u?'selected':''}>${u}</option>`).join('')}</select></div>
        <div class="form-group span-2"><label>품목명</label><input type="text" id="le_product_name" value="${rec.item_name||''}" /></div>
        <div class="form-group"><label>수량</label><input type="number" id="le_quantity" value="${rec.qty||0}" step="1" /></div>
        <div class="form-group"><label>담당자</label><input type="text" id="le_manager" value="${rec.manager||''}" /></div>
        <div class="form-group"><label>출고처</label><input type="text" id="le_destination" value="${rec.destination||''}" /></div>
        <div class="form-group span-2"><label>비고</label><input type="text" id="le_notes" value="${rec.memo||rec.notes||''}" /></div>
      </div>
    `;
    document.getElementById('lgEditModal').classList.add('show');
    return;
  }
  lgEditingId = id;
  lgEditingSource = 'logistics';
  const rec = allLogisticsData.find(r => r.id === id);
  if (!rec) return;

  document.getElementById('lgEditModalBody').innerHTML = `
    <div class="form-grid form-grid-2">
      <div class="form-group"><label>거래유형</label>
        <select id="le_transaction_type">
          ${['입고','출고','반품','조정'].map(t => `<option ${rec.transaction_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="form-group"><label>제품유형</label>
        <select id="le_product_type">
          ${['수입제품','OEM제품','자체생산'].map(t => `<option ${rec.product_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="form-group"><label>거래일자</label><input type="date" id="le_date" value="${rec.date||''}" /></div>
      <div class="form-group"><label>상태</label>
        <select id="le_status">
          ${['입고대기','입고완료','출고중','출고완료','반품'].map(s => `<option ${rec.status===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="form-group span-2"><label>제품명</label><input type="text" id="le_product_name" value="${rec.product_name||''}" /></div>
      <div class="form-group"><label>수량</label><input type="number" id="le_quantity" value="${rec.quantity||0}" step="1" /></div>
      <div class="form-group"><label>단위</label>
        <select id="le_unit">${['ea','box','kg','L','pallet'].map(u=>`<option ${rec.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
      <div class="form-group"><label>단가 (원)</label><input type="number" id="le_unit_price" value="${rec.unit_price||0}" /></div>
      <div class="form-group"><label>총금액 (원)</label><input type="number" id="le_total_amount" value="${rec.total_amount||0}" /></div>
      <div class="form-group"><label>소비기한</label><input type="date" id="le_expiry_date" value="${rec.expiry_date||''}" /></div>
      <div class="form-group"><label>담당자</label><input type="text" id="le_manager" value="${rec.manager||''}" /></div>
      <div class="form-group"><label>거래처</label><input type="text" id="le_vendor" value="${rec.vendor||''}" /></div>
      <div class="form-group span-2"><label>비고</label><input type="text" id="le_notes" value="${rec.notes||''}" /></div>
    </div>
  `;
  document.getElementById('lgEditModal').classList.add('show');
}

function lgCloseEditModal() {
  document.getElementById('lgEditModal').classList.remove('show');
  lgEditingId = null;
  lgEditingSource = 'logistics';
}

async function lgSaveEdit() {
  if (!lgEditingId) return;
  try {
    // wh_outbound 행 수정
    if (lgEditingSource === 'wh_outbound') {
      const rec = allWhOutboundData.find(r => r.id === lgEditingId);
      if (!rec) { showToast('출고 기록을 찾을 수 없습니다.', 'warning'); return; }
      const updated = {
        ...rec,
        outbound_date: document.getElementById('le_date')?.value || rec.outbound_date,
        item_name: document.getElementById('le_product_name')?.value || rec.item_name,
        qty: parseFloat(document.getElementById('le_quantity')?.value) || rec.qty,
        unit: document.getElementById('le_unit')?.value || rec.unit,
        manager: document.getElementById('le_manager')?.value || rec.manager,
        destination: document.getElementById('le_destination')?.value || rec.destination,
        memo: document.getElementById('le_notes')?.value || rec.memo,
      };
      await apiPut('wh_outbound', lgEditingId, updated);
      showToast('출고 수정 완료!', 'success');
      lgCloseEditModal();
      if (typeof whInvalidateMapCache === 'function') whInvalidateMapCache();
      // ── 연동 갱신: 창고 재고현황 + 물류현황 동시 반영 ──
      if (typeof whLoadAll === 'function') whLoadAll();
      await loadLogisticsData();
      return;
    }
    // logistics 행 수정
    const rec = allLogisticsData.find(r => r.id === lgEditingId);
    const updated = {
      ...rec,
      transaction_type: document.getElementById('le_transaction_type')?.value || rec.transaction_type,
      product_type: document.getElementById('le_product_type')?.value || rec.product_type,
      date: document.getElementById('le_date')?.value || rec.date,
      status: document.getElementById('le_status')?.value || rec.status,
      product_name: document.getElementById('le_product_name')?.value || rec.product_name,
      quantity: parseFloat(document.getElementById('le_quantity')?.value) || 0,
      unit: document.getElementById('le_unit')?.value || rec.unit,
      unit_price: parseFloat(document.getElementById('le_unit_price')?.value) || 0,
      total_amount: parseFloat(document.getElementById('le_total_amount')?.value) || 0,
      expiry_date: document.getElementById('le_expiry_date')?.value || rec.expiry_date,
      manager: document.getElementById('le_manager')?.value || rec.manager,
      vendor: document.getElementById('le_vendor')?.value || rec.vendor,
      notes: document.getElementById('le_notes')?.value || rec.notes,
    };
    await apiPut('logistics', lgEditingId, updated);
    showToast('수정 완료!', 'success');
    lgCloseEditModal();
    // ── 연동 갱신: 재고현황 + 물류현황 동시 반영 ──
    if (typeof whInvalidateMapCache === 'function') whInvalidateMapCache();
    if (typeof whLoadAll === 'function') whLoadAll();
    await loadLogisticsData();
  } catch(e) {
    showToast('수정 실패: ' + e.message, 'error');
  }
}

async function lgDeleteRecord(id, source) {
  const targetId = id || lgEditingId;
  const src = source || lgEditingSource || 'logistics';
  showConfirm('이 내역을 삭제하시겠습니까?', async () => {
    try {
      if (src === 'wh_outbound') {
        const rec = allWhOutboundData.find(r => r.id === targetId);
        const lotNo = rec ? rec.lot_no : '';
        await apiDelete('wh_outbound', targetId);
        // logistics 연동 삭제 — Firestore 재조회 없이 캐시 사용
        if (lotNo) {
          try {
            const lgMatch = allLogisticsData.filter(r => r.wh_lot_no === lotNo || r.lot_no === lotNo);
            for (const m of lgMatch) { if (m.id) await apiDelete('logistics', m.id); }
          } catch(le) { console.warn('logistics 연동 삭제 실패:', le); }
        }
        if (typeof whInvalidateMapCache === 'function') whInvalidateMapCache();
      } else if (src === 'wh_inbound') {
        const rec = allWhInboundData.find(r => r.id === targetId);
        const lotNo = rec ? rec.lot_no : '';
        await apiDelete('wh_inbound', targetId);
        // logistics 연동 삭제 — Firestore 재조회 없이 캐시 사용
        if (lotNo) {
          try {
            const lgMatch = allLogisticsData.filter(r => (r.wh_lot_no === lotNo || r.lot_no === lotNo) && r.transaction_type === '입고');
            for (const m of lgMatch) { if (m.id) await apiDelete('logistics', m.id); }
          } catch(le) { console.warn('logistics 연동 삭제 실패:', le); }
        }
        if (typeof whInvalidateMapCache === 'function') whInvalidateMapCache();
      } else {
        await apiDelete('logistics', targetId);
      }
      showToast('삭제되었습니다.', 'success');
      lgCloseEditModal();
      await loadLogisticsData();
    } catch(e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}

// ===========================
// 제품 자동검색 (제품마스터 연동)
// ===========================
let _lgProductCache = null;

async function lgGetProductCache() {
  if (_lgProductCache) return _lgProductCache;
  try {
    _lgProductCache = await apiGetAll('products');
  } catch(e) {
    _lgProductCache = [];
  }
  return _lgProductCache;
}

async function lgProductSearch(keyword) {
  const dropdown = document.getElementById('lgProductDropdown');
  if (!dropdown) return;
  const q = (keyword || '').trim().toLowerCase();
  if (q.length < 1) {
    dropdown.style.display = 'none';
    return;
  }
  const products = await lgGetProductCache();
  const matched = products.filter(p => {
    const name = (p.product_name || '').toLowerCase();
    const code = (p.product_code || '').toLowerCase();
    return name.includes(q) || code.includes(q);
  }).slice(0, 15);

  if (matched.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  dropdown.innerHTML = matched.map(p => {
    const typeLabel = p.product_type === '자체생산'
      ? '<span style="color:#1e8449;font-size:10px;font-weight:700">[OWN]</span>'
      : p.product_type === 'OEM'
      ? '<span style="color:#d68910;font-size:10px;font-weight:700">[OEM]</span>'
      : '<span style="color:#2980b9;font-size:10px;font-weight:700">[IMP]</span>';
    const safeP = JSON.stringify(p).replace(/"/g, '&quot;');
    return `<div onclick="lgSelectProduct(JSON.parse(this.dataset.p))" data-p="${safeP}"
      style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px"
      onmouseover="this.style.background='#f0f8f1'" onmouseout="this.style.background=''"
    >
      ${typeLabel} <strong>${p.product_name}</strong>
      <span style="color:#888;font-size:11px;margin-left:6px">${p.product_code || ''}</span>
      ${p.specification ? `<span style="color:#aaa;font-size:11px"> · ${p.specification}</span>` : ''}
    </div>`;
  }).join('');
  dropdown.style.display = 'block';
}

function lgSelectProduct(p) {
  const nameEl = document.getElementById('lg_product_name');
  const codeEl = document.getElementById('lg_product_code');
  const unitEl = document.getElementById('lg_unit');
  const expiryEl = document.getElementById('lg_expiry_date');
  const dropdown = document.getElementById('lgProductDropdown');

  if (nameEl) nameEl.value = p.product_name || '';
  if (codeEl) codeEl.value = p.product_code || '';
  if (unitEl && p.unit) {
    const opt = Array.from(unitEl.options).find(o => o.value === p.unit);
    if (opt) unitEl.value = p.unit;
  }
  if (expiryEl && p.shelf_life_date) expiryEl.value = p.shelf_life_date;

  // 제품유형 자동 설정
  const typeEl = document.getElementById('lg_product_type');
  if (typeEl && p.product_type) {
    const map = { '자체생산': '자체생산', 'OEM': 'OEM제품', '수입제품': '수입제품', '농산물': '수입제품' };
    const mapped = map[p.product_type];
    if (mapped) {
      typeEl.value = mapped;
      if (typeof lgRefreshLotNo === 'function') lgRefreshLotNo();
      if (typeof lgShowProductSections === 'function') lgShowProductSections();
    }
  }

  if (dropdown) dropdown.style.display = 'none';
}

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('lgProductDropdown');
  const input = document.getElementById('lg_product_name');
  if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ===========================
// 재고 현황 집계 및 렌더링
// 같은 품목명 + 소비기한 기준으로 입고/출고 합산
// ===========================
function lgRenderStockTable() {
  var tbody = document.getElementById('stockTableBody');
  if (!tbody) return;

  var q = (document.getElementById('stockSearch') ? document.getElementById('stockSearch').value : '').toLowerCase();
  var typeF = document.getElementById('allTypeFilter') ? document.getElementById('allTypeFilter').value : '';

  var stockMap = {};
  // ──────────────────────────────────────────────────
  // 단일 진실 공급원 기반 집계
  //  1패스: logistics 입고 (WH-IN- 제외 → 중복 방지)
  //  2패스: logistics 출고 (WH-OUT- 제외 → 중복 방지)
  //  3패스: wh_inbound 전체 직접 집계 (단일 진실 공급원)
  //  4패스: wh_outbound 전체 직접 집계 (단일 진실 공급원)
  // ──────────────────────────────────────────────────
  // 1패스 재실행: logistics에서 WH-IN- 제외하고 입고 집계
  allLogisticsData.forEach(function(r) {
    if ((r.lot_no || '').startsWith('WH-IN-')) return; // 창고입고 동기화 기록 제외
    var name = (r.product_name || r.item_name || '').trim();
    var expiry = (r.expiry_date || r.expiry || '').trim();
    var unit = (r.unit || 'ea').trim();
    var ptype = (r.product_type || '').trim();
    var qty = Number(r.quantity || r.qty || 0);
    var tx = (r.transaction_type || '입고').trim();
    if (!name) return;
    if (tx !== '입고' && tx !== '반품') return;
    var key = name + '||' + expiry;
    if (!stockMap[key]) {
      stockMap[key] = { name: name, expiry: expiry, unit: unit, ptype: ptype, inQty: 0, outQty: 0 };
    }
    stockMap[key].inQty += qty;
  });
  // nameIndex: 품목명 → 가장 소비기한 빠른 key (O(n) 검색용 인덱스)
  function buildNameIndex() {
    var idx = {};
    Object.keys(stockMap).forEach(function(k) {
      var n = k.split('||')[0];
      if (!idx[n] || (stockMap[k].expiry||'9999') < (stockMap[idx[n]].expiry||'9999')) idx[n] = k;
    });
    return idx;
  }
  // 2패스 재실행: logistics 출고 집계 (WH-OUT- 제외)
  var nameIdx2 = buildNameIndex();
  allLogisticsData.forEach(function(r) {
    if ((r.lot_no || '').startsWith('WH-OUT-')) return;
    var name = (r.product_name || r.item_name || '').trim();
    var expiry = (r.expiry_date || r.expiry || '').trim();
    var qty = Number(r.quantity || r.qty || 0);
    var tx = (r.transaction_type || '입고').trim();
    if (!name || tx !== '출고') return;
    var key = name + '||' + expiry;
    if (stockMap[key]) {
      stockMap[key].outQty += qty;
    } else {
      var matchedKey = nameIdx2[name] || null;
      if (matchedKey) stockMap[matchedKey].outQty += qty;
      else stockMap[key] = { name: name, expiry: expiry, unit: (r.unit||'ea'), ptype: (r.product_type||''), inQty: 0, outQty: qty };
    }
  });
  // 3패스: 창고 입고(wh_inbound) 집계 - 단일 진실 공급원
  (allWhInboundData || []).forEach(function(r) {
    var name = (r.item_name || '').trim();
    var expiry = (r.expiry_date || '').trim();
    var unit = (r.unit || 'ea').trim();
    var ptype = r.inbound_type || '수입제품';
    var qty = Number(r.qty || 0);
    if (!name || !qty) return;
    var key = name + '||' + expiry;
    if (!stockMap[key]) {
      stockMap[key] = { name: name, expiry: expiry, unit: unit, ptype: ptype, inQty: 0, outQty: 0 };
    }
    stockMap[key].inQty += qty;
    // ptype이 없으면 wh_inbound 값으로 채움
    if (!stockMap[key].ptype) stockMap[key].ptype = ptype;
  });
  // 4패스: 창고 출고(wh_outbound) 집계 - nameIndex 활용으로 O(n) 처리
  var nameIdx4 = buildNameIndex();
  (allWhOutboundData || []).forEach(function(r) {
    var name = (r.item_name || '').trim();
    var qty = Number(r.qty || 0);
    if (!name || !qty) return;
    var matchedKey = nameIdx4[name] || null;
    if (matchedKey) stockMap[matchedKey].outQty += qty;
  });

  var rows = Object.values(stockMap);
  if (q) rows = rows.filter(function(r) { return r.name.toLowerCase().indexOf(q) !== -1; });
  if (typeF) rows = rows.filter(function(r) { return r.ptype === typeF; });
  rows.sort(function(a, b) {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return (a.expiry || '').localeCompare(b.expiry || '');
  });

  var countEl = document.getElementById('stockResultCount');
  var countEl2 = document.getElementById('stockCount');
  if (countEl) countEl.textContent = rows.length + '품목';
  if (countEl2) countEl2.textContent = rows.length + '품목';

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:30px"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>재고 데이터가 없습니다.</td></tr>';
    return;
  }

  var typeColors = { '수입제품': '#2980b9', 'OEM제품': '#d68910', '자체생산': '#1e8449', '기타': '#888' };
  var typeBg = { '수입제품': '#e8f4fd', 'OEM제품': '#fef9e7', '자체생산': '#eafaf1', '기타': '#f0f0f0' };

  tbody.innerHTML = rows.map(function(r) {
    var stock = r.inQty - r.outQty;
    var color = typeColors[r.ptype] || '#888';
    var bg = typeBg[r.ptype] || '#f0f0f0';
    var expiryStatus = '';
    var expiryStyle = '';
    if (r.expiry) {
      var today = new Date();
      var exp = new Date(r.expiry);
      var diff = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
      if (diff < 0) {
        expiryStatus = '<span style="background:#fdedec;color:#e74c3c;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;margin-left:4px">기한만료</span>';
        expiryStyle = 'color:#e74c3c;font-weight:700';
      } else if (diff <= 30) {
        expiryStatus = '<span style="background:#fff3cd;color:#d68910;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;margin-left:4px">임박(' + diff + '일)</span>';
        expiryStyle = 'color:#d68910;font-weight:600';
      }
    }
    var stockBadge = '';
    if (stock <= 0) {
      stockBadge = '<span style="background:#fdedec;color:#e74c3c;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700">재고없음</span>';
    } else if (stock <= 10) {
      stockBadge = '<span style="background:#fff3cd;color:#d68910;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700">부족</span>';
    } else {
      stockBadge = '<span style="background:#eafaf1;color:#27ae60;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700">정상</span>';
    }
    return '<tr>' +
      '<td><b>' + r.name + '</b></td>' +
      '<td><span style="background:' + bg + ';color:' + color + ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">' + (r.ptype || '-') + '</span></td>' +
      '<td style="' + expiryStyle + '">' + (r.expiry || '-') + expiryStatus + '</td>' +
      '<td style="text-align:right;color:#27ae60;font-weight:600">' + r.inQty.toLocaleString() + '</td>' +
      '<td style="text-align:right;color:#e74c3c;font-weight:600">' + r.outQty.toLocaleString() + '</td>' +
      '<td style="text-align:right;font-weight:700;font-size:15px">' + stock.toLocaleString() + '</td>' +
      '<td>' + r.unit + '</td>' +
      '<td>' + stockBadge + '</td>' +
      '</tr>';
  }).join('');
}
