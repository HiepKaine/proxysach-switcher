const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const POPUP_CONFIG = {
  STORAGE_KEYS: {
    PROXY_INFO: "proxyInfo",
    API_KEY: "apiKey",
    CHANGE_IP_TYPE: "change_ip_type",
    PROXY_TYPE: "proxyType",
    IS_AUTO_CHANGE_IP: "isAutoChangeIP",
    TIME_AUTO_CHANGE_IP: "timeAutoChangeIP",
    TIME_AUTO_CHANGE_IP_DEFAULT: "timeAutoChangeIPDefault",
    PROXY_CONNECTED: "proxyConnected",
    TX_CONF: "tx_conf",
    TX_PROXY: "tx_proxy",
    CACHED_PROXY_INFO: "cachedProxyInfo",
    CACHED_LOCATIONS: "cachedLocations",
    NEXT_CHANGE_TARGET: "nextChangeTarget",
    NEXT_CHANGE_DURATION: "nextChangeDuration",
  },
  MESSAGES: {
    GET_LOCATIONS_SUCCESS: "getLocationsSuccess",
    PROCESSING_GET_PROXY_INFO: "processingGetProxyInfo",
    SHOW_PROCESSING_NEW_IP_CONNECT: "showProcessingNewIpConnect",
    FAILURE_GET_PROXY_INFO: "failureGetProxyInfo",
    SUCCESS_GET_PROXY_INFO: "successGetProxyInfo",
    SUCCESS_GET_INFO_KEY: "successGetInfoKey",
    DISCONNECT_PROXY: "disconnectProxy",
  },
  BACKGROUND_MESSAGES: {
    GET_LOCATIONS_DATA: "getLocationsData",
    GET_CURRENT_PROXY: "getCurrentProxy",
    CHANGE_IP: "changeIp",
    AUTO_CHANGE_IP: "autoChangeIp",
    CANCEL_ALL: "cancelALL",
    FORCE_DISCONNECT: "forceDisconnect",
  },
  UI_ELEMENTS: {
    LOCATION_SELECT: "location_select",
    API_KEY: "api_key",
    BTN_CONNECT: "btn-connect",
    BTN_DISCONNECT: "btn-disconnect",
    PROXY_STATUS: "proxy-status",
    PUBLIC_IPV4: "public_ipv4",
    PUBLIC_IPV6: "public_ipv6",
    TIMEOUT: "timeout",
    NEXT_TIME: "next_time",
    TIME_CHANGE_IP: "time-change-ip",
    API_KEY_ERROR: "api_key_error",
    IP_INFO: "ip-info",
    IS_AUTO_CHANGE: "is-auto-change",
    RADIO_SWITCH_5: "#radio-switch-5",
    RADIO_SWITCH_CHANGE_IP: "#radio-switch-change-ip",
  },
  PROXY_TYPES: {
    IPV4: "ipv4",
    IPV6: "ipv6",
  },
  CHANGE_IP_TYPES: {
    KEEP: "keep",
    CHANGE: "change",
  },
  CSS_CLASSES: {
    TEXT_DANGER: "text-danger",
    TEXT_SUCCESS: "text-success",
  },
  MESSAGES_TEXT: {
    NOT_CONNECTED: "• Chưa kết nối",
    CONNECTING: "• Đang kết nối...",
    CHANGING_IP: "• Đang đổi IP...",
    CONNECTED: "• Đã kết nối",
    INVALID_KEY: "• Key Không Hợp Lệ",
    LOADING_PROXY_INFO: "• Đang tải thông tin...",
    PROXY_EXPIRED: "• Hết hạn proxy",
    KEY_EXPIRED: "• Hết hạn key",
  },
};

const IS_FIREFOX =
  typeof browser !== "undefined" || navigator.userAgent.includes("Firefox");
const IS_CHROME = !IS_FIREFOX;

class StorageManager {
  static set(key, value) {
    try {
      localStorage.setItem(
        key,
        typeof value === "object" ? JSON.stringify(value) : value
      );
    } catch (error) {}
  }

  static get(key, parseJSON = false) {
    try {
      const value = localStorage.getItem(key);
      return parseJSON && value ? JSON.parse(value) : value;
    } catch (error) {
      return null;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {}
  }

  static clear() {
    try {
      localStorage.clear();
    } catch (error) {}
  }

  static setCachedProxyInfo(proxyInfo) {
    try {
      const cachedData = {
        proxyInfo: proxyInfo,
        timestamp: Date.now(),
        version: 1,
      };
      this.set(POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO, cachedData);
    } catch (error) {}
  }

  static updateCachedProxyInfoTimerExpired() {
    try {
      const cachedData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO,
        true
      );
      if (cachedData && cachedData.proxyInfo) {
        cachedData.proxyInfo.nextChangeIP = 0;
        cachedData.proxyInfo.nextChangeExpired = true;
        cachedData.timestamp = Date.now();
        this.set(POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO, cachedData);
      }
    } catch (error) {}
  }

