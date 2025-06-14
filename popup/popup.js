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
    TIME_AUTO_CHANGE_IP_2: "timeAutoChangeIP2",
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
    GET_CURRENT_PROXY_NO_CHANGE: "getCurrentProxyNoChange", // NEW: Non-invasive proxy info
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

// Browser detection
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
    } catch (error) {
      console.error("Popup: Error caching proxy info:", error);
    }
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
    } catch (error) {
      console.error("Popup: Error updating cached proxy info timer:", error);
    }
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
        if (proxyInfo.expired && currentTime >= proxyInfo.expired) {
          this.clearCachedProxyInfo();
          return {
            expired: "key",
            error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED,
          };
        }

        // Check proxy timeout
        if (proxyInfo.proxyTimeout && currentTime >= proxyInfo.proxyTimeout) {
          this.clearCachedProxyInfo();
          return {
            expired: "proxy",
            error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED,
          };
        }

        return proxyInfo;
      }
      return null;
    } catch (error) {
      console.error("Popup: Error loading cached proxy info:", error);
      return null;
    }
  }

  static clearCachedProxyInfo() {
    try {
      this.remove(POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO);
    } catch (error) {
      console.error("Popup: Error clearing cached proxy info:", error);
    }
  }

  // NEW: Locations caching methods
  static setCachedLocations(locations) {
    try {
      const cachedData = {
        locations: locations,
        timestamp: Date.now(),
        version: 1,
      };
      this.set(POPUP_CONFIG.STORAGE_KEYS.CACHED_LOCATIONS, cachedData);
    } catch (error) {
      console.error("Popup: Error caching locations:", error);
    }
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
      console.error("Popup: Error loading cached locations:", error);
      return null;
    }
  }

  static clearCachedLocations() {
    try {
      this.remove(POPUP_CONFIG.STORAGE_KEYS.CACHED_LOCATIONS);
    } catch (error) {
      console.error("Popup: Error clearing cached locations:", error);
    }
  }

  // NEW: Next change timer persistence methods
  static setNextChangeTimer(targetTime, duration) {
    try {
      const timerData = {
        targetTime: targetTime, // Timestamp when next change should happen
        duration: duration, // Original duration in seconds
        startTime: Date.now(), // When this timer was set
        version: 1,
        expired: false, // Track if timer has expired
      };
      this.set(POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET, timerData);
    } catch (error) {
      console.error("Popup: Error saving next change timer:", error);
    }
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
          wasExpired: timerData.expired, // Track if was manually marked as expired
        };
      }
      return null;
    } catch (error) {
      console.error("Popup: Error loading next change timer:", error);
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
    } catch (error) {
      console.error("Popup: Error marking timer as expired:", error);
    }
  }

  static clearNextChangeTimer() {
    try {
      this.remove(POPUP_CONFIG.STORAGE_KEYS.NEXT_CHANGE_TARGET);
    } catch (error) {
      console.error("Popup: Error clearing next change timer:", error);
    }
  }

  // NEW: Check if timer was previously expired
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

// Thêm vào MessageHandler.setupMessageListener()
class MessageHandler {
  static async sendToBackground(message, data = {}) {
    try {
      // Messages that don't need response
      const oneWayMessages = [
        POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
        POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
        POPUP_CONFIG.BACKGROUND_MESSAGES.CHANGE_IP,
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
      ];

      if (oneWayMessages.includes(message)) {
        // Send message without expecting response
        try {
          browserAPI.runtime.sendMessage({ greeting: message, data });
        } catch (error) {}
        return null;
      } else {
        // Send message and wait for response with timeout
        return await Promise.race([
          browserAPI.runtime.sendMessage({ greeting: message, data }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Message timeout")), 5000)
          ),
        ]);
      }
    } catch (error) {
      console.error("Popup: Error sending message to background:", error);

      // Handle specific error types
      if (error.message.includes("Receiving end does not exist")) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Retry once
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
          console.error("Popup: Retry also failed:", retryError);
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
          // FIXED: Handle auto change protection
          if (request.data?.isAutoChanging && request.data?.isProtected) {
            UIManager.showProcessingNewIpConnectProtected();
          } else {
            UIManager.showProcessingNewIpConnect();
          }
          break;
        case POPUP_CONFIG.MESSAGES.FAILURE_GET_PROXY_INFO:
          UIManager.showError(request);
          // FIXED: Không tự động disconnect khi có lỗi API
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_PROXY_INFO:
          // FIXED: Handle protected success response
          const preserveTimer = request.data?.preserveTimer || false;
          // Remove preserveTimer from data before passing to handler
          const { preserveTimer: _, ...cleanData } = request.data || {};
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
      console.error("Popup: Background connection check failed:", error);
      return false;
    }
  }

