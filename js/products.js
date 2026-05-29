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

  // 자동 계산
  setupAutoCalc();

  // 더보기 메뉴
  setupMoreMenu2();
});

// ===========================
// 자동계산 설정
// ===========================
function setupAutoCalc() {
  const salePrice = document.getElementById('salePrice');
  const costPrice = document.getElementById('costPrice');
  if (salePrice) salePrice.addEventListener('input', calcMargin);
  if (costPrice) costPrice.addEventListener('input', calcMargin);
}

function calcMargin() {
  const sale = parseFloat(document.getElementById('salePrice')?.value) || 0;
  const cost = parseFloat(document.getElementById('costPrice')?.value) || 0;
  // 마진율은 표시용이므로 별도 필드 없음, 필요 시 추가
}

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
  const oem = allProducts.filter(p => p.product_type === 'OEM생산').length;
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
// 서류 상태 백지 (체크박스 기반)
// ===========================
function docStatusBadge(docs) {
  if (!docs) return '<span style="color:#999">-</span>';
  try {
    const d = typeof docs === 'string' ? JSON.parse(docs) : docs;
    const items = Object.values(d);
    const checked = items.filter(v => v && v.checked === true).length;
    const total = items.length;
    
    if (total === 0) return '<span style="color:#999">-</span>';
    if (checked === total) return `<span class="badge badge-success">전부 입수</span>`;
    if (checked === 0) return `<span class="badge badge-warning">서류 미입수</span>`;
    return `<span class="badge badge-info">${checked}/${total} 입수</span>`;
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
    const typeColors = { '자체생산': 'badge-success', 'OEM생산': 'badge-info', '수입제품': 'badge-warning', '기타': 'badge-secondary' };
    tbody.innerHTML = pageData.map(p => {
      const typeCls = typeColors[p.product_type] || 'badge-secondary';
      const margin = (p.sale_price && p.cost_price)
        ? (((p.sale_price - p.cost_price) / p.sale_price) * 100).toFixed(1) + '%'
        : '-';
      return `<tr>
        <td><strong>${p.product_code || '-'}</strong></td>
        <td>
          <strong>${p.product_name || '-'}</strong>
          ${p.specification ? `<br><small style="color:#888">${p.specification}</small>` : ''}
        </td>
        <td><span class="badge ${typeCls}">${p.product_type || '-'}</span></td>
        <td>${p.category || '-'}</td>
        <td>${p.sale_price ? numFormat(p.sale_price, 0) + '원' : '-'}</td>
        <td>${p.cost_price ? numFormat(p.cost_price, 0) + '원' : '-'} ${margin !== '-' ? `<small style="color:#888">(${margin})</small>` : ''}</td>
        <td>${docStatusBadge(p.documents)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${p.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }
  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  // products.html은 별도 페이지네이션 없음 — 추후 필요 시 추가
}

// ===========================
// 제품 코드 자동 생성 (제품구분별)
// ===========================
async function generateProductCode(productType = '') {
  try {
    const data = await apiGetAll('products');
    
    // 제품구분별 코드 프리픽스
    const prefixes = {
      '자사제품': 'LCS',
      '수입제품': 'LCI',
      'OEM제품': 'LCO',
      '기타제품': 'LCE'
    };
    
    const prefix = prefixes[productType] || 'LCS'; // 기본값: 자사제품
    
    // 같은 제품구분의 제품 개수 계산
    const sameTypeProducts = data.filter(p => p.product_type === productType);
    const seq = String(sameTypeProducts.length + 1).padStart(3, '0');
    
    return `${prefix}-${seq}`;
  } catch (e) {
    const prefixes = {
      '자사제품': 'LCS',
      '수입제품': 'LCI',
      'OEM제품': 'LCO',
      '기타제품': 'LCE'
    };
    const prefix = prefixes[productType] || 'LCS';
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${prefix}-${rand}`;
  }
}

// ===========================
// 신규 등록 모달 열기
// ===========================
async function openNewModal() {
  editingId = null;
  const form = document.getElementById('productForm');
  if (form) form.reset();

  // 서류 상태 초기화
  document.querySelectorAll('.document-status').forEach(el => {
    if (el.tagName === 'SELECT') el.value = '미등록';
    else el.value = '';
  });
  document.querySelectorAll('.document-date').forEach(el => el.value = '');

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = '신규 제품 등록';

  // 코드 자동생성 (기본값)
  const code = await generateProductCode('자사제품');
  const codeEl = document.getElementById('productCode');
  if (codeEl) codeEl.value = code;

  // 제품구분 선택 시 코드 자동 재생성
  const productTypeEl = document.getElementById('productType');
  if (productTypeEl) {
    productTypeEl.addEventListener('change', async function() {
      const newCode = await generateProductCode(this.value);
      if (codeEl) codeEl.value = newCode;
    });
  }

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

  // 기본 필드 채우기
  const fields = {
    productCode: p.product_code,
    productName: p.product_name,
    productType: p.product_type,
    category: p.category,
    specification: p.specification,
    unit: p.unit,
    salePrice: p.sale_price,
    costPrice: p.cost_price,
    barcode: p.barcode,
    shelfLife: p.shelf_life,
    storageCondition: p.storage_condition,
    manufacturer: p.manufacturer,
    remarks: p.remarks,
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  });

  // 서류 상태 채우기 (체크박스 기반)
  if (p.documents) {
    try {
      const docs = typeof p.documents === 'string' ? JSON.parse(p.documents) : p.documents;
      Object.entries(docs).forEach(([docName, info]) => {
        const checkboxEl = document.querySelector(`.document-checkbox[data-doc="${docName}"]`);
        if (checkboxEl && info) {
          checkboxEl.checked = info.checked || false;
        }
        
        // 기타 서류 기재 내용 채우기
        if (docName === '기타') {
          const remarksEl = document.querySelector(`.document-remarks[data-doc="${docName}"]`);
          if (remarksEl && info) remarksEl.value = info.remarks || '';
        }
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
// 서류 데이터 수집 (체크박스 기반)
// ===========================
function collectDocuments() {
  const docs = {};
  
  // 체크박스 중심으로 데이터 수집
  document.querySelectorAll('.document-checkbox[data-doc]').forEach(el => {
    const docName = el.getAttribute('data-doc');
    const isChecked = el.checked;
    
    if (docName === '기타') {
      // 기타 서류는 기재 내용 포함
      const remarksEl = document.querySelector(`.document-remarks[data-doc="${docName}"]`);
      docs[docName] = {
        checked: isChecked,
        remarks: remarksEl?.value || ''
      };
    } else {
      // 나머지 서류는 슨단히 체크 여부만 기록
      docs[docName] = {
        checked: isChecked
      };
    }
  });
  
  return JSON.stringify(docs);
}

// ===========================
// 폼 제출
// ===========================
async function handleSubmit(e) {
  e.preventDefault();
  const data = {
    product_code: document.getElementById('productCode')?.value || '',
    product_name: document.getElementById('productName')?.value || '',
    product_type: document.getElementById('productType')?.value || '',
    category: document.getElementById('category')?.value || '',
    specification: document.getElementById('specification')?.value || '',
    unit: document.getElementById('unit')?.value || '',
    sale_price: parseFloat(document.getElementById('salePrice')?.value) || 0,
    cost_price: parseFloat(document.getElementById('costPrice')?.value) || 0,
    barcode: document.getElementById('barcode')?.value || '',
    shelf_life: parseInt(document.getElementById('shelfLife')?.value) || 0,
    storage_condition: document.getElementById('storageCondition')?.value || '',
    manufacturer: document.getElementById('manufacturer')?.value || '',
    remarks: document.getElementById('remarks')?.value || '',
    documents: collectDocuments(),
  };

  if (!data.product_name) { showToast('제품명을 입력하세요.', 'warning'); return; }

  const submitBtn = document.querySelector('#productForm button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    if (editingId) {
      await apiPut('products', editingId, data);
      showToast('제품 정보가 수정되었습니다.', 'success');
    } else {
      await apiPost('products', data);
      showToast('제품이 등록되었습니다.', 'success');
    }
    closeModal();
    await loadProducts();
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '저장'; }
  }
}

// ===========================
// 삭제
// ===========================
async function deleteProduct(id) {
  showConfirm('이 제품을 삭제하시겠습니까?<br><small style="color:#e74c3c">삭제 후 복구할 수 없습니다.</small>', async () => {
    try {
      await apiDelete('products', id);
      showToast('삭제되었습니다.', 'success');
      if (editingId === id) closeModal();
      await loadProducts();
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}

// ===========================
// 내보내기 (CSV)
// ===========================
function exportData() {
  if (!allProducts.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
  const headers = ['제품코드', '제품명', '제품구분', '카테고리', '규격', '단위', '판매단가', '원가', '바코드', '유통기한(일)', '보관조건', '제조업체', '비고'];
  const rows = allProducts.map(p => [
    p.product_code, p.product_name, p.product_type, p.category,
    p.specification, p.unit, p.sale_price, p.cost_price,
    p.barcode, p.shelf_life, p.storage_condition, p.manufacturer, p.remarks
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `products_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  closeMoreMenu2();
  showToast('CSV 파일이 다운로드되었습니다.', 'success');
}

// ===========================
// 전체 삭제
// ===========================
function deleteAllData() {
  closeMoreMenu2();
  showConfirm(`전체 제품 데이터 ${allProducts.length}건을 삭제하시겠습니까?<br><small style="color:#e74c3c">삭제 후 복구할 수 없습니다.</small>`, async () => {
    try {
      for (const p of allProducts) {
        await apiDelete('products', p.id);
      }
      showToast('전체 삭제되었습니다.', 'success');
      await loadProducts();
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  });
}