  static getCachedProxyInfo() {
    try {
      const cachedData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO,
        true
      );
      if (cachedData && cachedData.proxyInfo) {
        const proxyInfo = cachedData.proxyInfo;
        // Check expiration times
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

        // Check key expiration first (higher priority)
        if (
          proxyInfo.expired &&
          currentTime >= Math.floor(Date.now(proxyInfo.expired) / 1000)
        ) {
          this.clearCachedProxyInfo("Key expired");
          return {
            expired: "key",
            error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED,
          };
        }

        // Check proxy timeout
        if (
          proxyInfo.proxyTimeout &&
          currentTime >= Math.floor(Date.now(proxyInfo.proxyTimeout) / 1000)
        ) {
          this.clearCachedProxyInfo("Proxy timeout");
          return {
            expired: "proxy",
            error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED,
          };
        }

        return proxyInfo;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static clearCachedProxyInfo(reason = "unknown") {
    try {
      const config = {
        reason: reason,
        timestamp: Date.now(),
        browser: IS_FIREFOX ? "firefox" : "chrome",
      };

      if (IS_FIREFOX) {
        // For Firefox, send force disconnect first
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
          config
        );

        // Small delay then send cancel all
        setTimeout(() => {
          MessageHandler.sendToBackground(
            POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
            config
          );
        }, 200);
      } else {
        // For Chrome, send cancel all
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      }

      ProxyManager.directProxy();
      this.remove(POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO);
    } catch (error) {}
  }

  static setCachedLocations(locations) {
    try {
      const cachedData = {
        locations: locations,
        timestamp: Date.now(),
        version: 1,
      };
      this.set(POPUP_CONFIG.STORAGE_KEYS.CACHED_LOCATIONS, cachedData);
    } catch (error) {}
  }

  static getCachedLocations() {
    try {
      const cachedData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.CACHED_LOCATIONS,
        true
      );
      if (cachedData && cachedData.locations) {
        return cachedData.locations;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static clearCachedLocations() {
    try {
      this.remove(POPUP_CONFIG.STORAGE_KEYS.CACHED_LOCATIONS);
    } catch (error) {}
  }

  static setNextChangeTimer(targetTime, duration) {
    try {
      const timerData = {
        targetTime: targetTime,
        duration: duration,
        startTime: Date.now(),
        version: 1,
        expired: false,
      };
      this.set(POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET, timerData);
    } catch (error) {}
  }

  static getNextChangeTimer() {
    try {
      const timerData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET,
        true
      );
      if (timerData && timerData.targetTime) {
        const now = Date.now();
        const remainingMs = timerData.targetTime - now;
        const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

        return {
          remainingSeconds: remainingSeconds,
          originalDuration: timerData.duration,
          startTime: timerData.startTime,
          targetTime: timerData.targetTime,
          isExpired: remainingSeconds <= 0 || timerData.expired,
          wasExpired: timerData.expired,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static markNextChangeTimerExpired() {
    try {
      const timerData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET,
        true
      );
      if (timerData) {
        timerData.expired = true;
        timerData.expiredAt = Date.now();
        this.set(POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET, timerData);
      }
    } catch (error) {}
  }

  static clearNextChangeTimer() {
    try {
      this.remove(POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET);
    } catch (error) {}
  }

  static wasNextChangeTimerExpired() {
    try {
      const timerData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET,
        true
      );
      return timerData && timerData.expired;
    } catch (error) {
      return false;
    }
  }
}

class ChromeStorageManager {
  static async get(key) {
    return new Promise((resolve) => {
      try {
        browserAPI.storage.sync.get([key], (items) => {
          resolve(items[key] || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  static async set(key, value) {
    try {
      await browserAPI.storage.sync.set({ [key]: value });
    } catch (error) {}
  }
}

class MessageHandler {
  static async sendToBackground(message, data = {}) {
    try {
      const oneWayMessages = [
        POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
        POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
        POPUP_CONFIG.BACKGROUND_MESSAGES.CHANGE_IP,
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
      ];

      if (oneWayMessages.includes(message)) {
        try {
          browserAPI.runtime.sendMessage({ greeting: message, data });
        } catch (error) {}
        return null;
      } else {
        return await Promise.race([
          browserAPI.runtime.sendMessage({ greeting: message, data }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Message timeout")), 5000)
          ),
        ]);
      }
    } catch (error) {
      if (error.message.includes("Receiving end does not exist")) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          if (oneWayMessages.includes(message)) {
            browserAPI.runtime.sendMessage({ greeting: message, data });
            return null;
          } else {
            return await browserAPI.runtime.sendMessage({
              greeting: message,
              data,
            });
          }
        } catch (retryError) {
          return null;
        }
      }

      return null;
    }
  }

  static setupMessageListener() {
    browserAPI.runtime.onMessage.addListener((request) => {
      switch (request.greeting) {
        case POPUP_CONFIG.MESSAGES.GET_LOCATIONS_SUCCESS:
          LocationManager.handleLocationsSuccess(request.data);
          break;
        case POPUP_CONFIG.MESSAGES.PROCESSING_GET_PROXY_INFO:
          UIManager.showProcessingConnect();
          break;
        case POPUP_CONFIG.MESSAGES.SHOW_PROCESSING_NEW_IP_CONNECT:
          if (request.data?.isAutoChanging && request.data?.isProtected) {
            UIManager.showProcessingNewIpConnectProtected();
          } else {
            UIManager.showProcessingNewIpConnect();
          }
          break;
        case POPUP_CONFIG.MESSAGES.FAILURE_GET_PROXY_INFO:
          UIManager.showError(request);
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_PROXY_INFO:
          const preserveTimer = request.data?.preserveTimer || false;
          const updateCache = request.data?.updateCache || false;
          const cacheSource = request.data?.cacheSource || "background";

          const {
            preserveTimer: _,
            updateCache: __,
            cacheSource: ___,
            ...cleanData
          } = request.data || {};

          if (updateCache) {
            cleanData.updateCache = true;
            cleanData.cacheSource = cacheSource;
          }

          ProxyManager.handleSuccessfulConnection(cleanData, preserveTimer);
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_INFO_KEY:
          ProxyManager.handleInfoKeySuccess(request.data);
          break;
        case POPUP_CONFIG.MESSAGES.DISCONNECT_PROXY:
          ProxyManager.directProxy();
          break;
        default:
      }
    });

    if (browserAPI.storage && browserAPI.storage.onChanged) {
      browserAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "sync" && changes.cacheUpdateFlag) {
          const cacheUpdate = changes.cacheUpdateFlag.newValue;

          if (cacheUpdate && cacheUpdate.proxyInfo && cacheUpdate.timestamp) {
            const now = Date.now();
            const updateAge = now - cacheUpdate.timestamp;

            if (updateAge < 5000) {
              StorageManager.setCachedProxyInfo(cacheUpdate.proxyInfo);

              const proxyConnected = StorageManager.get(
                POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
              );

              if (proxyConnected === "true") {
                UIManager.showProxyInfo(cacheUpdate.proxyInfo, false, true);
                ProxyManager.updateProxyUIStatus();
              }
            }
          }
        }
      });
    }
  }

  static async checkBackgroundConnection() {
    try {
      const response = await Promise.race([
        browserAPI.runtime.sendMessage({ greeting: "ping", data: {} }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ping timeout")), 1000)
        ),
      ]);

      return response && response.pong;
    } catch (error) {
      return false;
    }
  }

  static async sendToBackgroundSafe(message, data = {}) {
    try {
      const status = await Promise.race([
        this.sendToBackground("getBackgroundTimerStatus"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Status check timeout")), 1000)
        ),
      ]);

      if (status && (status.isChangingIP || status.isProtected)) {
        return null;
      }

      return await this.sendToBackground(message, data);
    } catch (error) {
      return null;
    }
  }
}

class TimerManager {
  constructor() {
    this.nextTimeChange = null;
    this.timeChangeIP = null;
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.lastUpdateTime = 0;
    this.isPopupControlling = false;
    this.lastNotificationTime = 0;
    this.notificationDebounceTime = 2000;
    this.syncCheckInterval = null;
    this.isInitialized = false;
    this.isProcessingExpiredTimer = false;
    this.lastExpiredProcessTime = 0;
  }

  async syncWithBackground() {
    try {
      const response = await Promise.race([
        browserAPI.runtime.sendMessage({
          greeting: "getBackgroundTimerStatus",
          data: {},
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Sync timeout")), 3000)
        ),
      ]);

      if (response && response.isActive) {
        if (response.isChangingIP || response.isProtected) {
          return { status: "changing", data: response };
        }

        const now = Date.now();
        const timeSinceLastUpdate = Math.floor(
          (now - response.lastUpdateTime) / 1000
        );
        const realRemainingTime = Math.max(
          0,
          response.remainingTime - timeSinceLastUpdate
        );

        return {
          status: "success",
          remainingTime: realRemainingTime,
          data: response,
        };
      } else {
        return { status: "inactive" };
      }
    } catch (error) {
      return { status: "error" };
    }
  }

  startTimeChangeCountdownWithTime(confirmedTime) {
    if (this.isProcessingExpiredTimer) {
      return false;
    }

    if (
      this.timeChangeIP &&
      this.isPopupControlling &&
      Math.abs(this.totalTimeChangeIp - confirmedTime) <= 3
    ) {
      return true;
    }

    this.clearTimeChangeCountdown();

    if (!confirmedTime || confirmedTime <= 0) {
      return false;
    }

    this.totalTimeChangeIp = confirmedTime;
    this.isPopupControlling = true;
    this.isInitialized = true;

    const element = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
    );
    if (element) {
      element.value = `${this.totalTimeChangeIp}`;
    }

    StorageManager.set(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
      this.totalTimeChangeIp
    );

    this.timeChangeIP = setInterval(async () => {
      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
      );
      if (!element) {
        this.clearTimeChangeCountdown();
        return;
      }

      element.value = `${this.totalTimeChangeIp}`;
      this.totalTimeChangeIp--;
      this.lastUpdateTime = Date.now();

      this.updatePopupActivity();

      if (this.totalTimeChangeIp < 0) {
        this.clearTimeChangeCountdown();
        this.showChangingIPStatus();
        
        await this.handleTimerExpiredWithActualChange();
        return;
      }

      const isAutoChangeIP = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
      );
      if (isAutoChangeIP) {
        StorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
          this.totalTimeChangeIp
        );
      }
    }, 1000);

    this.startSyncCheck();
    return true;
  }

  async initializeTimer() {
    if (this.isInitialized) {
      return false;
    }

    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (!JSON.parse(isAutoChangeIP) || proxyConnected !== "true") {
      this.isInitialized = true;
      return false;
    }

    if (this.isInitializing) {
      return false;
    }

    this.isInitializing = true;

    try {
      const syncResult = await this.syncWithBackground();

      if (syncResult.status === "success" && syncResult.remainingTime > 0) {
        this.startTimeChangeCountdownWithTime(syncResult.remainingTime + 1);
        this.isInitialized = true;
        return true;
      } else if (syncResult.status === "changing") {
        this.showChangingIPStatus();
        this.isInitialized = true;
        return true;
      } else if (syncResult.status === "inactive") {
        const defaultTime = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
        );

        if (defaultTime) {
          const time = parseInt(defaultTime);
          this.startTimeChangeCountdownWithTime(time);
          this.isInitialized = true;
          return true;
        }
      }

      this.isInitialized = true;
      return false;
    } catch (error) {
      this.isInitialized = true;
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  startSyncCheck() {
    this.stopSyncCheck();

    this.syncCheckInterval = setInterval(async () => {
      if (!this.isPopupControlling || this.isProcessingExpiredTimer) return;

      try {
        const response = await Promise.race([
          browserAPI.runtime.sendMessage({
            greeting: "getBackgroundTimerStatus",
            data: {},
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Sync check timeout")), 1000)
          ),
        ]);

        if (response && response.isActive) {
          if (response.isChangingIP || response.isProtected) {
            return;
          }

          const now = Date.now();
          const timeSinceLastUpdate = Math.floor(
            (now - response.lastUpdateTime) / 1000
          );
          const realRemainingTime = Math.max(
            0,
            response.remainingTime - timeSinceLastUpdate
          );

          const timeDiff = Math.abs(this.totalTimeChangeIp - realRemainingTime);

          if (timeDiff > 5 && this.totalTimeChangeIp > 10) {
            this.totalTimeChangeIp = realRemainingTime;

            const element = document.getElementById(
              POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
            );
            if (element) {
              element.value = `${realRemainingTime}`;
            }
          }
        }
      } catch (error) {
        // Ignore sync errors
      }
    }, 2000);
  }

  stopSyncCheck() {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
    }
  }

  showChangingIPStatus() {
    const element = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
    );
    if (element) {
      element.value = "Changing...";
    }
  }

  clearNextTimeChangeState() {
    this.clearCountDown();
    this.countDowntime = 0;
    StorageManager.clearNextChangeTimer();
    const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME);
    if (element) {
      element.innerText = "0 s";
    }
  }

  async handleTimerExpiredWithActualChange() {
    if (this.isProcessingExpiredTimer) {
      return;
    }

    const now = Date.now();
    if (now - this.lastExpiredProcessTime < 5000) {
      return;
    }

    this.isProcessingExpiredTimer = true;
    this.lastExpiredProcessTime = now;

    try {
      const backgroundStatus = await Promise.race([
        MessageHandler.sendToBackground("getBackgroundTimerStatus"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Background status timeout")), 2000)
        ),
      ]);

      if (backgroundStatus) {
        if (backgroundStatus.isChangingIP || backgroundStatus.isProtected) {
          await this.waitForBackgroundCompletion();
          return;
        }

        if (backgroundStatus.isActive && backgroundStatus.remainingTime > 0) {
          this.startTimeChangeCountdownWithTime(backgroundStatus.remainingTime);
          return;
        }
      }

      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      const proxyType =
        StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";
      const location = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
      )?.value;

      if (!apiKey) {
        await this.resetToDefaultTime();
        return;
      }

      const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      if (proxyConnected !== "true") {
        await this.resetToDefaultTime();
        return;
      }

      const config = {
        apiKey: apiKey,
        isAutoChangeIP: true,
        timeAutoChangeIP:
          StorageManager.get(
            POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
          ) || "60",
        proxyType: proxyType,
        triggeredBy: "popup_timer_expired",
        timestamp: Date.now(),
      };

      if (location) {
        config.location = location;
      }

      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
        config
      );

    } catch (error) {
      await this.resetToDefaultTime();
    } finally {
      this.isProcessingExpiredTimer = false;
    }
  }