  // ENHANCED: Check background protection status before sending requests
  static async sendToBackgroundSafe(message, data = {}) {
    try {
      // Check if auto change is in protected state với timeout ngắn
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
      console.error("Popup: Error in sendToBackgroundSafe:", error);
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
  }

  async syncWithBackground() {
    try {
      const response = await browserAPI.runtime.sendMessage({
        greeting: "getBackgroundTimerStatus",
        data: {},
      });

      if (response && response.isActive) {
        if (response.isChangingIP) {
          return { status: "changing", data: response };
        }

        // Calculate accurate remaining time
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

    // Update display immediately with confirmed time
    const element = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
    );
    if (element) {
      element.value = `${this.totalTimeChangeIp}`;
    }

    // Update storage
    StorageManager.set(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
      this.totalTimeChangeIp
    );

    // Start countdown
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

      // Update popup activity
      this.updatePopupActivity();

      if (this.totalTimeChangeIp < 0) {
        this.clearTimeChangeCountdown();
        this.showChangingIPStatus();
        // FIXED: Only trigger actual IP change when timer hits 0
        await this.handleTimerExpiredWithActualChange();
        return;
      }

      // Update localStorage
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
        // FIXED: Actually start the countdown timer display with remaining time
        this.startTimeChangeCountdownWithTime(syncResult.remainingTime);
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
          return true;
        }
      }

      this.isInitialized = true;
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  // Start regular sync checks
  startSyncCheck() {
    this.stopSyncCheck();

    this.syncCheckInterval = setInterval(async () => {
      if (!this.isPopupControlling) return;

      try {
        const response = await browserAPI.runtime.sendMessage({
          greeting: "getBackgroundTimerStatus",
          data: {},
        });

        if (response && response.isActive) {
          const now = Date.now();
          const timeSinceLastUpdate = Math.floor(
            (now - response.lastUpdateTime) / 1000
          );
          const realRemainingTime = Math.max(
            0,
            response.remainingTime - timeSinceLastUpdate
          );

          const timeDiff = Math.abs(this.totalTimeChangeIp - realRemainingTime);

          if (timeDiff > 5) {
            this.totalTimeChangeIp = realRemainingTime;

            const element = document.getElementById(
              POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
            );
            if (element) {
              element.value = `${realRemainingTime}`;
            }
          }
        }
      } catch (error) {}
    }, 500);
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
    // Clear stored next time change data
    StorageManager.clearNextChangeTimer();
    const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME);
    if (element) {
      element.innerText = "0 s";
    }
  }

