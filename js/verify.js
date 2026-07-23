// ══════════════════════════════════════════════════
// 재고검증 (wh_verify) 탭 전체 로직
// ══════════════════════════════════════════════════

var _vfyCurrentItem = '';
var _vfyCurrentLoc  = '';
var _vfyTimeline    = [];   // 현재 조회된 타임라인 rows
var _vfyEditId      = '';   // 수정 중인 레코드 ID
var _vfyEditType    = '';   // 'in' | 'out'

// ── 탭 진입 시 초기화 ────────────────────────────
function vfyInit() {
  // 위치코드 드롭다운 채우기
  var sel = document.getElementById('vfyLocFilter');
  if (sel && sel.options.length <= 1) {
    var allLocs = (typeof COLD_LOCATIONS !== 'undefined' ? COLD_LOCATIONS : [])
      .concat(typeof WARM_LOCATIONS !== 'undefined' ? WARM_LOCATIONS : []);
    allLocs.forEach(function(l) {
      var opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.code;
      sel.appendChild(opt);
    });
  }
  // 오늘 날짜를 종료일 기본값으로
  var toEl = document.getElementById('vfyDateTo');
  if (toEl && !toEl.value) toEl.value = new Date().toISOString().split('T')[0];
}

// ── 품목명 자동완성 ──────────────────────────────
async function vfyItemAutocomplete(inputEl) {
  var q = (inputEl.value || '').trim().toLowerCase();
  var drop = document.getElementById('vfyItemDrop');
  if (!drop) return;
  if (!q) { drop.style.display = 'none'; return; }

  var products = await whLoadProductMaster();
  // 입고/출고 데이터에서도 품목명 수집
  var nameSet = {};
  products.forEach(function(p) { if (p.product_name) nameSet[p.product_name] = true; });
  (typeof whInboundData !== 'undefined' ? whInboundData : []).forEach(function(r) { if (r.item_name) nameSet[r.item_name] = true; });
  (typeof whOutboundData !== 'undefined' ? whOutboundData : []).forEach(function(r) { if (r.item_name) nameSet[r.item_name] = true; });

  var matches = Object.keys(nameSet).filter(function(n) { return n.toLowerCase().includes(q); }).slice(0, 15);
  if (matches.length === 0) { drop.style.display = 'none'; return; }

  drop.innerHTML = matches.map(function(n) {
    var hi = n.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi'), '<b style="color:#e67e22">$1</b>');
    return '<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5" ' +
      'onmousedown="vfySelectItem(\'' + n.replace(/'/g,"\\'") + '\')">' + hi + '</div>';
  }).join('');
  drop.style.display = 'block';
}

function vfySelectItem(name) {
  var inp = document.getElementById('vfyItemInput');
  if (inp) inp.value = name;
  var drop = document.getElementById('vfyItemDrop');
  if (drop) drop.style.display = 'none';
}

// ── 조회 ─────────────────────────────────────────
async function vfySearch() {
  var itemName = (document.getElementById('vfyItemInput') || {}).value.trim();
  // 빈 문자열이면 전체 품목 조회
  var isAll = !itemName;

  var locFilter  = (document.getElementById('vfyLocFilter') || {}).value || '';
  var dateFrom   = (document.getElementById('vfyDateFrom') || {}).value || '';
  var dateTo     = (document.getElementById('vfyDateTo') || {}).value || '';

  _vfyCurrentItem = isAll ? '(전체 품목)' : itemName;
  _vfyCurrentLoc  = locFilter;

  showToast(isAll ? '전체 품목 조회 중...' : '조회 중...', 'info');

  // 입고 데이터 필터
  var inRows = (typeof whInboundData !== 'undefined' ? whInboundData : [])
    .filter(function(r) {
      if (!isAll && (r.item_name || '') !== itemName) return false;
      if (locFilter && (r.location || '') !== locFilter) return false;
      var d = r.inbound_date || r.date || '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    })
    .map(function(r) {
      return {
        id:       r.id,
        type:     'in',
        date:     r.inbound_date || r.date || '',
        lot_no:   r.lot_no || '',
        location: r.location || '',
        item_name:r.item_name || '',
        qty:      Number(r.qty) || 0,
        unit:     r.unit || 'ea',
        party:    r.supplier || '',
        manager:  r.manager || '',
        memo:     r.memo || '',
        inbound_type: r.inbound_type || ''
      };
    });

  // 출고 데이터 필터
  var outRows = (typeof whOutboundData !== 'undefined' ? whOutboundData : [])
    .filter(function(r) {
      if (!isAll && (r.item_name || '') !== itemName) return false;
      if (locFilter && (r.location || '') !== locFilter) return false;
      var d = r.outbound_date || r.date || '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    })
    .map(function(r) {
      return {
        id:       r.id,
        type:     'out',
        date:     r.outbound_date || r.date || '',
        lot_no:   r.lot_no || '',
        location: r.location || '',
        item_name:r.item_name || '',
        qty:      Number(r.qty) || 0,
        unit:     r.unit || 'ea',
        party:    r.destination || '',
        manager:  r.manager || '',
        memo:     r.memo || ''
      };
    });

  // 날짜순 정렬 (같은 날짜는 입고 먼저, 같은 유형이면 Lot 번호 순)
  var combined = inRows.concat(outRows).sort(function(a, b) {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    // 같은 날짜: 입고 먼저 표시
    if (a.type !== b.type) return (a.type === 'in' ? -1 : 1);
    // 같은 유형: Lot 번호 오름차순
    return (a.lot_no || '').localeCompare(b.lot_no || '');
  });

  // 누적재고 계산 (품목별 독립 계산)
  var cumStockMap = {};
  combined.forEach(function(row) {
    var key = row.item_name || '';
    if (!cumStockMap[key]) cumStockMap[key] = 0;
    if (row.type === 'in') {
      cumStockMap[key] += row.qty;
    } else {
      cumStockMap[key] -= row.qty;
    }
    row.cumStock = cumStockMap[key];
    row.isWarn = (row.cumStock < 0);
  });

  _vfyTimeline = combined;

  // 요약 카드
  var totalIn  = inRows.reduce(function(s, r) { return s + r.qty; }, 0);
  var totalOut = outRows.reduce(function(s, r) { return s + r.qty; }, 0);
  var warnCnt  = combined.filter(function(r) { return r.isWarn; }).length;

  document.getElementById('vfySumIn').textContent    = totalIn + ' ea';
  document.getElementById('vfySumOut').textContent   = totalOut + ' ea';
  document.getElementById('vfySumStock').textContent = (totalIn - totalOut) + ' ea';
  document.getElementById('vfySumWarn').textContent  = warnCnt + ' 건';
  document.getElementById('vfySummaryCards').style.display = '';

  // 타임라인 렌더
  vfyRenderTimeline();

  document.getElementById('vfyTimelineSection').style.display = combined.length > 0 ? '' : 'none';
  document.getElementById('vfyEmptyState').style.display      = combined.length > 0 ? 'none' : '';

  // ── 음수 재고 알림 배너 ──
  var warnBanner = document.getElementById('vfyWarnBanner');
  if (warnBanner) {
    if (warnCnt > 0) {
      // 음수 발생 행 목록 추출
      var warnRows = combined.filter(function(r) { return r.isWarn; });
      var warnDetails = warnRows.map(function(r) {
        return r.date + ' ' + (r.type === 'in' ? '입고' : '출고') + ' ' + r.qty + 'ea → 누적 ' + r.cumStock;
      }).join('<br>');
      warnBanner.innerHTML =
        '<div style="background:#fff0f0;border:2px solid #e74c3c;border-radius:10px;padding:14px 18px;margin-bottom:14px">' +
        '<div style="font-weight:700;color:#c0392b;font-size:13px;margin-bottom:8px">⚠️ 누적 재고 음수 경고 — ' + warnCnt + '건 발생</div>' +
        '<div style="font-size:12px;color:#555;line-height:1.8">' + warnDetails + '</div>' +
        '<div style="margin-top:10px;font-size:12px;color:#888">위 시점에서 출고 수량이 재고를 초과했습니다. 누락된 입고 이력이 있거나 출고 수량이 잘못 입력되었을 수 있습니다.</div>' +
        '</div>';
      warnBanner.style.display = '';
    } else {
      warnBanner.style.display = 'none';
      warnBanner.innerHTML = '';
    }
  }

  // 엑셀 다운로드 버튼 활성화
  var xlsBtn = document.getElementById('vfyExcelBtn');
  if (xlsBtn) xlsBtn.style.display = combined.length > 0 ? '' : 'none';

  if (combined.length > 0) {
    showToast(combined.length + '건 조회 완료' + (warnCnt > 0 ? ' (⚠️ 경고 ' + warnCnt + '건)' : ''), warnCnt > 0 ? 'warning' : 'success');
  } else {
    showToast((isAll ? '전체 품목' : '"' + itemName + '"') + ' 이력이 없습니다.', 'info');
  }
}

// ── 타임라인 렌더링 ──────────────────────────────
function vfyRenderTimeline() {
  var tbody = document.getElementById('vfyTimelineBody');
  if (!tbody) return;

  if (_vfyTimeline.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#aaa;padding:30px">이력이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = _vfyTimeline.map(function(row) {
    var isIn   = row.type === 'in';
    var rowBg  = row.isWarn ? '#fff0f0' : (isIn ? '#f0fff4' : '#fff');
    var warnIcon = row.isWarn ? ' <span title="누적재고 음수 경고" style="color:#e74c3c">⚠️</span>' : '';
    var typeBadge = isIn
      ? '<span style="background:#eafaf1;color:#27ae60;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">입고</span>'
      : '<span style="background:#fdedec;color:#e74c3c;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">출고</span>';

    // 조정 유형 배지
    if (row.inbound_type === '재고조정' || (row.lot_no && row.lot_no.startsWith('WH-ADJ'))) {
      typeBadge = '<span style="background:#fef9e7;color:#e67e22;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">조정</span>';
    }
    if (row.lot_no && row.lot_no.startsWith('WH-LOSS')) {
      typeBadge = '<span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">손실</span>';
    }
    if (row.lot_no && row.lot_no.startsWith('WH-SAMPLE')) {
      typeBadge = '<span style="background:#e2d9f3;color:#6f42c1;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">샘플</span>';
    }
    if (row.lot_no && row.lot_no.startsWith('WH-RTN')) {
      typeBadge = '<span style="background:#d1ecf1;color:#0c5460;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">반품</span>';
    }
    if (row.inbound_type === '회수입고') {
      typeBadge = '<span style="background:#f3e8fd;color:#8e44ad;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">회수입고</span>';
    }

    var qtyColor = isIn ? '#27ae60' : '#e74c3c';
    var qtySign  = isIn ? '+' : '-';
    var cumColor = row.cumStock < 0 ? '#e74c3c' : (row.cumStock === 0 ? '#aaa' : '#2980b9');

    return '<tr style="background:' + rowBg + ';border-bottom:1px solid #f0f0f0">' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;white-space:nowrap">' + (row.date || '-') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;white-space:nowrap">' + typeBadge + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;font-size:11px;white-space:nowrap"><code>' + (row.lot_no || '-') + '</code></td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;white-space:nowrap"><code style="font-size:11px">' + (row.location || '-') + '</code></td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2">' + (row.item_name || '-') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;text-align:right;font-weight:700;color:' + qtyColor + '">' + qtySign + row.qty + ' ' + (row.unit || 'ea') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;text-align:right;font-weight:700;color:' + cumColor + '">' + row.cumStock + warnIcon + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2">' + (row.party || '-') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2">' + (row.manager || '-') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;font-size:11px;color:#888">' + (row.memo || '') + '</td>' +
      '<td style="padding:7px 10px;border:1px solid #ffe0b2;white-space:nowrap">' +
        '<button onclick="vfyOpenEditModal(\'' + row.id + '\',\'' + row.type + '\')" ' +
        'style="background:#e8f4fd;color:#2980b9;border:1px solid #2980b9;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:3px" title="수정"><i class="fas fa-edit"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

// ── 이력 수정 모달 ────────────────────────────────
function vfyOpenEditModal(id, type) {
  var row = _vfyTimeline.find(function(r) { return r.id === id; });
  if (!row) return;
  _vfyEditId   = id;
  _vfyEditType = type;

  var isIn = type === 'in';
  var body = document.getElementById('vfyEditModalBody');
  if (!body) return;

  body.innerHTML =
    '<div style="background:#fef9e7;border:1px solid #f39c12;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#856404">' +
    '<b>Lot No:</b> ' + (row.lot_no || '-') + ' &nbsp;|&nbsp; <b>현재 수량:</b> ' + row.qty + ' ' + (row.unit || 'ea') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">날짜</label>' +
        '<input type="date" id="vfyEditDate" value="' + row.date + '" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px" /></div>' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">수량 <span style="color:#e74c3c">*</span></label>' +
        '<input type="number" id="vfyEditQty" value="' + row.qty + '" min="0" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px" /></div>' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">단위</label>' +
        '<select id="vfyEditUnit" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px">' +
        ['ea','box','pallet','kg'].map(function(u){ return '<option' + (row.unit===u?' selected':'') + '>' + u + '</option>'; }).join('') +
        '</select></div>' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">' + (isIn ? '공급처' : '출고처') + '</label>' +
        '<input type="text" id="vfyEditParty" value="' + (row.party || '') + '" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px" /></div>' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">담당자</label>' +
        '<input type="text" id="vfyEditManager" value="' + (row.manager || '') + '" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px" /></div>' +
      '<div><label style="display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:5px">비고</label>' +
        '<input type="text" id="vfyEditMemo" value="' + (row.memo || '') + '" style="width:100%;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px" /></div>' +
    '</div>' +
    '<div style="margin-top:12px"><label style="display:block;font-size:11px;font-weight:700;color:#e74c3c;margin-bottom:5px">수정 사유 <span style="color:#e74c3c">*</span> (감사 로그에 기록됩니다)</label>' +
      '<input type="text" id="vfyEditReason" placeholder="예) 수량 오입력 수정, 날짜 오류 수정" style="width:100%;padding:9px 12px;border:1.5px solid #e74c3c;border-radius:8px;font-size:13px" /></div>';

  document.getElementById('vfyEditModal').classList.add('show');
}

function vfyCloseEditModal() {
  var m = document.getElementById('vfyEditModal');
  if (m) m.classList.remove('show');
  _vfyEditId = '';
  _vfyEditType = '';
}

async function vfySaveEdit() {
  if (!_vfyEditId) return;
  var reason = (document.getElementById('vfyEditReason') || {}).value.trim();
  if (!reason) { showToast('수정 사유를 입력해주세요.', 'warning'); return; }

  var newQty     = Number((document.getElementById('vfyEditQty') || {}).value) || 0;
  var newDate    = (document.getElementById('vfyEditDate') || {}).value || '';
  var newUnit    = (document.getElementById('vfyEditUnit') || {}).value || 'ea';
  var newParty   = (document.getElementById('vfyEditParty') || {}).value || '';
  var newManager = (document.getElementById('vfyEditManager') || {}).value || '';
  var newMemo    = (document.getElementById('vfyEditMemo') || {}).value || '';

  var collection = _vfyEditType === 'in' ? 'wh_inbound' : 'wh_outbound';
  var dateField  = _vfyEditType === 'in' ? 'inbound_date' : 'outbound_date';
  var partyField = _vfyEditType === 'in' ? 'supplier' : 'destination';

  var updateData = { qty: newQty, unit: newUnit, manager: newManager, memo: newMemo };
  updateData[dateField] = newDate;
  updateData[partyField] = newParty;

  try {
    await apiPatch(collection, _vfyEditId, updateData);

    // 감사 로그 저장
    await apiPost('wh_audit_log', {
      action: 'edit',
      collection: collection,
      record_id: _vfyEditId,
      item_name: _vfyCurrentItem,
      reason: reason,
      updated_fields: JSON.stringify(updateData),
      editor: '관리자',
      created_at: Date.now()
    });

    showToast('수정 완료', 'success');
    vfyCloseEditModal();
    whInvalidateMapCache();
    await whReloadAll();
    await vfySearch();
  } catch(e) {
    showToast('수정 실패: ' + e.message, 'error');
  }
}

async function vfyDeleteRecord() {
  if (!_vfyEditId) return;
  var reason = (document.getElementById('vfyEditReason') || {}).value.trim();
  if (!reason) { showToast('삭제 사유를 입력해주세요.', 'warning'); return; }
  if (!confirm('이 이력을 삭제하시겠습니까?\n삭제 후 재고에 즉시 반영됩니다.')) return;

  var collection = _vfyEditType === 'in' ? 'wh_inbound' : 'wh_outbound';

  try {
    await apiDelete(collection, _vfyEditId);

    // 감사 로그
    await apiPost('wh_audit_log', {
      action: 'delete',
      collection: collection,
      record_id: _vfyEditId,
      item_name: _vfyCurrentItem,
      reason: reason,
      editor: '관리자',
      created_at: Date.now()
    });

    showToast('삭제 완료', 'success');
    vfyCloseEditModal();
    whInvalidateMapCache();
    await whReloadAll();
    await vfySearch();
  } catch(e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

// ── 누락 이력 추가 모달 ──────────────────────────
function vfyOpenAddModal(type) {
  if (!_vfyCurrentItem) { showToast('먼저 품목명을 조회해주세요.', 'warning'); return; }
  var isIn = type === 'in';
  document.getElementById('vfyAddType').value = type;
  document.getElementById('vfyAddModalTitle').innerHTML =
    '<i class="fas fa-plus-circle" style="color:' + (isIn ? '#27ae60' : '#e74c3c') + '"></i> 누락 ' + (isIn ? '입고' : '출고') + ' 추가';
  document.getElementById('vfyAddItem').value = _vfyCurrentItem;
  document.getElementById('vfyAddDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('vfyAddQty').value  = '';
  document.getElementById('vfyAddReason').value = '';
  document.getElementById('vfyAddDest').value = '';
  document.getElementById('vfyAddManager').value = '';

  // 위치 드롭다운 채우기
  vfyBuildLocSelect();

  // 출고처/공급처 라벨 변경
  var destRow = document.getElementById('vfyAddDestRow');
  if (destRow) {
    destRow.querySelector('label').textContent = isIn ? '공급처' : '출고처';
  }

  document.getElementById('vfyAddModal').classList.add('show');
}

function vfyBuildLocSelect() {
  var wh  = (document.getElementById('vfyAddWarehouse') || {}).value || 'C';
  var sel = document.getElementById('vfyAddLoc');
  if (!sel) return;
  var locs = wh === 'C'
    ? (typeof COLD_LOCATIONS !== 'undefined' ? COLD_LOCATIONS : [])
    : (typeof WARM_LOCATIONS !== 'undefined' ? WARM_LOCATIONS : []);
  sel.innerHTML = '<option value="">위치 선택</option>' +
    locs.map(function(l) { return '<option value="' + l.code + '">' + l.code + '</option>'; }).join('');

  // 현재 조회 위치 자동 선택
  if (_vfyCurrentLoc) {
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === _vfyCurrentLoc) { sel.selectedIndex = i; break; }
    }
  }
}

function vfyCloseAddModal() {
  var m = document.getElementById('vfyAddModal');
  if (m) m.classList.remove('show');
}

async function vfySaveAdd() {
  var type    = (document.getElementById('vfyAddType') || {}).value || 'in';
  var isIn    = type === 'in';
  var date    = (document.getElementById('vfyAddDate') || {}).value || '';
  var wh      = (document.getElementById('vfyAddWarehouse') || {}).value || 'C';
  var loc     = (document.getElementById('vfyAddLoc') || {}).value || '';
  var item    = (document.getElementById('vfyAddItem') || {}).value || '';
  var qty     = Number((document.getElementById('vfyAddQty') || {}).value) || 0;
  var unit    = (document.getElementById('vfyAddUnit') || {}).value || 'ea';
  var dest    = (document.getElementById('vfyAddDest') || {}).value || '';
  var manager = (document.getElementById('vfyAddManager') || {}).value || '';
  var reason  = (document.getElementById('vfyAddReason') || {}).value.trim();

  if (!date || !loc || !qty || !reason) {
    showToast('날짜, 위치, 수량, 추가 사유는 필수입니다.', 'warning');
    return;
  }

  // Lot 번호 생성
  var today = date.replace(/-/g,'').slice(2);
  var prefix = isIn ? ('WH-IN-' + today) : ('WH-OUT-' + today);
  var existing = isIn
    ? (typeof whInboundData !== 'undefined' ? whInboundData : [])
    : (typeof whOutboundData !== 'undefined' ? whOutboundData : []);
  var seq = String(existing.filter(function(r){ return r.lot_no && r.lot_no.startsWith(prefix); }).length + 1).padStart(3,'0');
  var lotNo = prefix + '-' + seq;

  try {
    if (isIn) {
      await apiPost('wh_inbound', {
        lot_no: lotNo,
        inbound_date: date,
        warehouse: wh,
        location: loc,
        item_name: item,
        qty: qty,
        unit: unit,
        supplier: dest,
        manager: manager,
        inbound_type: '누락입고',
        memo: '[누락입고추가] ' + reason,
        created_at: Date.now()
      });
    } else {
      await apiPost('wh_outbound', {
        lot_no: lotNo,
        outbound_date: date,
        warehouse: wh,
        location: loc,
        item_name: item,
        qty: qty,
        unit: unit,
        destination: dest,
        manager: manager,
        memo: '[누락출고추가] ' + reason,
        created_at: Date.now()
      });
    }

    // 감사 로그
    await apiPost('wh_audit_log', {
      action: 'add_missing',
      collection: isIn ? 'wh_inbound' : 'wh_outbound',
      lot_no: lotNo,
      item_name: item,
      qty: qty,
      reason: reason,
      editor: '관리자',
      created_at: Date.now()
    });

    showToast('누락 ' + (isIn ? '입고' : '출고') + ' 추가 완료: ' + lotNo, 'success');
    vfyCloseAddModal();
    whInvalidateMapCache();
    await whReloadAll();
    await vfySearch();
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'error');
  }
}

// ── 잔여 오차 조정 모달 ──────────────────────────
function vfyOpenAdjModal() {
  if (!_vfyCurrentItem) { showToast('먼저 품목명을 조회해주세요.', 'warning'); return; }

  // 현재 전산 재고 계산
  var currentStock = _vfyTimeline.length > 0
    ? _vfyTimeline[_vfyTimeline.length - 1].cumStock
    : 0;

  document.getElementById('vfyAdjCurrentStock').textContent = currentStock + ' ea';
  document.getElementById('vfyAdjActual').value  = '';
  document.getElementById('vfyAdjReason').value  = '';
  document.getElementById('vfyAdjDiffLabel').textContent = '';
  document.getElementById('vfyAdjDate').value    = new Date().toISOString().split('T')[0];

  document.getElementById('vfyAdjModal').classList.add('show');
}

function vfyCalcAdjDiff() {
  var currentStockText = (document.getElementById('vfyAdjCurrentStock') || {}).textContent || '0';
  var currentStock = parseInt(currentStockText) || 0;
  var actual = Number((document.getElementById('vfyAdjActual') || {}).value) || 0;
  var diff = actual - currentStock;
  var label = document.getElementById('vfyAdjDiffLabel');
  if (!label) return;
  if (diff === 0) {
    label.textContent = '(차이 없음)';
    label.style.color = '#aaa';
  } else if (diff > 0) {
    label.textContent = '(+' + diff + ' 입고 조정)';
    label.style.color = '#27ae60';
  } else {
    label.textContent = '(' + diff + ' 출고 조정)';
    label.style.color = '#e74c3c';
  }
}

function vfyCloseAdjModal() {
  var m = document.getElementById('vfyAdjModal');
  if (m) m.classList.remove('show');
}

async function vfySaveAdj() {
  var currentStockText = (document.getElementById('vfyAdjCurrentStock') || {}).textContent || '0';
  var currentStock = parseInt(currentStockText) || 0;
  var actual  = Number((document.getElementById('vfyAdjActual') || {}).value);
  var adjType = (document.getElementById('vfyAdjType') || {}).value || 'adj';
  var adjDate = (document.getElementById('vfyAdjDate') || {}).value || new Date().toISOString().split('T')[0];
  var reason  = (document.getElementById('vfyAdjReason') || {}).value.trim();

  if (isNaN(actual) || actual < 0) { showToast('실제 재고 수량을 입력해주세요.', 'warning'); return; }
  if (!reason) { showToast('조정 사유를 입력해주세요.', 'warning'); return; }

  var diff = actual - currentStock;
  if (diff === 0) { showToast('전산 재고와 실제 재고가 동일합니다. 조정이 필요 없습니다.', 'info'); return; }

  // Lot 접두사 결정
  var prefixMap = { loss: 'WH-LOSS', adj: 'WH-ADJ', sample: 'WH-SAMPLE', return: 'WH-RTN' };
  var lotPrefix = (prefixMap[adjType] || 'WH-ADJ') + '-' + adjDate.replace(/-/g,'').slice(2);

  // 조정 위치: 현재 조회 위치 또는 첫 번째 이력 위치
  var adjLoc = _vfyCurrentLoc || (_vfyTimeline.length > 0 ? _vfyTimeline[0].location : 'W-A1-1-1');
  var adjWh  = adjLoc ? adjLoc.charAt(0) : 'W';

  var existingAdj = [];
  try {
    var allIn  = typeof whInboundData  !== 'undefined' ? whInboundData  : [];
    var allOut = typeof whOutboundData !== 'undefined' ? whOutboundData : [];
    existingAdj = allIn.concat(allOut).filter(function(r){ return r.lot_no && r.lot_no.startsWith(lotPrefix); });
  } catch(e2) {}
  var seq = String(existingAdj.length + 1).padStart(3,'0');
  var adjLot = lotPrefix + '-' + seq;

  var typeLabel = { loss: '손실처리', adj: '기타조정', sample: '샘플출고', return: '반품입고' }[adjType] || '조정';

  try {
    if (diff > 0) {
      // 실제 > 전산 → 입고 조정
      await apiPost('wh_inbound', {
        lot_no: adjLot,
        inbound_date: adjDate,
        warehouse: adjWh,
        location: adjLoc,
        item_name: _vfyCurrentItem,
        qty: diff,
        unit: 'ea',
        inbound_type: typeLabel,
        manager: '재고검증',
        memo: '[' + typeLabel + '] ' + reason + ' (전산:' + currentStock + ' → 실제:' + actual + ')',
        created_at: Date.now()
      });
    } else {
      // 실제 < 전산 → 출고 조정
      await apiPost('wh_outbound', {
        lot_no: adjLot,
        outbound_date: adjDate,
        warehouse: adjWh,
        location: adjLoc,
        item_name: _vfyCurrentItem,
        qty: Math.abs(diff),
        unit: 'ea',
        destination: typeLabel,
        manager: '재고검증',
        memo: '[' + typeLabel + '] ' + reason + ' (전산:' + currentStock + ' → 실제:' + actual + ')',
        created_at: Date.now()
      });
    }

    // 감사 로그
    await apiPost('wh_audit_log', {
      action: 'adjust',
      adj_type: adjType,
      lot_no: adjLot,
      item_name: _vfyCurrentItem,
      location: adjLoc,
      before_stock: currentStock,
      after_stock: actual,
      diff: diff,
      reason: reason,
      editor: '관리자',
      created_at: Date.now()
    });

    showToast(typeLabel + ' 완료: ' + adjLot + ' (' + (diff > 0 ? '+' : '') + diff + ' ea)', 'success');
    vfyCloseAdjModal();
    whInvalidateMapCache();
    await whReloadAll();
    await vfySearch();
  } catch(e) {
    showToast('조정 실패: ' + e.message, 'error');
  }
}

// ── 엑셀 다운로드 ────────────────────────────────
function vfyExportExcel() {
  if (!_vfyTimeline || _vfyTimeline.length === 0) {
    showToast('먼저 이력을 조회해 주세요.', 'warning');
    return;
  }

  var itemName = _vfyCurrentItem || '품목';
  var today    = new Date().toISOString().split('T')[0];

  var isAllMode = (itemName === '(전체 품목)');

  // ── 시트1: 이력 타임라인 (품목별 누적재고 독립 계산) ──
  var timelineData = [
    ['날짜', '품목명', '유형', 'Lot No', '창고', '위치코드', '변동수량(ea)', '품목별누적재고(ea)', '담당자', '출고싸/공급싸', '비고', '음수경고']
  ];
  // 엑셀용 품목별 누적재고 독립 계산
  var xlsCumMap = {};
  _vfyTimeline.forEach(function(r) {
    var key = r.item_name || '';
    if (!xlsCumMap[key]) xlsCumMap[key] = 0;
    if (r.type === 'in') xlsCumMap[key] += r.qty;
    else                  xlsCumMap[key] -= r.qty;
    var typeLabel = r.type === 'in' ? '입고' : '출고';
    if (r.inbound_type === '재고조정' || (r.lot_no && r.lot_no.startsWith('WH-ADJ'))) typeLabel = '조정';
    if (r.lot_no && r.lot_no.startsWith('WH-LOSS'))   typeLabel = '손실';
    if (r.lot_no && r.lot_no.startsWith('WH-SAMPLE')) typeLabel = '샘플';
    if (r.lot_no && r.lot_no.startsWith('WH-RTN'))    typeLabel = '반품';
    timelineData.push([
      r.date || '',
      r.item_name || '',
      typeLabel,
      r.lot_no || '',
      r.warehouse === 'C' ? '냉장창고' : '일반창고',
      r.location || '',
      (r.type === 'in' ? '+' : '-') + r.qty,
      xlsCumMap[key],
      r.manager || '',
      r.destination || r.supplier || r.party || '',
      r.memo || r.note || '',
      xlsCumMap[key] < 0 ? '⚠️ 음수' : ''
    ]);
  });

  // ── 시트2: 음수 경고 목록 ──
  var warnData = [
    ['날짜', '품목명', '유형', 'Lot No', '위치코드', '변동수량(ea)', '누적재고(ea)', '비고']
  ];
  _vfyTimeline.filter(function(r) { return r.isWarn; }).forEach(function(r) {
    warnData.push([
      r.date || '',
      r.item_name || '',
      r.type === 'in' ? '입고' : '출고',
      r.lot_no || '',
      r.location || '',
      (r.type === 'in' ? '+' : '-') + r.qty,
      r.cumStock,
      r.memo || r.note || ''
    ]);
  });

  // ── 시트3: 요약 ──
  var totalIn  = _vfyTimeline.filter(function(r) { return r.type === 'in'; }).reduce(function(s, r) { return s + r.qty; }, 0);
  var totalOut = _vfyTimeline.filter(function(r) { return r.type !== 'in'; }).reduce(function(s, r) { return s + r.qty; }, 0);
  var warnCnt  = _vfyTimeline.filter(function(r) { return r.isWarn; }).length;

  var summaryData = [
    ['항목', '값'],
    ['품목명', itemName],
    ['조회 위치', _vfyCurrentLoc || '전체'],
    ['조회 기간', (document.getElementById('vfyDateFrom') || {}).value + ' ~ ' + (document.getElementById('vfyDateTo') || {}).value],
    ['전체 이력 건수', _vfyTimeline.length],
    ['전체 입고량(ea)', totalIn],
    ['전체 출고량(ea)', totalOut],
    ['현재 전산재고(ea)', totalIn - totalOut],
    ['음수 경고 건수', warnCnt],
    ['다운로드 일시', today]
  ];

  // 전체 품목 모드일 때 품목별 집계 시트 추가
  var itemSummaryData = null;
  if (isAllMode) {
    var itemMap = {};
    _vfyTimeline.forEach(function(r) {
      var n = r.item_name || '(미입력)';
      if (!itemMap[n]) itemMap[n] = { in: 0, out: 0, warn: 0 };
      if (r.type === 'in') itemMap[n].in  += r.qty;
      else                  itemMap[n].out += r.qty;
      if (r.isWarn) itemMap[n].warn++;
    });
    itemSummaryData = [['품목명', '입고합계(ea)', '출고합계(ea)', '전산재고(ea)', '음수경고건수']];
    Object.keys(itemMap).sort().forEach(function(n) {
      var m = itemMap[n];
      itemSummaryData.push([n, m.in, m.out, m.in - m.out, m.warn]);
    });
  }

  if (typeof XLSX === 'undefined') {
    showToast('엑셀 라이브러리가 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'error');
    return;
  }

  var wb = XLSX.utils.book_new();

  var ws1 = XLSX.utils.aoa_to_sheet(timelineData);
  ws1['!cols'] = [10,22,8,18,10,12,14,14,10,16,16,8].map(function(w) { return { wch: w }; });
  XLSX.utils.book_append_sheet(wb, ws1, '이력타임라인');

  // 전체 품목 모드: 품목별 집계 시트 먼저 삽입
  if (isAllMode && itemSummaryData) {
    var wsItem = XLSX.utils.aoa_to_sheet(itemSummaryData);
    wsItem['!cols'] = [28,14,14,14,12].map(function(w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, wsItem, '품목별집계');
  }

  if (warnData.length > 1) {
    var ws2 = XLSX.utils.aoa_to_sheet(warnData);
    ws2['!cols'] = [10,22,8,18,12,14,14,16].map(function(w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws2, '음수경고목록');
  }

  var ws3 = XLSX.utils.aoa_to_sheet(summaryData);
  ws3['!cols'] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, '요약');

  var fileName = '재고검증_' + itemName.replace(/[\/\\:*?"<>|]/g, '_') + '_' + today + '.xlsx';
  XLSX.writeFile(wb, fileName);
  showToast('엑셀 다운로드 완료: ' + fileName, 'success');
}
