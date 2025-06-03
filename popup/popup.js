// Browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Constants
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
  },
};

/**
 * Storage Manager - Handles localStorage operations
 */
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
}

/**
 * Chrome Storage Manager - Handles browserAPI.storage operations
 */
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

/**
 * Message Handler - Handles communication with background script
 */
class MessageHandler {
  static async sendToBackground(message, data = {}) {
    try {
      return await browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
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
          UIManager.showProcessingNewIpConnect();
          break;
        case POPUP_CONFIG.MESSAGES.FAILURE_GET_PROXY_INFO:
          UIManager.showError(request);
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_PROXY_INFO:
          ProxyManager.handleSuccessfulConnection(request.data);
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
}

/**
 * FIXED Timer Manager - Better coordination with background
 */
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
    this.syncCheckInterval = null; // FIXED: Regular sync check
  }

  // FIXED: Enhanced sync with background - more robust and frequent
  async syncWithBackground() {
    try {
      console.log("TimerManager: Syncing with background...");
      
      // Request status from background
      const response = await browserAPI.runtime.sendMessage({
        greeting: "getBackgroundTimerStatus",
        data: {},
      });

      if (response && response.isActive) {
        console.log("TimerManager: Background timer is active", response);
        
        // FIXED: Check if background is currently changing IP
        if (response.isChangingIP) {
          console.log("TimerManager: Background is changing IP, waiting...");
          this.showChangingIPStatus();
          return false;
        }

        // FIXED: Calculate real-time remaining time
        const now = Date.now();
        const timeSinceLastUpdate = Math.floor((now - response.lastUpdateTime) / 1000);
        const realRemainingTime = Math.max(0, response.remainingTime - timeSinceLastUpdate);

        console.log(`TimerManager: Syncing with background time: ${realRemainingTime}s (background: ${response.remainingTime}s, elapsed: ${timeSinceLastUpdate}s)`);

        // FIXED: Update with real-time calculation
        this.totalTimeChangeIp = realRemainingTime;

        const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
        if (element) {
          element.value = `${realRemainingTime}`;
        }

        // FIXED: Update storage with synced time
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, realRemainingTime);

        // Clear any existing timer
        this.clearTimeChangeCountdown();

        if (realRemainingTime > 0) {
          // Start countdown with synced time
          this.isRestoringTimer = true;
          this.startTimeChangeCountdown();
          
          // FIXED: Start regular sync checks
          this.startSyncCheck();
        } else {
          // Timer has expired, wait for background to handle
          console.log("TimerManager: Timer expired, waiting for background to handle");
          return await this.resetToDefaultTime();
        }

        return true;
      } else {
        console.log("TimerManager: No active background timer");
        return false;
      }
    } catch (error) {
      console.error("TimerManager: Error syncing with background", error);
      return false;
    }
  }

  // FIXED: Start regular sync checks to maintain synchronization
  startSyncCheck() {
    // Clear any existing sync check
    this.stopSyncCheck();

    // FIXED: Check sync every 5 seconds
    this.syncCheckInterval = setInterval(async () => {
      if (!this.isPopupControlling) return;

      try {
        const response = await browserAPI.runtime.sendMessage({
          greeting: "getBackgroundTimerStatus",
          data: {},
        });

        if (response && response.isActive) {
          // FIXED: Check if times are significantly out of sync
          const now = Date.now();
          const timeSinceLastUpdate = Math.floor((now - response.lastUpdateTime) / 1000);
          const realRemainingTime = Math.max(0, response.remainingTime - timeSinceLastUpdate);
          
          const timeDiff = Math.abs(this.totalTimeChangeIp - realRemainingTime);
          
          if (timeDiff > 2) { // If difference is more than 2 seconds
            console.log(`TimerManager: Timer drift detected (${timeDiff}s), resyncing`);
            await this.syncWithBackground();
          }
        }
      } catch (error) {
        console.error("TimerManager: Sync check failed", error);
      }
    }, 5000);
  }

  // FIXED: Stop sync checks
  stopSyncCheck() {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
    }
  }

  // FIXED: Show changing IP status
  showChangingIPStatus() {
    const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
    if (element) {
      element.value = "Changing...";
    }
  }

  // FIXED: Enhanced timer startup with better sync
  startTimeChangeCountdown() {
    this.clearTimeChangeCountdown();

    if (!this.totalTimeChangeIp) return;

    console.log(`TimerManager: Starting countdown with ${this.totalTimeChangeIp}s`);
    this.isPopupControlling = true;

    // FIXED: Start sync checks when timer starts
    this.startSyncCheck();

    this.timeChangeIP = setInterval(async () => {
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (!element) {
        this.clearTimeChangeCountdown();
        return;
      }

      element.value = `${this.totalTimeChangeIp}`;
      this.totalTimeChangeIp--;
      this.lastUpdateTime = Date.now();

      // Update popup activity
      this.updatePopupActivity();

      // FIXED: When timer reaches 0, handle gracefully
      if (this.totalTimeChangeIp < 0) {
        console.log("TimerManager: Timer expired, handling auto change cycle");
        
        // Clear current timer
        this.clearTimeChangeCountdown();
        
        // Show changing status
        this.showChangingIPStatus();
        
        // FIXED: Wait for background to handle the change, then reset
        await this.handleTimerExpiredWithWait();
        
        return;
      }

      // Update localStorage
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      if (isAutoChangeIP) {
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, this.totalTimeChangeIp);
      }
    }, 1000);
  }

  // FIXED: Handle timer expiration with proper waiting
  async handleTimerExpiredWithWait() {
    try {
      // Step 1: Wait for background to complete IP change
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max wait
      
      while (attempts < maxAttempts) {
        await this.sleep(1000);
        attempts++;
        
        try {
          const response = await browserAPI.runtime.sendMessage({
            greeting: "getBackgroundTimerStatus",
            data: {},
          });
          
          // FIXED: Check if background has reset the timer (new cycle started)
          if (response && response.isActive && response.remainingTime > 0 && response.remainingTime < response.originalDuration) {
            console.log("TimerManager: Background has started new cycle, syncing");
            await this.syncWithBackground();
            return;
          }
        } catch (error) {
          console.error("TimerManager: Error checking background status", error);
        }
      }
      
      // Step 2: If background didn't reset, do it ourselves
      console.log("TimerManager: Background didn't reset, resetting locally");
      await this.resetToDefaultTime();
      
    } catch (error) {
      console.error("TimerManager: Error handling timer expiration", error);
      await this.resetToDefaultTime();
    }
  }

  // FIXED: Enhanced restore with better sync logic
  async restoreTimerFromStorage() {
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    if (!JSON.parse(isAutoChangeIP)) {
      return false;
    }

    console.log("TimerManager: Restoring timer from storage...");
    
    // FIXED: Always try to sync with background first
    const synced = await this.syncWithBackground();
    if (synced) {
      console.log("TimerManager: Successfully synced with background");
      return true;
    }

    // FIXED: If sync fails, try localStorage but with validation
    console.log("TimerManager: Background sync failed, checking localStorage...");
    const savedTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

    // FIXED: Only use saved time if it's reasonable (not too old)
    if (savedTime && parseInt(savedTime) > 0 && parseInt(savedTime) <= parseInt(defaultTime || 3600)) {
      console.log(`TimerManager: Using saved time: ${savedTime}s`);
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = parseInt(savedTime);
      this.isRestoringTimer = true;
      this.startTimeChangeCountdown();
      return true;
    } else if (defaultTime) {
      console.log(`TimerManager: Using default time: ${defaultTime}s`);
      const freshTime = parseInt(defaultTime);
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = freshTime;
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, freshTime);
      this.isRestoringTimer = false;
      this.startTimeChangeCountdown();
      return true;
    }

    console.log("TimerManager: No valid time found for restore");
    return false;
  }

  // FIXED: Enhanced clear method
  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    // FIXED: Stop sync checks when clearing
    this.stopSyncCheck();
    
    // Mark popup as inactive
    this.markPopupInactive();
  }

  // FIXED: Enhanced clear all method
  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.stopSyncCheck(); // FIXED: Stop sync checks
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.markPopupInactive();
  }

  // FIXED: Enhanced force stop
  forceStopAll() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }

    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.stopSyncCheck(); // FIXED: Stop sync checks

    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.lastUpdateTime = 0;
    this.lastNotificationTime = 0;

    this.markPopupInactive();
  }

  // Rest of the methods remain the same...
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
    } catch (error) {
      console.error("Error updating popup activity:", error);
    }
  }

  markPopupInactive() {
    this.isPopupControlling = false;
    try {
      browserAPI.storage.local.set({
        popupTimerActive: false,
        popupLastUpdate: Date.now(),
        popupControlling: false,
      });
    } catch (error) {
      console.error("Error marking popup inactive:", error);
    }
  }

  async resetToDefaultTime() {
    const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);

    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const resetTime = parseInt(defaultTime);

      console.log(`TimerManager: Resetting to default time: ${resetTime}s`);

      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = resetTime;

      // Update storage
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, resetTime);

      // Update display
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (element) {
        element.value = `${resetTime}`;
      }

      // Start fresh timer
      this.isRestoringTimer = false;
      this.startTimeChangeCountdown();

      return true;
    }

    return false;
  }

  startCountDown() {
    this.clearCountDown();

    if (!this.countDowntime) return;

    this.nextTimeChange = setInterval(() => {
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME);
      if (!element) {
        this.clearCountDown();
        return;
      }

      element.innerText = `${this.countDowntime} s`;
      this.countDowntime--;

      if (this.countDowntime < 0) {
        element.innerText = "0 s";
        this.clearCountDown();
        return;
      }
    }, 1000);
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

  setTotalTimeChangeIp(time) {
    this.totalTimeChangeIp = parseInt(time) || 0;
  }

  resetAutoChangeTimer() {
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const timeValue = parseInt(defaultTime);

      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = timeValue;

      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (element) {
        element.value = `${timeValue}`;
      }

      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, timeValue);
      this.updatePopupActivity();
    }
  }

  getStatus() {
    return {
      countDowntime: this.countDowntime,
      totalTimeChangeIp: this.totalTimeChangeIp,
      autoChangeInterval: this.autoChangeInterval,
      isCountDownRunning: !!this.nextTimeChange,
      isTimeChangeRunning: !!this.timeChangeIP,
      isRestoringTimer: this.isRestoringTimer,
      isPopupControlling: this.isPopupControlling,
      lastUpdateTime: this.lastUpdateTime,
      lastNotificationTime: this.lastNotificationTime,
      hasSyncCheck: !!this.syncCheckInterval,
    };
  }

  async notifyPopupClosing() {
    try {
      await browserAPI.runtime.sendMessage({
        greeting: "popupClosed",
        data: { timestamp: Date.now() },
      });
      console.log("Background notified of popup closing");
    } catch (error) {
      console.error("Error notifying background of popup closing:", error);
    }
  }
}

