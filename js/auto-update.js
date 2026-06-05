// =====================================================
// auto-update.js — 실시간 앱 자동 갱신 시스템
// Firebase와 Service Worker를 활용한 자동 업데이트
// =====================================================

const AUTO_UPDATE_CONFIG = {
  CHECK_INTERVAL: 60000, // 60초마다 확인
  VERSION_KEY: 'app_version',
  LAST_CHECK_KEY: 'last_update_check',
  UPDATE_AVAILABLE_KEY: 'update_available'
};

// =====================================================
// 1. 앱 버전 관리
// =====================================================

class AppVersionManager {
  constructor() {
    this.currentVersion = this.getStoredVersion();
    this.remoteVersion = null;
    this.updateAvailable = false;
  }

  /**
   * 저장된 앱 버전 조회
   */
  getStoredVersion() {
    return localStorage.getItem(AUTO_UPDATE_CONFIG.VERSION_KEY) || '1.0.0';
  }

  /**
   * 앱 버전 저장
   */
  setStoredVersion(version) {
    localStorage.setItem(AUTO_UPDATE_CONFIG.VERSION_KEY, version);
    this.currentVersion = version;
  }

  /**
   * 원격 버전 확인 (Firebase에서)
   */
  async checkRemoteVersion() {
    try {
      // Firebase에서 버전 정보 조회
      const response = await fetch('/version.json');
      if (!response.ok) throw new Error('버전 파일 조회 실패');
      
      const data = await response.json();
      this.remoteVersion = data.version;
      
      // 버전 비교
      if (this.isNewerVersion(this.remoteVersion, this.currentVersion)) {
        this.updateAvailable = true;
        localStorage.setItem(AUTO_UPDATE_CONFIG.UPDATE_AVAILABLE_KEY, 'true');
        console.log(`[AUTO-UPDATE] 새 버전 사용 가능: ${this.remoteVersion}`);
        return true;
      }
      
      return false;
    } catch (e) {
      console.warn('[AUTO-UPDATE] 원격 버전 확인 실패:', e.message);
      return false;
    }
  }

  /**
   * 버전 비교 (semver)
   */
  isNewerVersion(remote, current) {
    const remoteArr = remote.split('.').map(Number);
    const currentArr = current.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (remoteArr[i] > currentArr[i]) return true;
      if (remoteArr[i] < currentArr[i]) return false;
    }
    
    return false;
  }
}

// =====================================================
// 2. 자동 갱신 매니저
// =====================================================

class AutoUpdateManager {
  constructor() {
    this.versionManager = new AppVersionManager();
    this.updateCheckInterval = null;
    this.isChecking = false;
  }

  /**
   * 자동 갱신 시작
   */
  start() {
    console.log('[AUTO-UPDATE] 자동 갱신 시스템 시작');
    
    // 초기 확인
    this.checkForUpdates();
    
    // 주기적 확인
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, AUTO_UPDATE_CONFIG.CHECK_INTERVAL);
    
