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
    // FIXED: Add coordination flags
    this.isPopupControlling = false;
    this.lastNotificationTime = 0;
    this.notificationDebounceTime = 2000; // 2 seconds debounce
  }

  // Basic countdown timer for nextChangeIP display
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

  // FIXED: Auto change timer with better background coordination
  startTimeChangeCountdown() {
    this.clearTimeChangeCountdown();

    if (!this.totalTimeChangeIp) return;

    console.log(`Popup timer started: ${this.totalTimeChangeIp}s`);
    this.isPopupControlling = true;

    this.timeChangeIP = setInterval(async () => {
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (!element) {
        this.clearTimeChangeCountdown();
        return;
      }

      element.value = `${this.totalTimeChangeIp}`;
      this.totalTimeChangeIp--;
      this.lastUpdateTime = Date.now();

      // Update popup activity in storage for background sync
      this.updatePopupActivity();

      // When timer reaches 0, notify background with debouncing
      if (this.totalTimeChangeIp < 0) {
        console.log("Popup timer expired, notifying background");
        this.clearTimeChangeCountdown();
        
        // Mark popup as inactive
        this.markPopupInactive();
        
        // FIXED: Debounced notification to background
        await this.notifyBackgroundTimerExpiredDebounced();
        
        return;
      }

      // Update localStorage
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      if (isAutoChangeIP) {
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, this.totalTimeChangeIp);
      }
    }, 1000);
  }

  // FIXED: Debounced notification to prevent rapid calls
  async notifyBackgroundTimerExpiredDebounced() {
    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;
    
    if (timeSinceLastNotification < this.notificationDebounceTime) {
      console.log("Popup: Debouncing timer expired notification");
      return;
    }
    
    this.lastNotificationTime = now;
    
    try {
      const response = await browserAPI.runtime.sendMessage({
        greeting: "popupTimerExpired",
        data: { timestamp: now }
      });
      console.log("Background notified of timer expiration:", response);
    } catch (error) {
      console.error("Error notifying background:", error);
      // Fallback: set storage flag for background to check
      try {
        await browserAPI.storage.local.set({
          timerExpiredFlag: true,
          timerExpiredTime: now
        });
      } catch (storageError) {
        console.error("Error setting timer expired flag:", storageError);
      }
    }
  }

  // Update popup activity for background sync
  updatePopupActivity() {
    try {
      browserAPI.storage.local.set({
        popupTimerActive: true,
        popupLastUpdate: Date.now(),
        popupTimerValue: this.totalTimeChangeIp,
        popupControlling: this.isPopupControlling
      });
    } catch (error) {
      console.error("Error updating popup activity:", error);
    }
  }

  // Mark popup as inactive
  markPopupInactive() {
    this.isPopupControlling = false;
    try {
      browserAPI.storage.local.set({
        popupTimerActive: false,
        popupLastUpdate: Date.now(),
        popupControlling: false
      });
    } catch (error) {
      console.error("Error marking popup inactive:", error);
    }
  }

  // FIXED: Improved sync with background timer
  async syncWithBackground() {
    try {
      // Request status from background
      const response = await browserAPI.runtime.sendMessage({
        greeting: "getBackgroundTimerStatus",
        data: {}
      });

      if (response && response.remainingTime > 0) {
        // FIXED: Check if background is currently changing IP
        if (response.isChangingIP) {
          console.log("Background is changing IP, waiting...");
          return false;
        }

        console.log(`Syncing with background: ${response.remainingTime}s remaining`);
        
        this.totalTimeChangeIp = response.remainingTime;
        
        const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
        if (element) {
          element.value = `${response.remainingTime}`;
        }

        // Update storage
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, response.remainingTime);
        
        // Start countdown with synced time
        this.isRestoringTimer = true;
        this.startTimeChangeCountdown();
        
        return true;
      }
    } catch (error) {
      console.error("Error syncing with background:", error);
    }
    
    return false;
  }

  // FIXED: Restore timer with better background coordination
  async restoreTimerFromStorage() {
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    if (!JSON.parse(isAutoChangeIP)) {
      return false;
    }

    // First try to sync with background
    const synced = await this.syncWithBackground();
    if (synced) {
      return true;
    }

    // Fallback to localStorage if background sync fails
    const savedTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

    if (savedTime && parseInt(savedTime) > 0) {
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = parseInt(savedTime);
      this.isRestoringTimer = true;
      this.startTimeChangeCountdown();
      return true;
    } else if (defaultTime) {
      const freshTime = parseInt(defaultTime);
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = freshTime;
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, freshTime);
      this.isRestoringTimer = false;
      this.startTimeChangeCountdown();
      return true;
    }

    return false;
  }

  // Reset auto change timer to default value (called externally)
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
      
      // Update popup activity
      this.updatePopupActivity();
    }
  }

  // Clear functions
  clearCountDown() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }
  }

  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }
    
    // Mark popup as inactive when clearing timer
    this.markPopupInactive();
  }

  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.markPopupInactive();
  }

  // Setters
  setCountDowntime(time) {
    this.countDowntime = parseInt(time) || 0;
  }

  setTotalTimeChangeIp(time) {
    this.totalTimeChangeIp = parseInt(time) || 0;
  }

  // Get status
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
    };
  }

  // FIXED: Improved force stop with background notification
  forceStopAll() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }

    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.lastUpdateTime = 0;
    this.lastNotificationTime = 0;
    
    this.markPopupInactive();
  }

  // FIXED: Notify background when popup is about to close
  async notifyPopupClosing() {
    try {
      await browserAPI.runtime.sendMessage({
        greeting: "popupClosed",
        data: { timestamp: Date.now() }
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
        const proxyType = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";
        
        if (apiKey) {
          try {
            // FIXED: Add small delay to prevent rapid calls during popup reopen
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Call getCurrentProxy to get fresh data from API
            await MessageHandler.sendToBackground(
              POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
              {
                apiKey: apiKey,
                proxyType: proxyType
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
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display = null;
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CONNECTING;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProcessingNewIpConnect() {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display = null;
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CHANGING_IP;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  // FIXED: Add loading state for proxy info
  static showLoadingProxyInfo() {
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.LOADING_PROXY_INFO;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProxyInfo(proxyInfo, isStart = false) {
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV4).innerText = proxyInfo.public_ipv4;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV6).innerText = proxyInfo.public_ipv6;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIMEOUT).innerText = proxyInfo.proxyTimeout;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText = "-";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT).value = proxyInfo.location;

    if (!isStart) {
      this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
      this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    }

    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY_ERROR).innerText = "";
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.CONNECTED;
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display = "block";
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);

    // Initialize timers
    timerManager.setCountDowntime(proxyInfo.nextChangeIP || 0);
    const timeAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    const timeAutoChangeIPDefault = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);

    timerManager.setTotalTimeChangeIp(Number(timeAutoChangeIP || timeAutoChangeIPDefault || 0));

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
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.innerText = `• ${messageData.data.error}`;
  }

  static clearPopupPage() {
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
    this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);

    timerManager.forceStopAll();

    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV4).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PUBLIC_IPV6).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIMEOUT).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).innerText = "0";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY_ERROR).innerText = "";
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO).style.display = "none";

    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.NOT_CONNECTED;
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
  }

  static setNotConnectedStatus() {
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    
    if (statusElement) {
      statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.NOT_CONNECTED;
      statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    }
    
    // Hide IP info panel
    const ipInfoElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IP_INFO);
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
    const proxyTypeElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_5);
    for (const element of proxyTypeElements) {
      if (element.checked) {
        return element.value;
      }
    }
    return POPUP_CONFIG.PROXY_TYPES.IPV4;
  }

  static getChangeIpType() {
    const changeIpElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP);
    for (const element of changeIpElements) {
      if (element.checked && element.value === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE) {
        return POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE;
      }
    }
    return POPUP_CONFIG.CHANGE_IP_TYPES.KEEP;
  }

  static getFormData() {
    return {
      proxyType: this.getProxyType(),
      location: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT).value,
      changeIpType: this.getChangeIpType(),
      isAutoChangeIP: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE).checked,
      timeAutoChangeIP: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value,
      apiKey: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY).value,
    };
  }

  static validateApiKey(apiKey) {
    return apiKey && apiKey.trim() !== "";
  }

  static loadStoredSettings() {
    const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
    const changeIpType = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.CHANGE_IP_TYPE);
    const proxyType = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE);
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    const timeAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    const timeAutoChangeIPDefault = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

    if (apiKey && changeIpType && proxyType) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY).value = apiKey;

      const changeIpElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP);
      changeIpElements.forEach((element) => {
        element.checked = element.value === changeIpType;
      });

      const proxyTypeElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_5);
      proxyTypeElements.forEach((element) => {
        element.checked = element.value === proxyType;
      });
    }

    if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE).checked = true;
      const timeValue = Number(timeAutoChangeIP || timeAutoChangeIPDefault);
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value = timeValue;
      timerManager.setTotalTimeChangeIp(timeValue);
    }
  }

  static saveSettings(formData) {
    if (formData.isAutoChangeIP) {
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT, formData.timeAutoChangeIP);
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP, formData.isAutoChangeIP);
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, formData.timeAutoChangeIP);
    } else {
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
    }

    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.CHANGE_IP_TYPE, formData.changeIpType);
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE, formData.proxyType);
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
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS).innerText = POPUP_CONFIG.MESSAGES_TEXT.INVALID_KEY;
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
      await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.AUTO_CHANGE_IP, config);
    } else if (formData.changeIpType === POPUP_CONFIG.CHANGE_IP_TYPES.CHANGE) {
      await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.CHANGE_IP, config);
    } else {
      await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY, config);
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
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      const timeAutoChangeIPDefault = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

      if (JSON.parse(isAutoChangeIP) && timeAutoChangeIPDefault) {
        const defaultTime = Number(timeAutoChangeIPDefault);

        // Reset to default time - fresh start for new IP
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, defaultTime);
        timerManager.setTotalTimeChangeIp(defaultTime);

        // Update display
        const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
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
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);

    // Also clear the checkbox state in UI
    const autoChangeCheckbox = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE);
    if (autoChangeCheckbox) {
      autoChangeCheckbox.checked = false;
    }
  }

  static async disconnect() {
    const proxyInfo = await ChromeStorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY);
    const config = {
      apiKey: proxyInfo?.apiKey || "",
      isAutoChangeIP: false,
      timeAutoChangeIP: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value,
    };

    await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);

    UIManager.clearPopupPage();
    this.directProxy();

    await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL, config);
  }
}

