# 라이프컬처 생산관리 시스템 (LifeCulture MES)

> 더치커피 원부자재 입고부터 완제품 출고까지 전 공정 Lot 추적 + 판매/거래처/제품 통합 관리 PWA  
> **v2.3** — 원두 Lot 선택 모달 개선 / 자재코드 자동연동 / 모든 사이드바 전체 메뉴 적용

---

## 📋 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 앱 이름 | 라이프컬처 생산관리 |
| 플랫폼 | PWA (Progressive Web App) — 스마트폰/PC 홈화면 설치 가능 |
| 데이터 저장 | Genspark Table REST API (클라우드 DB) |
| 팀 공유 | ✅ **같은 URL로 접속하면 전원이 동일한 데이터를 공유** |

---

## 🌐 팀 공유 방식 안내

> **회사 사람들이 같은 앱을 설치하면 데이터가 공유됩니다.**

- 모든 데이터는 **Genspark Table API (클라우드 서버)**에 저장됩니다.
- A가 로스팅 일지를 입력하면 B가 같은 URL로 접속했을 때 즉시 확인 가능합니다.
- 별도 로그인 없이 **같은 URL을 공유**하면 됩니다.
- PWA 설치는 단지 홈화면 바로가기 추가일 뿐, URL이 동일하면 동일한 데이터를 씁니다.

---

## 📁 파일 구조

