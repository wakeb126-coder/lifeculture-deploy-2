// =====================================================
// 제품 정보 관리 JS — Genspark Table API 사용
// =====================================================
let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const pageSize = 15;
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();

  // 검색/필터
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', filterProducts);
  const filterCategory = document.getElementById('filterCategory');
  if (filterCategory) filterCategory.addEventListener('change', filterProducts);

  // 신규 등록 버튼
  const addBtn = document.getElementById('addProductBtn');
  if (addBtn) addBtn.addEventListener('click', openNewModal);

  // 모달 닫기
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  const cancelBtn = document.getElementById('modalCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // 폼 제출
  const form = document.getElementById('productForm');
  if (form) form.addEventListener('submit', handleSubmit);

  // 모달 배경 클릭 시 닫기
  const modal = document.getElementById('productModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // 더보기 메뉴
  setupMoreMenu2();
});

// ===========================
// 더보기 메뉴 (products 전용)
// ===========================
function setupMoreMenu2() {
  const btn = document.getElementById('moreMenuBtn');
  const overlay = document.getElementById('moreMenuOverlay');
  const sheet = document.getElementById('moreMenuSheet');
  const closeBtn = document.getElementById('moreMenuClose');
  const exportBtn = document.getElementById('exportBtn');
  const deleteAllBtn = document.getElementById('deleteAllBtn');

  if (btn && overlay && sheet) {
    btn.addEventListener('click', () => {
      overlay.style.display = 'block';
      sheet.style.display = 'block';
      setTimeout(() => { overlay.classList.add('show'); sheet.classList.add('show'); }, 10);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMoreMenu2);
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMoreMenu2();
    });
  }
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  if (deleteAllBtn) deleteAllBtn.addEventListener('click', deleteAllData);
}
function closeMoreMenu2() {
  const overlay = document.getElementById('moreMenuOverlay');
  const sheet = document.getElementById('moreMenuSheet');
  if (overlay) { overlay.classList.remove('show'); setTimeout(() => { overlay.style.display = ''; }, 300); }
  if (sheet) { sheet.classList.remove('show'); setTimeout(() => { sheet.style.display = ''; }, 300); }
}

// ===========================
// 데이터 로드
// ===========================
async function loadProducts() {
  try {
    const data = await apiGetAll('products');
    allProducts = data.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    filteredProducts = [...allProducts];
    renderTable();
    renderKpi();
  } catch (e) {
    console.error('[products] 로드 실패:', e);
    const tb = document.getElementById('productsTableBody');
    if (tb) tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#999"><i class="fas fa-exclamation-circle"></i> 데이터 로드 실패: ${e.message}</td></tr>`;
  }
}

// ===========================
// KPI
// ===========================
function renderKpi() {
  const total = allProducts.length;
  const own = allProducts.filter(p => p.product_type === '자체생산').length;
  const oem = allProducts.filter(p => p.product_type === 'OEM').length;
  const imp = allProducts.filter(p => p.product_type === '수입제품').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('totalProducts', total);
  set('ownProduction', own);
  set('oemProduction', oem);
  set('importedProducts', imp);
}

// ===========================
// 필터링
// ===========================
function filterProducts() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const cat = document.getElementById('filterCategory')?.value || '';
  filteredProducts = allProducts.filter(p => {
    const matchQ = !q ||
      (p.product_name || '').toLowerCase().includes(q) ||
      (p.product_code || '').toLowerCase().includes(q);
    const matchCat = !cat || p.product_type === cat;
    return matchQ && matchCat;
  });
  currentPage = 1;
  renderTable();
}

// ===========================
// 서류 상태 뱃지
// ===========================
function docStatusBadge(docs) {
  if (!docs) return '<span style="color:#999">-</span>';
  try {
    const d = typeof docs === 'string' ? JSON.parse(docs) : docs;
    const items = Object.values(d);
    const completed = items.filter(v => v && v.status === '등록완료').length;
    const needed = items.filter(v => v && v.status === '갱신필요').length;
    if (needed > 0) return `<span class="badge badge-danger">${needed}건 갱신필요</span>`;
    if (completed === items.length && items.length > 0) return `<span class="badge badge-success">완료</span>`;
    return `<span class="badge badge-warning">${completed}/${items.length}</span>`;
  } catch {
    return '<span style="color:#999">-</span>';
  }
}

