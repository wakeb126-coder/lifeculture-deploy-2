// ===========================
// 공통 유틸리티 함수
// ===========================

// 날짜 포맷 (YYYY-MM-DD)
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 오늘 날짜
function today() {
  return formatDate(new Date());
}

// 날짜 한국어 포맷
function formatDateKR(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}

// 숫자 포맷 (천 단위 콤마)
function numFormat(n, decimals = 2) {
  if (n === null || n === undefined || n === '') return '-';
  const num = parseFloat(n);
  if (isNaN(num)) return '-';
  return num.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

// ===========================
// Lot 번호 자동 생성
// ===========================
async function generateLotNo(prefix) {
  const dateStr = today().replace(/-/g, '');
  try {
    let tableName = '';
    if (prefix === 'RM' || prefix === 'IM' || prefix === 'OM') tableName = 'raw_materials';
    else if (prefix === 'ROAST') tableName = 'roasting_log';
    else if (prefix === 'GRIND') tableName = 'grinding_log';
    else if (prefix === 'EXT') tableName = 'extraction_log';
    else if (prefix === 'BTL') tableName = 'bottle_packing_log';
    else if (prefix === 'BOX') tableName = 'box_packing_log';

    const res = await fetch(`tables/${tableName}?limit=100`);
    const data = await res.json();
    const rows = data.data || [];

    const todayLots = rows.filter(r =>
      r.lot_no && r.lot_no.startsWith(`${prefix}-${dateStr}`)
    );
    const seq = String(todayLots.length + 1).padStart(3, '0');
    return `${prefix}-${dateStr}-${seq}`;
  } catch (e) {
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${prefix}-${dateStr}-${rand}`;
  }
}

// 공정별 Lot 번호 생성 (공정코드-날짜-순번)
async function generateProcessLotNo(processCode) {
  return await generateLotNo(processCode);
}

// ===========================
// 원료수불부 전용 Lot 생성
// ===========================
async function generateRawLotNo(transactionType) {
  return await generateLotNo('RM');
}

// ===========================
// 사이드바 HTML 생성 (권한 적용)
// ===========================
function getSidebarHTML(activePage = '') {
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

  // 사용자별 허용 메뉴 계산 (auth.js의 getUserAllowedMenus 활용)
  let allowedMenus;
  if (user && typeof getUserAllowedMenus === 'function') {
    allowedMenus = getUserAllowedMenus(user);
  } else if (user && typeof ROLE_PERMISSIONS !== 'undefined') {
    const perms = ROLE_PERMISSIONS[user.role];
    allowedMenus = perms ? perms.menus : ['dashboard', 'traceability'];
  } else {
    allowedMenus = ['dashboard', 'raw-materials', 'materials-master', 'vendors', 'roasting', 'grinding', 'extraction', 'bottle-packing', 'box-packing', 'traceability', 'sales', 'products', 'logistics', 'backup'];
  }

  const roleColors = { admin:'#e74c3c', production:'#27ae60', warehouse:'#2980b9', sales:'#8e44ad', viewer:'#7f8c8d' };
  const roleLabels = { admin:'관리자', production:'생산팀', warehouse:'물류팀', sales:'영업팀', viewer:'조회자' };

  const navGroups = [
    {
      category: '홈',
      items: [
        { label: '현황 대시보드', href: 'index.html', icon: 'fa-tachometer-alt', menu: 'dashboard' }
      ]
    },
    {
      category: '물류팀',
      items: [
        { label: '원부재료 마스터', href: 'materials-master.html', icon: 'fa-cubes', menu: 'materials-master' },
        { label: '원료수불부 (자체생산)', href: 'raw-materials.html', icon: 'fa-box-open', menu: 'raw-materials' },
        { label: '거래처 정보', href: 'vendors.html', icon: 'fa-handshake', menu: 'vendors' },
        { label: '물류관리 (수입/OEM/자체)', href: 'logistics.html', icon: 'fa-truck', menu: 'logistics' }
      ]
    },
    {
      category: '생산팀',
      items: [
        { label: '로스팅', href: 'roasting.html', icon: 'fa-fire', menu: 'roasting' },
        { label: '분쇄', href: 'grinding.html', icon: 'fa-cog', menu: 'grinding' },
        { label: '추출', href: 'extraction.html', icon: 'fa-tint', menu: 'extraction' },
        { label: '제품(병) 포장', href: 'bottle-packing.html', icon: 'fa-wine-bottle', menu: 'bottle-packing' },
        { label: '완제품(박스) 포장', href: 'box-packing.html', icon: 'fa-boxes', menu: 'box-packing' }
      ]
    },
    {
      category: '영업팀',
      items: [
        { label: '제품마스터정보', href: 'products.html', icon: 'fa-tag', menu: 'products' },
        { label: '온라인몰 판매', href: 'sales.html', icon: 'fa-shopping-cart', menu: 'sales' }
      ]
    },
    {
      category: '품질관리팀',
      items: [
        { label: 'Lot 역추적', href: 'traceability.html', icon: 'fa-search', menu: 'traceability' }
      ]
    },
    {
      category: '시스템',
      items: [
        { label: '데이터 백업/복원', href: 'backup.html', icon: 'fa-database', menu: 'backup', style: 'color:#e67e22' },
        { label: '사용자 관리', href: 'user-admin.html', icon: 'fa-users-cog', menu: 'user-admin', adminOnly: true }
      ]
    }
  ];

  let html = '';
  navGroups.forEach(group => {
    const visibleItems = group.items.filter(item => {
      if (item.adminOnly && (!user || user.role !== 'admin')) return false;
      return allowedMenus.includes(item.menu);
    });
    if (!visibleItems.length) return;
    html += `<div class="nav-section"><span class="nav-section-title">${group.category}</span>`;
    visibleItems.forEach(item => {
      const isActive = (item.href === activePage || activePage === item.menu) ? 'active' : '';
      const styleAttr = item.style ? ` style="${item.style}"` : '';
      html += `<a href="${item.href}" class="nav-item ${isActive}"${styleAttr}><i class="fas ${item.icon}"></i><span>${item.label}</span></a>`;
    });
    html += '</div>';
  });

  // 사용자 정보 하단
  if (user) {
    const color = roleColors[user.role] || '#7f8c8d';
    const roleLabel = roleLabels[user.role] || user.role;
    html += `
      <div class="sidebar-user-info" style="padding:16px;border-top:1px solid rgba(255,255,255,0.1);margin-top:auto">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:15px;flex-shrink:0">${user.name.charAt(0)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${user.name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${user.email}</div>
            <span style="display:inline-block;background:${color};color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-top:2px">${roleLabel}</span>
          </div>
          <button onclick="logout()" style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;padding:4px;font-size:14px" title="로그아웃"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </div>
    `;
  }

  return html;
}

// 사이드바 초기화
function setupSidebar() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');

  function toggleSidebar() {
    if (sidebar) sidebar.classList.toggle('open');
  }
  if (sidebarToggle) sidebarToggle.onclick = toggleSidebar;
  if (menuToggle) menuToggle.onclick = toggleSidebar;

  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && e.target !== menuToggle) {
      sidebar.classList.remove('open');
    }
  });
}

// ===========================
// 페이지 공통 초기화 (인증 포함)
// ===========================
function initPageWithAuth(menuKey) {
  // 인증 확인
  if (typeof requireAuth === 'function') {
    const user = requireAuth(menuKey);
    if (!user) return null;
  }

  // 날짜 표시
  initDateDisplay();

  // 사이드바 구성
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const sidebarNav = document.getElementById('sidebarNav');
  if (sidebarNav) {
    sidebarNav.innerHTML = getSidebarHTML(currentPath);
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !document.getElementById('sidebarNav')) {
    // 구형 사이드바 방식
  }
  setupSidebar();

  // 사용자 헤더 렌더링
  if (typeof renderUserHeader === 'function') renderUserHeader();

  return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
}

// ===========================
// 토스트 알림
// ===========================
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info} toast-icon"></i>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3500);
}

// ===========================
// 확인 모달
// ===========================
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:420px">
      <div class="modal-header"><h3><i class="fas fa-question-circle" style="color:var(--warning)"></i> 확인</h3></div>
      <div class="modal-body"><p style="margin:0;font-size:15px">${message}</p></div>
      <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:16px">
        <button class="btn btn-secondary" id="confirmNo">취소</button>
        <button class="btn btn-danger" id="confirmYes">삭제</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirmNo').onclick = () => overlay.remove();
  overlay.querySelector('#confirmYes').onclick = () => { onConfirm(); overlay.remove(); };
}

// ===========================
// 품질 뱃지
// ===========================
function qualityBadge(v) {
  if (!v) return '-';
  const map = { '적합': 'badge-success', '부적합': 'badge-danger', '재작업': 'badge-warning', '보류': 'badge-warning', '합격': 'badge-success', '불합격': 'badge-danger', '특채': 'badge-warning' };
  return `<span class="badge ${map[v] || 'badge-info'}">${v}</span>`;
}

// ===========================
// 네비게이션 활성화
// ===========================
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      item.classList.add('active');
    }
  });
}

// ===========================
// 날짜 표시
// ===========================
function initDateDisplay() {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const str = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  const el = document.getElementById('topbarDate');
  if (el) el.textContent = str;
  const el2 = document.getElementById('currentDate');
  if (el2) el2.textContent = str;
}

// ===========================
// 모바일 사이드바 토글 (구형 호환)
// ===========================
function initSidebarToggle() {
  setupSidebar();
}

// ===========================
// 페이지 로드 시 공통 초기화 (구형 호환)
// ===========================
function initPage() {
  initDateDisplay();
  setActiveNav();
  setupSidebar();
}

// ===========================
// Lot 링크 클릭 → 역추적
// ===========================
function goToTrace(lotNo) {
  window.location.href = `traceability.html?lot=${encodeURIComponent(lotNo)}`;
}

// ===========================
// 엑셀 내보내기 공통 함수
// ===========================
function exportToExcel(data, filename, headers) {
  if (!data || !data.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
  const headerRow = headers.map(h => h.label).join('\t');
  const rows = data.map(row => headers.map(h => {
    const val = row[h.key] || '';
    return String(val).replace(/\t/g, ' ');
  }).join('\t'));
  const content = [headerRow, ...rows].join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/tab-separated-values;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '_' + today().replace(/-/g,'') + '.xls';
  a.click();
  URL.revokeObjectURL(url);
  showToast('엑셀 파일이 다운로드되었습니다.', 'success');
}

// ===========================
// 인쇄 (A4)
// ===========================
function printPage() {
  window.print();
}