  async waitForBackgroundCompletion() {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        await this.sleep(1000);
        attempts++;

        const status = await MessageHandler.sendToBackground(
          "getBackgroundTimerStatus"
        );

        if (!status || (!status.isChangingIP && !status.isProtected)) {
          if (status && status.isActive && status.remainingTime > 0) {
            this.startTimeChangeCountdownWithTime(status.remainingTime);
          } else {
            await this.resetToDefaultTime();
          }
          return;
        }

      } catch (error) {
        break;
      }
    }

    await this.resetToDefaultTime();
  }

  async handleTimerExpiredWithWait() {
    try {
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await this.sleep(1000);
        attempts++;

        try {
          const response = await browserAPI.runtime.sendMessage({
            greeting: "getBackgroundTimerStatus",
            data: {},
          });

          if (
            response &&
            response.isActive &&
            response.remainingTime > 0 &&
            response.remainingTime < response.originalDuration
          ) {
            const now = Date.now();
            const timeSinceLastUpdate = Math.floor(
              (now - response.lastUpdateTime) / 1000
            );
            const realRemainingTime = Math.max(
              0,
              response.remainingTime - timeSinceLastUpdate
            );

            this.startTimeChangeCountdownWithTime(realRemainingTime);
            return;
          }
        } catch (error) {}
      }

      await this.resetToDefaultTime();
    } catch (error) {
      await this.resetToDefaultTime();
    }
  }

  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.stopSyncCheck();
    this.markPopupInactive();
    
    this.isProcessingExpiredTimer = false;
  }

  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.stopSyncCheck();
    this.clearNextTimeChangeState();
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.isInitialized = false;
    this.markPopupInactive();
  }

  clearNextTimeChangeOnly() {
    this.clearCountDown();
    this.countDowntime = 0;
    StorageManager.clearNextChangeTimer();
    const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME);
    if (element) {
      element.innerText = "0 s";
    }
  }

  forceStopAll() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }

    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.stopSyncCheck();

    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.lastUpdateTime = 0;
    this.lastNotificationTime = 0;
    this.isInitialized = false;
    this.isProcessingExpiredTimer = false;

    this.markPopupInactive();
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  updatePopupActivity() {
    try {
      browserAPI.storage.local.set({
        popupTimerActive: true,
        popupLastUpdate: Date.now(),
        popupTimerValue: this.totalTimeChangeIp,
        popupControlling: this.isPopupControlling,
      });
    } catch (error) {}
  }

  markPopupInactive() {
    this.isPopupControlling = false;
    try {
      browserAPI.storage.local.set({
        popupTimerActive: false,
        popupLastUpdate: Date.now(),
        popupControlling: false,
      });
    } catch (error) {}
  }

  async resetToDefaultTime() {
    const defaultTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );

    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const resetTime = parseInt(defaultTime);

      this.clearTimeChangeCountdown();
      
      await this.sleep(200);

      this.startTimeChangeCountdownWithTime(resetTime);
      return true;
    }

    return false;
  }

  startCountDown(seconds = null) {
    this.clearCountDown();

    const targetSeconds = seconds !== null ? seconds : this.countDowntime;

    if (!targetSeconds || targetSeconds <= 0) {
      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
      );
      if (element) {
        element.innerText = "0 s";
      }
      return;
    }

    const now = Date.now();
    const targetTime = now + targetSeconds * 1000;

    StorageManager.setNextChangeTimer(targetTime, targetSeconds);

    this.countDowntime = targetSeconds;
    this.nextTimeChange = setInterval(() => {
      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
      );
      if (!element) {
        this.clearCountDown();
        return;
      }

      element.innerText = `${this.countDowntime} s`;
      this.countDowntime--;

      if (this.countDowntime < 0) {
        element.innerText = "0 s";

        StorageManager.markNextChangeTimerExpired();
        StorageManager.updateCachedProxyInfoTimerExpired();

        this.clearCountDown();
        return;
      }

      const remainingTime = Date.now() + this.countDowntime * 1000;
      StorageManager.setNextChangeTimer(remainingTime, this.countDowntime);
    }, 1000);
  }

  restoreCountDown() {
    const timerData = StorageManager.getNextChangeTimer();

    if (!timerData) {
      return false;
    }

    if (timerData.wasExpired || timerData.isExpired) {
      StorageManager.clearNextChangeTimer();

      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
      );
      if (element) {
        element.innerText = "0 s";
      }
      return false;
    }

    if (timerData.remainingSeconds <= 0) {
      StorageManager.markNextChangeTimerExpired();
      StorageManager.updateCachedProxyInfoTimerExpired();

      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
      );
      if (element) {
        element.innerText = "0 s";
      }
      return false;
    }

    this.startCountDown(timerData.remainingSeconds);
    return true;
  }

  clearCountDown() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }
  }

  setCountDowntime(time) {
    this.countDowntime = parseInt(time) || 0;
  }

  async notifyPopupClosing() {
    try {
      await browserAPI.runtime.sendMessage({
        greeting: "popupClosed",
        data: { timestamp: Date.now() },
      });
    } catch (error) {}
  }
}

