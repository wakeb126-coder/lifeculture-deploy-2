// =====================================================
// firebase-config.js — Genspark Table API 호환 래퍼
// Firebase 대신 Genspark REST Table API를 사용합니다
// 기존 코드가 firebase-config.js를 로드해도 오류 없이 동작
// =====================================================
console.log('[DB] Genspark Table API 모드로 초기화됨');

// Firebase 전역 객체 흉내 (오류 방지용 빈 스텁)
const firebaseConfig = { projectId: 'lifeculture-genspark' };