/**
 * Event Manager - Handles DOM events
 */
class EventManager {
  static setupEventListeners() {
    // Connect button
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT).addEventListener("click", async () => {
      UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
      UIManager.clearPopupPage();
      timerManager.forceStopAll();
      await ProxyManager.handleClick();
    });

    // Disconnect button
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT).addEventListener("click", async () => {
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
      await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA);

      // Load stored settings if API key exists
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();

        // FIXED: Better timer restoration with coordination
        const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
        const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
        
        if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
          // Try to sync with background first
          const synced = await timerManager.syncWithBackground();
          if (!synced) {
            // Fallback to localStorage restore
            timerManager.restoreTimerFromStorage();
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

// FIXED: Better popup close/unload handling
window.addEventListener('beforeunload', async () => {
  // Notify background that popup is closing
  await timerManager.notifyPopupClosing();
  // Mark popup as inactive
  timerManager.markPopupInactive();
});

window.addEventListener('unload', async () => {
  // Notify background that popup is closing
  await timerManager.notifyPopupClosing();
  // Mark popup as inactive
  timerManager.markPopupInactive();
});

// FIXED: Add visibility change handler
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    // Popup is hidden (user switched tabs or minimized)
    console.log("Popup hidden, notifying background");
    await timerManager.notifyPopupClosing();
  } else {
    // Popup is visible again
    console.log("Popup visible, syncing with background");
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    const proxyConnected = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    
    if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
      await timerManager.syncWithBackground();
    }
  }
});

// Setup message listener
MessageHandler.setupMessageListener();

// Setup event listeners
EventManager.setupEventListeners();

// Initialize app
AppInitializer.initialize();