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

// Storage Manager
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

  static getCachedProxyInfo() {
    try {
      const cachedData = this.get(
        POPUP_CONFIG.STORAGE_KEYS.CACHED_PROXY_INFO,
        true
      );

      if (cachedData && cachedData.proxyInfo) {
        const proxyInfo = cachedData.proxyInfo;
        const currentTime = Math.floor(Date.now() / 1000);

        // Check key expiration
        if (proxyInfo.expired) {
          const expiredTimestamp = TimeUtils.convertToTimestamp(
            proxyInfo.expired
          );
          if (expiredTimestamp > 0 && currentTime >= expiredTimestamp) {
            this.clearCachedProxyInfo("key expired");
            return {
              expired: "key",
              error: POPUP_CONFIG.MESSAGES_TEXT.KEY_EXPIRED,
            };
          }
        }

        // Check proxy timeout
        if (proxyInfo.proxyTimeout) {
          const timeoutTimestamp = TimeUtils.convertToTimestamp(
            proxyInfo.proxyTimeout
          );
          if (timeoutTimestamp > 0 && currentTime >= timeoutTimestamp) {
            this.clearCachedProxyInfo("proxy timeout");
            return {
              expired: "proxy",
              error: POPUP_CONFIG.MESSAGES_TEXT.PROXY_EXPIRED,
            };
          }
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

      // Only call directProxy without badge update
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
}

// Chrome Storage Manager
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

// Time Utils
class TimeUtils {
  static convertAPITimeToTimestamp(timeString) {
    try {
      if (!timeString || typeof timeString !== "string") return 0;

      const parts = timeString.trim().split(" ");
      if (parts.length !== 2) return 0;

      const [timePart, datePart] = parts;
      const timeComponents = timePart.split(":");
      if (timeComponents.length !== 3) return 0;

      const [hours, minutes, seconds] = timeComponents.map((x) =>
        parseInt(x, 10)
      );
      const dateComponents = datePart.split("/");
      if (dateComponents.length !== 3) return 0;

      const [day, month, year] = dateComponents.map((x) => parseInt(x, 10));

      if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59 ||
        seconds < 0 ||
        seconds > 59 ||
        day < 1 ||
        day > 31 ||
        month < 1 ||
        month > 12 ||
        year < 2020 ||
        year > 2100
      ) {
        return 0;
      }

      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      if (isNaN(date.getTime())) return 0;

      return Math.floor(date.getTime() / 1000);
    } catch (error) {
      return 0;
    }
  }

  static convertTimestampToSeconds(timestamp) {
    try {
      if (!timestamp || typeof timestamp !== "number") return 0;
      if (timestamp > 1000000000000) {
        return Math.floor(timestamp / 1000);
      }
      return Math.floor(timestamp);
    } catch (error) {
      return 0;
    }
  }

  static convertToTimestamp(timeValue) {
    if (typeof timeValue === "string") {
      return this.convertAPITimeToTimestamp(timeValue);
    } else if (typeof timeValue === "number") {
      return this.convertTimestampToSeconds(timeValue);
    }
    return 0;
  }
}

// Message Handler
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
        browserAPI.runtime.sendMessage({ greeting: message, data });
        return null;
      }

      return await Promise.race([
        browserAPI.runtime.sendMessage({ greeting: message, data }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Message timeout")), 5000)
        ),
      ]);
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
          if (request.data?.isAutoChanging && request.data?.isProtected) {
            UIManager.showProcessingNewIpConnectProtected();
          } else {
            UIManager.showProcessingNewIpConnect();
          }
          break;
        case POPUP_CONFIG.MESSAGES.FAILURE_GET_PROXY_INFO:
          UIManager.showError(request);
          // Chỉ set badge Off khi thực sự fail
          BadgeManager.setBadgeOff();
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_PROXY_INFO:
          const preserveTimer = request.data?.preserveTimer || false;
          ProxyManager.handleSuccessfulConnection(request.data, preserveTimer);
          break;
        case POPUP_CONFIG.MESSAGES.SUCCESS_GET_INFO_KEY:
          ProxyManager.handleInfoKeySuccess(request.data);
          break;
        case POPUP_CONFIG.MESSAGES.DISCONNECT_PROXY:
          ProxyManager.directProxy("message_disconnect");
          // Set badge Off khi nhận lệnh disconnect
          BadgeManager.setBadgeOff();
          break;
      }
    });
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

// Timer Manager - FIXED to prevent infinite loops
class TimerManager {
  constructor() {
    this.nextTimeChange = null;
    this.timeChangeIP = null;
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.syncCheckInterval = null;
    this.isProcessingExpiredTimer = false;
    this.isPopupControlling = false;
    this.isInitialized = false;
    this.waitAttempts = 0; // Prevent infinite waiting
    this.maxWaitAttempts = 30;
  }

