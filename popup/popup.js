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
 * FIXED Timer Manager - Correct reset logic after successful IP change
 */
class TimerManager {
  constructor() {
    this.nextTimeChange = null;
    this.timeChangeIP = null;
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    // FIXED: Add flag to track timer context
    this.isRestoringTimer = false;
  }

  // Basic countdown timer for nextChangeIP display
  startCountDown() {
    this.clearCountDown();

    if (!this.countDowntime) return;

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
        this.clearCountDown();
        return;
      }

      // Update localStorage
      const proxyInfo =
        StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, true) || {};
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, {
        ...proxyInfo,
        nextChangeIP: this.countDowntime > 0 ? this.countDowntime : 0,
      });
    }, 1000);
  }

  // FIXED: Auto change timer with proper reset logic
  startTimeChangeCountdown() {
    this.clearTimeChangeCountdown();

    if (!this.totalTimeChangeIp) return;

    this.timeChangeIP = setInterval(() => {
      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
      );
      if (!element) {
        this.clearTimeChangeCountdown();
        return;
      }

      element.value = `${this.totalTimeChangeIp}`;
      this.totalTimeChangeIp--;

      // FIXED: When timer reaches 0, trigger auto change
      if (this.totalTimeChangeIp < 0) {
        // Clear the timer
        this.clearTimeChangeCountdown();

        // Check if auto change is still enabled
        const isAutoChangeIP = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
        );
        if (JSON.parse(isAutoChangeIP)) {
          // Trigger auto change IP
          this.triggerAutoChangeIP();
        } else {
          // Reset to default if auto change is disabled
          this.resetToDefaultTime();
        }
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
  }

  // FIXED: Trigger auto change IP when timer expires
  async triggerAutoChangeIP() {
    try {
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      const proxyType =
        StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";
      const locationElement = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
      );
      const location = locationElement ? locationElement.value : null;

      if (!apiKey) {
        console.error("No API key for auto change");
        this.resetToDefaultTime();
        return;
      }

      // Show processing state
      const statusElement = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
      );
      if (statusElement) {
        statusElement.innerText = "• Tự động đổi IP...";
        statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
        statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
      }

      // Send change IP request to background
      const config = {
        apiKey: apiKey,
        proxyType: proxyType,
        location: location,
        isAutoChangeIP: true,
      };

      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.CHANGE_IP,
        config
      );

      // Timer will be reset to default when handleSuccessfulConnection is called
    } catch (error) {
      console.error("Error in auto change IP:", error);
      this.resetToDefaultTime();
    }
  }

  // FIXED: Reset to default time (used when timer expires or on error)
  resetToDefaultTime() {
    const defaultTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );
    const resetTime = parseInt(defaultTime) || 60;

    this.totalTimeChangeIp = resetTime;
    StorageManager.set(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
      resetTime
    );

    const element = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
    );
    if (element) {
      element.value = `${resetTime}`;
    }

    // Restart countdown with default time
    this.isRestoringTimer = false; // Not a restore, it's a fresh start
    this.startTimeChangeCountdown();
  }

  // FIXED: Method to restore timer from storage (for popup reopen)
  restoreTimerFromStorage() {
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );
    if (!JSON.parse(isAutoChangeIP)) {
      return false;
    }

    const savedTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP
    );
    const defaultTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    if (savedTime && parseInt(savedTime) > 0) {
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = parseInt(savedTime);
      this.isRestoringTimer = true; // Flag as restore operation
      this.startTimeChangeCountdown();
      return true;
    } else if (defaultTime) {
      const freshTime = parseInt(defaultTime);
      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = freshTime;
      StorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
        freshTime
      );
      this.isRestoringTimer = false; // Fresh start, not restore
      this.startTimeChangeCountdown();
      return true;
    }

    return false;
  }

  // Reset auto change timer to default value (called externally)
  resetAutoChangeTimer() {
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );
    const defaultTime = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const timeValue = parseInt(defaultTime);

      this.clearTimeChangeCountdown();
      this.totalTimeChangeIp = timeValue;

      const element = document.getElementById(
        POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP
      );
      if (element) {
        element.value = `${timeValue}`;
      }

      StorageManager.set(
        POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
        timeValue
      );
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
  }

  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
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
    };
  }

  // Force stop all timers
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
  }
}

/**
 * Location Manager - Handles location dropdown
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

  static initializeUI() {
    const proxyInfo = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO,
      true
    );
    
    // FIXED: Check if proxy is actually connected, not just has stored info
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );
    
    const timeAutoChangeIP2 = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_2
    );
    const isAutoChangeIP = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
    );

    // FIXED: Only show proxy info if both proxyInfo exists AND proxy is connected
    if (proxyInfo && proxyConnected === "true") {
      UIManager.showProxyInfo(proxyInfo, true);
      
      if (isAutoChangeIP && JSON.parse(isAutoChangeIP)) {
        timerManager.setTotalTimeChangeIp(Number(timeAutoChangeIP2));
      }
    } else {
      // FIXED: Ensure status shows "not connected" if no active connection
      UIManager.setNotConnectedStatus();
      
      // Clear any stale proxy info
      if (proxyInfo && proxyConnected !== "true") {
        StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
      }
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
 * FIXED Proxy Manager - Correct timer reset after successful IP change
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

  // FIXED: Always reset timer to default after successful IP change
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

      // FIXED: Always reset auto change timer to default after successful IP change
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
      } else {
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

    // FIXED: Clear all auto change IP settings to prevent auto-trigger on popup reopen
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
 * FIXED App Initializer - Proper timer restoration on popup open
 */
class AppInitializer {
  static async initialize() {
    try {
      // Force clear all timers on initialization
      timerManager.forceStopAll();

      // FIXED: Set proper initial "not connected" status
      UIManager.setNotConnectedStatus();

      // Get locations data
      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA
      );

      // Load stored settings if API key exists
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();

        // FIXED: Only restore timer if proxy is actually connected
        const isAutoChangeIP = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
        );
        const proxyConnected = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
        );
        
        if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
          timerManager.restoreTimerFromStorage();
        }
      }
    } catch (error) {
      console.error("Error initializing popup:", error);
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

// Setup message listener
MessageHandler.setupMessageListener();

// Setup event listeners
EventManager.setupEventListeners();

// Initialize app
AppInitializer.initialize();