/**
 * FIXED Location Manager - Call getCurrentProxy with debouncing
 */
class LocationManager {
  static handleLocationsSuccess(locations) {
    const selectElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
    );

    // Clear existing options
    while (selectElement.hasChildNodes()) {
      selectElement.removeChild(selectElement.firstChild);
    }

    // Add new options
    if (locations) {
      locations.forEach((location) => {
        const option = document.createElement("option");
        option.textContent = location.name;
        option.value = location.code;
        selectElement.appendChild(option);
      });
    }

    this.initializeUI();
  }

  // FIXED: Prevent multiple getCurrentProxy calls
  static async initializeUI() {
    // FIXED: Check if we're already initializing
    if (this.isInitializing) {
      console.log("Already initializing UI, skipping");
      return;
    }

    this.isInitializing = true;

    try {
      const proxyConnected = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
      );

      if (proxyConnected === "true") {
        // Show loading state
        UIManager.showLoadingProxyInfo();

        // Get current proxy info from API instead of localStorage
        const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
        const proxyType =
          StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";

        if (apiKey) {
          try {
            // FIXED: Add small delay to prevent rapid calls during popup reopen
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Call getCurrentProxy to get fresh data from API
            await MessageHandler.sendToBackground(
              POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
              {
                apiKey: apiKey,
                proxyType: proxyType,
              }
            );
          } catch (error) {
            console.error("Error getting current proxy:", error);
            UIManager.setNotConnectedStatus();
            StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
          }
        } else {
          // No API key, set as not connected
          UIManager.setNotConnectedStatus();
          StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
        }
      } else {
        // Ensure status shows "not connected"
        UIManager.setNotConnectedStatus();
      }
    } finally {
      this.isInitializing = false;
    }
  }
}

