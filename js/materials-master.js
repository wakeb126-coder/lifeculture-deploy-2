// =====================================================
// 원부재료 마스터 관리 JS — Genspark Table API 사용
// =====================================================
let allMaterials = [];
let filteredMaterials = [];
let currentPage = 1;
const pageSize = 15;
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
  generateMaterialCode();
  loadMaterials();

  const form = document.getElementById('materialsForm');
  if (form) form.addEventListener('submit', handleSubmit);

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', filterTable);
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) typeFilter.addEventListener('change', filterTable);
});

// ===========================
// 자재 코드 자동 생성
// ===========================
async function generateMaterialCode() {
  const display = document.getElementById('codeDisplay');
  if (!display) return;
  try {
    const data = await apiGetAll('materials_master');
    const dateStr = today().replace(/-/g, '').slice(0, 8);
    const todayCodes = data.filter(m =>
      m.material_code && m.material_code.startsWith(`MAT-${dateStr}`)
    );
    const seq = String(todayCodes.length + 1).padStart(3, '0');
    display.textContent = `MAT-${dateStr}-${seq}`;
  } catch (e) {
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    const dateStr = today().replace(/-/g, '').slice(0, 8);
    display.textContent = `MAT-${dateStr}-${rand}`;
  }
}

// ===========================
// 자재 유형별 코드 변경
// ===========================
function onTypeChange() {
  // 자재구분에 따라 코드 prefix 변경 가능
}

// ===========================
// 데이터 로드
// ===========================
async function loadMaterials() {
  try {
    const data = await apiGetAll('materials_master');
    allMaterials = data.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    filteredMaterials = [...allMaterials];
    renderTable();
    renderKpi();
  } catch (e) {
    console.error('[materials-master] 로드 실패:', e);
    const tb = document.getElementById('materialsTableBody');
    if (tb) tb.innerHTML = `<tr><td colspan="13" class="empty-msg"><i class="fas fa-exclamation-circle"></i> 데이터 로드 실패: ${e.message}</td></tr>`;
  }
}

// ===========================
// KPI 렌더링
// ===========================
function renderKpi() {
  const total = allMaterials.length;
  const coffee = allMaterials.filter(m => m.material_type === '생두').length;
  const sub = allMaterials.filter(m => ['부재료', '포장재', '소모품'].includes(m.material_type)).length;
  const lowStock = allMaterials.filter(m => {
    const min = parseFloat(m.min_stock) || 0;
    return min > 0; // 안전재고 설정된 항목 (실제 재고와 비교하려면 raw_materials와 연동 필요)
  }).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kpiTotal', total);
  set('kpiCoffee', coffee);
  set('kpiSubMat', sub);
  set('kpiStockLow', 0); // 실제 재고 부족은 raw_materials 연동 필요
}

// ===========================
// 필터링
// ===========================
function filterTable() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const type = document.getElementById('typeFilter')?.value || '';
  filteredMaterials = allMaterials.filter(m => {
    const matchQ = !q ||
      (m.material_name || '').toLowerCase().includes(q) ||
      (m.material_code || '').toLowerCase().includes(q) ||
      (m.supplier || '').toLowerCase().includes(q);
    const matchType = !type || m.material_type === type;
    return matchQ && matchType;
  });
  currentPage = 1;
  renderTable();
}