  startTimeChangeCountdownWithTime(confirmedTime) {
    if (this.isProcessingExpiredTimer) return false;

    this.clearTimeChangeCountdown();

    if (!confirmedTime || confirmedTime <= 0) return false;

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

        if (
          response &&
          response.isActive &&
          !response.isChangingIP &&
          !response.isProtected
        ) {
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
      } catch (error) {}
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

  async handleTimerExpiredWithActualChange() {
    if (this.isProcessingExpiredTimer) return;

    const now = Date.now();
    this.isProcessingExpiredTimer = true;

    try {
      const backgroundStatus = await MessageHandler.sendToBackground(
        "getBackgroundTimerStatus"
      );

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

      const proxyConnected = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
      );
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
    this.waitAttempts = 0;

    while (this.waitAttempts < this.maxWaitAttempts) {
      await this.sleep(1000);
      this.waitAttempts++;

      try {
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

  clearTimeChangeCountdown() {
    if (this.timeChangeIP) {
      clearInterval(this.timeChangeIP);
      this.timeChangeIP = null;
    }

    this.stopSyncCheck();
    this.isProcessingExpiredTimer = false;
  }

  clearAll() {
    this.clearCountDown();
    this.clearTimeChangeCountdown();
    this.stopSyncCheck();
    this.countDowntime = 0;
    this.totalTimeChangeIp = 0;
    this.isPopupControlling = false;
    this.isInitialized = false;
    this.waitAttempts = 0;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        this.clearCountDown();
        return;
      }

      const remainingTime = Date.now() + this.countDowntime * 1000;
      StorageManager.setNextChangeTimer(remainingTime, this.countDowntime);
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
}

// Location Manager
class LocationManager {
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

  static async forceDisconnectProxy(reason = "Unknown") {
    try {
      timerManager.clearAll();

      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      StorageManager.clearCachedProxyInfo();
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);

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

      // Set badge to Off when force disconnected
      await BadgeManager.setBadgeOff();

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

      await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_PROXY, null);
      await ChromeStorageManager.set(POPUP_CONFIG.STORAGE_KEYS.TX_CONF, config);
    } catch (error) {
      UIManager.setNotConnectedStatus();
      StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
      StorageManager.clearCachedProxyInfo();

      // Set badge to Off even if error
      await BadgeManager.setBadgeOff();
    }
  }

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
        return;
      } else {
        UIManager.showLoadingProxyInfo();
        const statusElement = document.getElementById(
          POPUP_CONFIG.UI_ELEMENTS.PROXY_STATUS
        );
        if (statusElement) {
          statusElement.innerText = "• Đã kết nối (đang tải thông tin)";
          statusElement.classList.remove(POPUP_CONFIG.CSS_CLASSES.TEXT_DANGER);
          statusElement.classList.add(POPUP_CONFIG.CSS_CLASSES.TEXT_SUCCESS);
        }
        return;
      }
    } else {
      UIManager.setNotConnectedStatus();
      StorageManager.clearCachedProxyInfo();
    }
  }
}

// UI Manager
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

    document.getElementById(POPUP_CONFIG.UI_ELEMENTS.NEXT_TIME).innerText =
      "0 s";
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

    timerManager.clearAll();

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

// Form Manager
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

// Change IP Manager
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

      timerManager.clearAll();

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

class BadgeManager {
  static badgeTimeout = null;