/**
 * UI Manager - Handles UI updates and interactions
 */
class UIManager {
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

  // FIXED: Add loading state for proxy info
  static showLoadingProxyInfo() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.LOADING_PROXY_INFO;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProxyInfo(proxyInfo, isStart = false) {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV4).innerText =
      proxyInfo.public_ipv4;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV6).innerText =
      proxyInfo.public_ipv6;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIMEOUT).innerText =
      proxyInfo.proxyTimeout;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText = "-";
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

    // Initialize timers
    timerManager.setCountDowntime(proxyInfo.nextChangeIP || 0);
    const timeAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP
    );
    const timeAutoChangeIPDefault = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );

    timerManager.setTotalTimeChangeIp(
      Number(timeAutoChangeIP || timeAutoChangeIPDefault || 0)
    );

    // Start countdown timer
    if (proxyInfo.nextChangeIP > 0) {
      timerManager.startCountDown();
    }

    // Start auto change timer if enabled
    if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
      timerManager.startTimeChangeCountdown();
    }
  }

  static showError(messageData) {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.innerText = `• ${messageData.data.error}`;
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
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText = "";
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

    // Hide IP info panel
    const ipInfoElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IP_INFO
    );
    if (ipInfoElement) {
      ipInfoElement.style.display = "none";
    }

    // Enable connect button, disable disconnect button
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

