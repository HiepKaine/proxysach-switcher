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
    TX_PROXY: "tx_proxy"
  },
  MESSAGES: {
    GET_LOCATIONS_SUCCESS: "getLocationsSuccess",
    PROCESSING_GET_PROXY_INFO: "processingGetProxyInfo",
    SHOW_PROCESSING_NEW_IP_CONNECT: "showProcessingNewIpConnect",
    FAILURE_GET_PROXY_INFO: "failureGetProxyInfo",
    SUCCESS_GET_PROXY_INFO: "successGetProxyInfo",
    SUCCESS_GET_INFO_KEY: "successGetInfoKey",
    DISCONNECT_PROXY: "disconnectProxy"
  },
  BACKGROUND_MESSAGES: {
    GET_LOCATIONS_DATA: "getLocationsData",
    GET_CURRENT_PROXY: "getCurrentProxy",
    CHANGE_IP: "changeIp",
    AUTO_CHANGE_IP: "autoChangeIp",
    CANCEL_ALL: "cancelALL"
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
    RADIO_SWITCH_CHANGE_IP: "#radio-switch-change-ip"
  },
  PROXY_TYPES: {
    IPV4: "ipv4",
    IPV6: "ipv6"
  },
  CHANGE_IP_TYPES: {
    KEEP: "keep",
    CHANGE: "change"
  },
  CSS_CLASSES: {
    TEXT_DANGER: "text-danger",
    TEXT_SUCCESS: "text-success"
  },
  MESSAGES_TEXT: {
    NOT_CONNECTED: "• Chưa kết nối",
    CONNECTING: "• Đang kết nối...",
    CHANGING_IP: "• Đang đổi IP...",
    CONNECTED: "• Đã kết nối",
    INVALID_KEY: "• Key Không Hợp Lệ"
  }
};

/**
 * Storage Manager - Handles localStorage operations
 */
class StorageManager {
  static set(key, value) {
    try {
      localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
    } catch (error) {
      console.error(`Error setting localStorage key ${key}:`, error);
    }
  }