// ===========================
// 테이블 렌더링
// ===========================
function renderTable() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  const start = (currentPage - 1) * pageSize;
  const pageData = filteredProducts.slice(start, start + pageSize);

  if (!pageData.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#999"><i class="fas fa-inbox" style="font-size:32px;margin-bottom:12px;display:block"></i>제품 정보가 없습니다.</td></tr>`;
  } else {
    const typeColors = { '자체생산': 'badge-success', 'OEM': 'badge-info', '수입제품': 'badge-warning', '농산물': 'badge-primary', '기타': 'badge-secondary' };
    tbody.innerHTML = pageData.map(p => {
      const typeCls = typeColors[p.product_type] || 'badge-secondary';
      
      // 소비기한 날짜 형식 변경 (YYYY-MM-DD -> YYYY년 MM월 DD일까지)
      let shelfLifeText = '-';
      if (p.shelf_life_date) {
        const d = new Date(p.shelf_life_date);
        if (!isNaN(d.getTime())) {
          shelfLifeText = `${d.getFullYear()}년 ${(d.getMonth()+1).toString().padStart(2, '0')}월 ${d.getDate().toString().padStart(2, '0')}일까지`;
        }
      }

      return `<tr>
        <td><strong>${p.product_code || '-'}</strong></td>
        <td>
          <strong>${p.product_name || '-'}</strong>
          ${p.specification ? `<br><small style="color:#888">${p.specification}</small>` : ''}
        </td>
        <td><span class="badge ${typeCls}">${p.product_type || '-'}</span></td>
        <td>${p.category || '-'}</td>
        <td><span style="font-size:12px">${shelfLifeText}</span></td>
        <td>${p.storage_condition || '-'}</td>
        <td>${docStatusBadge(p.documents)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${p.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }
}

// ===========================
// 제품 코드 자동 생성 (구분별)
// ===========================
async function handleProductTypeChange(type) {
  if (!type) {
    document.getElementById('productCode').value = '';
    return;
  }
  
  const prefixMap = {
    '자체생산': 'LC-PRD',
    'OEM': 'LC-OEM',
    '수입제품': 'LC-IMT',
    '농산물': 'LC-ACT',
    '기타': 'LC-ETC'
  };
  
  const prefix = prefixMap[type] || 'LC-PRD';
  
  try {
    const data = await apiGetAll('products');
    const count = data.filter(p => p.product_type === type).length + 1;
    const seq = String(count).padStart(3, '0');
    document.getElementById('productCode').value = `${prefix}-${seq}`;
  } catch (e) {
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    document.getElementById('productCode').value = `${prefix}-${rand}`;
  }
}

// ===========================
// 신규 등록 모달 열기
// ===========================
async function openNewModal() {
  editingId = null;
  const form = document.getElementById('productForm');
  if (form) form.reset();

  document.querySelectorAll('.document-status').forEach(el => {
    if (el.tagName === 'SELECT') el.value = '미등록';
    else el.value = '';
  });
  document.querySelectorAll('.document-date').forEach(el => el.value = '');

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = '신규 제품 등록';

  const codeEl = document.getElementById('productCode');
  if (codeEl) codeEl.value = '';

  const modal = document.getElementById('productModal');
  if (modal) modal.classList.add('show');
}

// ===========================
// 수정 모달 열기
// ===========================
function openEditModal(id) {
  const p = allProducts.find(r => r.id === id);
  if (!p) return;
  editingId = id;

  const form = document.getElementById('productForm');
  if (form) form.reset();

  const fields = {
    productCode: p.product_code,
    productName: p.product_name,
    productType: p.product_type,
    category: p.category,
    specification: p.specification,
    unit: p.unit,
    barcode: p.barcode,
    shelfLifeDate: p.shelf_life_date,
    storageCondition: p.storage_condition,
    manufacturer: p.manufacturer,
    remarks: p.remarks,
    bizRegNo: p.biz_reg_no,
    bankAccount: p.bank_account,
    contactPerson: p.contact_person,
    contactPhone: p.contact_phone,
    personalEmail: p.personal_email,
    taxEmail: p.tax_email,
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  });

  if (p.documents) {
    try {
      const docs = typeof p.documents === 'string' ? JSON.parse(p.documents) : p.documents;
      Object.entries(docs).forEach(([docName, info]) => {
        const statusEl = document.querySelector(`.document-status[data-doc="${docName}"]`);
        if (statusEl && info) statusEl.value = info.status || '미등록';
        const dateEl = document.querySelector(`.document-date[data-doc="${docName}"]`);
        if (dateEl && info) dateEl.value = info.date || '';
      });
    } catch (e) { /* 무시 */ }
  }

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = '제품 정보 수정';

  const modal = document.getElementById('productModal');
  if (modal) modal.classList.add('show');
}

// ===========================
// 모달 닫기
// ===========================
function closeModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('show');
  editingId = null;
}

// ===========================
// 서류 데이터 수집
// ===========================
function collectDocuments() {
  const docs = {};
  document.querySelectorAll('.document-status[data-doc]').forEach(el => {
    const docName = el.getAttribute('data-doc');
    const dateEl = document.querySelector(`.document-date[data-doc="${docName}"]`);
    docs[docName] = {
      status: el.value || '미등록',
      date: dateEl?.value || ''
    };
  });
  return JSON.stringify(docs);
}

// ===========================
// 폼 제출
// ===========================
async function handleSubmit(e) {
  e.preventDefault();
  
  const docsJson = collectDocuments();
  const data = {
    product_code: document.getElementById('productCode').value,
    product_name: document.getElementById('productName').value,
    product_type: document.getElementById('productType').value,
    category: document.getElementById('category').value,
    specification: document.getElementById('specification').value,
    unit: document.getElementById('unit').value,
    barcode: document.getElementById('barcode').value,
    shelf_life_date: document.getElementById('shelfLifeDate').value,
    storage_condition: document.getElementById('storageCondition').value,
    manufacturer: document.getElementById('manufacturer').value,
    remarks: document.getElementById('remarks').value,
    biz_reg_no: document.getElementById('bizRegNo').value,
    bank_account: document.getElementById('bankAccount').value,
    contact_person: document.getElementById('contact_person')?.value || document.getElementById('contactPerson')?.value || '',
    contact_phone: document.getElementById('contact_phone')?.value || document.getElementById('contactPhone')?.value || '',
    personal_email: document.getElementById('personal_email')?.value || document.getElementById('personalEmail')?.value || '',
    tax_email: document.getElementById('tax_email')?.value || document.getElementById('taxEmail')?.value || '',
    documents: docsJson,
    updated_at: Date.now()
  };

  if (!data.product_name) { showToast('제품명을 입력하세요.', 'warning'); return; }

  const submitBtn = document.querySelector('#productForm button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    if (editingId) {
      await apiUpdate('products', editingId, data);
      showToast('제품 정보가 수정되었습니다.');
    } else {
      data.created_at = Date.now();
      await apiPost('products', data);
      showToast('신규 제품이 등록되었습니다.');
    }
    closeModal();
    loadProducts();
  } catch (e) {
    console.error('[products] 저장 실패:', e);
    showToast('저장에 실패했습니다: ' + e.message, 'danger');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '저장하기'; }
  }
}

// ===========================
// 데이터 삭제
// ===========================
async function deleteProduct(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await apiDelete('products', id);
    showToast('삭제되었습니다.');
    loadProducts();
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'danger');
  }
}

// ===========================
// 엑셀 내보내기
// ===========================
function exportData() {
  if (!filteredProducts.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
  // 실제 엑셀 라이브러리 연동 필요 (여기서는 간단히 CSV/JSON 시뮬레이션)
  console.log('Exporting...', filteredProducts);
  showToast('엑셀 파일 준비 중...');
  closeMoreMenu2();
}

// ===========================
// 전체 데이터 삭제
// ===========================
async function deleteAllData() {
  if (!confirm('모든 제품 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    for (const p of allProducts) {
      await apiDelete('products', p.id);
    }
    showToast('모든 데이터가 삭제되었습니다.');
    loadProducts();
    closeMoreMenu2();
  } catch (e) {
    showToast('삭제 중 오류 발생: ' + e.message, 'danger');
  }
}
