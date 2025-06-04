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
        console.log(
          "🚀 ~ TimerManager ~ syncWithBackground ~ realRemainingTime:",
          realRemainingTime
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
        await this.handleTimerExpiredWithWait();
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
      } catch (error) {
        console.log("Sync check failed, will retry...");
      }
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
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.autoChangeInterval = 0;
    this.isRestoringTimer = false;
    this.isPopupControlling = false;
    this.isInitialized = false;
    this.markPopupInactive();
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
  static handleLocationsSuccess(locations) {
    const selectElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.LOCATION_SELECT
    );

    while (selectElement.hasChildNodes()) {
      selectElement.removeChild(selectElement.firstChild);
    }

    if (locations) {
      locations.forEach((location) => {
        const option = document.createElement("option");
        option.textContent = location.name;
        option.value = location.code;
        selectElement.appendChild(option);
      });
    }
  }

  static async getProxyInfoIfConnected(preserveTimer = false) {
    const proxyConnected = StorageManager.get(
      POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
    );

    if (proxyConnected === "true") {
      UIManager.showLoadingProxyInfo();

      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      const proxyType =
        StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.PROXY_TYPE) || "ipv4";

      if (apiKey) {
        try {
          await MessageHandler.sendToBackground(
            POPUP_CONFIG.BACKGROUND_MESSAGES.GET_CURRENT_PROXY,
            {
              apiKey: apiKey,
              proxyType: proxyType,
              preserveTimer: preserveTimer, // ✅ FIX: Thêm flag
            }
          );
        } catch (error) {
          UIManager.setNotConnectedStatus();
          StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
        }
      } else {
        UIManager.setNotConnectedStatus();
        StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      }
    } else {
      UIManager.setNotConnectedStatus();
    }
  }
}

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

  static showLoadingProxyInfo() {
    const statusElement = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
    );
    statusElement.innerText = POPUP_CONFIG.MESSAGES_TEXT.LOADING_PROXY_INFO;
    statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
    statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
  }

  static showProxyInfo(proxyInfo, isStart = false, preserveTimer = false) {
    console.log("Showing proxy info:", proxyInfo, isStart, preserveTimer);

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

    if (!preserveTimer) {
      timerManager.setCountDowntime(proxyInfo.nextChangeIP || 0);
      if (proxyInfo.nextChangeIP > 0) {
        timerManager.startCountDown();
      }
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
      timeAutoChangeIP:
        localStorage.getItem("timeAutoChangeIP") || formData.timeAutoChangeIP,
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

  static handleSuccessfulConnection(proxyData, preserveTimer = false) {
    if (!preserveTimer) {
      timerManager.forceStopAll();
    }

    setTimeout(() => {
      ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY, proxyData);
      UIManager.showProxyInfo(proxyData, false, preserveTimer);
      this.updateProxyUIStatus();

      StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO, proxyData);

      if (!preserveTimer) {
        const isAutoChangeIP = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
        );
        const timeAutoChangeIPDefault = StorageManager.get(
          POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
        );

        if (JSON.parse(isAutoChangeIP) && timeAutoChangeIPDefault) {
          const defaultTime = Number(timeAutoChangeIPDefault);
          StorageManager.set(
            POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP,
            defaultTime
          );
          timerManager.startTimeChangeCountdownWithTime(defaultTime);
        }
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

    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    StorageManager.remove(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

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
        await ProxyManager.disconnect();
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

      await MessageHandler.sendToBackground(
        POPUP_CONFIG.BACKGROUND_MESSAGES.GET_LOCATIONS_DATA
      );

      const apiKey = StorageManager.get(POPUP_CONFIG.STORAGE_KEYS.API_KEY);
      if (apiKey) {
        FormManager.loadStoredSettings();
      }

      // Step 4: Wait for locations to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      const proxyConnected = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
      );
      const isAutoChangeIP = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP
      );

      let timerInitialized = false;

      if (proxyConnected === "true" && JSON.parse(isAutoChangeIP)) {
        timerInitialized = await timerManager.initializeTimer();
        if (timerInitialized) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (proxyConnected === "true") {
        await LocationManager.getProxyInfoIfConnected(timerInitialized);
      }
    } catch (error) {
      console.error("App initialization error:", error);
    } finally {
      this.isInitializing = false;
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

    if (JSON.parse(isAutoChangeIP) && proxyConnected === "true") {
      setTimeout(async () => {
        await timerManager.initializeTimer();
      }, 500);
    }
  }
});

MessageHandler.setupMessageListener();
EventManager.setupEventListeners();
AppInitializer.initialize();
