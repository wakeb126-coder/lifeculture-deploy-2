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
      loadStockAlert(),
      loadMonthlySales(),
      loadDocumentAlert()
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

// ─────────────────────────────────────────────
// 이번달 매출 현황
// ─────────────────────────────────────────────
async function loadMonthlySales() {
  const container = document.getElementById('monthlySales');
  if (!container) return;
  try {
    const thisMonth = today().substring(0, 7); // YYYY-MM
    const all = await apiGetAll('sales') || [];
    const monthData = all.filter(r => {
      if (!r.sale_date || !r.sale_date.startsWith(thisMonth)) return false;
      // 샘플/샘플출고 항목 제외
      const prod = String(r.product_name || '').toLowerCase();
      const ch = String(r.channel || '').toLowerCase();
      if (prod.includes('샘플') || ch.includes('샘플')) return false;
      return true;
    });

    if (!monthData.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i> 이번달 매출 데이터 없음</div>';
      return;
    }

    // 채널별 집계
    const channelMap = {};
    let totalPayment = 0;
    let totalSettlement = 0;
    monthData.forEach(r => {
      const ch = r.channel || '기타';
      if (!channelMap[ch]) channelMap[ch] = { payment: 0, settlement: 0, count: 0 };
      channelMap[ch].payment += parseFloat(r.payment) || 0;
      channelMap[ch].settlement += parseFloat(r.settlement) || 0;
      channelMap[ch].count += 1;
      totalPayment += parseFloat(r.payment) || 0;
      totalSettlement += parseFloat(r.settlement) || 0;
    });

    const rows = Object.entries(channelMap)
      .sort((a, b) => b[1].settlement - a[1].settlement);

    container.innerHTML = `
      <div style="margin-bottom:8px;display:flex;gap:16px;flex-wrap:wrap">
        <span style="font-size:12px;color:#555">결제합계: <strong style="color:#2C5F2E">${numFormat(totalPayment, 0)}원</strong></span>
        <span style="font-size:12px;color:#555">정산합계: <strong style="color:#2980b9">${numFormat(totalSettlement, 0)}원</strong></span>
        <span style="font-size:12px;color:#555">건수: <strong>${monthData.length}건</strong></span>
      </div>
      <table class="mini-table">
        <thead><tr><th>채널</th><th>건수</th><th>결제금액</th><th>정산금액</th></tr></thead>
        <tbody>
          ${rows.map(([ch, v]) => `
            <tr>
              <td>${ch}</td>
              <td>${v.count}건</td>
              <td>${numFormat(v.payment, 0)}원</td>
              <td><strong>${numFormat(v.settlement, 0)}원</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    const container2 = document.getElementById('monthlySales');
    if (container2) container2.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i> 이번달 매출 데이터 없음</div>';
  }
}

// ─────────────────────────────────────────────
// 서류 갱신 알림
// ─────────────────────────────────────────────
async function loadDocumentAlert() {
  const container = document.getElementById('documentAlert');
  if (!container) return;
  try {
    const all = await apiGetAll('vendors') || [];
    const todayStr = today(); // YYYY-MM-DD
    const alerts = [];

    all.forEach(v => {
      const name = v.vendor_name || v.company_name || v.name || '(거래처명 없음)';
      // 각 서류별 확인
      const docs = [
        { label: '사업자등록증', date: v.doc_registration_date, status: v.doc_registration_status },
        { label: '통장사본', date: v.doc_bank_date, status: v.doc_bank_status },
        { label: '기타서류', date: v.doc_other_date, status: v.doc_other_status },
      ];
      // 추가 서류 (extra)
      if (v.extra_docs && Array.isArray(v.extra_docs)) {
        v.extra_docs.forEach((d, i) => {
          docs.push({ label: d.name || `추가서류${i+1}`, date: d.date, status: d.status });
        });
      }
      docs.forEach(doc => {
        if (!doc.date) return;
        // 기한만료 상태이거나 등록일로부터 1년(365일) 이내 갱신 필요 판단
        const docDate = new Date(doc.date);
        const todayDate = new Date(todayStr);
        const diffDays = Math.floor((todayDate - docDate) / (1000 * 60 * 60 * 24));
        const isExpired = doc.status === '기한만료';
        const isSoonExpire = diffDays >= 335; // 등록일로부터 335일 이상 = 30일 이내 갱신 필요
        if (isExpired || isSoonExpire) {
          alerts.push({
            vendor: name,
            doc: doc.label,
            date: doc.date,
            status: doc.status || '-',
            diffDays,
            isExpired
          });
        }
      });
    });

    if (!alerts.length) {
      container.innerHTML = '<div class="empty-msg" style="color:#27ae60"><i class="fas fa-check-circle"></i> 갱신 필요 서류 없음</div>';
      return;
    }

    // 만료 우선 정렬
    alerts.sort((a, b) => b.diffDays - a.diffDays);

    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>거래처</th><th>서류</th><th>등록일</th><th>상태</th></tr></thead>
        <tbody>
          ${alerts.slice(0, 8).map(a => `
            <tr>
              <td>${a.vendor}</td>
              <td>${a.doc}</td>
              <td>${a.date}</td>
              <td>${a.isExpired
                ? '<span class="badge badge-danger">기한만료</span>'
                : '<span class="badge badge-warning" style="background:#fff3cd;color:#856404">갱신임박</span>'
              }</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    const container2 = document.getElementById('documentAlert');
    if (container2) container2.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i> 서류 데이터 없음</div>';
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