  static async setBadgeOn() {
    try {
      // Clear any pending badge changes
      if (this.badgeTimeout) {
        clearTimeout(this.badgeTimeout);
        this.badgeTimeout = null;
      }

      await browserAPI.action.setBadgeText({ text: "On" });
      await browserAPI.action.setBadgeBackgroundColor({ color: "#00ff00" });

      // Notify background to not change badge
      await browserAPI.storage.local.set({
        badgeState: "on",
        badgeControlledBy: "popup",
        badgeTimestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error setting badge On:", error);
    }
  }

  static async setBadgeOff() {
    try {
      // Clear any pending badge changes
      if (this.badgeTimeout) {
        clearTimeout(this.badgeTimeout);
        this.badgeTimeout = null;
      }

      await browserAPI.action.setBadgeText({ text: "Off" });
      await browserAPI.action.setBadgeBackgroundColor({ color: "#ff0000" });

      // Notify background to not change badge
      await browserAPI.storage.local.set({
        badgeState: "off",
        badgeControlledBy: "popup",
        badgeTimestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error setting badge Off:", error);
    }
  }

  static async lockBadgeState(duration = 10000) {
    // Lock badge state for a duration to prevent background from changing it
    await browserAPI.storage.local.set({
      badgeLocked: true,
      badgeLockExpiry: Date.now() + duration,
    });

    // Auto unlock after duration
    this.badgeTimeout = setTimeout(async () => {
      await browserAPI.storage.local.set({
        badgeLocked: false,
        badgeLockExpiry: 0,
      });
    }, duration);
  }
}

// Proxy Manager
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

    // Don't set badge here - wait for actual connection confirmation
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
      timerManager.clearAll();
    }

    const currentTime = Math.floor(Date.now() / 1000);

    // Check expiration
    if (proxyData.expired) {
      const expiredTimestamp = TimeUtils.convertToTimestamp(proxyData.expired);
      if (expiredTimestamp > 0 && currentTime >= expiredTimestamp) {
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
    }

    if (proxyData.proxyTimeout) {
      const timeoutTimestamp = TimeUtils.convertToTimestamp(
        proxyData.proxyTimeout
      );
      if (timeoutTimestamp > 0 && currentTime >= timeoutTimestamp) {
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
    }

    setTimeout(async () => {
      StorageManager.setCachedProxyInfo(proxyData);
      UIManager.showProxyInfo(proxyData, false, preserveTimer);
      await this.updateProxyUIStatus();

      // Set badge to On and lock it for 10 seconds
      await BadgeManager.setBadgeOn();
      await BadgeManager.lockBadgeState(10000);

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
        } else {
          if (proxyData.nextChangeIP && proxyData.nextChangeIP > 0) {
            timerManager.setCountDowntime(proxyData.nextChangeIP);
            timerManager.startCountDown();
          }
        }
      }
    }, 100);
  }

  static handleInfoKeySuccess(data) {
    this.handleClick();
  }

  static async updateProxyUIStatus() {
    StorageManager.set(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED, "true");
  }

  static async directProxy(reason) {
    timerManager.clearAll();

    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_INFO);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.IS_AUTO_CHANGE_IP);
    StorageManager.remove(POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP);
    StorageManager.remove(
      POPUP_CONFIG.STORAGE_KEYS.TIME_AUTO_CHANGE_IP_DEFAULT
    );

    if (reason !== "key expired" && reason !== "proxy timeout") {
      StorageManager.clearCachedProxyInfo();
    }

    const autoChangeCheckbox = document.getElementById(
      POPUP_CONFIG.UI_ELEMENTS.IS_AUTO_CHANGE
    );
    if (autoChangeCheckbox) {
      autoChangeCheckbox.checked = false;
    }

    // Set badge to Off when disconnected
    await BadgeManager.setBadgeOff();
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
      await this.directProxy("manual disconnect");

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
    } catch (error) {
      UIManager.clearPopupPage();
      await this.directProxy("disconnect error");
    }
  }
}

// Event Manager
class EventManager {
  static setupEventListeners() {
    document
      .getElementById(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT)
      .addEventListener("click", async () => {
        UIManager.disableButton(POPUP_CONFIG.UI_ELEMENTS.BTN_CONNECT);
        UIManager.clearPopupPage();
        timerManager.clearAll();
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

// App Initializer - FIXED to prevent infinite loops
class AppInitializer {
  static isInitializing = false;
  static initAttempts = 0;
  static maxInitAttempts = 3;

  static async initialize() {
    try {
      if (this.isInitializing || this.initAttempts >= this.maxInitAttempts) {
        return;
      }

      this.isInitializing = true;
      this.initAttempts++;

      timerManager.clearAll();
      UIManager.setNotConnectedStatus();

      const expiredHandled = await LocationManager.checkAndHandleExpiration();
      if (expiredHandled) {
        return;
      }

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

      await new Promise((resolve) => setTimeout(resolve, 500));

      const proxyConnected = StorageManager.get(
        POPUP_CONFIG.STORAGE_KEYS.PROXY_CONNECTED
      );

      if (proxyConnected === "true") {
        // Update badge to On if connected
        await BadgeManager.setBadgeOn();

        const expiredHandled = await LocationManager.checkAndHandleExpiration();
        if (!expiredHandled) {
          await LocationManager.getProxyInfoIfConnectedSafeNoAPI(false);
        }
      } else {
        // Update badge to Off if not connected
        await BadgeManager.setBadgeOff();
      }
    } catch (error) {
      this.showInitializationError();
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

// Initialize
const timerManager = new TimerManager();

window.addEventListener("beforeunload", async () => {
  timerManager.stopSyncCheck();
});

window.addEventListener("unload", async () => {
  timerManager.stopSyncCheck();
});

MessageHandler.setupMessageListener();
EventManager.setupEventListeners();
AppInitializer.initialize();
