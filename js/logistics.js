// =====================================================
// 물류관리 JS (수입제품 / OEM제품 / 자체생산 구분)
// =====================================================

let allLogisticsData = [];
let lgEditingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // new Date() 1회 생성 후 재사용 (중복 생성 제거)
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
  await lgRefreshLotNo();
  await loadLogisticsData();
  const form = document.getElementById('logisticsForm');
  if (form) form.addEventListener('submit', lgHandleSubmit);
});

// =====================================================
// Lot No 자동생성
// =====================================================
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
    const data = await apiGetAll('logistics');
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
async function loadLogisticsData() {
  try {
    const res = await apiGetAll('logistics');
    allLogisticsData = (res || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    lgUpdateKpiCards();
    lgFilterTable('import');
    lgFilterTable('oem');
    lgFilterTable('own');
    lgFilterTable('all');
  } catch(e) {
    console.error('[logistics] 데이터 로드 실패:', e);
  }
}

// =====================================================
// KPI 카드 업데이트
// =====================================================
function lgUpdateKpiCards() {
  const importCount = allLogisticsData.filter(r => r.product_type === '수입제품').length;
  const oemCount = allLogisticsData.filter(r => r.product_type === 'OEM제품').length;
  const ownCount = allLogisticsData.filter(r => r.product_type === '자체생산').length;
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
  if (tab === 'import') {
    const q = (document.getElementById('importSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('importStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === '수입제품' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    );
    lgRenderTable('importTableBody', data, 'import');
    const el = document.getElementById('importCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'oem') {
    const q = (document.getElementById('oemSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('oemStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === 'OEM제품' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    );
    lgRenderTable('oemTableBody', data, 'oem');
    const el = document.getElementById('oemCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'own') {
    const q = (document.getElementById('ownSearch')?.value || '').toLowerCase();
    const sf = document.getElementById('ownStatusFilter')?.value || '';
    const data = allLogisticsData.filter(r =>
      r.product_type === '자체생산' &&
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!sf || r.status === sf)
    );
    lgRenderTable('ownTableBody', data, 'own');
    const el = document.getElementById('ownCount');
    if (el) el.textContent = `${data.length}건`;
  } else if (tab === 'all') {
    const q = (document.getElementById('allSearch')?.value || '').toLowerCase();
    const typeF = document.getElementById('allTypeFilter')?.value || '';
    const txF = document.getElementById('allTxFilter')?.value || '';
    const from = document.getElementById('allDateFrom')?.value || '';
    const to = document.getElementById('allDateTo')?.value || '';
    const data = allLogisticsData.filter(r =>
      (!q || (r.product_name || '').toLowerCase().includes(q)) &&
      (!typeF || r.product_type === typeF) &&
      (!txF || r.transaction_type === txF) &&
      (!from || (r.date || '') >= from) &&
      (!to || (r.date || '') <= to)
    );
    lgRenderTable('allTableBody', data, 'all');
    const el = document.getElementById('allCount');
    const el2 = document.getElementById('allResultCount');
    if (el) el.textContent = `${data.length}건`;
    if (el2) el2.textContent = `${data.length}건 조회됨`;
  }
}

function lgRenderTable(tbodyId, data, tab) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-msg"><i class="fas fa-inbox"></i> 등록된 내역이 없습니다.</td></tr>`;
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
      return `<tr>
        <td style="font-size:11px">${r.lot_no || '-'}</td>
        <td>${typeBadge}</td>
        <td>${txBadge}</td>
        <td>${r.date || '-'}</td>
        <td><strong>${r.product_name || '-'}</strong></td>
        <td style="text-align:right">${r.quantity != null ? Number(r.quantity).toLocaleString() : '-'}</td>
        <td>${r.unit || '-'}</td>
        <td style="text-align:right;color:#1e8449">${totalFmt}</td>
        <td>${expiryHtml}</td>
        <td>${statusBadge}</td>
        <td>${r.manager || '-'}</td>
        <td>${r.notes || '-'}</td>
        <td>
          <button class="edit-row-btn" onclick="lgOpenEditModal('${r.id}')"><i class="fas fa-edit"></i></button>
          <button class="edit-row-btn" style="color:#e74c3c;border-color:#e74c3c" onclick="lgDeleteRecord('${r.id}')"><i class="fas fa-trash"></i></button>
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
  let data = [];
  if (tab === 'import') data = allLogisticsData.filter(r => r.product_type === '수입제품');
  else if (tab === 'oem') data = allLogisticsData.filter(r => r.product_type === 'OEM제품');
  else if (tab === 'own') data = allLogisticsData.filter(r => r.product_type === '자체생산');
  else data = allLogisticsData;

  const headers = ['Lot No', '제품유형', '거래유형', '거래일자', '제품명', '수량', '단위', '총금액', '소비기한', '상태', '담당자', '비고'];
  const rows = data.map(r => [
    r.lot_no || '', r.product_type || '', r.transaction_type || '', r.date || '',
    r.product_name || '', r.quantity || 0, r.unit || '', r.total_amount || 0,
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
async function lgOpenEditModal(id) {
  lgEditingId = id;
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
}

async function lgSaveEdit() {
  if (!lgEditingId) return;
  const rec = allLogisticsData.find(r => r.id === lgEditingId);
  const updated = {
    ...rec,
    transaction_type: document.getElementById('le_transaction_type').value,
    product_type: document.getElementById('le_product_type').value,
    date: document.getElementById('le_date').value,
    status: document.getElementById('le_status').value,
    product_name: document.getElementById('le_product_name').value,
    quantity: parseFloat(document.getElementById('le_quantity').value) || 0,
    unit: document.getElementById('le_unit').value,
    unit_price: parseFloat(document.getElementById('le_unit_price').value) || 0,
    total_amount: parseFloat(document.getElementById('le_total_amount').value) || 0,
    expiry_date: document.getElementById('le_expiry_date').value,
    manager: document.getElementById('le_manager').value,
    vendor: document.getElementById('le_vendor').value,
    notes: document.getElementById('le_notes').value,
  };
  try {
    await apiPut('logistics', lgEditingId, updated);
    showToast('수정 완료!', 'success');
    lgCloseEditModal();
    await loadLogisticsData();
  } catch(e) {
    showToast('수정 실패: ' + e.message, 'error');
  }
}

async function lgDeleteRecord(id) {
  const targetId = id || lgEditingId;
  showConfirm('이 물류 내역을 삭제하시겠습니까?', async () => {
    try {
      await apiDelete('logistics', targetId);
      showToast('삭제되었습니다.', 'success');
      lgCloseEditModal();
      await loadLogisticsData();
    } catch(e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}
