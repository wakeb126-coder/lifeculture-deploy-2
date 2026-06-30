// =====================================================
// db.js — Firebase Firestore CRUD 함수
// 모든 데이터를 Firebase Firestore에 저장/조회
// =====================================================

function getFirestore() {
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK가 로드되지 않았습니다.');
  return firebase.firestore();
}

// 전체 데이터 조회 (10초 타임아웃 안전망 포함)
async function apiGetAll(table, searchParams = {}) {
  const TIMEOUT_MS = 10000; // 10초
  try {
    const db = getFirestore();
    let ref = db.collection(table);
    if (searchParams.orderBy) {
      ref = ref.orderBy(searchParams.orderBy, searchParams.orderDir || 'asc');
    }
    if (searchParams.limit) ref = ref.limit(searchParams.limit);
    // 타임아웃 Promise와 경쟁 - 10초 초과 시 빈 배열 반환
    const timeoutPromise = new Promise(function(resolve) {
      setTimeout(function() {
        console.warn('[DB] apiGetAll ' + table + ' 타임아웃 (10초) - 빈 배열 반환');
        resolve([]);
      }, TIMEOUT_MS);
    });
    const fetchPromise = ref.get().then(function(snapshot) {
      const docs = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
      docs.sort(function(a, b) {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
        return tb - ta;
      });
      return docs;
    });
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    console.error('[DB] apiGetAll ' + table + ' 오류:', e);
    return [];
  }
}

// ID로 단건 조회
async function apiGetById(table, id) {
  const db = getFirestore();
  const doc = await db.collection(table).doc(id).get();
  if (!doc.exists) throw new Error(`${table}/${id} 문서를 찾을 수 없습니다.`);
  return { id: doc.id, ...doc.data() };
}

// 조건 조회
async function apiGet(table, params = {}) {
  try {
    const db = getFirestore();
    let ref = db.collection(table);
    if (params.where) {
      for (const [field, op, val] of params.where) {
        ref = ref.where(field, op, val);
      }
    }
    if (params.orderBy) ref = ref.orderBy(params.orderBy, params.orderDir || 'asc');
    if (params.limit) ref = ref.limit(params.limit);
    const snapshot = await ref.get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { data };
  } catch (e) {
    console.error(`[DB] apiGet ${table} 오류:`, e);
    return { data: [] };
  }
}

// 데이터 추가 (POST)
async function apiPost(table, data) {
  const db = getFirestore();
  const docData = {
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const docRef = await db.collection(table).add(docData);
  return { id: docRef.id, ...docData };
}

// 데이터 전체 수정 (PUT)
async function apiPut(table, id, data) {
  const db = getFirestore();
  const docData = {
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection(table).doc(id).set(docData);
  return { id, ...docData };
}

// 데이터 부분 수정 (PATCH)
async function apiPatch(table, id, data) {
  const db = getFirestore();
  const docData = {
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection(table).doc(id).update(docData);
  return { id, ...docData };
}

// 데이터 삭제 (DELETE)
async function apiDelete(table, id) {
  const db = getFirestore();
  await db.collection(table).doc(id).delete();
}

// 배치 저장 (500건 청크 분할 - Firestore 제한 대응)
async function apiBatchPost(table, dataArray, onProgress) {
  const db = getFirestore();
  const CHUNK_SIZE = 400; // 안전 마진을 위해 400으로 설정
  const results = [];
  const chunks = [];
  for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
    chunks.push(dataArray.slice(i, i + CHUNK_SIZE));
  }
  let done = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const data of chunk) {
      const ref = db.collection(table).doc();
      const docData = {
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      batch.set(ref, docData);
      results.push({ id: ref.id, ...docData });
    }
    await batch.commit();
    done += chunk.length;
    if (typeof onProgress === 'function') onProgress(done, dataArray.length);
  }
  return results;
}

// 배치 삭제 (500건 청크 분할)
async function apiBatchDelete(table, ids, onProgress) {
  const db = getFirestore();
  const CHUNK_SIZE = 400;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  let done = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection(table).doc(id));
    }
    await batch.commit();
    done += chunk.length;
    if (typeof onProgress === 'function') onProgress(done, ids.length);
  }
}

// 특정 필드 조건으로 조회
async function apiGetWhere(table, field, operator, value) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(table).where(field, operator, value).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error(`[DB] apiGetWhere ${table} 오류:`, e);
    return [];
  }
}

console.log('[DB] db.js 로드 완료 — Firebase Firestore 사용 중');