/**
 * Form Manager - Handles form data and validation
 */
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
    const timeAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP
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

    if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
      document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
      ).checked = true;
      const timeValue = Number(timeAutoChangeIP || timeAutoChangeIPDefault);
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value =
        timeValue;
      timerManager.setTotalTimeChangeIp(timeValue);
    }
  }

  static saveSettings(formData) {
    if (formData.isAutoChangeIP) {
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

/**
 * Proxy Manager - Handles proxy operations
 */
class ProxyManager {
  static async handleClick() {
    const formData = FormManager.getFormData();

    if (!FormManager.validateApiKey(formData.apiKey)) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS).innerText =
        POPUP_CONFIG.MESSAGES_TEXT.INVALID_KEY;
      return;
    }

    FormManager.saveSettings(formData);

    const config = {
      apiKey: formData.apiKey,
      isAutoChangeIP: formData.isAutoChangeIP,
      timeAutoChangeIP: formData.timeAutoChangeIP,
      proxyType: formData.proxyType,
    };

    if (formData.location) {
      config.location = formData.location;
    }

    if (formData.isAutoChangeIP) {
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP,
        config
      );
    } else if (formData.changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE) {
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
  }

  static handleSuccessfulConnection(proxyData) {
    // Force clear all existing timers first
    timerManager.forceStopAll();

    // Small delay to ensure cleanup
    setTimeout(() => {
      ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY, proxyData);
      UIManager.showProxyInfo(proxyData);
      this.updateProxyUIStatus();

      // Store proxy info
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, proxyData);

      // Always reset auto change timer to default after successful IP change
      const isAutoChangeIP = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
      );
      const timeAutoChangeIPDefault = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
      );

      if (JSON.parse(isAutoChangeIP) && timeAutoChangeIPDefault) {
        const defaultTime = Number(timeAutoChangeIPDefault);

        // Reset to default time - fresh start for new IP
        StorageManager.set(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
          defaultTime
        );
        timerManager.setTotalTimeChangeIp(defaultTime);

        // Update display
        const element = document.getElementById(
          POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
        );
        if (element) {
          element.value = `${defaultTime}`;
        }

        // Start fresh countdown with default time
        timerManager.isRestoringTimer = false; // Fresh start, not restore
        timerManager.startTimeChangeCountdown();
      }
    }, 100);
  }

  static handleInfoKeySuccess(data) {
    this.handleClick();
  }

  static updateProxyUIStatus() {
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED, "true");
  }

  static directProxy() {
    timerManager.forceStopAll();

    // Remove all proxy-related storage
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);

    // Clear all auto change IP settings to prevent auto-trigger on popup reopen
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    StorageManager.remove(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    // Also clear the checkbox state in UI
    const autoChangeCheckbox = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
    );
    if (autoChangeCheckbox) {
      autoChangeCheckbox.checked = false;
    }
  }

  static async disconnect() {
    const proxyInfo = await ChromeStorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TX_PROXY
    );
    const config = {
      apiKey: proxyInfo?.apiKey || "",
      isAutoChangeIP: false,
      timeAutoChangeIP: document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
      ).value,
    };

    await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);

    UIManager.clearPopupPage();
    this.directProxy();

    await MessageHandler.sendToBackground(
      POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL,
      config
    );
  }
}