// ===========================
// 테이블 렌더링
// ===========================
function renderTable() {
  const tbody = document.getElementById('materialsTableBody');
  if (!tbody) return;
  const start = (currentPage - 1) * pageSize;
  const pageData = filteredMaterials.slice(start, start + pageSize);

  if (!pageData.length) {
    tbody.innerHTML = `<tr><td colspan="13"><div class="empty-msg"><i class="fas fa-inbox"></i> 등록된 자재가 없습니다.</div></td></tr>`;
  } else {
    const typeColors = {
      '생두': 'badge-warning',
      '부재료': 'badge-info',
      '포장재': 'badge-success',
      '소모품': 'badge-secondary',
      '기타': 'badge-secondary'
    };
    tbody.innerHTML = pageData.map(m => {
      const typeCls = typeColors[m.material_type] || 'badge-secondary';
      return `<tr>
        <td><strong>${m.material_code || '-'}</strong></td>
        <td><strong>${m.material_name || '-'}</strong></td>
        <td><span class="badge ${typeCls}">${m.material_type || '-'}</span></td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.specification || '-'}</td>
        <td>${m.unit || '-'}</td>
        <td>${m.standard_price ? numFormat(m.standard_price, 0) + '원' : '-'}</td>
        <td>${m.min_stock ? numFormat(m.min_stock) + (m.unit || '') : '-'}</td>
        <td>${m.supplier || '-'}</td>
        <td>${m.storage_condition || '-'}</td>
        <td>${m.shelf_life_days ? m.shelf_life_days + '일' : '-'}</td>
        <td>${m.origin_country || '-'}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.notes || '-'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${m.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaterial('${m.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }

  const countEl = document.getElementById('tableCount');
  if (countEl) countEl.textContent = `전체 ${filteredMaterials.length}건`;
  renderPagination();
}

// ===========================
// 페이지네이션
// ===========================
function renderPagination() {
  const totalPages = Math.ceil(filteredMaterials.length / pageSize);
  const pg = document.getElementById('pagination');
  if (!pg) return;
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  if (currentPage > 1) html += `<button class="page-btn" onclick="changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  if (currentPage < totalPages) html += `<button class="page-btn" onclick="changePage(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
  pg.innerHTML = html;
}
function changePage(p) { currentPage = p; renderTable(); }

// ===========================
// 폼 데이터 수집
// ===========================
function getFormData() {
  const code = document.getElementById('codeDisplay')?.textContent || '';
  return {
    material_code: code,
    material_name: document.getElementById('f_material_name')?.value || '',
    material_type: document.getElementById('f_material_type')?.value || '',
    unit: document.getElementById('f_unit')?.value || '',
    origin_country: document.getElementById('f_origin_country')?.value || '',
    specification: document.getElementById('f_specification')?.value || '',
    standard_price: parseFloat(document.getElementById('f_standard_price')?.value) || 0,
    min_stock: parseFloat(document.getElementById('f_min_stock')?.value) || 0,
    supplier: document.getElementById('f_supplier')?.value || '',
    storage_condition: document.getElementById('f_storage_condition')?.value || '',
    shelf_life_days: parseInt(document.getElementById('f_shelf_life_days')?.value) || 0,
    notes: document.getElementById('f_notes')?.value || '',
  };
}

// ===========================
// 폼 초기화
// ===========================
function resetForm() {
  const form = document.getElementById('materialsForm');
  if (form) form.reset();
  editingId = null;
  const btn = document.querySelector('#materialsForm button[type="submit"]');
  if (btn) btn.innerHTML = '<i class="fas fa-save"></i> 등록';
  generateMaterialCode();
  showToast('폼이 초기화되었습니다.', 'info');
}

// ===========================
// 폼 제출
// ===========================
async function handleSubmit(e) {
  e.preventDefault();
  const data = getFormData();
  if (!data.material_name) { showToast('자재명을 입력하세요.', 'warning'); return; }
  if (!data.material_type) { showToast('자재구분을 선택하세요.', 'warning'); return; }

  const btn = document.querySelector('#materialsForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }
  try {
    if (editingId) {
      await apiPut('materials_master', editingId, data);
      showToast('자재 정보가 수정되었습니다.', 'success');
      editingId = null;
    } else {
      await apiPost('materials_master', data);
      showToast('자재가 등록되었습니다.', 'success');
    }
    resetForm();
    await loadMaterials();
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> 등록';
    }
  }
}

// ===========================
// 수정 모달
// ===========================
function openEditModal(id) {
  const m = allMaterials.find(r => r.id === id);
  if (!m) return;
  editingId = id;

  const fields = ['material_name', 'material_type', 'unit', 'origin_country',
    'specification', 'standard_price', 'min_stock', 'supplier', 'storage_condition',
    'shelf_life_days', 'notes'];

  fields.forEach(key => {
    const el = document.getElementById('f_' + key);
    if (el) el.value = m[key] || '';
  });

  const codeDisplay = document.getElementById('codeDisplay');
  if (codeDisplay) codeDisplay.textContent = m.material_code || '';

  const formSection = document.querySelector('.form-container');
  if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });

  const btn = document.querySelector('#materialsForm button[type="submit"]');
  if (btn) btn.innerHTML = '<i class="fas fa-save"></i> 수정 저장';
  showToast('수정 모드: 내용 변경 후 저장하세요.', 'info');
}

function closeEditModal() { resetForm(); }
function saveEdit() { /* not used */ }

// ===========================
// 삭제
// ===========================
async function deleteMaterial(id) {
  showConfirm('이 자재를 삭제하시겠습니까?<br><small style="color:#e74c3c">삭제 후 복구할 수 없습니다.</small>', async () => {
    try {
      await apiDelete('materials_master', id);
      showToast('삭제되었습니다.', 'success');
      if (editingId === id) resetForm();
      await loadMaterials();
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}

// 하위 호환
function deleteRecord() {
  if (editingId) deleteMaterial(editingId);
}