  // FIXED: New method that actually triggers IP change when timer expires
  async handleTimerExpiredWithActualChange() {
    try {

      // Get current settings for the IP change
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      const proxyType =
        StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";
      const location = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
      )?.value;

      if (!apiKey) {
        console.error("Popup: No API key available for auto IP change");
        await this.resetToDefaultTime();
        return;
      }

      // Create config for auto change IP
      const config = {
        apiKey: apiKey,
        isAutoChangeIP: true,
        timeAutoChangeIP:
          StorageManager.get(
            POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
          ) || "60",
        proxyType: proxyType,
      };

      if (location) {
        config.location = location;
      }

      // Trigger auto change IP in background
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
        config
      );

    } catch (error) {
      console.error("Popup: Error during timer expired IP change:", error);
      await this.resetToDefaultTime();
    }
  }

  // MODIFIED: Original method for waiting and recovery, now without triggering IP change
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
  }

  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.stopSyncCheck();
    this.clearNextTimeChangeState(); // ENHANCED: Use the enhanced method
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.isInitialized = false;
    this.markPopupInactive();
  }

  // ENHANCED: Clear only next time change countdown, preserve auto change timer
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
      this.startTimeChangeCountdownWithTime(resetTime);

      return true;
    }

    return false;
  }

  startCountDown(seconds = null) {
    this.clearCountDown();

    // Use provided seconds or stored countDowntime
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


    // Calculate target timestamp
    const now = Date.now();
    const targetTime = now + targetSeconds * 1000;

    // Save timer state
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

        // CRITICAL FIX: Mark timer as expired in storage
        StorageManager.markNextChangeTimerExpired();

        // CRITICAL FIX: Update cached proxy info to reflect expired state
        StorageManager.updateCachedProxyInfoTimerExpired();

        this.clearCountDown();
        return;
      }

      // Update the stored timer with remaining time
      const remainingTime = Date.now() + this.countDowntime * 1000;
      StorageManager.setNextChangeTimer(remainingTime, this.countDowntime);
    }, 1000);
  }

  // CRITICAL FIX: Enhanced restore countdown with expiry check
  restoreCountDown() {
    const timerData = StorageManager.getNextChangeTimer();

    if (!timerData) {
      return false;
    }

    // CRITICAL FIX: Check if timer was previously expired
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
      // Mark as expired and update cache
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

    // Start countdown with remaining time
  
    this.startCountDown(timerData.remainingSeconds);
    return true;
  }

  clearCountDown() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }
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

          // FIXED: Không tự động disconnect, chỉ hiển thị lỗi
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

        // FIXED: Restore nextChangeIP from background storage
        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        // FIXED: Nếu không có cached data, hiển thị loading và KHÔNG gọi API
        UIManager.showLoadingProxyInfo();

        // FIXED: Thử restore nextChangeIP từ background trước
        const restored = await this.restoreNextChangeIPFromBackground();

        if (!restored) {
          // Nếu không restore được, hiển thị connected nhưng chưa có info
          const statusElement = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
          );
          if (statusElement) {
            statusElement.innerText = "• Đã kết nối (chưa có thông tin)";
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

  // ENHANCED: Load from cache or API
  static async loadLocations() {
    // First, try to load from cache
    const cachedLocations = StorageManager.getCachedLocations();

    if (cachedLocations) {
      this.populateLocationDropdown(cachedLocations);
      return;
    }

    // If no cache, call API
    try {
      const response = await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA
      );

      if (response && response.data) {
        // Cache the locations data
        StorageManager.setCachedLocations(response.data);
        this.populateLocationDropdown(response.data);
      } else {
        console.error("Popup: Failed to get locations from API");
      }
    } catch (error) {
      console.error("Popup: Error calling locations API:", error);
    }
  }

  static handleLocationsSuccess(locations) {
    if (locations) {
      // Cache the locations data when received from background
      StorageManager.setCachedLocations(locations);
      this.populateLocationDropdown(locations);
    }
  }

  static populateLocationDropdown(locations) {
    const selectElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
    );

    // Clear existing options
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
      // Check if background is in protected state
      const status = await MessageHandler.sendToBackground(
        "getBackgroundTimerStatus"
      );

      if (status && (status.isChangingIP || status.isProtected)) {
    

        // FIXED: Thử load từ cache thay vì chờ
        const cachedProxyInfo = StorageManager.getCachedProxyInfo();
        if (cachedProxyInfo && !cachedProxyInfo.expired) {
          UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
          await this.restoreNextChangeIPFromBackground();
        }
        return;
      }

      await this.getProxyInfoIfConnected(preserveTimer);
    } catch (error) {
      console.error(
        "LocationManager: Error in getProxyInfoIfConnectedSafe:",
        error
      );

      // FIXED: Không gọi getProxyInfoIfConnected nếu có lỗi, thay vào đó dùng cache
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

          // FIXED: Chỉ hiển thị lỗi, không tự động disconnect
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

        // FIXED: Restore nextChangeIP from background storage
        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
        const proxyType =
          StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";

        if (apiKey) {
          UIManager.showLoadingProxyInfo();
          try {
            // FIXED: Sử dụng safe API call với timeout ngắn hơn
            const apiResponse = await Promise.race([
              MessageHandler.sendToBackgroundSafe(
                POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY_NO_CHANGE,
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

            // FIXED: Nếu API call thất bại, không disconnect
            if (!apiResponse) {
          

              // Hiển thị trạng thái connected nhưng chưa có info
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

              // Thử restore nextChangeIP từ background
              await this.restoreNextChangeIPFromBackground();
            }
          } catch (error) {
            console.error("Popup: API error:", error);

            // FIXED: Không disconnect khi có lỗi API
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

            // Thử restore nextChangeIP từ background
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

  // NEW: Restore nextChangeIP from background storage
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
       
          setTimeout(() => {
            timerManager.setCountDowntime(remainingSeconds);
            timerManager.startCountDown();
          }, 1000);
          return true;
        } else {
          // Timer đã hết hạn, đánh dấu expired
          await browserAPI.storage.local.set({ nextChangeExpired: true });
          document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
          ).innerText = "0 s";
        }
      }
    } catch (error) {
      console.error(
        "Popup: Error restoring nextChangeIP from background:",
        error
      );
    }
    return false;
  }

  static async forceDisconnectProxy(reason = "Unknown") {
    try {

      // Stop all timers first
      timerManager.forceStopAll();

      // Clear all local storage
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      StorageManager.clearCachedProxyInfo();
      // StorageManager.clearCachedLocations();
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);

      // CRITICAL FIX: Clear chrome storage local as well
      try {
        await browserAPI.storage.local.remove([
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED,
          "proxyInfo",
          "proxyConnectedTimestamp",
          "lastProxyUpdate",
        ]);
      } catch (storageError) {
        console.error(
          "Popup: Error clearing chrome storage during force disconnect:",
          storageError
        );
      }

      // Reset UI
      UIManager.setNotConnectedStatus();
      const ipInfoElement = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IP_INFO
      );
      if (ipInfoElement) {
        ipInfoElement.style.display = "none";
      }

      // Reset auto change checkbox
      const autoChangeCheckbox = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
      );
      if (autoChangeCheckbox) {
        autoChangeCheckbox.checked = false;
      }

      // Send disconnect commands to background
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

      // Clear Chrome storage
      try {
        await ChromeStorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TX_PROXY,
          null
        );
        await ChromeStorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TX_CONF,
          config
        );
      } catch (storageError) {
        console.error("Popup: Error clearing Chrome storage:", storageError);
      }
    } catch (error) {
      console.error("Popup: Error during force disconnect:", error);

      // Fallback: at least reset UI and clear basic storage
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

    // Disable buttons during auto change
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

  // ENHANCED: Show proxy info with persistent nextChangeIP timer
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

    // CRITICAL FIX: Enhanced timer handling logic
 

    // First, try to restore any existing countdown timer
    const restored = timerManager.restoreCountDown();

    if (!restored) {
      // No existing timer or timer was expired
      // Check if we should start a new timer from API data

      // CRITICAL FIX: Don't start timer if it was previously marked as expired
      if (proxyInfo.nextChangeExpired) {
        document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText =
          "0 s";
      } else if (proxyInfo.nextChangeIP && proxyInfo.nextChangeIP > 0) {
        // Only start new timer if we don't have expired timer state
        const wasExpired = StorageManager.wasNextChangeTimerExpired();

        if (wasExpired) {
        
          document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME
          ).innerText = "0 s";
        } else {
       
          timerManager.setCountDowntime(proxyInfo.nextChangeIP);
          timerManager.startCountDown();
        }
      } else {
        // No timer data at all, show 0
        document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText =
          "0 s";
      }
    } else {
    
    }
  }

  static showError(messageData) {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.innerText = `• ${messageData.data.error}`;

    // ENHANCED: Enable connect button on error
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
      // Clear auto change IP settings when change IP type is "keep"
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

// NEW: ChangeIPManager class to handle change IP type logic
class ChangeIPManager {
  static init() {
    // Add event listeners for change IP type radio buttons
    const changeIpElements = document.querySelectorAll(
      POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP
    );

    changeIpElements.forEach((element) => {
      element.addEventListener("change", () => {
        this.updateAutoChangeIPState();
      });
    });

    // Initialize state on load
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
      // Force disable and uncheck auto change IP when "keep" is selected
      if (autoChangeCheckbox) {
        // If auto change was previously enabled, turn it off first
        if (autoChangeCheckbox.checked) {
          autoChangeCheckbox.checked = false;

          // Trigger change event to ensure any listeners are notified
          const changeEvent = new Event("change", { bubbles: true });
          autoChangeCheckbox.dispatchEvent(changeEvent);
        }

        // Then disable the checkbox
        autoChangeCheckbox.disabled = true;
      }

      if (timeChangeInput) {
        timeChangeInput.disabled = true;
        // Reset time input to default value
        timeChangeInput.value = "60";
      }

      if (containerChangeIP) {
        containerChangeIP.classList.add("disabled");
      }

      // Stop any running auto change IP timer
      timerManager.forceStopAll();

      // Clear auto change IP storage completely
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      StorageManager.remove(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
      );
    } else {
      // Enable auto change IP when "change" is selected
      if (autoChangeCheckbox) {
        autoChangeCheckbox.disabled = false;
      }

      if (timeChangeInput) {
        timeChangeInput.disabled = false;

        // Restore previous time value if available
        const savedTime = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
        );
        if (savedTime && savedTime !== "0") {
          timeChangeInput.value = savedTime;
        } else {
          // Set default time if no saved value
          timeChangeInput.value = "60"; // Default 5 minutes
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

    // NEW: Validate change IP type before processing
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

    // NEW: Only allow change IP operations when change IP type is "change"
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
      // When "keep" is selected, only get current proxy info
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
        config
      );
    }
  }

  // MODIFIED: Enhanced to cache proxy info and handle all success cases
  static async handleSuccessfulConnection(proxyData, preserveTimer = false) {
    // FIXED: Smart timer handling based on context
    if (!preserveTimer) {
      timerManager.forceStopAll();
    } else {
      // When preserveTimer is true, only clear nextChangeIP timer, keep auto change timer
      timerManager.clearNextTimeChangeOnly();
    }

    // Check expiration before caching and showing
    const currentTime = Math.floor(Date.now() / 1000);

    // Check key expiration first
    if (proxyData.expired && currentTime >= proxyData.expired) {
      UIManager.showError({
        data: {
          error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED.replace("• ", ""),
        },
      });

      // Auto-disconnect due to key expiration
      setTimeout(async () => {
        await LocationManager.forceDisconnectProxy("Key expired");
      }, 1000);
      return;
    }

    // Check proxy timeout
    if (proxyData.proxyTimeout && currentTime >= proxyData.proxyTimeout) {
      UIManager.showError({
        data: {
          error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED.replace("• ", ""),
        },
      });

      // Auto-disconnect due to proxy timeout
      setTimeout(async () => {
        await LocationManager.forceDisconnectProxy("Proxy timeout");
      }, 1000);
      return;
    }

    setTimeout(async () => {
      // Make this async
      // ENHANCED: Update proxy cache with latest API data
      const cacheUpdateSuccess = this.updateProxyCache(
        proxyData,
        "ChangeIP/Connect API"
      );

      if (!cacheUpdateSuccess) {
        console.warn(
          "Popup: Failed to update proxy cache, but continuing with UI update"
        );
      }

      // Update UI with latest proxy info (preserveTimer is passed to showProxyInfo)
      UIManager.showProxyInfo(proxyData, false, preserveTimer);

      // CRITICAL FIX: Update both storage types
      await this.updateProxyUIStatus();

      // FIXED: Only start auto change timer if not preserving timers and auto change is enabled
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
        }
      } else {
      }
    }, 100);
  }

  static handleInfoKeySuccess(data) {
    // When getInfoKey succeeds, trigger handleClick to process the proxy data
    // This will eventually call handleSuccessfulConnection which updates cache

    this.handleClick();
  }

  static async updateProxyUIStatus() {
    // Update localStorage (for popup UI)
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED, "true");

    // CRITICAL FIX: Also update chrome storage local (for background script)
    try {
      await browserAPI.storage.local.set({
        [POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED]: "true",
        proxyConnectedTimestamp: Date.now(),
      });
    } catch (error) {
      console.error("Popup: Error updating chrome storage:", error);
    }
  }

  static async updateProxyCache(proxyData, source = "API") {
    try {
      // CRITICAL FIX: When updating from fresh API call, clear any expired timer state
      if (source.includes("API") || source.includes("ChangeIP")) {
        // This is fresh data from API, so clear any previous timer expiry state
        const wasExpired = StorageManager.wasNextChangeTimerExpired();
        if (wasExpired) {
       
          StorageManager.clearNextChangeTimer();
        }
      }

      // Always update cache with latest data
      StorageManager.setCachedProxyInfo(proxyData);

      // Also update Chrome storage for background sync
      await ChromeStorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TX_PROXY,
        proxyData
      );

      // Update local proxy info storage
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, proxyData);

      // CRITICAL FIX: Update chrome storage local for background sync
      await browserAPI.storage.local.set({
        proxyInfo: proxyData,
        lastProxyUpdate: Date.now(),
      });

      return true;
    } catch (error) {
      console.error(`Popup: Error updating proxy cache from ${source}:`, error);
      return false;
    }
  }

  static async directProxy() {
    timerManager.forceStopAll();

    // Clear all proxy-related storage including cache
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    StorageManager.remove(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    // ENHANCED: Clear cached proxy info and locations
    StorageManager.clearCachedProxyInfo();
    // StorageManager.clearCachedLocations();

    // ENHANCED: Clear nextTimeChange state
    timerManager.clearNextTimeChangeState();

    // CRITICAL FIX: Clear chrome storage local as well
    try {
      await browserAPI.storage.local.remove([
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED,
        "proxyInfo",
        "proxyConnectedTimestamp",
        "lastProxyUpdate",
      ]);
    } catch (error) {
      console.error("Popup: Error clearing chrome storage:", error);
    }

    const autoChangeCheckbox = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
    );
    if (autoChangeCheckbox) {
      autoChangeCheckbox.checked = false;
    }
  }

  // FIXED: Enhanced disconnect method for Firefox support
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
        browser: IS_FIREFOX ? "firefox" : "chrome", // Add browser info
      };

      await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);

      // Clear popup UI first
      UIManager.clearPopupPage();
      await this.directProxy(); // Make sure this completes

      // Send different messages based on browser
      if (IS_FIREFOX) {
        // For Firefox, send force disconnect message first (no response expected)
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.FORCE_DISCONNECT,
          config
        );

        // Small delay to ensure background processes the force disconnect
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Then send cancel all (no response expected)
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      } else {
        // For Chrome, use standard cancel all (no response expected)
        MessageHandler.sendToBackground(
          POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
          config
        );
      }

      // Additional Firefox-specific cleanup
      if (IS_FIREFOX) {
        // Clear any Firefox-specific storage
        try {
          await browserAPI.storage.local.remove(["firefoxProxyActive"]);
        } catch (e) {}

        // Wait a bit longer for Firefox to process
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error("Popup: Error during disconnect:", error);

      // Fallback: ensure UI is cleared even if background communication fails
      UIManager.clearPopupPage();
      await this.directProxy();
    }
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
          console.error("Popup: Disconnect error:", error);
        } finally {
          // Ensure button is re-enabled if needed
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

      // FIXED: Đơn giản hóa background connection check
      let isBackgroundConnected = false;
      try {
        const response = await MessageHandler.sendToBackground("ping");
        isBackgroundConnected = response && response.pong;
      } catch (error) {
        console.error("Popup: Background connection failed:", error);
      }

      if (!isBackgroundConnected) {
        const statusElement = document.getElementById(
          POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
        );
        if (statusElement) {
          statusElement.innerText = "• Extension lỗi kết nối, vui lòng thử lại";
          statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
        }
        return;
      }

      // FIXED: Check protection status trước khi làm gì khác
      let backgroundStatus = null;
      try {
        backgroundStatus = await MessageHandler.sendToBackground(
          "getBackgroundTimerStatus"
        );
      } catch (error) {
        console.error("Popup: Failed to get background status:", error);
      }

      if (
        backgroundStatus &&
        (backgroundStatus.isChangingIP || backgroundStatus.isProtected)
      ) {
      
        UIManager.showProcessingNewIpConnectProtected();

        // Wait for protection to clear, then continue initialization
        setTimeout(async () => {
          await this.continueInitialization();
        }, 1000);
        return;
      }

      await this.continueInitialization();
    } catch (error) {
      console.error("AppInitializer: Initialization error:", error);
      const statusElement = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
      );
      if (statusElement) {
        statusElement.innerText = "• Initialization Error";
        statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
      }
    } finally {
      this.isInitializing = false;
    }
  }

  // FIXED: Cải thiện continueInitialization
  static async continueInitialization() {
    try {
      // Load locations from cache or API
      await LocationManager.loadLocations();

      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();
      }

      ChangeIPManager.init();

      await new Promise((resolve) => setTimeout(resolve, 500));

      const proxyConnected = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
      );
      const isAutoChangeIP = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
      );

      let timerInitialized = false;

      // FIXED: Khởi tạo timer trước
      if (
        proxyConnected === "true" &&
        JSON.parse(isAutoChangeIP) &&
        ChangeIPManager.isChangeIPAllowed()
      ) {
        timerInitialized = await timerManager.initializeTimer();
        if (timerInitialized) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // FIXED: Chỉ load proxy info nếu connected, không gọi API nếu không cần thiết
      if (proxyConnected === "true") {
        await LocationManager.getProxyInfoIfConnectedSafeNoAPI(
          timerInitialized
        );
      }
    } catch (error) {
      console.error("AppInitializer: Error in continueInitialization:", error);
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