  static get(key, parseJSON = false) {
    try {
      const value = localStorage.getItem(key);
      return parseJSON && value ? JSON.parse(value) : value;
    } catch (error) {
      console.error(`Error getting localStorage key ${key}:`, error);
      return null;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing localStorage key ${key}:`, error);
    }
  }

  static clear() {
    try {
      localStorage.clear();
    } catch (error) {
      console.error("Error clearing localStorage:", error);
    }
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
        console.error(`Error getting Chrome storage key ${key}:`, error);
        resolve(null);
      }
    });
  }

  static async set(key, value) {
    try {
      await browserAPI.storage.sync.set({ [key]: value });
    } catch (error) {
      console.error(`Error setting Chrome storage key ${key}:`, error);
    }
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
      console.error("Error sending message to background:", error);
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
          console.log("Unknown message:", request.greeting);
      }
    });
  }
}

/**
 * Timer Manager - Handles countdown timers (FIXED VERSION)
 */
class TimerManager {
  constructor() {
    this.nextTimeChange = null;
    this.timeChangeIP = null;
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
  }

  // FIX: Always clear existing interval before creating new one
  startCountDown() {
    // Clear existing interval first
    this.clearCountDown();
    
    if (!this.countDowntime) return;

    console.log(`Starting countdown timer with ${this.countDowntime} seconds`);
    
    this.nextTimeChange = setInterval(() => {
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME);
      if (!element) {
        console.warn("Next time element not found, clearing countdown");
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
      const proxyInfo = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, true) || {};
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, {
        ...proxyInfo,
        nextChangeIP: this.countDowntime > 0 ? this.countDowntime : 0
      });
    }, 1000);
  }

  // FIX: Always clear existing interval before creating new one
  startTimeChangeCountdown() {
    // Clear existing interval first
    this.clearTimeChangeCountdown();
    
    if (!this.totalTimeChangeIp) return;

    console.log(`Starting time change countdown with ${this.totalTimeChangeIp} seconds`);

    this.timeChangeIP = setInterval(() => {
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (!element) {
        console.warn("Time change IP element not found, clearing countdown");
        this.clearTimeChangeCountdown();
        return;
      }
      
      element.value = `${this.totalTimeChangeIp}`;
      this.totalTimeChangeIp--;

      if (this.totalTimeChangeIp < 0) {
        // Reset to default time and continue
        const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
        const resetTime = parseInt(defaultTime) || 60; // Default 60 seconds if not set
        
        this.totalTimeChangeIp = resetTime;
        element.value = `${resetTime}`;
        
        console.log(`Auto change timer reset to: ${resetTime} seconds`);
        
        // Update stored time
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, resetTime);
        return;
      }

      // Update localStorage if auto change is enabled
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      
      if (isAutoChangeIP) {
        StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, this.totalTimeChangeIp);
      }
    }, 1000);
  }

  // Start auto change countdown with proper initialization
  startAutoChangeCountdown(intervalSeconds) {
    console.log(`Starting auto change countdown with ${intervalSeconds} seconds`);
    
    // Clear any existing timers first
    this.clearTimeChangeCountdown();
    
    this.autoChangeInterval = intervalSeconds;
    this.totalTimeChangeIp = intervalSeconds;
    
    const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
    if (element) {
      element.value = `${intervalSeconds}`;
    }
    
    this.startTimeChangeCountdown();
  }

  // Reset auto change timer to default value
  resetAutoChangeTimer() {
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    const defaultTime = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
    
    if (JSON.parse(isAutoChangeIP) && defaultTime) {
      const timeValue = parseInt(defaultTime);
      
      // Clear existing timer first
      this.clearTimeChangeCountdown();
      
      this.totalTimeChangeIp = timeValue;
      
      const element = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP);
      if (element) {
        element.value = `${timeValue}`;
      }
      
      // Update stored time
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, timeValue);
      
      console.log(`Auto change timer reset to default: ${timeValue} seconds`);
    }
  }

  // FIX: Enhanced clear functions with logging
  clearCountDown() {
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
      console.log("Countdown timer cleared");
    }
  }

  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
      console.log("Time change countdown timer cleared");
    }
  }

  // FIX: Enhanced clearAll with comprehensive clearing
  clearAll() {
    console.log("Clearing all timers...");
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    
    // Reset counters to prevent stale data
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    
    console.log("All timers cleared and reset");
  }

  // FIX: Safe setter methods that clear existing timers
  setCountDowntime(time) {
    console.log(`Setting countdown time to: ${time} seconds`);
    this.countDowntime = parseInt(time) || 0;
  }

  setTotalTimeChangeIp(time) {
    console.log(`Setting total time change IP to: ${time} seconds`);
    this.totalTimeChangeIp = parseInt(time) || 0;
  }

  // Get current timer status
  getStatus() {
    return {
      countDowntime: this.countDowntime,
      totalTimeChangeIp: this.totalTimeChangeIp,
      autoChangeInterval: this.autoChangeInterval,
      isCountDownRunning: !!this.nextTimeChange,
      isTimeChangeRunning: !!this.timeChangeIP
    };
  }

  // FIX: Force stop all timers (emergency cleanup)
  forceStopAll() {
    console.log("Force stopping all timers...");
    
    // Clear all possible intervals
    if (this.nextTimeChange) {
      clearInterval(this.nextTimeChange);
      this.nextTimeChange = null;
    }
    
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }
    
    // Reset all properties
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    
    console.log("All timers force stopped and reset");
  }
}

/**
 * Location Manager - Handles location dropdown
 */
class LocationManager {
  static handleLocationsSuccess(locations) {
    const selectElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT);
    
    // Clear existing options
    while (selectElement.hasChildNodes()) {
      selectElement.removeChild(selectElement.firstChild);
    }

    // Add new options
    if (locations) {
      locations.forEach(location => {
        const option = document.createElement("option");
        option.textContent = location.name;
        option.value = location.code;
        selectElement.appendChild(option);
      });
    }

    // Initialize UI with stored data
    this.initializeUI();
  }

  static initializeUI() {
    const proxyInfo = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, true);
    const timeAutoChangeIP2 = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_2);
    const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);

    if (isAutoChangeIP && JSON.parse(isAutoChangeIP)) {
      timerManager.setTotalTimeChangeIp(Number(timeAutoChangeIP2));
    }

    if (proxyInfo) {
      UIManager.showProxyInfo(proxyInfo, true);
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

    // FIX: Enhanced timer initialization with proper clearing
    console.log("Initializing timers with proxy info...");
    
    // Initialize timers with proper data
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
    
    console.log("Timers initialized successfully");
  }

  static showError(messageData) {
    const statusElement = document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.innerText = `• ${messageData.data.error}`;
  }

  static clearPopupPage() {
    this.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT);
    this.enableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
    
    // FIX: Force clear all timers before resetting UI
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
    return POPUP_CONFIG.PROXY_TYPES.IPV4; // Default
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
      apiKey: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.API_KEY).value
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
      
      // Set change IP type radio buttons
      const changeIpElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_CHANGE_IP);
      changeIpElements.forEach(element => {
        element.checked = element.value === changeIpType;
      });

      // Set proxy type radio buttons
      const proxyTypeElements = document.querySelectorAll(POPUP_CONFIG.UI_ELEMENTS.RADIO_SWITCH_5);
      proxyTypeElements.forEach(element => {
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
      // Save the time as default for future auto changes
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT, formData.timeAutoChangeIP);
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP, formData.isAutoChangeIP);
      // Set current working time to the same value initially
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP, formData.timeAutoChangeIP);
      console.log(`Auto change IP enabled with ${formData.timeAutoChangeIP} seconds interval`);
    } else {
      // Clean up auto change settings when disabled
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
      console.log("Auto change IP disabled");
    }

    // Always save basic settings
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.CHANGE_IP_TYPE, formData.changeIpType);
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE, formData.proxyType);
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.API_KEY, formData.apiKey);
  }
}

/**
 * Proxy Manager - Handles proxy operations (FIXED VERSION)
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
      proxyType: formData.proxyType
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

  // FIX: Enhanced handleSuccessfulConnection with proper timer management
  static handleSuccessfulConnection(proxyData) {
    console.log("Handling successful connection...");
    
    // FIX: Force clear ALL existing timers first
    timerManager.forceStopAll();
    
    // Small delay to ensure all intervals are cleared
    setTimeout(() => {
      ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY, proxyData);
      UIManager.showProxyInfo(proxyData);
      this.updateProxyUIStatus();
      
      // Store proxy info
      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, proxyData);
      
      // Handle auto change IP timer with fresh start
      const isAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      const timeAutoChangeIP = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
      const timeAutoChangeIPDefault = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT);
      
      if (JSON.parse(isAutoChangeIP)) {
        if (timeAutoChangeIP) {
          // Continue with current timer value
          timerManager.setTotalTimeChangeIp(Number(timeAutoChangeIP));
          timerManager.startTimeChangeCountdown();
        } else if (timeAutoChangeIPDefault) {
          // Reset to default value (new connection or after auto change)
          const defaultTime = Number(timeAutoChangeIPDefault);
          timerManager.resetAutoChangeTimer();
          timerManager.setTotalTimeChangeIp(defaultTime);
          timerManager.startTimeChangeCountdown();
          console.log(`Auto change timer initialized with default: ${defaultTime} seconds`);
        }
      }
      
      console.log("Connection handling completed successfully");
    }, 100); // Small delay to ensure cleanup
  }

  static handleInfoKeySuccess(data) {
    this.handleClick();
  }

  static updateProxyUIStatus() {
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED, "true");
  }

  // FIX: Enhanced directProxy with timer cleanup
  static directProxy() {
    console.log("Setting direct proxy...");
    
    // Clear all timers first
    timerManager.forceStopAll();
    
    // Clear storage
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    
    console.log("Direct proxy set and timers cleared");
  }

  static async disconnect() {
    console.log("Disconnecting proxy...");
    
    const proxyInfo = await ChromeStorageManager.get(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY);
    const config = {
      apiKey: proxyInfo?.apiKey || "",
      isAutoChangeIP: false,
      timeAutoChangeIP: document.getElementById(POPUP_CONFIG.UI_ELEMENTS.TIME_CHANGE_IP).value
    };
    
    await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);
    
    // Clear UI and timers
    UIManager.clearPopupPage();
    this.directProxy();
    
    await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.CANCEL_ALL, config);
    
    console.log("Proxy disconnect completed");
  }
}

/**
 * Event Manager - Handles DOM events
 */
class EventManager {
  static setupEventListeners() {
    // Connect button
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT)
      .addEventListener("click", async () => {
        UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
        UIManager.clearPopupPage();
        // FIX: Force clear all timers before new connection
        timerManager.forceStopAll();
        await ProxyManager.handleClick();
      });

    // Disconnect button
    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_DISCONNECT)
      .addEventListener("click", async () => {
        await ProxyManager.disconnect();
      });
  }
}

/**
 * App Initializer - Handles app initialization
 */
class AppInitializer {
  static async initialize() {
    try {
      // FIX: Force clear all timers on initialization
      timerManager.forceStopAll();
      
      // Get locations data
      await MessageHandler.sendToBackground(POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA);
      
      // Set initial status
      document.getElementById(POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS).classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
      
      // Load stored settings if API key exists
      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();
      }
      
      console.log("Popup initialized successfully");
    } catch (error) {
      console.error("Error initializing popup:", error);
    }
  }
}

// Initialize global instances
const timerManager = new TimerManager();

// Setup message listener
MessageHandler.setupMessageListener();

// Setup event listeners
EventManager.setupEventListeners();

// Initialize app
AppInitializer.initialize();