```
/
├── index.html              ← 현황 대시보드
├── raw-materials.html      ← 원료수불부 (입출고 관리)
├── materials-master.html   ← 원부재료 마스터
├── roasting.html           ← 로스팅 생산일지
├── grinding.html           ← 분쇄 생산일지
├── extraction.html         ← 추출 생산일지
├── bottle-packing.html     ← 제품(병) 포장 생산일지
├── box-packing.html        ← 완제품(박스) 포장 생산일지
├── traceability.html       ← Lot 역추적
├── vendors.html            ← 거래처 정보 관리
├── products.html           ← 제품 정보 관리
├── sales.html              ← 온라인몰 판매 관리
├── install-guide.html      ← 앱 설치 가이드
├── manifest.json           ← PWA 매니페스트
├── sw.js                   ← Service Worker (오프라인 캐싱)
│
├── css/
│   ├── style.css           ← 공통 스타일
│   ├── production.css      ← 생산일지 스타일
│   ├── mobile.css          ← 모바일 반응형 스타일
│   └── traceability.css    ← Lot 역추적 전용 스타일
│
├── js/
│   ├── db.js               ← Genspark Table API CRUD 공통 함수
│   ├── common.js           ← 공통 유틸리티, 네비게이션 생성
│   ├── pwa.js              ← PWA 설치 배너, 오프라인 감지
│   ├── firebase-config.js  ← Firebase 스텁 (구버전 호환, 미사용)
│   ├── dashboard.js        ← 대시보드 KPI 및 최근 기록
│   ├── raw-materials.js    ← 원료수불부 CRUD + FIFO 출고
│   ├── materials-master.js ← 원부재료 마스터 CRUD
│   ├── roasting.js         ← 로스팅 생산일지 CRUD
│   ├── grinding.js         ← 분쇄 생산일지 CRUD
│   ├── extraction.js       ← 추출 생산일지 CRUD
│   ├── bottle-packing.js   ← 제품(병) 포장 CRUD
│   ├── box-packing.js      ← 완제품(박스) 포장 CRUD
│   ├── traceability.js     ← Lot 역추적 검색
│   ├── vendors.js          ← 거래처 CRUD
│   ├── products.js         ← 제품 CRUD + 서류 관리
│   └── sales.js            ← 판매 CRUD + CSV 가져오기/내보내기
│
└── images/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🗄️ 데이터 모델 (Genspark Table API)

### 테이블 목록

| 테이블명 | 설명 | 주요 필드 |
|---------|------|----------|
| `raw_materials` | 원료수불부 | lot_no, item_name, transaction_type, receive_qty, out_qty |
| `roasting_log` | 로스팅 일지 | lot_no, work_date, raw_lot_no, roasted_qty, quality_result |
| `grinding_log` | 분쇄 일지 | lot_no, work_date, roast_lot_no, ground_qty, quality_result |
| `extraction_log` | 추출 일지 | lot_no, work_date, grind_lot_no, extract_qty, quality_result |
| `bottle_packing_log` | 병 포장 일지 | lot_no, work_date, extract_lot_no, bottle_count, quality_result |
| `box_packing_log` | 박스 포장 일지 | lot_no, work_date, bottle_lot_no, box_count, quality_result |
| `materials_master` | 원부재료 마스터 | material_code, material_name, material_type, standard_price |
| `vendors` | 거래처 정보 | vendor_code, vendor_name, vendor_type, trade_status |
| `products` | 제품 정보 | product_code, product_name, product_type, sale_price, documents |
| `sales` | 온라인몰 판매 | sale_date, channel, product_name, quantity, sale_amount, profit |

### API 엔드포인트
```
GET    tables/{table}?page=1&limit=100   ← 목록 조회
GET    tables/{table}/{id}               ← 단건 조회
POST   tables/{table}                   ← 신규 등록
PUT    tables/{table}/{id}              ← 전체 수정
PATCH  tables/{table}/{id}              ← 부분 수정
DELETE tables/{table}/{id}              ← 삭제
```

---

## ✅ 완료된 기능

### 공통 인프라
- [x] Genspark Table REST API 연동 (`js/db.js`)
- [x] PWA 설치 지원 (홈화면 추가, Service Worker)
- [x] 오프라인 감지 및 알림 바
- [x] 공통 네비게이션 (사이드바 + 모바일 바텀내비 + 더보기 메뉴)
- [x] 토스트 알림, 확인 모달 공통화
- [x] Lot 번호 자동 생성 (IM/OM/ROAST/GRIND/EXT/BTL/BOX 구분)

### 생산일지 (5개 공정)
- [x] 로스팅: CRUD, Lot 생성, 원료 출고 자동 연동
- [x] 분쇄: CRUD, 로스팅 Lot 연동
- [x] 추출: CRUD, 분쇄 Lot 연동, Brix 기록
- [x] 제품(병) 포장: CRUD, 추출 Lot 연동, 유통기한 관리
- [x] 완제품(박스) 포장: CRUD, 병 포장 Lot 연동, 출하 관리

### 원부자재 관리
- [x] 원료수불부: 입고(IM)/출고(OM) CRUD, FIFO 자동 차감, 탭별 당일현황
- [x] 원부재료 마스터: CRUD, 자재 코드 자동생성, 안전재고 설정

### 거래처/제품/판매
- [x] 거래처 정보: CRUD, 거래처 코드 자동생성, 서류 상태 관리
- [x] 제품 정보: CRUD, 제품 코드 자동생성, 서류체크리스트(6종), CSV 내보내기
- [x] 온라인몰 판매: CRUD, 채널별 집계, 월별 차트, CSV 가져오기/내보내기

### 분석/추적
- [x] Lot 역추적: Lot 번호로 전 공정 이력 조회
- [x] 대시보드 KPI: 이번달 로스팅/추출/완제품/매출 현황

---

## 📲 앱 설치 방법 (팀원 공유)

1. **Publish 탭**에서 배포하여 URL 확보
2. 팀원들에게 URL 공유
3. 스마트폰 브라우저에서 URL 접속 → "홈 화면에 추가" 선택
4. `install-guide.html` 참조 (iOS / Android 상세 가이드 포함)

> 💡 URL이 같으면 데이터가 자동으로 공유됩니다!

---

## 🔧 추가 개발 예정

- [ ] 재고 부족 자동 알림 (raw_materials ↔ materials_master 연동)
- [ ] 대시보드 차트 (Chart.js 월별 생산량)
- [ ] 판매 채널별 마진 분석 차트 고도화
- [ ] 사용자별 접근 권한 구분 (관리자/작업자)
- [ ] 인쇄용 생산일지 PDF 출력

---

## 🚀 배포

**Publish 탭**을 사용하여 원클릭 배포하세요.  
배포 후 URL을 팀원들과 공유하면 즉시 사용 가능합니다.
