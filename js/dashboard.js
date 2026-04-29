// 대시보드 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});

async function loadDashboard() {
  try {
    await Promise.all([
      loadKPI(),
      loadRecentRoasting(),
      loadRecentExtraction(),
      loadRecentBox(),
      loadStockAlert()
    ]);
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

async function loadKPI() {
  try {
    const thisMonth = today().substring(0, 7); // YYYY-MM

    // 원자재 품목 수
    const rawRes = await apiGet('raw_materials', { limit: 100 });
    const rawData = rawRes.data || [];
    // 입고 거래만 필터
    const rawItems = rawData.filter(r => r.transaction_type === '입고');
    document.getElementById('kpiRaw').textContent = rawItems.length + '건';

    // 로스팅 이번 달
    const roastRes = await apiGet('roasting_log', { limit: 100 });
    const roastData = roastRes.data || [];
    const roastMonth = roastData.filter(r => r.work_date && r.work_date.startsWith(thisMonth));
    const roastTotal = roastMonth.reduce((s, r) => s + (parseFloat(r.roasted_qty) || 0), 0);
    document.getElementById('kpiRoasting').textContent = numFormat(roastTotal, 1) + 'kg';

    // 추출 이번 달
    const extRes = await apiGet('extraction_log', { limit: 100 });
    const extData = extRes.data || [];
    const extMonth = extData.filter(r => r.work_date && r.work_date.startsWith(thisMonth));
    const extTotal = extMonth.reduce((s, r) => s + (parseFloat(r.extract_qty) || 0), 0);
    document.getElementById('kpiExtraction').textContent = numFormat(extTotal, 1) + 'L';

    // 완제품 박스 이번 달
    const boxRes = await apiGet('box_packing_log', { limit: 100 });
    const boxData = boxRes.data || [];
    const boxMonth = boxData.filter(r => r.work_date && r.work_date.startsWith(thisMonth));
    const boxTotal = boxMonth.reduce((s, r) => s + (parseInt(r.box_count) || 0), 0);
    document.getElementById('kpiBox').textContent = numFormat(boxTotal, 0) + 'box';
  } catch (e) {
    console.error('KPI load error:', e);
  }
}

async function loadRecentRoasting() {
  const container = document.getElementById('recentRoasting');
  try {
    const res = await apiGet('roasting_log', { limit: 100 });
    const rows = (res.data || []).reverse().slice(0, 5);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i>데이터 없음</div>';
      return;
    }
    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Lot No</th><th>날짜</th><th>제품명</th><th>완료량</th><th>품질</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="badge badge-lot" style="cursor:pointer" onclick="goToTrace('${r.lot_no}')">${r.lot_no || '-'}</span></td>
              <td>${r.work_date || '-'}</td>
              <td>${r.product_name || '-'}</td>
              <td>${numFormat(r.roasted_qty, 1)} kg</td>
              <td>${qualityBadge(r.quality_result)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-msg">데이터 로드 실패</div>';
  }
}

async function loadRecentExtraction() {
  const container = document.getElementById('recentExtraction');
  try {
    const res = await apiGet('extraction_log', { limit: 100 });
    const rows = (res.data || []).reverse().slice(0, 5);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i>데이터 없음</div>';
      return;
    }
    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Lot No</th><th>날짜</th><th>제품명</th><th>추출량</th><th>품질</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="badge badge-lot" style="cursor:pointer" onclick="goToTrace('${r.lot_no}')">${r.lot_no || '-'}</span></td>
              <td>${r.work_date || '-'}</td>
              <td>${r.product_name || '-'}</td>
              <td>${numFormat(r.extract_qty, 1)} L</td>
              <td>${qualityBadge(r.quality_result)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-msg">데이터 로드 실패</div>';
  }
}

async function loadRecentBox() {
  const container = document.getElementById('recentBox');
  try {
    const res = await apiGet('box_packing_log', { limit: 100 });
    const rows = (res.data || []).reverse().slice(0, 5);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i>데이터 없음</div>';
      return;
    }
    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Lot No</th><th>날짜</th><th>제품명</th><th>박스수</th><th>거래처</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="badge badge-lot" style="cursor:pointer" onclick="goToTrace('${r.lot_no}')">${r.lot_no || '-'}</span></td>
              <td>${r.work_date || '-'}</td>
              <td>${r.product_name || '-'}</td>
              <td>${numFormat(r.box_count, 0)} box</td>
              <td>${r.customer || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-msg">데이터 로드 실패</div>';
  }
}

async function loadStockAlert() {
  const container = document.getElementById('stockAlert');
  try {
    const res = await apiGet('raw_materials', { limit: 100 });
    const all = res.data || [];
    // 품목별 잔량 집계
    const stockMap = {};
    all.forEach(r => {
      const key = r.item_name || r.item_code;
      if (!key) return;
      if (!stockMap[key]) stockMap[key] = { name: r.item_name, unit: r.unit, balance: 0 };
      if (r.transaction_type === '입고') stockMap[key].balance += parseFloat(r.receive_qty) || 0;
      if (r.transaction_type === '출고') stockMap[key].balance -= parseFloat(r.out_qty) || 0;
      if (r.transaction_type === '조정') stockMap[key].balance = parseFloat(r.balance) || stockMap[key].balance;
    });
    const items = Object.values(stockMap);
    if (!items.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i>등록된 원자재 없음</div>';
      return;
    }
    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>품목명</th><th>잔량</th><th>단위</th><th>상태</th></tr></thead>
        <tbody>
          ${items.slice(0, 6).map(r => {
            const low = r.balance <= 10;
            return `
              <tr>
                <td>${r.name || '-'}</td>
                <td><strong>${numFormat(r.balance, 1)}</strong></td>
                <td>${r.unit || '-'}</td>
                <td>${low ? '<span class="badge badge-danger">부족</span>' : '<span class="badge badge-success">정상</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-msg">데이터 로드 실패</div>';
  }
}