class LocationManager {
  static async getProxyInfoIfConnectedSafeNoAPI(preserveTimer = false) {
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (proxyConnected === "true") {
      const cachedProxyInfo = StorageManager.getCachedProxyInfo();

      if (cachedProxyInfo) {
        if (cachedProxyInfo.expired) {
          const statusElement = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
          );
          if (statusElement) {
            statusElement.innerText = cachedProxyInfo.error;
            statusElement.classList.remove(
              POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS
            );
            statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
          }
          return;
        }

        UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
        ProxyManager.updateProxyUIStatus();

        if (cachedProxyInfo.location) {
          const locationSelect = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
          );
          if (locationSelect) {
            locationSelect.value = cachedProxyInfo.location;
          }
        }

        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        UIManager.showLoadingProxyInfo();

        const restored = await this.restoreNextChangeIPFromBackground();

        if (!restored) {
          const statusElement = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
          );
          if (statusElement) {
            statusElement.innerText = "• Đã kết nối (đang tải thông tin)";
            statusElement.classList.remove(
              POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER
            );
            statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
          }
        }
        return;
      }
    } else {
      UIManager.setNotConnectedStatus();
      StorageManager.clearCachedProxyInfo();
    }
  }

  static async loadLocations() {
    const cachedLocations = StorageManager.getCachedLocations();

    if (cachedLocations) {
      this.populateLocationDropdown(cachedLocations);
      return;
    }

    try {
      const response = await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA
      );

      if (response && response.data) {
        StorageManager.setCachedLocations(response.data);
        this.populateLocationDropdown(response.data);
      }
    } catch (error) {}
  }

  static handleLocationsSuccess(locations) {
    if (locations) {
      StorageManager.setCachedLocations(locations);
      this.populateLocationDropdown(locations);
    }
  }

  static populateLocationDropdown(locations) {
    const selectElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
    );

    while (selectElement.hasChildNodes()) {
      selectElement.removeChild(selectElement.firstChild);
    }

    if (locations && locations.length > 0) {
      locations.forEach((location) => {
        const option = document.createElement("option");
        option.textContent = location.name;
        option.value = location.code;
        selectElement.appendChild(option);
      });
    }
  }

  static async getProxyInfoIfConnectedSafe(preserveTimer = false) {
    try {
      const status = await MessageHandler.sendToBackground(
        "getBackgroundTimerStatus"
      );

      if (status && (status.isChangingIP || status.isProtected)) {
        const cachedProxyInfo = StorageManager.getCachedProxyInfo();
        if (cachedProxyInfo && !cachedProxyInfo.expired) {
          UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
          await this.restoreNextChangeIPFromBackground();
        }
        return;
      }

      await this.getProxyInfoIfConnected(preserveTimer);
    } catch (error) {
      const cachedProxyInfo = StorageManager.getCachedProxyInfo();
      if (cachedProxyInfo && !cachedProxyInfo.expired) {
        UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
        await this.restoreNextChangeIPFromBackground();
      }
    }
  }

  static async getProxyInfoIfConnected(preserveTimer = false) {
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (proxyConnected === "true") {
      const cachedProxyInfo = StorageManager.getCachedProxyInfo();

      if (cachedProxyInfo) {
        if (cachedProxyInfo.expired) {
          const statusElement = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
          );
          if (statusElement) {
            statusElement.innerText = cachedProxyInfo.error;
            statusElement.classList.remove(
              POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS
            );
            statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
          }

          return;
        }

        UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
        ProxyManager.updateProxyUIStatus();

        if (cachedProxyInfo.location) {
          const locationSelect = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
          );
          if (locationSelect) {
            locationSelect.value = cachedProxyInfo.location;
          }
        }

        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
        const proxyType =
          StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";

        if (apiKey) {
          UIManager.showLoadingProxyInfo();
          try {
            const apiResponse = await Promise.race([
              MessageHandler.sendToBackgroundSafe(
                POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
                {
                  apiKey: apiKey,
                  proxyType: proxyType,
                  preserveTimer: preserveTimer,
                  onlyGetInfo: true,
                }
              ),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("API timeout")), 1000)
              ),
            ]);

            if (!apiResponse) {
              const statusElement = document.getElementById(
                POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
              );
              if (statusElement) {
                statusElement.innerText = "• Đã kết nối (API không phản hồi)";
                statusElement.classList.remove(
                  POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER
                );
                statusElement.classList.add(
                  POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS
                );
              }

              await this.restoreNextChangeIPFromBackground();
            }
          } catch (error) {
            const statusElement = document.getElementById(
              POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
            );
            if (statusElement) {
              statusElement.innerText = "• Đã kết nối (lỗi tải thông tin)";
              statusElement.classList.remove(
                POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER
              );
              statusElement.classList.add(
                POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS
              );
            }

            await this.restoreNextChangeIPFromBackground();
          }
        } else {
          UIManager.setNotConnectedStatus();
          StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
          StorageManager.clearCachedProxyInfo();
        }
      }
    } else {
      UIManager.setNotConnectedStatus();
      StorageManager.clearCachedProxyInfo();
    }
  }

  static async restoreNextChangeIPFromBackground() {
    try {
      const result = await browserAPI.storage.local.get([
        "nextChangeTarget",
        "nextChangeDuration",
        "nextChangeStartTime",
        "nextChangeExpired",
      ]);

      if (result.nextChangeTarget && !result.nextChangeExpired) {
        const now = Date.now();
        const remainingMs = result.nextChangeTarget - now;
        const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

        if (remainingSeconds > 0) {
          timerManager.setCountDowntime(remainingSeconds + 1);
          timerManager.startCountDown();
          return true;
        } else {
          await browserAPI.storage.local.set({ nextChangeExpired: true });
          document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
          ).innerText = "0 s";
        }
      }
    } catch (error) {}
    return false;
  }

  static async forceDisconnectProxy(reason = "Unknown") {
    try {
      timerManager.forceStopAll();

      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      StorageManager.clearCachedProxyInfo();
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);

      try {
        await browserAPI.storage.local.remove([
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED,
          "proxyInfo",
          "proxyConnectedTimestamp",
          "lastProxyUpdate",
        ]);
      } catch (storageError) {}

      UIManager.setNotConnectedStatus();
      const ipInfoElement = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IP_INFO
      );
      if (ipInfoElement) {
        ipInfoElement.style.display = "none";
      }

      const autoChangeCheckbox = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
      );
      if (autoChangeCheckbox) {
        autoChangeCheckbox.checked = false;
      }

      const config = {
        reason: reason,
        timestamp: Date.now(),
        browser: IS_FIREFOX ? "firefox" : "chrome",
      };

      if (IS_FIREFOX) {
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
          config
        );

        setTimeout(() => {
          MessageHandler.sendToBackground(
            POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
            config
          );
        }, 200);
      } else {
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      }

      try {
        await ChromeStorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TX_PROXY,
          null
        );
        await ChromeStorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TX_CONF,
          config
        );
      } catch (storageError) {}
    } catch (error) {
      UIManager.setNotConnectedStatus();
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      StorageManager.clearCachedProxyInfo();

      try {
        await browserAPI.storage.local.remove([
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED,
        ]);
      } catch (e) {}
    }
  }

  // NEW: Check expiration method
  static async checkAndHandleExpiration() {
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (proxyConnected !== "true") {
      return false;
    }

    const cachedProxyInfo = StorageManager.getCachedProxyInfo();
    
    if (!cachedProxyInfo) {
      return false;
    }

    if (cachedProxyInfo.expired) {
      if (cachedProxyInfo.expired === "key") {
        UIManager.showError({
          data: {
            error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED.replace("• ", ""),
          },
        });
        setTimeout(async () => {
          await this.forceDisconnectProxy("Key expired");
        }, 1000);
        return true;
      } else if (cachedProxyInfo.expired === "proxy") {
        UIManager.showError({
          data: {
            error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED.replace("• ", ""),
          },
        });
        setTimeout(async () => {
          await this.forceDisconnectProxy("Proxy timeout");
        }, 1000);
        return true;
      }
    }

    return false;
  }
}