/**
 * Event Manager - Handles DOM events
 */
class EventManager {
  static setupEventListeners() {
    // Connect button
    document
      .getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT)
      .addEventListener("click", async () => {
        UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
        UIManager.clearPopupPage();
        timerManager.forceStopAll();
        await ProxyManager.handleClick();
      });

    // Disconnect button
    document
      .getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT)
      .addEventListener("click", async () => {
        await ProxyManager.disconnect();
      });
  }
}

/**
 * FIXED App Initializer - Better coordination on popup open
 */
class AppInitializer {
  static async initialize() {
    try {
      // FIXED: Prevent multiple initializations
      if (this.isInitializing) {
        console.log("Already initializing, skipping");
        return;
      }

      this.isInitializing = true;

      // Force clear all timers on initialization
      timerManager.forceStopAll();

      // Set proper initial "not connected" status
      UIManager.setNotConnectedStatus();

      // Get locations data
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA
      );

      // Load stored settings if API key exists
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();

        // FIXED: Better timer restoration với logic ưu tiên background
        const isAutoChangeIP = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
        );
        const proxyConnected = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
        );

        if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
          console.log("Auto change IP is enabled, attempting timer restore...");

          // FIXED: Đợi một chút để background script sẵn sàng
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Try to restore timer (sẽ tự động sync với background)
          const restored = await timerManager.restoreTimerFromStorage();
          if (restored) {
            console.log("Timer restoration successful");
          } else {
            console.log("Timer restoration failed");
          }
        }
      }
    } catch (error) {
      console.error("Error initializing popup:", error);
    } finally {
      this.isInitializing = false;
    }
  }
}

// Initialize global instances
const timerManager = new TimerManager();

// Debug tools
window.debugTimer = {
  getStatus: () => timerManager.getStatus(),
  resetToDefault: () => timerManager.resetToDefaultTime(),
  restore: () => timerManager.restoreTimerFromStorage(),
  forceStop: () => timerManager.forceStopAll(),
  manager: timerManager,
};

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

