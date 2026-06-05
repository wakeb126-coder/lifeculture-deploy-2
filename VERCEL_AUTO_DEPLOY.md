# Vercel 자동 배포 설정 가이드

> GitHub 저장소와 Vercel을 연동하여 자동 배포 설정

---

## 🚀 Vercel 자동 배포 설정 (3단계)

### 1단계: Vercel 계정 생성

1. https://vercel.com 접속
2. "Sign Up" 클릭
3. GitHub 계정으로 로그인
4. 계정 생성 완료

### 2단계: GitHub 저장소 연동

#### Vercel 웹사이트에서:

1. Vercel 대시보드 접속 (https://vercel.com/dashboard)
2. "Add New" → "Project" 클릭
3. "Import Git Repository" 선택
4. GitHub 저장소 검색: `lifeculture-deploy-2`
5. "Import" 클릭

#### 프로젝트 설정:

```
Project Name: lifeculture-mes
Framework Preset: Other (정적 사이트)
Build Command: (비워두기)
Output Directory: .
```

6. "Deploy" 클릭

### 3단계: 자동 배포 설정

#### Vercel 프로젝트 설정에서:

1. Settings → Git
2. "Production Branch": `main` 선택
3. "Automatic Deployments": 활성화
4. 저장

---

## ✅ 자동 배포 확인

### 배포 URL 확인

Vercel 대시보드에서:
```
https://lifeculture-mes.vercel.app
```

### 배포 이력 확인

1. Vercel 대시보드
2. "Deployments" 탭
3. 배포 이력 확인

**배포 상태:**
- ✅ Ready (배포 완료)
- ⏳ Building (배포 중)
- ❌ Failed (배포 실패)

---

## 🔄 자동 배포 플로우

```
Manus AI 작업 완료
    ↓
GitHub에 푸시
    ↓
Vercel에서 자동 감지 (1-2분)
    ↓
빌드 및 배포 시작
    ↓
배포 완료 (총 2-5분)
    ↓
사용자 앱에서 자동 갱신
```

---

## 📱 사용자 앱 자동 갱신

### 작동 원리

1. **버전 확인** (60초마다)
   - 로컬 버전: `localStorage.getItem('app_version')`
   - 원격 버전: `fetch('/version.json')`

2. **새 버전 감지**
   - 원격 버전 > 로컬 버전
   - 업데이트 알림 표시

3. **사용자 선택**
   - "지금 업데이트": 즉시 갱신
   - "나중에": 나중에 알림

4. **자동 갱신**
   - 캐시 초기화
   - 페이지 새로고침
   - 새 버전 로드

### 알림 UI

```
┌─────────────────────────────────────────────┐
│ 📥 새 버전이 사용 가능합니다                 │
│ 앱을 새로고침하여 최신 기능을 사용하세요    │
│                                             │
│ [지금 업데이트] [나중에]                    │
└─────────────────────────────────────────────┘
```

---

## 🔧 배포 후 설정

### 1. version.json 업데이트

새 버전 배포 시마다 `version.json` 파일 업데이트:

```json
{
  "version": "2.3.2",
  "releaseDate": "2026-05-30",
  "changelog": "새로운 기능 추가"
}
```

### 2. Firebase 버전 정보 업데이트

Firebase 콘솔에서:

1. Firestore Database 열기
2. `app_config` 컬렉션 → `version` 문서
3. 다음 필드 업데이트:

```json
{
  "version": "2.3.2",
  "releaseDate": "2026-05-30",
  "changelog": "새로운 기능 추가"
}
```

---

## 📊 배포 모니터링

### Vercel 대시보드에서 확인

1. Deployments 탭
2. 각 배포 클릭
3. 상세 로그 확인

### 배포 로그 확인

```
✓ Build completed
✓ Files uploaded
✓ Deployment ready
✓ Live at: https://lifeculture-mes.vercel.app
```

### 실패 시 확인 사항

```
✗ Build failed
  - 오류 메시지 확인
  - 파일 구조 확인
  - 의존성 확인
```

---

## 🐛 문제 해결

### 배포가 자동으로 실행되지 않음

**확인 사항:**
1. Vercel에서 GitHub 저장소 연동 확인
2. Production Branch가 `main`으로 설정되어 있는지 확인
3. Automatic Deployments가 활성화되어 있는지 확인

**해결:**
1. Vercel 대시보드 → Settings → Git
2. "Automatic Deployments" 다시 활성화
3. 저장

### 배포 실패

**확인 사항:**
1. Vercel 대시보드에서 배포 로그 확인
2. 오류 메시지 확인
3. 파일 구조 확인

**일반적인 오류:**
- 파일 누락
- 경로 오류
- 인코딩 오류

### 앱이 갱신되지 않음

**확인 사항:**
1. 브라우저 캐시 삭제
2. 개발자 도구 → Application → Clear Site Data
3. 페이지 새로고침 (Ctrl+F5)

---

## 📝 배포 체크리스트

### 배포 전

- [ ] 로컬에서 모든 기능 테스트 완료
- [ ] 파일 변경사항 확인
- [ ] `version.json` 버전 업데이트
- [ ] 커밋 메시지 작성

### 배포 중

- [ ] GitHub에 푸시
- [ ] Vercel에서 자동 배포 시작 확인 (1-2분)
- [ ] 배포 로그 확인

### 배포 후

- [ ] 배포 URL 접속 테스트
- [ ] 기능 정상 작동 확인
- [ ] Firebase 버전 정보 업데이트
- [ ] 팀원들에게 배포 완료 알림

---

## 🎯 배포 시나리오

### 시나리오 1: 버그 수정

```
1. 로컬에서 버그 수정
2. 테스트 완료
3. version.json 업데이트 (2.3.1 → 2.3.2)
4. git add . && git commit -m "fix: 버그 수정"
5. git push origin main
6. Vercel에서 자동 배포 (2-5분)
7. 사용자 앱에서 자동 갱신
```

### 시나리오 2: 새 기능 추가

```
1. 로컬에서 기능 개발
2. 테스트 완료
3. version.json 업데이트 (2.3.1 → 2.4.0)
4. git add . && git commit -m "feat: 새 기능 추가"
5. git push origin main
6. Vercel에서 자동 배포
7. Firebase 버전 정보 업데이트
8. 사용자 앱에서 자동 갱신
```

### 시나리오 3: 긴급 배포

```
1. 긴급 버그 발생
2. 빠르게 수정
3. version.json 업데이트
4. git push origin main
5. Vercel에서 즉시 배포
6. 사용자 앱에서 즉시 갱신
```

---

## 📞 지원

배포 관련 문제:

1. **Vercel 문서**: https://vercel.com/docs
2. **GitHub 문서**: https://docs.github.com
3. **Firebase 문서**: https://firebase.google.com/docs

---

## 🔗 유용한 링크

| 항목 | 링크 |
|------|------|
| Vercel 대시보드 | https://vercel.com/dashboard |
| 배포 URL | https://lifeculture-mes.vercel.app |
| GitHub 저장소 | https://github.com/wakeb126-coder/lifeculture-deploy-2 |
| Firebase 콘솔 | https://console.firebase.google.com |

---

**마지막 업데이트:** 2026년 5월 29일  
**상태:** 운영 중
