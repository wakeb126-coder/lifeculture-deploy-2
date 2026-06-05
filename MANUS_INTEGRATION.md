# Manus AI 자동 배포 시스템 통합 가이드

> Firebase와 Manus AI를 연동하여 보완된 내용이 실시간으로 배포되고 앱에서 즉시 사용 가능하도록 설정

---

## 📋 목차

1. [시스템 아키텍처](#시스템-아키텍처)
2. [자동 배포 플로우](#자동-배포-플로우)
3. [Vercel 설정](#vercel-설정)
4. [GitHub Actions 설정](#github-actions-설정)
5. [Firebase 설정](#firebase-설정)
6. [앱 자동 갱신](#앱-자동-갱신)
7. [모니터링 및 로깅](#모니터링-및-로깅)

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Manus AI 작업                           │
│  (제품마스터 개선, 버그 수정, 기능 추가 등)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub 저장소                              │
│  (wakeb126-coder/lifeculture-deploy-2)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions 자동 배포                        │
│  (deploy.yml 워크플로우)                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel 클라우드                             │
│  (lifeculture-mes.vercel.app)                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Firestore                              │
│  (버전 정보, 설정 저장)                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              사용자 앱 (웹/모바일)                            │
│  (auto-update.js로 실시간 갱신)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 자동 배포 플로우

### 1단계: Manus AI에서 작업 완료

```
Manus AI에서 제품마스터 개선사항 구현
↓
파일 수정 (products.html, products.js 등)
↓
변경사항 커밋 및 푸시
```

### 2단계: GitHub Actions 자동 실행

```
main 브랜치에 푸시 감지
↓
.github/workflows/deploy.yml 실행
↓
Vercel CLI로 배포 명령 실행
```

### 3단계: Vercel 자동 배포

```
Vercel에서 빌드 시작
↓
정적 파일 배포
↓
CDN에 캐시 업데이트
↓
배포 완료 (1-2분)
```

### 4단계: 앱 자동 갱신

```
사용자 앱에서 60초마다 버전 확인
↓
새 버전 감지 (version.json 비교)
↓
업데이트 알림 표시
↓
사용자 클릭 시 즉시 갱신
```

---

## 🚀 Vercel 설정

### 1단계: Vercel 프로젝트 생성

```bash
# Vercel CLI 설치
npm install -g vercel

# 로그인
vercel login

# 프로젝트 배포
cd /home/ubuntu/lifeculture-deploy-2
vercel --prod
```

### 2단계: 환경 변수 설정

Vercel 대시보드에서:
1. Settings → Environment Variables
2. 다음 변수 추가:

```
VERCEL_ORG_ID = [조직 ID]
VERCEL_PROJECT_ID = [프로젝트 ID]
```

### 3단계: 자동 배포 설정

Vercel 대시보드에서:
1. Settings → Git
2. GitHub 저장소 연동: `wakeb126-coder/lifeculture-deploy-2`
3. Production Branch: `main`
4. Automatic Deployments: 활성화

---

## ⚙️ GitHub Actions 설정

### 1단계: 시크릿 설정

GitHub 저장소에서:
1. Settings → Secrets and variables → Actions
2. 다음 시크릿 추가:

```
VERCEL_TOKEN
  - Vercel 계정 설정에서 생성
  - https://vercel.com/account/tokens

VERCEL_ORG_ID
  - Vercel 대시보드에서 확인

VERCEL_PROJECT_ID
  - Vercel 프로젝트 설정에서 확인
```

### 2단계: 워크플로우 파일 확인

`.github/workflows/deploy.yml` 파일이 다음 내용을 포함하는지 확인:

```yaml
- name: Vercel 배포
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  run: vercel --prod --token $VERCEL_TOKEN
```

### 3단계: 수동 배포 테스트

GitHub 저장소에서:
1. Actions 탭
2. "자동 배포 (Vercel)" 선택
3. "Run workflow" 클릭
4. 배포 진행 상황 확인

---

## 🔥 Firebase 설정

### 1단계: 버전 정보 저장

Firebase 콘솔에서:
1. Firestore Database 열기
2. 컬렉션 생성: `app_config`
3. 문서 생성: `version`
4. 다음 필드 추가:

```json
{
  "version": "2.3.1",
  "releaseDate": "2026-05-29",
  "changelog": "제품마스터 개선사항 적용"
}
```

### 2단계: 보안 규칙 설정

Firestore 보안 규칙:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // app_config는 모두 읽기 가능 (공개)
    match /app_config/{document=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    
    // 기타 컬렉션은 기존 규칙 유지
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3단계: 버전 업데이트 프로세스

새 버전 배포 시:

```bash
# 1. version.json 파일 업데이트
{
  "version": "2.3.2",
  "changelog": "새로운 기능 추가"
}

# 2. 커밋 및 푸시
git add version.json
git commit -m "chore: 버전 업데이트 2.3.2"
git push origin main

# 3. GitHub Actions 자동 실행 (1-2분)

# 4. Firebase 콘솔에서 app_config/version 업데이트
# (또는 자동 스크립트로 업데이트)
```

---

## 📱 앱 자동 갱신

### auto-update.js 작동 원리

#### 1. 버전 확인 (60초마다)

```javascript
// 로컬 저장소에서 현재 버전 확인
const currentVersion = localStorage.getItem('app_version');

// version.json에서 원격 버전 확인
const remoteVersion = await fetch('/version.json').then(r => r.json());

// 버전 비교
if (remoteVersion > currentVersion) {
  // 새 버전 알림 표시
  showUpdateNotification();
}
```

#### 2. 업데이트 알림

사용자에게 다음과 같은 알림 표시:

```
┌─────────────────────────────────────────────┐
│ 📥 새 버전이 사용 가능합니다                 │
│ 앱을 새로고침하여 최신 기능을 사용하세요    │
│                                             │
│ [지금 업데이트] [나중에]                    │
└─────────────────────────────────────────────┘
```

#### 3. 업데이트 적용

사용자가 "지금 업데이트" 클릭 시:

```javascript
// 1. 캐시 초기화
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});

// 2. 로컬 스토리지 버전 업데이트
localStorage.setItem('app_version', remoteVersion);

// 3. 페이지 새로고침
window.location.reload(true);
```

#### 4. Firebase 실시간 모니터링

Firebase에서 버전 정보 변경 감지:

```javascript
db.collection('app_config')
  .doc('version')
  .onSnapshot(doc => {
    if (doc.exists && doc.data().version !== currentVersion) {
      // 새 버전 감지 → 알림 표시
      notifyNewVersion(doc.data());
    }
  });
```

---

## 📊 모니터링 및 로깅

### 1. GitHub Actions 모니터링

GitHub 저장소에서:
1. Actions 탭
2. "자동 배포 (Vercel)" 워크플로우 선택
3. 배포 이력 확인

**배포 상태:**
- ✅ 성공 (초록색)
- ❌ 실패 (빨간색)
- ⏳ 진행 중 (노란색)

### 2. Vercel 배포 모니터링

Vercel 대시보드에서:
1. Deployments 탭
2. 배포 이력 확인
3. 각 배포의 상세 로그 확인

### 3. 앱 로그 확인

브라우저 개발자 도구 (F12) → Console 탭:

```javascript
// 자동 갱신 로그
[AUTO-UPDATE] 자동 갱신 시스템 시작
[AUTO-UPDATE] 새 버전 사용 가능: 2.3.2
[AUTO-UPDATE] 업데이트 적용 중...
```

### 4. Firebase 로깅

Firebase 콘솔에서:
1. Firestore Database → Collections
2. `app_config` 컬렉션 확인
3. 버전 정보 업데이트 이력 확인

---

## 🔍 문제 해결

### 배포가 자동으로 실행되지 않음

**원인:** GitHub Actions 시크릿 설정 오류

**해결:**
1. GitHub 저장소 Settings → Secrets 확인
2. `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 확인
3. 시크릿 값 재설정

### 앱이 자동 갱신되지 않음

**원인:** 캐시 문제 또는 Service Worker 충돌

**해결:**
1. 브라우저 캐시 삭제 (Ctrl+Shift+Delete)
2. 개발자 도구 → Application → Clear Site Data
3. 페이지 새로고침 (Ctrl+F5)

### 버전 정보가 업데이트되지 않음

**원인:** Firebase 보안 규칙 또는 권한 문제

**해결:**
1. Firebase 콘솔에서 보안 규칙 확인
2. `app_config` 컬렉션 쓰기 권한 확인
3. 수동으로 Firebase 콘솔에서 업데이트

---

## 📝 배포 체크리스트

배포 전 다음 항목을 확인하세요:

### 개발 단계
- [ ] 로컬에서 기능 테스트 완료
- [ ] 모든 파일 변경사항 확인
- [ ] 코드 리뷰 완료

### 커밋 단계
- [ ] `version.json` 버전 업데이트
- [ ] 커밋 메시지 작성
- [ ] 변경사항 푸시

### 배포 단계
- [ ] GitHub Actions 워크플로우 실행 확인
- [ ] Vercel 배포 완료 확인
- [ ] 배포 URL 접속 테스트
- [ ] Firebase 버전 정보 업데이트

### 사용자 단계
- [ ] 앱에서 업데이트 알림 확인
- [ ] 업데이트 적용 후 기능 테스트
- [ ] 팀원들에게 배포 완료 알림

---

## 🎯 배포 주기

| 주기 | 설명 | 예시 |
|------|------|------|
| **즉시** | 긴급 버그 수정 | 로그인 오류, 데이터 손실 |
| **당일** | 기능 개선 | UI 개선, 성능 최적화 |
| **주간** | 정기 업데이트 | 새 기능 추가, 보안 패치 |
| **월간** | 주요 업데이트 | 대규모 기능 추가 |

---

## 📞 지원

배포 관련 문제:
1. GitHub Actions 로그 확인
2. Vercel 배포 로그 확인
3. 브라우저 콘솔 로그 확인
4. Firebase 콘솔 확인

---

**마지막 업데이트:** 2026년 5월 29일  
**시스템 버전:** v2.3.1  
**상태:** 운영 중
