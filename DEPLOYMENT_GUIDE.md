# 라이프컬처 생산관리 시스템 — 배포 및 테스트 가이드

> 제품마스터 개선사항(제품구분별 코드 자동 발부, 서류관리 체크리스트)이 적용된 시스템 배포 방법

---

## 📋 목차

1. [로컬 테스트 환경](#로컬-테스트-환경)
2. [Vercel 배포](#vercel-배포)
3. [기능 검증 체크리스트](#기능-검증-체크리스트)
4. [Firebase 설정 확인](#firebase-설정-확인)
5. [팀원 공유 방법](#팀원-공유-방법)

---

## 🖥️ 로컬 테스트 환경

### 방법 1: Python HTTP 서버 (가장 간단)

```bash
cd /home/ubuntu/lifeculture-deploy-2
python3 -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000` 접속

**장점:**
- 설치 불필요
- 즉시 실행 가능
- 모든 정적 파일 제공

**포트 변경:**
```bash
python3 -m http.server 3000  # 포트 3000으로 변경
```

---

### 방법 2: Node.js HTTP 서버

```bash
# Node.js 설치 확인
node --version

# 간단한 HTTP 서버 실행
npx http-server -p 8000
```

---

### 방법 3: Live Server (VS Code)

1. VS Code에서 프로젝트 폴더 열기
2. "Live Server" 확장 설치
3. `index.html` 우클릭 → "Open with Live Server"

---

## 🚀 Vercel 배포

### 사전 준비

- GitHub 계정 (이미 연결됨: `wakeb126-coder`)
- Vercel 계정 (https://vercel.com)

### 배포 단계

#### 1단계: Vercel 계정 생성 및 로그인

```bash
# Vercel CLI 설치
npm install -g vercel

# Vercel 로그인
vercel login
```

#### 2단계: 프로젝트 배포

```bash
cd /home/ubuntu/lifeculture-deploy-2

# 배포 실행
vercel
```

**배포 중 선택 사항:**
- **프로젝트 이름**: `lifeculture-mes` (또는 원하는 이름)
- **프로젝트 경로**: `.` (현재 디렉토리)
- **빌드 명령어**: 없음 (정적 사이트이므로 Enter)
- **출력 디렉토리**: `.` (현재 디렉토리)

#### 3단계: 배포 완료

배포 완료 후 다음과 같은 URL이 제공됩니다:
```
https://lifeculture-mes.vercel.app
```

---

### GitHub 연동 자동 배포 설정

#### 1단계: Vercel 웹사이트에서 설정

1. https://vercel.com/dashboard 접속
2. "Add New" → "Project" 클릭
3. GitHub 저장소 선택: `wakeb126-coder/lifeculture-deploy-2`
4. "Import" 클릭

#### 2단계: 배포 설정

- **Framework Preset**: "Other" 선택
- **Build Command**: 비워두기 (정적 사이트)
- **Output Directory**: `.`

#### 3단계: 자동 배포 설정

이제 `main` 브랜치에 푸시할 때마다 자동으로 배포됩니다:

```bash
# 변경사항 커밋
git add .
git commit -m "제품마스터 기능 추가"

# 자동으로 Vercel에 배포됨
git push origin main
```

---

## ✅ 기능 검증 체크리스트

배포 후 다음 항목들을 확인하세요:

### 1. 로그인 페이지
- [ ] 로그인 페이지 정상 표시
- [ ] 초기 계정 정보 표시됨 (로그인 가이드)
- [ ] 로그인 성공 후 대시보드로 이동

### 2. 제품 정보 페이지 접근
- [ ] 좌측 사이드바에서 "제품 정보" 메뉴 클릭
- [ ] 제품 목록 페이지 정상 표시
- [ ] KPI 카드 표시 (총 제품수, 자체생산, OEM생산, 수입제품)

### 3. 제품구분별 코드 자동 발부 테스트
- [ ] "신규 등록" 버튼 클릭
- [ ] 기본값으로 "LCS-001" 코드 표시
- [ ] 제품구분 드롭다운 클릭
- [ ] **"수입제품" 선택** → 코드가 "LCI-001"로 변경됨
- [ ] **"OEM제품" 선택** → 코드가 "LCO-001"로 변경됨
- [ ] **"기타제품" 선택** → 코드가 "LCE-001"로 변경됨

### 4. 서류관리 체크리스트 테스트
- [ ] 모달 하단에 "📎 서류관리 (입수 서류만 체크)" 섹션 표시
- [ ] 5개 항목 체크박스 표시:
  - ☐ 시험성적서
  - ☐ 원산지증명서
  - ☐ 수입신고필증
  - ☐ 거래명세서
  - ☐ 기타 (입력 필드 포함)
- [ ] 체크박스 클릭 가능
- [ ] "기타" 항목의 입력 필드에 텍스트 입력 가능

### 5. 제품 저장 및 조회
- [ ] 제품명 입력
- [ ] 제품구분 선택
- [ ] 서류 항목 일부 체크
- [ ] "저장" 버튼 클릭
- [ ] 성공 메시지 표시
- [ ] 제품 목록에 새 제품 추가됨
- [ ] 서류 상태 뱃지 표시 (예: "2/5 입수")

### 6. 제품 수정 및 서류 상태 업데이트
- [ ] 등록된 제품의 "수정" 버튼 클릭
- [ ] 기존 체크 상태 유지됨
- [ ] 추가 서류 항목 체크
- [ ] 저장 후 뱃지 업데이트됨 (예: "3/5 입수")

### 7. 필터링 및 검색
- [ ] 제품구분 필터 드롭다운 클릭
- [ ] "수입제품" 선택 → LCI 코드 제품만 표시
- [ ] 검색창에 제품명 또는 코드 입력 → 필터링 작동

---

## 🔐 Firebase 설정 확인

### Firebase 프로젝트 확인

1. https://console.firebase.google.com 접속
2. 프로젝트 선택: **lifeculture-d903e**
3. **Firestore Database** 확인

### 데이터 확인

1. Firestore 콘솔에서 **"products"** 컬렉션 확인
2. 등록된 제품 문서 확인
3. **documents** 필드에 JSON 형식으로 저장됨:

```json
{
  "시험성적서": { "checked": true },
  "원산지증명서": { "checked": false },
  "수입신고필증": { "checked": true },
  "거래명세서": { "checked": false },
  "기타": { "checked": true, "remarks": "품질 인증서" }
}
```

---

## 👥 팀원 공유 방법

### 배포 URL 공유

배포 완료 후 다음 URL을 팀원들과 공유:

```
https://lifeculture-mes.vercel.app
```

### 팀원 접속 방법

1. **PC에서:**
   - 브라우저에서 위 URL 접속
   - 로그인 (초기 계정 사용)
   - 제품 정보 관리 시작

2. **스마트폰에서:**
   - 브라우저에서 위 URL 접속
   - 주소창 우측 "공유" 또는 "메뉴" → "홈 화면에 추가"
   - PWA 앱으로 설치 (iOS/Android 모두 지원)

### 데이터 공유

- **같은 URL로 접속하면 모든 팀원이 동일한 데이터 공유**
- Firebase Firestore에 저장되므로 실시간 동기화
- 별도 로그인 없이 URL만 공유하면 됨

---

## 🔄 지속적 업데이트

### 로컬에서 수정 후 배포

```bash
# 1. 로컬에서 수정
# products.html, products.js 등 파일 수정

# 2. 변경사항 커밋
git add .
git commit -m "설명"

# 3. 푸시 (자동 배포)
git push origin main

# 4. Vercel에서 자동 배포 (1-2분 소요)
# https://vercel.com/dashboard에서 배포 상태 확인
```

---

## 🐛 문제 해결

### 로그인 실패

**증상:** 로그인 버튼 클릭 후 아무 반응 없음

**해결:**
1. 브라우저 개발자 도구 (F12) → Console 탭 확인
2. Firebase 오류 메시지 확인
3. Firebase 프로젝트 활성화 상태 확인

### 제품 저장 실패

**증상:** 저장 버튼 클릭 후 오류 메시지

**해결:**
1. 필수 필드 입력 확인 (제품명, 제품구분)
2. 브라우저 개발자 도구 → Network 탭에서 API 요청 확인
3. Firebase 콘솔에서 Firestore 권한 확인

### 코드 자동 생성 안 됨

**증상:** 제품구분 선택해도 코드가 변경 안 됨

**해결:**
1. 브라우저 새로고침 (Ctrl+F5)
2. 개발자 도구 → Console에서 JavaScript 오류 확인
3. `products.js` 파일이 정상 로드되었는지 확인

---

## 📞 지원

문제가 발생하면:

1. **로컬 테스트**: Python HTTP 서버로 로컬 테스트 실행
2. **브라우저 콘솔**: F12 → Console 탭에서 오류 확인
3. **Firebase 콘솔**: 데이터 저장 상태 확인
4. **GitHub 이슈**: 문제 상세 기록 후 보고

---

## 📚 참고 자료

- [Vercel 문서](https://vercel.com/docs)
- [Firebase Firestore 문서](https://firebase.google.com/docs/firestore)
- [PWA 설치 가이드](./install-guide.html)

---

**마지막 업데이트:** 2026년 5월 29일  
**버전:** v2.3 (제품마스터 개선)
