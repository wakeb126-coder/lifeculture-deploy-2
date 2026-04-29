// =====================================================
// firebase-init.js — Firebase 초기화
// 라이프컬처 생산관리 시스템
// =====================================================

const firebaseConfig = {
  apiKey: "AIzaSyB_WSSPoA6Vji1Vn7uyV0kT7017stqCVIE",
  authDomain: "lifeculture-d903e.firebaseapp.com",
  projectId: "lifeculture-d903e",
  storageBucket: "lifeculture-d903e.firebasestorage.app",
  messagingSenderId: "424120325987",
  appId: "1:424120325987:web:bf9ba6190cf2742c16e556",
  measurementId: "G-QB7HJ2JKTE"
};

// Firebase 초기화 (중복 방지)
if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

// Firestore 설정 (오프라인 지원)
const firestoreDb = firebase.firestore();
firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firebase] 여러 탭이 열려 있어 오프라인 지원이 비활성화됩니다.');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firebase] 이 브라우저는 오프라인 지원을 지원하지 않습니다.');
  }
});

console.log('[Firebase] 초기화 완료 — 프로젝트:', firebaseConfig.projectId);