class UIManager {
  static showProcessingNewIpConnectProtected() {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display =
      null;
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = "• Đang tự động đổi IP...";
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);

    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
  }

  static showProcessingConnect() {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display =
      null;
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CONNECTING;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProcessingNewIpConnect() {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display =
      null;
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CHANGING_IP;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showLoadingProxyInfo() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.LOADING_PROXY_INFO;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProxyInfo(proxyInfo, isStart = false, preserveTimer = false) {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV4).innerText =
      proxyInfo.public_ipv4;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV6).innerText =
      proxyInfo.public_ipv6;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIMEOUT).innerText =
      proxyInfo.proxyTimeout;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT).value =
      proxyInfo.location;

    if (!isStart) {
      this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
      this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    }

    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY_ERROR).innerText =
      "";
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CONNECTED;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display =
      "block";
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);

    const restored = timerManager.restoreCountDown();

    if (!restored) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText =
        "0 s";
    }
  }

  static showError(messageData) {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.innerText = `• ${messageData.data.error}`;

    this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
  }

  static clearPopupPage() {
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
    this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);

    timerManager.forceStopAll();

    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV4).innerText =
      "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV6).innerText =
      "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIMEOUT).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText =
      "0 s";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).innerText =
      "0";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY_ERROR).innerText =
      "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display =
      "none";

    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.NOT_CONNECTED;
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
  }

  static setNotConnectedStatus() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );

    if (statusElement) {
      statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.NOT_CONNECTED;
      statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    }

    const ipInfoElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IP_INFO
    );
    if (ipInfoElement) {
      ipInfoElement.style.display = "none";
    }

    this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
  }

  static disableButton(buttonId) {
    document.getElementById(buttonId).disabled = true;
  }

  static enableButton(buttonId) {
    document.getElementById(buttonId).disabled = false;
  }
}