// FIXED: Add visibility change handler
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    // Popup is hidden (user switched tabs or minimized)
    console.log("Popup hidden, stopping sync checks");
    timerManager.stopSyncCheck();
    await timerManager.notifyPopupClosing();
  } else {
    // Popup is visible again
    console.log("Popup visible, resyncing with background");
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);

    if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
      // FIXED: Force resync when popup becomes visible
      setTimeout(async () => {
        await timerManager.syncWithBackground();
      }, 500);
    }
  }
});

// Setup message listener
MessageHandler.setupMessageListener();

// Setup event listeners
EventManager.setupEventListeners();

// Initialize app
AppInitializer.initialize();

window.debugTimer = {
  // Enhanced sync test
  async testSync() {
    console.log("🔄 Testing sync...");
    
    const backgroundStatus = await this.getBackgroundStatus();
    const popupStatus = timerManager.getStatus();
    
    console.log("📊 Background status:", backgroundStatus);
    console.log("📊 Popup status:", popupStatus);
    
    if (backgroundStatus && backgroundStatus.isActive) {
      console.log("🔄 Forcing sync...");
      const synced = await timerManager.syncWithBackground();
      console.log("Sync result:", synced ? "✅ Success" : "❌ Failed");
      
      // Check sync accuracy
      setTimeout(async () => {
        const newStatus = await this.getBackgroundStatus();
        const newPopupStatus = timerManager.getStatus();
        const timeDiff = Math.abs(newStatus.remainingTime - newPopupStatus.totalTimeChangeIp);
        console.log(`⏰ Time difference after sync: ${timeDiff}s`);
      }, 2000);
    }
  },

  // Test background connection
  async testBackground() {
    try {
      const response = await browserAPI.runtime.sendMessage({
        greeting: "ping",
        data: {}
      });
      console.log("✅ Background connection:", response);
      return response;
    } catch (error) {
      console.error("❌ Background connection failed:", error);
      return null;
    }
  },

  // Get background timer status
  async getBackgroundStatus() {
    try {
      const response = await browserAPI.runtime.sendMessage({
        greeting: "getBackgroundTimerStatus",
        data: {}
      });
      console.log("📊 Background timer status:", response);
      return response;
    } catch (error) {
      console.error("❌ Failed to get background status:", error);
      return null;
    }
  },

  // Get popup timer status
  getPopupTimerStatus() {
    const status = timerManager.getStatus();
    console.log("⏰ Popup timer status:", status);
    return status;
  },

  // Test complete sync flow
  async testCompleteSync() {
    console.log("🚀 Testing complete sync flow...");
    
    // Test background connection
    await this.testBackground();
    
    // Get initial status
    const backgroundStatus = await this.getBackgroundStatus();
    const popupStatus = this.getPopupTimerStatus();
    
    console.log("Before sync - Background:", backgroundStatus?.remainingTime, "Popup:", popupStatus.totalTimeChangeIp);
    
    // Force sync
    await this.testSync();
    
    // Check final status
    setTimeout(async () => {
      const finalBackgroundStatus = await this.getBackgroundStatus();
      const finalPopupStatus = this.getPopupTimerStatus();
      
      console.log("After sync - Background:", finalBackgroundStatus?.remainingTime, "Popup:", finalPopupStatus.totalTimeChangeIp);
      
      const timeDiff = Math.abs(finalBackgroundStatus?.remainingTime - finalPopupStatus.totalTimeChangeIp);
      console.log(`✨ Final time difference: ${timeDiff}s`);
      
      if (timeDiff <= 1) {
        console.log("🎉 Sync test PASSED!");
      } else {
        console.log("❌ Sync test FAILED - times not synchronized");
      }
    }, 3000);
  },

  manager: timerManager
};
