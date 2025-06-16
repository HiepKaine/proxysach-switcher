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

    // NEW: Add chrome storage listener for cache sync
    if (browserAPI.storage && browserAPI.storage.onChanged) {
      browserAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "sync" && changes.cacheUpdateFlag) {
          const cacheUpdate = changes.cacheUpdateFlag.newValue;

          if (cacheUpdate && cacheUpdate.proxyInfo && cacheUpdate.timestamp) {
            const now = Date.now();
            const updateAge = now - cacheUpdate.timestamp;

            if (updateAge < 5000) {
              console.log(
                `Popup: Received cache update from ${cacheUpdate.source}`
              );
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
    // NEW: Add protection flags
    this.isProcessingExpiredTimer = false;
    this.lastExpiredProcessTime = 0;
  }

  // ENHANCED: Better sync with background
  async syncWithBackground() {
    try {
      const response = await Promise.race([
        browserAPI.runtime.sendMessage({
          greeting: "getBackgroundTimerStatus",
          data: {},
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Sync timeout")), 3000)
        )
      ]);

      if (response && response.isActive) {
        if (response.isChangingIP || response.isProtected) {
          return { status: "changing", data: response };
        }

        // Calculate accurate remaining time
        const now = Date.now();
        const timeSinceLastUpdate = Math.floor((now - response.lastUpdateTime) / 1000);
        const realRemainingTime = Math.max(0, response.remainingTime - timeSinceLastUpdate);
        
        return {
          status: "success",
          remainingTime: realRemainingTime,
          data: response,
        };
      } else {
        return { status: "inactive" };
      }
    } catch (error) {
      console.error("TimerManager: Sync with background failed:", error);
      return { status: "error" };
    }
  }

  // ENHANCED: Better countdown management
  startTimeChangeCountdownWithTime(confirmedTime) {
    // CRITICAL FIX: Prevent starting countdown if background is in protected state
    if (this.isProcessingExpiredTimer) {
      console.log("TimerManager: Cannot start countdown while processing expired timer");
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

    console.log(`TimerManager: Starting countdown with ${this.totalTimeChangeIp} seconds`);

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
        
        // CRITICAL FIX: Only trigger actual IP change when timer hits 0
        console.log("TimerManager: Timer expired, triggering IP change...");
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

  // ENHANCED: Better timer initialization
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
      console.log("TimerManager: Initializing timer, syncing with background...");
      const syncResult = await this.syncWithBackground();

      if (syncResult.status === "success" && syncResult.remainingTime > 0) {
        console.log(`TimerManager: Synced with background, starting countdown: ${syncResult.remainingTime}s`);
        this.startTimeChangeCountdownWithTime(syncResult.remainingTime + 1);
        this.isInitialized = true;
        return true;
      } else if (syncResult.status === "changing") {
        console.log("TimerManager: Background is changing IP, showing processing status");
        this.showChangingIPStatus();
        this.isInitialized = true;
        return true;
      } else if (syncResult.status === "inactive") {
        console.log("TimerManager: Background timer inactive, using default time");
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

      console.log("TimerManager: Could not initialize timer");
      this.isInitialized = true;
      return false;
    } catch (error) {
      console.error("TimerManager: Error during timer initialization:", error);
      this.isInitialized = true;
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  // ENHANCED: Better sync check to prevent conflicts
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
          )
        ]);

        if (response && response.isActive) {
          // CRITICAL FIX: If background is changing IP, don't sync countdown
          if (response.isChangingIP || response.isProtected) {
            console.log("TimerManager: Background is changing IP, pausing sync check");
            return;
          }

          const now = Date.now();
          const timeSinceLastUpdate = Math.floor((now - response.lastUpdateTime) / 1000);
          const realRemainingTime = Math.max(0, response.remainingTime - timeSinceLastUpdate);

          const timeDiff = Math.abs(this.totalTimeChangeIp - realRemainingTime);

          // CRITICAL FIX: Only sync if difference is significant and not near expiry
          if (timeDiff > 5 && this.totalTimeChangeIp > 10) {
            console.log(`TimerManager: Syncing timer: ${this.totalTimeChangeIp}s -> ${realRemainingTime}s`);
            this.totalTimeChangeIp = realRemainingTime;

            const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
            if (element) {
              element.value = `${realRemainingTime}`;
            }
          }
        }
      } catch (error) {
        // Ignore sync errors
      }
    }, 2000); // Reduce frequency to prevent conflicts
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

  // CRITICAL FIX: Enhanced timer expiry handling with background sync
  async handleTimerExpiredWithActualChange() {
    // CRITICAL FIX: Prevent double processing
    if (this.isProcessingExpiredTimer) {
      console.log("TimerManager: Already processing expired timer, skipping");
      return;
    }

    const now = Date.now();
    if (now - this.lastExpiredProcessTime < 5000) { // 5 second debounce
      console.log("TimerManager: Timer expired too recently, skipping");
      return;
    }

    this.isProcessingExpiredTimer = true;
    this.lastExpiredProcessTime = now;

    try {
      // CRITICAL FIX: Check if background is already handling auto change
      console.log("TimerManager: Checking background status before processing expired timer...");
      
      const backgroundStatus = await Promise.race([
        MessageHandler.sendToBackground("getBackgroundTimerStatus"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Background status timeout")), 2000)
        )
      ]);

      if (backgroundStatus) {
        if (backgroundStatus.isChangingIP || backgroundStatus.isProtected) {
          console.log("TimerManager: Background is already changing IP, skipping popup trigger");
          // Wait for background to complete
          await this.waitForBackgroundCompletion();
          return;
        }

        if (backgroundStatus.isActive && backgroundStatus.remainingTime > 0) {
          console.log("TimerManager: Background timer is still active, syncing instead of triggering");
          this.startTimeChangeCountdownWithTime(backgroundStatus.remainingTime);
          return;
        }
      }

      // CRITICAL FIX: Only proceed if background is not handling auto change
      console.log("TimerManager: Background is not handling auto change, proceeding with popup trigger");

      // Get current settings for the IP change
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      const proxyType = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";
      const location = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT)?.value;

      if (!apiKey) {
        console.error("TimerManager: No API key available for auto IP change");
        await this.resetToDefaultTime();
        return;
      }

      // CRITICAL FIX: Check proxy connection state
      const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      if (proxyConnected !== "true") {
        console.log("TimerManager: Proxy not connected, skipping auto change");
        await this.resetToDefaultTime();
        return;
      }

      // Create config for auto change IP
      const config = {
        apiKey: apiKey,
        isAutoChangeIP: true,
        timeAutoChangeIP: StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT) || "60",
        proxyType: proxyType,
        triggeredBy: "popup_timer_expired",
        timestamp: Date.now()
      };

      if (location) {
        config.location = location;
      }

      console.log("TimerManager: Triggering auto change IP from popup...");
      
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
        config
      );

      console.log("TimerManager: Auto change IP triggered, waiting for background response...");

    } catch (error) {
      console.error("TimerManager: Error during timer expired IP change:", error);
      await this.resetToDefaultTime();
    } finally {
      // CRITICAL FIX: Always clear processing flag
      this.isProcessingExpiredTimer = false;
    }
  }

  // NEW: Wait for background to complete auto change
  async waitForBackgroundCompletion() {
    console.log("TimerManager: Waiting for background to complete auto change...");
    
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        await this.sleep(1000);
        attempts++;

        const status = await MessageHandler.sendToBackground("getBackgroundTimerStatus");
        
        if (!status || (!status.isChangingIP && !status.isProtected)) {
          console.log("TimerManager: Background completed auto change");
          
          if (status && status.isActive && status.remainingTime > 0) {
            this.startTimeChangeCountdownWithTime(status.remainingTime);
          } else {
            await this.resetToDefaultTime();
          }
          return;
        }

        console.log(`TimerManager: Background still processing (attempt ${attempts}/${maxAttempts})`);
      } catch (error) {
        console.error("TimerManager: Error waiting for background:", error);
        break;
      }
    }

    console.warn("TimerManager: Timeout waiting for background, resetting to default time");
    await this.resetToDefaultTime();
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

  // ENHANCED: Better cleanup
  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.stopSyncCheck();
    this.markPopupInactive();
    
    // CRITICAL FIX: Clear processing flag
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

  // ENHANCED: Better reset method
  async resetToDefaultTime() {
    const defaultTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );

    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const resetTime = parseInt(defaultTime);

      console.log(`TimerManager: Resetting to default time: ${resetTime}s`);
      this.clearTimeChangeCountdown();
      
      // Small delay to ensure cleanup is complete
      await this.sleep(200);
      
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
      console.log("LocationManager: 🔍 Loading proxy info from cache...");
      const cachedProxyInfo = StorageManager.getCachedProxyInfo();

      if (cachedProxyInfo) {
        // Check for expiration
        if (cachedProxyInfo.expired) {
          console.log("LocationManager: ❌ Cached proxy info is expired");
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

        console.log("LocationManager: ✅ Displaying cached proxy info:", {
          ip: cachedProxyInfo.public_ipv4,
          location: cachedProxyInfo.location,
          hasNextChangeIP: !!(
            cachedProxyInfo.nextChangeIP && cachedProxyInfo.nextChangeIP > 0
          ),
        });

        // Display proxy info from cache
        UIManager.showProxyInfo(cachedProxyInfo, false, preserveTimer);
        ProxyManager.updateProxyUIStatus();

        // Set location dropdown
        if (cachedProxyInfo.location) {
          const locationSelect = document.getElementById(
            POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
          );
          if (locationSelect) {
            locationSelect.value = cachedProxyInfo.location;
          }
        }

        // Restore nextChangeIP timer from background
        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        console.log(
          "LocationManager: ⚠️ No cached proxy info found, showing loading..."
        );
        UIManager.showLoadingProxyInfo();

        // Try to restore timer from background
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
      console.log("LocationManager: Not connected, clearing cache");
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
        // Load từ cache thay vì chờ
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

      // Không gọi getProxyInfoIfConnected nếu có lỗi, thay vào đó dùng cache
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

          // Chỉ hiển thị lỗi, không tự động disconnect
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

        // Restore nextChangeIP from background storage
        await this.restoreNextChangeIPFromBackground();
        return;
      } else {
        const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
        const proxyType =
          StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";

        if (apiKey) {
          UIManager.showLoadingProxyInfo();
          try {
            // Sử dụng safe API call với timeout ngắn hơn
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

            // Nếu API call thất bại, không disconnect
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

            // Không disconnect khi có lỗi API
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
          timerManager.setCountDowntime(remainingSeconds + 1);
          timerManager.startCountDown();
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
          timeChangeInput.value = "60"; // Default 60 seconds
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

  static async handleSuccessfulConnection(proxyData, preserveTimer = false) {
    if (!preserveTimer) {
      timerManager.forceStopAll();
    } else {
      timerManager.clearNextTimeChangeOnly();
    }

    const currentTime = Math.floor(Date.now() / 1000);

    if (proxyData.expired && currentTime >= proxyData.expired) {
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

    if (proxyData.proxyTimeout && currentTime >= proxyData.proxyTimeout) {
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

      if (!cacheUpdateSuccess) {
        console.warn(
          "Popup: Failed to update proxy cache, but continuing with UI update"
        );
      }

      UIManager.showProxyInfo(proxyData, false, preserveTimer);
      await this.updateProxyUIStatus();

      // ENHANCED: Check if this is from a cache update flag
      if (proxyData.updateCache || proxyData.cacheSource) {
        console.log(
          `Popup: Cache updated from ${
            proxyData.cacheSource || "unknown source"
          }`
        );
        StorageManager.setCachedProxyInfo(proxyData);

        try {
          await browserAPI.storage.sync.set({ tx_proxy: proxyData });
        } catch (error) {
          console.error("Popup: Error updating chrome storage sync:", error);
        }
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
      // Kiểm tra xem background có đang chạy auto change không
      const backgroundStatus = await MessageHandler.sendToBackground(
        "getBackgroundTimerStatus"
      );

      if (backgroundStatus && backgroundStatus.isActive) {
        // Background đang chạy auto change

        // Lấy nextChangeIP từ background storage hoặc API response
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
    } catch (error) {
      console.error(
        "Popup: Error syncing nextChangeIP with background:",
        error
      );
    }
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

      console.log(`Popup: Successfully updated proxy cache from ${source}`);
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

        console.log("Popup: Successfully refreshed cache from chrome storage");
        return true;
      }
    } catch (error) {
      console.error("Popup: Error forcing cache refresh:", error);
    }

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
        console.log("AppInitializer: Already initializing, skipping duplicate call");
        return;
      }

      this.isInitializing = true;
      
      // CRITICAL FIX: Stop all timers and clear states first
      timerManager.forceStopAll();
      UIManager.setNotConnectedStatus();

      console.log("AppInitializer: 🚀 Starting popup initialization...");

      // CRITICAL: Check and apply cache updates FIRST
      const cacheUpdated = await this.checkAndApplyPendingCacheUpdates();
      if (cacheUpdated) {
        console.log("AppInitializer: ✅ Cache was updated from background");
      }

      // CRITICAL FIX: Check background status and handle accordingly
      const backgroundStatus = await this.checkBackgroundStatus();
      
      if (backgroundStatus.status === "error") {
        console.error("AppInitializer: Background connection failed");
        this.showBackgroundError();
        return;
      }

      if (backgroundStatus.status === "protected") {
        console.log("AppInitializer: Background is in protected state");
        await this.handleProtectedState(backgroundStatus.data);
        return;
      }

      if (backgroundStatus.status === "changing") {
        console.log("AppInitializer: Background is changing IP");
        await this.handleChangingState(backgroundStatus.data);
        return;
      }

      // CRITICAL FIX: Continue with normal initialization
      await this.continueInitialization(backgroundStatus.data);

    } catch (error) {
      console.error("AppInitializer: Initialization error:", error);
      this.showInitializationError();
    } finally {
      this.isInitializing = false;
    }
  }

  // NEW: Enhanced background status checking
  static async checkBackgroundStatus() {
    try {
      console.log("AppInitializer: Checking background connection...");
      
      // First, check if background is responding
      const pingResponse = await Promise.race([
        MessageHandler.sendToBackground("ping"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Ping timeout")), 3000)
        )
      ]);

      if (!pingResponse || !pingResponse.pong) {
        return { status: "error", reason: "No ping response" };
      }

      // Then check background timer status
      const statusResponse = await Promise.race([
        MessageHandler.sendToBackground("getBackgroundTimerStatus"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Status timeout")), 3000)
        )
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
      console.error("AppInitializer: Background status check failed:", error);
      return { status: "error", reason: error.message };
    }
  }

  // NEW: Handle protected state
  static async handleProtectedState(backgroundData) {
    console.log("AppInitializer: Handling protected state...");
    
    UIManager.showProcessingNewIpConnectProtected();
    
    // Wait for background to complete
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        const status = await MessageHandler.sendToBackground("getBackgroundTimerStatus");
        
        if (!status || (!status.isChangingIP && !status.isProtected)) {
          console.log("AppInitializer: Background completed protected operation");
          await this.continueInitialization(status);
          return;
        }

        console.log(`AppInitializer: Waiting for background (${attempts}/${maxAttempts})`);
      } catch (error) {
        console.error("AppInitializer: Error checking background status:", error);
        break;
      }
    }

    console.warn("AppInitializer: Timeout waiting for background, continuing with initialization");
    await this.continueInitialization();
  }

  // NEW: Handle changing state
  static async handleChangingState(backgroundData) {
    console.log("AppInitializer: Handling changing IP state...");
    
    UIManager.showProcessingNewIpConnect();
    
    // Similar to protected state but with different UI
    let attempts = 0;
    const maxAttempts = 60; // Longer timeout for IP changes

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        const status = await MessageHandler.sendToBackground("getBackgroundTimerStatus");
        
        if (!status || !status.isChangingIP) {
          console.log("AppInitializer: Background completed IP change");
          await this.continueInitialization(status);
          return;
        }

        console.log(`AppInitializer: Waiting for IP change (${attempts}/${maxAttempts})`);
      } catch (error) {
        console.error("AppInitializer: Error checking IP change status:", error);
        break;
      }
    }

    console.warn("AppInitializer: Timeout waiting for IP change, continuing with initialization");
    await this.continueInitialization();
  }

  // ENHANCED: Better initialization continuation
  static async continueInitialization(backgroundData = null) {
    try {
      console.log("AppInitializer: Continuing with normal initialization...");

      // Load locations from cache or API
      await LocationManager.loadLocations();

      // Load stored settings
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();
      }

      // Initialize change IP manager
      ChangeIPManager.init();

      // Small delay to ensure UI is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check connection state and handle accordingly
      const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);

      let timerInitialized = false;

      // CRITICAL FIX: Only initialize timer if conditions are right
      if (proxyConnected === "true" && 
          JSON.parse(isAutoChangeIP) && 
          ChangeIPManager.isChangeIPAllowed()) {
        
        // CRITICAL FIX: Check if background timer is active first
        if (backgroundData && backgroundData.isActive) {
          console.log("AppInitializer: Background timer is active, syncing...");
          
          const now = Date.now();
          const timeSinceLastUpdate = Math.floor((now - backgroundData.lastUpdateTime) / 1000);
          const realRemainingTime = Math.max(0, backgroundData.remainingTime - timeSinceLastUpdate);

          if (realRemainingTime > 0) {
            timerInitialized = timerManager.startTimeChangeCountdownWithTime(realRemainingTime);
          } else {
            timerInitialized = await timerManager.initializeTimer();
          }
        } else {
          timerInitialized = await timerManager.initializeTimer();
        }

        if (timerInitialized) {
          console.log("AppInitializer: Timer initialized successfully");
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Load proxy info if connected
      if (proxyConnected === "true") {
        console.log("AppInitializer: Loading proxy information...");
        await LocationManager.getProxyInfoIfConnectedSafeNoAPI(timerInitialized);
      } else {
        console.log("AppInitializer: Not connected, skipping proxy info load");
      }

      console.log("AppInitializer: ✅ Initialization completed successfully");

    } catch (error) {
      console.error("AppInitializer: Error in continueInitialization:", error);
      this.showInitializationError();
    }
  }

  // ENHANCED: Better cache update checking
  static async checkAndApplyPendingCacheUpdates() {
    try {
      console.log("AppInitializer: 🔍 Checking for pending cache updates...");

      // Check chrome.storage.sync for pending updates
      const result = await browserAPI.storage.sync.get([
        "cacheUpdateFlag",
        "tx_proxy",
      ]);

      if (result.cacheUpdateFlag && result.cacheUpdateFlag.needsLocalStorageUpdate) {
        const updateAge = Date.now() - result.cacheUpdateFlag.timestamp;

        // Apply if update is recent (within 5 minutes)
        if (updateAge < 300000) {
          console.log(`AppInitializer: 🎯 Found pending cache update from ${result.cacheUpdateFlag.source}`);
          console.log(
            `AppInitializer: Update age: ${Math.round(updateAge / 1000)}s, reason: ${
              result.cacheUpdateFlag.reason || "N/A"
            }`
          );

          // Update localStorage cache immediately
          StorageManager.setCachedProxyInfo(result.cacheUpdateFlag.proxyInfo);

          // Clear the needsLocalStorageUpdate flag
          await browserAPI.storage.sync.set({
            cacheUpdateFlag: {
              ...result.cacheUpdateFlag,
              needsLocalStorageUpdate: false,
              appliedAt: Date.now(),
              appliedBy: "popup_initialization",
            },
          });

          console.log("AppInitializer: ✅ Applied pending cache update to localStorage");
          return true;
        } else {
          console.log(`AppInitializer: Cache update too old (${Math.round(updateAge / 1000)}s), skipping`);
        }
      }

      // Fallback checks for other cache sources
      const fallbackResult = await this.checkFallbackCacheSources(result);
      return fallbackResult;

    } catch (error) {
      console.error("AppInitializer: ❌ Error checking pending cache updates:", error);
      return false;
    }
  }

  // NEW: Check fallback cache sources
  static async checkFallbackCacheSources(syncResult) {
    try {
      // Check chrome.storage.local for cached info
      const localResult = await browserAPI.storage.local.get(["cachedProxyInfo"]);
      
      if (localResult.cachedProxyInfo && localResult.cachedProxyInfo.proxyInfo) {
        const localCache = StorageManager.getCachedProxyInfo();
        const localTimestamp = localResult.cachedProxyInfo.timestamp || 0;
        const currentTimestamp = localCache && localCache.timestamp ? localCache.timestamp : 0;

        if (localTimestamp > currentTimestamp) {
          console.log("AppInitializer: 🔄 Found newer cache in chrome.storage.local");
          StorageManager.setCachedProxyInfo(localResult.cachedProxyInfo.proxyInfo);
          return true;
        }
      }

      // Last fallback: Check tx_proxy directly
      if (syncResult.tx_proxy) {
        const currentCache = StorageManager.getCachedProxyInfo();
        if (!currentCache) {
          console.log("AppInitializer: 🔄 Using tx_proxy as fallback cache");
          StorageManager.setCachedProxyInfo(syncResult.tx_proxy);
          return true;
        }
      }

      console.log("AppInitializer: No pending cache updates found");
      return false;
    } catch (error) {
      console.error("AppInitializer: Error checking fallback cache sources:", error);
      return false;
    }
  }

  // NEW: Show background error
  static showBackgroundError() {
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    if (statusElement) {
      statusElement.innerText = "• Extension lỗi kết nối, vui lòng thử lại";
      statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    }
    
    // Disable buttons
    UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
  }

  // NEW: Show initialization error
  static showInitializationError() {
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
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