class FormManager {
  static getProxyType() {
    const proxyTypeElements = document.querySelectorAll(
      POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_5
    );
    for (const element of proxyTypeElements) {
      if (element.checked) {
        return element.value;
      }
    }
    return POPUP_CONFIG.PROXY_TYPES.IPV4;
  }

  static getChangeIpType() {
    const changeIpElements = document.querySelectorAll(
      POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP
    );
    for (const element of changeIpElements) {
      if (
        element.checked &&
        element.value === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE
      ) {
        return POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE;
      }
    }
    return POPUP_CONFIG.CHANGE_IP_TYPES.KEEP;
  }

  static getFormData() {
    return {
      proxyType: this.getProxyType(),
      location: document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
      ).value,
      changeIpType: this.getChangeIpType(),
      isAutoChangeIP: document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
      ).checked,
      timeAutoChangeIP: document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
      ).value,
      apiKey: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY).value,
    };
  }

  static validateApiKey(apiKey) {
    return apiKey && apiKey.trim() !== "";
  }

  static loadStoredSettings() {
    const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
    const changeIpType = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.CHANGE_IP_TYPE
    );
    const proxyType = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE);
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );
    const timeAutoChangeIPDefault = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    if (apiKey && changeIpType && proxyType) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY).value = apiKey;

      const changeIpElements = document.querySelectorAll(
        POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP
      );
      changeIpElements.forEach((element) => {
        element.checked = element.value === changeIpType;
      });

      const proxyTypeElements = document.querySelectorAll(
        POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_5
      );
      proxyTypeElements.forEach((element) => {
        element.checked = element.value === proxyType;
      });
    }

    if (JSON.parse(isAutoChangeIP)) {
      document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
      ).checked = true;

      if (timeAutoChangeIPDefault) {
        const timeValue = Number(timeAutoChangeIPDefault);
        document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value =
          timeValue;
      }
    }
    ChangeIPManager.updateAutoChangeIPState();
  }

  static saveSettings(formData) {
    if (
      formData.isAutoChangeIP &&
      formData.changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE
    ) {
      StorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT,
        formData.timeAutoChangeIP
      );
      StorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP,
        formData.isAutoChangeIP
      );
      StorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
        formData.timeAutoChangeIP
      );
    } else {
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      StorageManager.remove(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
      );
    }

    StorageManager.set(
      POPUP_CONFIG.STORAGE_KEYS.CHANGE_IP_TYPE,
      formData.changeIpType
    );
    StorageManager.set(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE,
      formData.proxyType
    );
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.API_KEY, formData.apiKey);
  }
}

class ChangeIPManager {
  static init() {
    const changeIpElements = document.querySelectorAll(
      POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP
    );

    changeIpElements.forEach((element) => {
      element.addEventListener("change", () => {
        this.updateAutoChangeIPState();
      });
    });

    this.updateAutoChangeIPState();
  }

  static updateAutoChangeIPState() {
    const changeIpType = FormManager.getChangeIpType();
    const autoChangeCheckbox = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
    );
    const timeChangeInput = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
    );

    const containerChangeIP = document.querySelector(".container-change-ip");

    if (changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.KEEP) {
      if (autoChangeCheckbox) {
        if (autoChangeCheckbox.checked) {
          autoChangeCheckbox.checked = false;

          const changeEvent = new Event("change", { bubbles: true });
          autoChangeCheckbox.dispatchEvent(changeEvent);
        }

        autoChangeCheckbox.disabled = true;
      }

      if (timeChangeInput) {
        timeChangeInput.disabled = true;
        timeChangeInput.value = "60";
      }

      if (containerChangeIP) {
        containerChangeIP.classList.add("disabled");
      }

      timerManager.forceStopAll();

      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      StorageManager.remove(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
      );
    } else {
      if (autoChangeCheckbox) {
        autoChangeCheckbox.disabled = false;
      }

      if (timeChangeInput) {
        timeChangeInput.disabled = false;

        const savedTime = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
        );
        if (savedTime && savedTime !== "0") {
          timeChangeInput.value = savedTime;
        } else {
          timeChangeInput.value = "60";
        }
      }

      if (containerChangeIP) {
        containerChangeIP.classList.remove("disabled");
      }
    }
  }

  static isChangeIPAllowed() {
    const changeIpType = FormManager.getChangeIpType();
    return changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE;
  }
}