    // 페이지 포커스 시 확인
    window.addEventListener('focus', () => {
      const lastCheck = localStorage.getItem(AUTO_UPDATE_CONFIG.LAST_CHECK_KEY);
      const now = Date.now();
      
      // 마지막 확인 후 30초 이상 경과했으면 다시 확인
      if (!lastCheck || (now - parseInt(lastCheck)) > 30000) {
        this.checkForUpdates();
      }
    });
  }

  /**
   * 업데이트 확인
   */
  async checkForUpdates() {
    if (this.isChecking) return;
    
    this.isChecking = true;
    
    try {
      const hasUpdate = await this.versionManager.checkRemoteVersion();
      
      if (hasUpdate) {
        this.notifyUpdateAvailable();
      }
      
      localStorage.setItem(AUTO_UPDATE_CONFIG.LAST_CHECK_KEY, Date.now().toString());
    } catch (e) {
      console.error('[AUTO-UPDATE] 업데이트 확인 중 오류:', e);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 업데이트 알림 표시
   */
  notifyUpdateAvailable() {
    // 이미 알림이 표시되었으면 무시
    if (document.getElementById('updateNotification')) {
      return;
    }
    
    const notification = document.createElement('div');
    notification.id = 'updateNotification';
    notification.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #2C5F2E 0%, #27ae60 100%);
      color: white;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: 'Noto Sans KR', sans-serif;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-download" style="font-size: 18px;"></i>
        <div>
          <div style="font-weight: 600; font-size: 14px;">새 버전이 사용 가능합니다</div>
          <div style="font-size: 12px; opacity: 0.9;">앱을 새로고침하여 최신 기능을 사용하세요</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="updateNowBtn" style="
          background: white;
          color: #2C5F2E;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        ">지금 업데이트</button>
        <button id="updateLaterBtn" style="
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        ">나중에</button>
      </div>
    `;
    
    document.body.insertBefore(notification, document.body.firstChild);
    
    // 버튼 이벤트
    document.getElementById('updateNowBtn').addEventListener('click', () => {
      this.applyUpdate();
    });
    
    document.getElementById('updateLaterBtn').addEventListener('click', () => {
      notification.remove();
    });
    
    // 마우스 오버 효과
    document.getElementById('updateNowBtn').addEventListener('mouseover', function() {
      this.style.background = '#f0f0f0';
    });
    document.getElementById('updateNowBtn').addEventListener('mouseout', function() {
      this.style.background = 'white';
    });
  }

  /**
   * 업데이트 적용
   */
  applyUpdate() {
    console.log('[AUTO-UPDATE] 업데이트 적용 중...');
    
    // 캐시 초기화
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    
    // 로컬 스토리지 버전 업데이트
    this.versionManager.setStoredVersion(this.versionManager.remoteVersion);
    
    // 페이지 새로고침
    window.location.reload(true);
  }

  /**
   * 자동 갱신 중지
   */
  stop() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      console.log('[AUTO-UPDATE] 자동 갱신 시스템 중지');
    }
  }
}

// =====================================================
// 3. Firebase 실시간 모니터링
// =====================================================

class FirebaseUpdateMonitor {
  constructor() {
    this.updateListener = null;
  }

  /**
   * Firebase에서 업데이트 모니터링
   */
  startMonitoring() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[AUTO-UPDATE] Firebase가 로드되지 않았습니다');
        return;
      }
      
      const db = firebase.firestore();
      
      // app_config 컬렉션에서 버전 정보 모니터링
      this.updateListener = db.collection('app_config')
        .doc('version')
        .onSnapshot(doc => {
          if (doc.exists) {
            const data = doc.data();
            console.log('[AUTO-UPDATE] Firebase 버전 업데이트:', data);
            
            // 새 버전이 있으면 알림
            if (data.version && data.version !== localStorage.getItem(AUTO_UPDATE_CONFIG.VERSION_KEY)) {
              this.notifyNewVersion(data);
            }
          }
        }, error => {
          console.warn('[AUTO-UPDATE] Firebase 모니터링 오류:', error.message);
        });
    } catch (e) {
      console.warn('[AUTO-UPDATE] Firebase 모니터링 설정 실패:', e.message);
    }
  }

  /**
   * 새 버전 알림
   */
  notifyNewVersion(versionData) {
    console.log('[AUTO-UPDATE] 새 버전 감지:', versionData.version);
    
    // 업데이트 알림 표시
    const autoUpdateManager = window.autoUpdateManager;
    if (autoUpdateManager) {
      autoUpdateManager.versionManager.remoteVersion = versionData.version;
      autoUpdateManager.versionManager.updateAvailable = true;
      autoUpdateManager.notifyUpdateAvailable();
    }
  }

  /**
   * 모니터링 중지
   */
  stopMonitoring() {
    if (this.updateListener) {
      this.updateListener();
      console.log('[AUTO-UPDATE] Firebase 모니터링 중지');
    }
  }
}

// =====================================================
// 4. 초기화
// =====================================================

// 전역 인스턴스 생성
let autoUpdateManager = null;
let firebaseUpdateMonitor = null;

/**
 * 자동 갱신 시스템 초기화
 */
function initAutoUpdate() {
  if (autoUpdateManager) return; // 이미 초기화됨
  
  autoUpdateManager = new AutoUpdateManager();
  firebaseUpdateMonitor = new FirebaseUpdateMonitor();
  
  // 자동 갱신 시작
  autoUpdateManager.start();
  
  // Firebase 모니터링 시작 (Firebase 로드 후)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        firebaseUpdateMonitor.startMonitoring();
      }, 2000); // Firebase 초기화 대기
    });
  } else {
    setTimeout(() => {
      firebaseUpdateMonitor.startMonitoring();
    }, 2000);
  }
  
  // 전역 객체에 저장
  window.autoUpdateManager = autoUpdateManager;
  window.firebaseUpdateMonitor = firebaseUpdateMonitor;
  
  console.log('[AUTO-UPDATE] 자동 갱신 시스템 초기화 완료');
}

// 페이지 로드 시 자동 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoUpdate);
} else {
  initAutoUpdate();
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (autoUpdateManager) autoUpdateManager.stop();
  if (firebaseUpdateMonitor) firebaseUpdateMonitor.stopMonitoring();
});