class ProxyManager {
  static async handleClick() {
    const formData = FormManager.getFormData();

    if (!FormManager.validateApiKey(formData.apiKey)) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS).innerText =
        POPUP_CONFIG.MESSAGES_TEXT.INVALID_KEY;
      return;
    }

    if (formData.isAutoChangeIP && !ChangeIPManager.isChangeIPAllowed()) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS).innerText =
        "• Cần chọn 'Đổi IP' để sử dụng tự động đổi IP";
      return;
    }

    FormManager.saveSettings(formData);

    const config = {
      apiKey: formData.apiKey,
      isAutoChangeIP:
        formData.isAutoChangeIP && ChangeIPManager.isChangeIPAllowed(),
      timeAutoChangeIP:
        localStorage.getItem("timeAutoChangeIP") || formData.timeAutoChangeIP,
      proxyType: formData.proxyType,
    };

    if (formData.location) {
      config.location = formData.location;
    }

    if (ChangeIPManager.isChangeIPAllowed()) {
      if (formData.isAutoChangeIP) {
        await MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
          config
        );
      } else if (
        formData.changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE
      ) {
        await MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CHANGE_IP,
          config
        );
      } else {
        await MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
          config
        );
      }
    } else {
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
        config
      );
    }
  }

  static async handleSuccessfulConnection(proxyData, preserveTimer = false) {
    if (!preserveTimer) {
      timerManager.forceStopAll();
    } else {
      timerManager.clearNextTimeChangeOnly();
    }

    const currentTime = Math.floor(Date.now() / 1000);

    if (
      proxyData.expired &&
      currentTime >= Math.floor(Date.now(proxyData.expired) / 1000)
    ) {
      UIManager.showError({
        data: {
          error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED.replace("• ", ""),
        },
      });
      setTimeout(async () => {
        await LocationManager.forceDisconnectProxy("Key expired");
      }, 1000);
      return;
    }

    if (
      proxyData.proxyTimeout &&
      currentTime >= Math.floor(Date.now(proxyData.proxyTimeout) / 1000)
    ) {
      UIManager.showError({
        data: {
          error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED.replace("• ", ""),
        },
      });
      setTimeout(async () => {
        await LocationManager.forceDisconnectProxy("Proxy timeout");
      }, 1000);
      return;
    }

    setTimeout(async () => {
      const cacheUpdateSuccess = this.updateProxyCache(
        proxyData,
        proxyData.cacheSource || "ChangeIP/Connect API"
      );

      UIManager.showProxyInfo(proxyData, false, preserveTimer);
      await this.updateProxyUIStatus();

      if (proxyData.updateCache || proxyData.cacheSource) {
        StorageManager.setCachedProxyInfo(proxyData);

        try {
          await browserAPI.storage.sync.set({ tx_proxy: proxyData });
        } catch (error) {}
      }

      if (!preserveTimer) {
        const isAutoChangeIP = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
        );
        const timeAutoChangeIPDefault = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
        );

        if (
          JSON.parse(isAutoChangeIP) &&
          timeAutoChangeIPDefault &&
          ChangeIPManager.isChangeIPAllowed()
        ) {
          const defaultTime = Number(timeAutoChangeIPDefault);
          StorageManager.set(
            POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
            defaultTime
          );
          timerManager.startTimeChangeCountdownWithTime(defaultTime);

          setTimeout(async () => {
            await this.syncNextChangeIPWithBackground();
          }, 1000);
        } else {
          if (proxyData.nextChangeIP && proxyData.nextChangeIP > 0) {
            timerManager.setCountDowntime(proxyData.nextChangeIP);
            timerManager.startCountDown();
          }
        }
      }
    }, 100);
  }

  static async syncNextChangeIPWithBackground() {
    try {
      const backgroundStatus = await MessageHandler.sendToBackground(
        "getBackgroundTimerStatus"
      );

      if (backgroundStatus && backgroundStatus.isActive) {
        const result = await browserAPI.storage.local.get([
          "nextChangeTarget",
          "nextChangeDuration",
          "nextChangeExpired",
        ]);

        if (result.nextChangeTarget && !result.nextChangeExpired) {
          const now = Date.now();
          const remainingMs = result.nextChangeTarget - now;
          const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

          if (remainingSeconds > 0) {
            timerManager.setCountDowntime(remainingSeconds + 2);
            timerManager.startCountDown();
          }
        }
      }
    } catch (error) {}
  }

  static handleInfoKeySuccess(data) {
    this.handleClick();
  }

  static async updateProxyUIStatus() {
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED, "true");

    try {
      await browserAPI.storage.local.set({
        [POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED]: "true",
        proxyConnectedTimestamp: Date.now(),
      });
    } catch (error) {}
  }

  static async updateProxyCache(proxyData, source = "API") {
    try {
      if (
        source.includes("API") ||
        source.includes("ChangeIP") ||
        source.includes("changeIP")
      ) {
        const wasExpired = StorageManager.wasNextChangeTimerExpired();
        if (wasExpired) {
          StorageManager.clearNextChangeTimer();
        }
      }

      StorageManager.setCachedProxyInfo(proxyData);
      await ChromeStorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TX_PROXY,
        proxyData
      );
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, proxyData);

      await browserAPI.storage.local.set({
        proxyInfo: proxyData,
        lastProxyUpdate: Date.now(),
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  static async directProxy() {
    timerManager.forceStopAll();

    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    StorageManager.remove(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    StorageManager.clearCachedProxyInfo();

    timerManager.clearNextTimeChangeState();

    try {
      await browserAPI.storage.local.remove([
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED,
        "proxyInfo",
        "proxyConnectedTimestamp",
        "lastProxyUpdate",
      ]);
    } catch (error) {}

    const autoChangeCheckbox = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
    );
    if (autoChangeCheckbox) {
      autoChangeCheckbox.checked = false;
    }
  }

  static async disconnect() {
    try {
      const proxyInfo = await ChromeStorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.TX_PROXY
      );

      const config = {
        apiKey: proxyInfo?.apiKey || "",
        isAutoChangeIP: false,
        timeAutoChangeIP:
          document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP)
            ?.value || "0",
        browser: IS_FIREFOX ? "firefox" : "chrome",
      };

      await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);

      UIManager.clearPopupPage();
      await this.directProxy();

      if (IS_FIREFOX) {
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
          config
        );

        await new Promise((resolve) => setTimeout(resolve, 200));

        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      } else {
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      }

      if (IS_FIREFOX) {
        try {
          await browserAPI.storage.local.remove(["firefoxProxyActive"]);
        } catch (e) {}

        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      UIManager.clearPopupPage();
      await this.directProxy();
    }
  }

  static async forceCacheRefresh() {
    try {
      const result = await browserAPI.storage.sync.get([
        "tx_proxy",
        "cacheUpdateFlag",
      ]);

      if (result.tx_proxy) {
        StorageManager.setCachedProxyInfo(result.tx_proxy);

        const proxyConnected = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
        );

        if (proxyConnected === "true") {
          UIManager.showProxyInfo(result.tx_proxy, false, true);
          await ProxyManager.updateProxyUIStatus();
        }

        return true;
      }
    } catch (error) {}

    return false;
  }
}

class EventManager {
  static setupEventListeners() {
    document
      .getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT)
      .addEventListener("click", async () => {
        UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
        UIManager.clearPopupPage();
        timerManager.forceStopAll();
        await ProxyManager.handleClick();
      });

    document
      .getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT)
      .addEventListener("click", async () => {
        UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);

        try {
          await ProxyManager.disconnect();
        } catch (error) {
        } finally {
          setTimeout(() => {
            UIManager.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
          }, 1000);
        }
      });
  }
}

class AppInitializer {
  static async initialize() {
    try {
      if (this.isInitializing) {
        return;
      }

      this.isInitializing = true;
      
      timerManager.forceStopAll();
      UIManager.setNotConnectedStatus();

      // NEW: Check expiration first when connected
      const expiredHandled = await LocationManager.checkAndHandleExpiration();
      if (expiredHandled) {
        return;
      }

      const cacheUpdated = await this.checkAndApplyPendingCacheUpdates();

      const backgroundStatus = await this.checkBackgroundStatus();

      if (backgroundStatus.status === "error") {
        this.showBackgroundError();
        return;
      }

      if (backgroundStatus.status === "protected") {
        await this.handleProtectedState(backgroundStatus.data);
        return;
      }

      if (backgroundStatus.status === "changing") {
        await this.handleChangingState(backgroundStatus.data);
        return;
      }

      await this.continueInitialization(backgroundStatus.data);
    } catch (error) {
      this.showInitializationError();
    } finally {
      this.isInitializing = false;
    }
  }

  static async checkBackgroundStatus() {
    try {
      const pingResponse = await Promise.race([
        MessageHandler.sendToBackground("ping"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ping timeout")), 3000)
        ),
      ]);

      if (!pingResponse || !pingResponse.pong) {
        return { status: "error", reason: "No ping response" };
      }

      const statusResponse = await Promise.race([
        MessageHandler.sendToBackground("getBackgroundTimerStatus"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Status timeout")), 3000)
        ),
      ]);

      if (statusResponse) {
        if (statusResponse.isChangingIP) {
          return { status: "changing", data: statusResponse };
        }

        if (statusResponse.isProtected) {
          return { status: "protected", data: statusResponse };
        }

        return { status: "active", data: statusResponse };
      }

      return { status: "inactive" };
    } catch (error) {
      return { status: "error", reason: error.message };
    }
  }

  static async handleProtectedState(backgroundData) {
    UIManager.showProcessingNewIpConnectProtected();
    
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      try {
        const status = await MessageHandler.sendToBackground(
          "getBackgroundTimerStatus"
        );

        if (!status || (!status.isChangingIP && !status.isProtected)) {
          await this.continueInitialization(status);
          return;
        }

      } catch (error) {
        break;
      }
    }

    await this.continueInitialization();
  }

  static async handleChangingState(backgroundData) {
    UIManager.showProcessingNewIpConnect();
    
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      try {
        const status = await MessageHandler.sendToBackground(
          "getBackgroundTimerStatus"
        );

        if (!status || !status.isChangingIP) {
          await this.continueInitialization(status);
          return;
        }

      } catch (error) {
        break;
      }
    }

    await this.continueInitialization();
  }

  static async continueInitialization(backgroundData = null) {
    try {
      await LocationManager.loadLocations();

      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();
      }

      ChangeIPManager.init();

      await new Promise(resolve => setTimeout(resolve, 500));

      const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);

      let timerInitialized = false;

      if (proxyConnected === "true" && 
          JSON.parse(isAutoChangeIP) && 
          ChangeIPManager.isChangeIPAllowed()) {
        
        if (backgroundData && backgroundData.isActive) {
          const now = Date.now();
          const timeSinceLastUpdate = Math.floor(
            (now - backgroundData.lastUpdateTime) / 1000
          );
          const realRemainingTime = Math.max(
            0,
            backgroundData.remainingTime - timeSinceLastUpdate
          );

          if (realRemainingTime > 0) {
            timerInitialized =
              timerManager.startTimeChangeCountdownWithTime(realRemainingTime);
          } else {
            timerInitialized = await timerManager.initializeTimer();
          }
        } else {
          timerInitialized = await timerManager.initializeTimer();
        }

        if (timerInitialized) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (proxyConnected === "true") {
        // NEW: Check expiration again before loading proxy info
        const expiredHandled = await LocationManager.checkAndHandleExpiration();
        if (!expiredHandled) {
          await LocationManager.getProxyInfoIfConnectedSafeNoAPI(timerInitialized);
        }
      }

    } catch (error) {
      this.showInitializationError();
    }
  }

  static async checkAndApplyPendingCacheUpdates() {
    try {
      const result = await browserAPI.storage.sync.get([
        "cacheUpdateFlag",
        "tx_proxy",
      ]);

      if (
        result.cacheUpdateFlag &&
        result.cacheUpdateFlag.needsLocalStorageUpdate
      ) {
        const updateAge = Date.now() - result.cacheUpdateFlag.timestamp;

        if (updateAge < 300000) {
          StorageManager.setCachedProxyInfo(result.cacheUpdateFlag.proxyInfo);

          await browserAPI.storage.sync.set({
            cacheUpdateFlag: {
              ...result.cacheUpdateFlag,
              needsLocalStorageUpdate: false,
              appliedAt: Date.now(),
              appliedBy: "popup_initialization",
            },
          });

          return true;
        }
      }

      const fallbackResult = await this.checkFallbackCacheSources(result);
      return fallbackResult;
    } catch (error) {
      return false;
    }
  }

  static async checkFallbackCacheSources(syncResult) {
    try {
      const localResult = await browserAPI.storage.local.get(["cachedProxyInfo"]);
      
      if (localResult.cachedProxyInfo && localResult.cachedProxyInfo.proxyInfo) {
        const localCache = StorageManager.getCachedProxyInfo();
        const localTimestamp = localResult.cachedProxyInfo.timestamp || 0;
        const currentTimestamp =
          localCache && localCache.timestamp ? localCache.timestamp : 0;

        if (localTimestamp > currentTimestamp) {
          StorageManager.setCachedProxyInfo(localResult.cachedProxyInfo.proxyInfo);
          return true;
        }
      }

      if (syncResult.tx_proxy) {
        const currentCache = StorageManager.getCachedProxyInfo();
        if (!currentCache) {
          StorageManager.setCachedProxyInfo(syncResult.tx_proxy);
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  static showBackgroundError() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    if (statusElement) {
      statusElement.innerText = "• Extension lỗi kết nối, vui lòng thử lại";
      statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    }
    
    UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
  }

  static showInitializationError() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    if (statusElement) {
      statusElement.innerText = "• Lỗi khởi tạo extension";
      statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    }
  }
}

const timerManager = new TimerManager();

window.addEventListener("beforeunload", async () => {
  timerManager.stopSyncCheck();
  await timerManager.notifyPopupClosing();
  timerManager.markPopupInactive();
});

window.addEventListener("unload", async () => {
  timerManager.stopSyncCheck();
  await timerManager.notifyPopupClosing();
  timerManager.markPopupInactive();
});

document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    timerManager.stopSyncCheck();
    await timerManager.notifyPopupClosing();
  } else {
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (
      JSON.parse(isAutoChangeIP) &&
      proxyConnected === "true" &&
      ChangeIPManager.isChangeIPAllowed()
    ) {
      setTimeout(async () => {
        await timerManager.initializeTimer();
      }, 500);
    }
  }
});

MessageHandler.setupMessageListener();
EventManager.setupEventListeners();
AppInitializer.initialize();
