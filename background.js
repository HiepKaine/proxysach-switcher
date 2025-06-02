// Browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Fix for Manifest V3 API differences
if (browserAPI.browserAction && !browserAPI.action) {
  browserAPI.action = browserAPI.browserAction;
}

/**
 * FIXED BACKGROUND SCRIPT - ENABLE AUTO CHANGE TIMER FOR POPUP CLOSED SCENARIOS
 *
 * NEW HYBRID APPROACH:
 * - Popup timer: Primary display and control when popup is open
 * - Background timer: Backup system when popup is closed
 * - Smart coordination: Avoid duplicate API calls
 * - Real-time sync: Both systems stay in sync
 */

// Constants
const CONFIG = {
  SERVER_URL: "https://api.vnproxy.com",
  ENDPOINTS: {
    STATUS_IP: "/webservice/statusIP",
    CHANGE_IP: "/webservice/changeIP",
    GET_LOCATION: "/webservice/getLocation",
  },
  STORAGE_KEYS: {
    PROXY_MODE: "proxyMode",
    PROXY_DATA: "proxyData",
    TIME_CHANGE_IP: "TIME_CHANGE_IP",
    TX_PROXY: "tx_proxy",
  },
  MESSAGES: {
    GET_LOCATIONS_DATA: "getLocationsData",
    CHECK_VERSION: "checkVersion",
    GET_INFO_KEY: "getInfoKey",
    GET_CURRENT_PROXY: "getCurrentProxy",
    CANCEL_ALL: "cancelALL",
    CHANGE_IP: "changeIp",
    AUTO_CHANGE_IP: "autoChangeIp",
  },
  ERRORS: {
    CONNECTION_FAILED: "Kết Nối Thất Bại",
    UNKNOWN_ERROR: "Lỗi không xác định",
    INVALID_PROXY: "Không thể lấy thông tin proxy",
    SETUP_FAILED: "Không thể thiết lập proxy",
  },
};

/**
 * Authentication Module - Handles proxy authentication
 */
class AuthenticationManager {
  constructor() {
    this.credentials = [];
  }

  init(proxyData = []) {
    this.credentials = proxyData;
    this.setupWebRequestListener();
  }

  setupWebRequestListener() {
    if (!browserAPI.webRequest?.onAuthRequired) return;

    if (
      browserAPI.webRequest.onAuthRequired.hasListener(this.handleAuthRequired)
    ) {
      browserAPI.webRequest.onAuthRequired.removeListener(
        this.handleAuthRequired
      );
    }

    browserAPI.webRequest.onAuthRequired.addListener(
      this.handleAuthRequired.bind(this),
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
  }

  handleAuthRequired(details) {
    const credential = this.credentials.find(
      (cred) => cred.username && cred.password
    );
    if (credential) {
      return {
        authCredentials: {
          username: credential.username,
          password: credential.password,
        },
      };
    }

    return {};
  }

  clear() {
    this.credentials = [];
    if (
      browserAPI.webRequest?.onAuthRequired?.hasListener(
        this.handleAuthRequired
      )
    ) {
      browserAPI.webRequest.onAuthRequired.removeListener(
        this.handleAuthRequired
      );
    }
  }
}

/**
 * Proxy Request Manager - Handles proxy requests
 */
class ProxyRequestManager {
  constructor() {
    this.mode = "";
    this.proxy = {};
    this.isInitialized = false;
    this.isListenerAdded = false;
  }

  async init(preferences) {
    await this.saveSettings(preferences);
    this.updateSettings(preferences);
    this.isInitialized = true;
  }

  updateSettings(preferences) {
    this.mode = preferences.mode;
    const validProxies = preferences.data.filter(
      (proxy) => proxy.type !== "pac" && proxy.hostname
    );

    this.proxy = this.findMatchingProxy(validProxies, preferences.mode);
  }

  findMatchingProxy(proxies, mode) {
    return (
      /:\d+[^/]*$/.test(mode) &&
      proxies.find((proxy) => mode === `${proxy.hostname}:${proxy.port}`)
    );
  }

  initializeListener() {
    if (this.isListenerAdded || !browserAPI.proxy?.onRequest) return;

    browserAPI.proxy.onRequest.addListener((e) => this.process(e), {
      urls: ["<all_urls>"],
    });
    this.isListenerAdded = true;
  }

  async loadSettings() {
    try {
      const result = await browserAPI.storage.local.get([
        CONFIG.STORAGE_KEYS.PROXY_MODE,
        CONFIG.STORAGE_KEYS.PROXY_DATA,
      ]);

      if (result.proxyMode && result.proxyData) {
        this.mode = result.proxyMode;
        const validProxies = result.proxyData.filter(
          (proxy) => proxy.type !== "pac" && proxy.hostname
        );
        this.proxy = this.findMatchingProxy(validProxies, result.proxyMode);
        this.isInitialized = true;
      }
    } catch (error) {
      console.error("Failed to load proxy settings:", error);
    }
  }

  async saveSettings(preferences) {
    try {
      await browserAPI.storage.local.set({
        [CONFIG.STORAGE_KEYS.PROXY_MODE]: preferences.mode,
        [CONFIG.STORAGE_KEYS.PROXY_DATA]: preferences.data,
      });
    } catch (error) {
      console.error("Failed to save proxy settings:", error);
    }
  }

  process(event) {
    if (!this.isInitialized) {
      this.loadSettings();
      return { type: "direct" };
    }
    return this.processProxy(this.proxy);
  }

  processProxy(proxyData) {
    if (!proxyData || !proxyData.type || proxyData.type === "direct") {
      return { type: "direct" };
    }

    const response = {
      type: proxyData.type === "socks5" ? "socks" : proxyData.type,
      host: proxyData.hostname,
      port: parseInt(proxyData.port),
    };

    if (proxyData.type.startsWith("socks")) {
      response.proxyDNS = !!proxyData.proxyDNS;
    }

    if (proxyData.username && proxyData.password) {
      response.username = proxyData.username;
      response.password = proxyData.password;
      response.proxyAuthorizationHeader = `Basic ${btoa(
        `${proxyData.username}:${proxyData.password}`
      )}`;
    }

    return response;
  }

  async clearProxy() {
    this.mode = "";
    this.proxy = {};
    this.isInitialized = false;
    await browserAPI.storage.local.remove([
      CONFIG.STORAGE_KEYS.PROXY_MODE,
      CONFIG.STORAGE_KEYS.PROXY_DATA,
    ]);
  }

  getCurrentProxy() {
    return {
      mode: this.mode,
      proxy: this.proxy,
      isActive: !!this.proxy && this.proxy.type !== "direct",
    };
  }
}

/**
 * API Service - Handles API calls
 */
class APIService {
  static async makeRequest(url, headers = {}) {
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        headers,
      });
      return await response.json();
    } catch (error) {
      console.error("API request error:", error);
      return null;
    }
  }

  static async getInfoKey(apiKey) {
    const url = `${CONFIG.SERVER_URL}${CONFIG.ENDPOINTS.STATUS_IP}?key=${apiKey}`;
    return await this.makeRequest(url);
  }

  static async changeIP(apiKey, location = null) {
    let url = `${CONFIG.SERVER_URL}${CONFIG.ENDPOINTS.CHANGE_IP}?key=${apiKey}`;
    if (location) {
      url += `&location=${location}`;
    }
    return await this.makeRequest(url);
  }

  static async getLocations() {
    const url = `${CONFIG.SERVER_URL}${CONFIG.ENDPOINTS.GET_LOCATION}`;
    return await this.makeRequest(url);
  }

  static async resolveDomain(domain) {
    const headers = { Accept: "application/dns-json" };
    const url = `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`;
    const result = await this.makeRequest(url, headers);

    if (result?.Answer?.length > 0) {
      const randomAnswer =
        result.Answer[Math.floor(Math.random() * result.Answer.length)];
      return randomAnswer.data;
    }
    return null;
  }
}

/**
 * Browser Proxy Manager - Handles browser-specific proxy settings
 */
class BrowserProxyManager {
  static async setBrowserProxy(proxyInfo) {
    const config = {
      mode: `${proxyInfo.public_ip}:${proxyInfo.port}`,
      data: [
        {
          hostname: proxyInfo.public_ip,
          username: proxyInfo.username,
          password: proxyInfo.password,
          port: proxyInfo.port,
          type: proxyInfo.type || "http",
          proxyDNS: true,
          active: true,
        },
      ],
    };

    try {
      if (navigator.userAgent.includes("Firefox")) {
        await this.setFirefoxProxy(config);
      } else {
        await this.setChromeProxy(config);
      }
    } catch (error) {
      console.error("Error setting browser proxy:", error);
    }
  }

  static async setFirefoxProxy(preferences) {
    if (navigator.userAgent.includes("Android")) return;

    try {
      const isIncognitoAllowed = browserAPI.extension?.isAllowedIncognitoAccess
        ? await browserAPI.extension.isAllowedIncognitoAccess()
        : true;

      if (!isIncognitoAllowed) {
        return;
      }

      if (browserAPI.proxy?.settings) {
        await browserAPI.proxy.settings.clear({});
      }
    } catch (error) {
      console.error("Error setting Firefox proxy:", error);
    }
  }

  static async setChromeProxy(preferences) {
    try {
      const config = { value: {}, scope: "regular" };
      const proxy = this.findActiveProxy(preferences);

      if (proxy && browserAPI.proxy?.settings) {
        config.value.mode = "fixed_servers";
        config.value.rules = this.getSingleProxyRule(proxy);
        await browserAPI.proxy.settings.set(config);
      }
    } catch (error) {
      console.error("Error setting Chrome proxy:", error);
    }
  }

  static findActiveProxy(preferences) {
    return preferences.data.find(
      (proxy) =>
        proxy.active &&
        proxy.type !== "pac" &&
        proxy.hostname &&
        preferences.mode === `${proxy.hostname}:${proxy.port}`
    );
  }

  static getSingleProxyRule(proxy) {
    return {
      singleProxy: {
        scheme: proxy.type,
        host: proxy.hostname,
        port: parseInt(proxy.port),
      },
    };
  }
}

class AutoChangeManager {
  constructor() {
    this.isRunning = false;
    this.timeInterval = 0;
    this.currentTimer = null;
    this.config = null;
    this.isPopupOpen = false;
    this.lastSyncTime = 0;
  }

  async start(config) {
    this.stop();

    if (!config.isAutoChangeIP || config.timeAutoChangeIP <= 0) {
      return;
    }

    this.isRunning = true;
    this.timeInterval = config.timeAutoChangeIP;
    this.config = config;

    // Save config and initial timer state
    await browserAPI.storage.local.set({
      backgroundTimerConfig: config,
      backgroundTimerStartTime: Date.now(),
      backgroundTimerDuration: config.timeAutoChangeIP,
      backgroundTimerActive: true
    });

    console.log(`Background timer started: ${this.timeInterval}s`);
    this.scheduleNextChange();
  }

  scheduleNextChange() {
    if (!this.isRunning) return;

    // FIXED: Check every second for more responsive timer
    this.currentTimer = setTimeout(async () => {
      if (!this.isRunning) return;

      // Check for timer expired flag from popup
      await this.checkTimerExpiredFlag();

      // Get current remaining time
      const remainingTime = await this.getRemainingTime();
      
      if (remainingTime <= 0) {
        // Timer expired, execute auto change
        console.log("Background timer expired, executing auto change IP");
        await this.handleAutoChange();
      } else {
        // Check if popup is handling the timer
        const popupHandling = await this.checkPopupTimerStatus();
        
        if (!popupHandling) {
          // Popup closed, but timer not expired yet - continue monitoring
          console.log(`Background monitoring timer: ${remainingTime}s remaining`);
        } else {
          // Popup is handling timer
          console.log(`Popup handling timer: ${remainingTime}s remaining`);
        }
        
        // Schedule next check in 1 second for responsiveness
        this.timeInterval = 1; // Check every second
        this.scheduleNextChange();
      }
    }, Math.min(this.timeInterval * 1000, 1000)); // Check at least every second
  }

  // FIXED: Check for timer expired flag from popup (fallback)
  async checkTimerExpiredFlag() {
    try {
      const result = await browserAPI.storage.local.get(['timerExpiredFlag', 'timerExpiredTime']);
      
      if (result.timerExpiredFlag) {
        console.log("Found timer expired flag from popup");
        
        // Clear the flag
        await browserAPI.storage.local.remove(['timerExpiredFlag', 'timerExpiredTime']);
        
        // Clear current timer and execute change immediately
        if (this.currentTimer) {
          clearTimeout(this.currentTimer);
          this.currentTimer = null;
        }
        
        // Execute auto change immediately
        await this.handleAutoChange();
        return true;
      }
    } catch (error) {
      console.error("Error checking timer expired flag:", error);
    }
    
    return false;
  }

  // Check if popup is open and handling timer
  async checkPopupTimerStatus() {
    try {
      // Get current timer state from storage
      const result = await browserAPI.storage.local.get([
        'popupTimerActive',
        'popupLastUpdate',
        'popupTimerValue'
      ]);

      const now = Date.now();
      const lastUpdate = result.popupLastUpdate || 0;
      const timeSinceUpdate = (now - lastUpdate) / 1000;

      // If popup updated within last 5 seconds, consider it active
      return result.popupTimerActive && timeSinceUpdate < 5;
    } catch (error) {
      return false;
    }
  }

  // Handle auto change when popup is closed
  async handleAutoChange() {
    if (!this.isRunning) return;

    try {
      console.log("Background: Starting auto change IP");
      
      // Notify popup if open
      this.sendToPopup("showProcessingNewIpConnect", {});
      
      // Step 1: Disconnect current proxy
      await proxyManager.setDirectProxy();
      await this.sleep(1000);

      // Step 2: Get new IP
      const result = await APIService.changeIP(
        this.config.apiKey,
        this.config.location
      );

      if (result?.code === 200) {
        console.log("Background: IP change successful");
        
        // Step 3: Set new proxy
        await proxyManager.handleProxyResponse(
          result.data,
          this.config.apiKey,
          this.config.proxyType
        );

        // Step 4: Reset timer to default and continue
        this.timeInterval = this.config.timeAutoChangeIP;

        // Update storage for popup sync
        await browserAPI.storage.local.set({
          backgroundTimerStartTime: Date.now(),
          backgroundTimerDuration: this.timeInterval,
          backgroundTimerActive: true,
          lastAutoChangeTime: Date.now()
        });

        // Notify popup of success
        this.sendToPopup("successGetProxyInfo", result.data);

        // Continue the cycle with proper interval reset
        if (this.isRunning) {
          console.log(`Background: Restarting timer for ${this.timeInterval}s`);
          // Reset to check every second again
          this.timeInterval = 1;
          this.scheduleNextChange();
        }
      } else {
        // Handle error
        const error = result?.code === 500
          ? CONFIG.ERRORS.CONNECTION_FAILED
          : result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;

        console.error("Background auto change failed:", error);
        this.sendToPopup("failureGetProxyInfo", { error });

        // Retry after shorter interval on error
        if (this.isRunning) {
          this.currentTimer = setTimeout(() => this.scheduleNextChange(), 30000);
        }
      }
    } catch (error) {
      console.error("Background auto change unexpected error:", error);
      if (this.isRunning) {
        this.currentTimer = setTimeout(() => this.scheduleNextChange(), 30000);
      }
    }
  }

  // Get remaining time for popup sync
  async getRemainingTime() {
    try {
      const result = await browserAPI.storage.local.get([
        'backgroundTimerStartTime',
        'backgroundTimerDuration',
        'backgroundTimerActive'
      ]);

      if (!result.backgroundTimerActive || !result.backgroundTimerStartTime) {
        return 0;
      }

      const now = Date.now();
      const elapsed = Math.floor((now - result.backgroundTimerStartTime) / 1000);
      const remaining = Math.max(0, result.backgroundTimerDuration - elapsed);

      return remaining;
    } catch (error) {
      return 0;
    }
  }

  // Sync with popup timer when popup opens
  async syncWithPopup() {
    const remaining = await this.getRemainingTime();
    
    if (remaining > 0) {
      // Update interval to remaining time
      this.timeInterval = remaining;
      
      // Clear current timer and restart with correct time
      if (this.currentTimer) {
        clearTimeout(this.currentTimer);
        this.currentTimer = null;
      }
      
      console.log(`Background: Syncing with popup, ${remaining}s remaining`);
      this.scheduleNextChange();
    }
    
    return remaining;
  }

  stop() {
    this.isRunning = false;

    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    // Clear storage
    browserAPI.storage.local.remove([
      'backgroundTimerConfig',
      'backgroundTimerStartTime', 
      'backgroundTimerDuration',
      'backgroundTimerActive'
    ]);

    this.config = null;
    console.log("Background timer stopped");
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
      // Popup might be closed, that's fine
    }
  }

  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      timeInterval: this.timeInterval,
      hasConfig: !!this.config,
      nextChangeTime: this.currentTimer ? Date.now() + this.timeInterval * 1000 : null,
      mode: "background_popup_sync",
    };
  }
}
/**
 * Message Handler - Handles communication with popup
 */
class MessageHandler {
  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
      // Popup might be closed, that's fine
    }
  }

  async handleMessage(request, sender, sendResponse) {
  try {
    switch (request.greeting) {
      case "ping":
        sendResponse({ pong: true });
        break;

      // FIXED: Add handler for background timer status
      case "getBackgroundTimerStatus":
        const remainingTime = await autoChangeManager.getRemainingTime();
        sendResponse({ 
          remainingTime: remainingTime,
          isActive: autoChangeManager.isRunning,
          config: autoChangeManager.config
        });
        
        // Sync background timer with popup opening
        if (remainingTime > 0) {
          await autoChangeManager.syncWithPopup();
        }
        break;

      // FIXED: Handle immediate popup timer expiration
      case "popupTimerExpired":
        console.log("Received popup timer expired notification");
        if (autoChangeManager.isRunning) {
          // Clear current timer and execute change immediately
          if (autoChangeManager.currentTimer) {
            clearTimeout(autoChangeManager.currentTimer);
            autoChangeManager.currentTimer = null;
          }
          // Execute auto change immediately
          await autoChangeManager.handleAutoChange();
        }
        sendResponse({ received: true });
        break;

      case CONFIG.MESSAGES.GET_LOCATIONS_DATA:
        const locations = await this.getLocations();
        if (locations) sendResponse({ data: locations });
        break;

      case CONFIG.MESSAGES.CHECK_VERSION:
        this.checkVersion();
        await proxyManager.setDirectProxy();
        break;

      case CONFIG.MESSAGES.GET_INFO_KEY:
        await this.getInfoKey(request.data);
        break;

      case CONFIG.MESSAGES.GET_CURRENT_PROXY:
        autoChangeManager.stop();
        await proxyManager.setDirectProxy();
        await this.getCurrentProxy(request.data.apiKey, request.data.proxyType);
        break;

      case CONFIG.MESSAGES.CANCEL_ALL:
        this.deleteAlarm("flagLoop");
        this.deleteAlarm("refreshPage");
        autoChangeManager.stop();
        await this.disconnectProxy(request.data.apiKey, request.data.whitelist_ip);
        await proxyManager.setDirectProxy();
        break;

      case CONFIG.MESSAGES.CHANGE_IP:
        autoChangeManager.stop();
        await proxyManager.setDirectProxy();
        await this.changeIP(request.data.apiKey, request.data.location, request.data.proxyType);
        break;

      case CONFIG.MESSAGES.AUTO_CHANGE_IP:
        // Stop any existing timer
        autoChangeManager.stop();
        await proxyManager.setDirectProxy();

        // Start both immediate change and background manager
        await this.changeIP(request.data.apiKey, request.data.location, request.data.proxyType);
        await autoChangeManager.start(request.data);
        break;
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
}

  async getLocations() {
    const result = await APIService.getLocations();
    if (result?.code === 200) {
      this.sendToPopup("getLocationsSuccess", result.data);
      return result.data;
    }
    this.sendToPopup("failureGetProxyInfo", {
      error: CONFIG.ERRORS.CONNECTION_FAILED,
    });
    return null;
  }

  async getInfoKey(data) {
    const result = await APIService.getInfoKey(data.apiKey);
    if (result?.code === 200) {
      this.sendToPopup("successGetInfoKey", result);
      return result.data;
    }
    const error =
      result?.status === 500
        ? CONFIG.ERRORS.CONNECTION_FAILED
        : result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;
    this.sendToPopup("failureGetProxyInfo", { error });
  }

  async getCurrentProxy(apiKey, proxyType) {
    this.sendToPopup("processingGetProxyInfo", {});

    const result = await APIService.getInfoKey(apiKey);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    } else {
      const error =
        result?.status === 500
          ? CONFIG.ERRORS.CONNECTION_FAILED
          : result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;
      this.sendToPopup("failureGetProxyInfo", { error });
    }
  }

  async changeIP(apiKey, location, proxyType) {
    this.sendToPopup("showProcessingNewIpConnect", {});

    const result = await APIService.changeIP(apiKey, location);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    } else {
      const error =
        result?.code === 500
          ? CONFIG.ERRORS.CONNECTION_FAILED
          : result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;
      this.sendToPopup("failureGetProxyInfo", { error });
    }
  }

  async disconnectProxy(apiKey, whitelistIp) {
    return true;
  }

  deleteAlarm(name) {
    browserAPI.alarms.clear(name);
  }

  checkVersion() {}
}

/**
 * Main Proxy Manager - Orchestrates all proxy operations
 */
class MainProxyManager {
  constructor() {
    this.authManager = new AuthenticationManager();
    this.requestManager = new ProxyRequestManager();
  }

  async setDirectProxy() {
    try {
      await this.requestManager.clearProxy();

      if (browserAPI.proxy?.settings) {
        await browserAPI.proxy.settings.clear({});
      }

      this.authManager.clear();
      this.setBadgeOff();
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: null,
      });
    } catch (error) {
      console.error("Error setting direct proxy:", error);
    }
  }

  async setProxySettings(proxyInfo) {
    try {
      const proxyConfig = {
        mode: `${proxyInfo.public_ip}:${proxyInfo.port}`,
        data: [
          {
            type: proxyInfo.type || "http",
            hostname: proxyInfo.public_ip,
            port: proxyInfo.port,
            username: proxyInfo.username,
            password: proxyInfo.password,
            proxyDNS: true,
            active: true,
          },
        ],
      };

      await this.requestManager.init(proxyConfig);
      this.authManager.init(proxyConfig.data);
      await BrowserProxyManager.setBrowserProxy(proxyInfo);

      this.setBadgeOn(proxyInfo.location);
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
      });
    } catch (error) {
      console.error("Error setting proxy:", error);
      messageHandler.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.SETUP_FAILED,
      });
    }
  }

  async handleProxyResponse(response, apiKey, proxyType) {
    if (!response?.ipv4 && !response?.ipv6) {
      const error =
        response?.code === 500
          ? CONFIG.ERRORS.CONNECTION_FAILED
          : CONFIG.ERRORS.INVALID_PROXY;
      messageHandler.sendToPopup("failureGetProxyInfo", { error });
      return;
    }

    const proxyInfo = await this.buildProxyInfo(response, apiKey, proxyType);
    if (!proxyInfo.public_ip || !proxyInfo.port) {
      messageHandler.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.INVALID_PROXY,
      });
      return;
    }

    await this.setProxySettings(proxyInfo);
    messageHandler.sendToPopup("successGetProxyInfo", proxyInfo);
  }

  async buildProxyInfo(response, apiKey, proxyType) {
    const portV4 = response.ipv4 ? this.extractPort(response.ipv4) : "";
    const portV6 = response.ipv6 ? this.extractPort(response.ipv6) : "";

    let publicIp = response.public_ipv4;
    if (response.ipv4 && this.containsDomain(response.ipv4)) {
      try {
        publicIp = await APIService.resolveDomain(response.ipv4.split(":")[0]);
      } catch (error) {
        console.error("Error resolving domain:", error);
      }
    }

    return {
      public_ipv6: response.public_ipv6 || "",
      public_ipv4: response.public_ipv4 || "",
      public_ip: publicIp || response.public_ipv4,
      username: response.credential?.username,
      password: response.credential?.password,
      proxyTimeout: response.proxyTimeout,
      nextChangeIP: response.nextChangeIP,
      nextTime:
        Math.floor(Date.now() / 1000) + parseInt(response.nextChangeIP || 0),
      location: response.location,
      apiKey,
      port: this.selectPort(proxyType, portV4, portV6),
      type: response.proxyType || "http",
    };
  }

  extractPort(address) {
    const parts = address.split(":");
    return parts.length >= 2 ? parts[parts.length - 1] : "";
  }

  selectPort(proxyType, portV4, portV6) {
    if (proxyType === "ipv4" && portV4) return parseInt(portV4);
    if (proxyType === "ipv6" && portV6) return parseInt(portV6);
    return parseInt(portV4 || portV6);
  }

  containsDomain(text) {
    return /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/.test(text);
  }

  setBadgeOff() {
    browserAPI.action.setBadgeBackgroundColor({ color: [162, 36, 36, 255] });
    browserAPI.action.setBadgeText({ text: "OFF" });
  }

  setBadgeOn(location) {
    browserAPI.action.setBadgeBackgroundColor({ color: [36, 162, 36, 255] });
    browserAPI.action.setBadgeText({ text: "ON" });
  }
}

// Initialize managers
const authManager = new AuthenticationManager();
const proxyRequestManager = new ProxyRequestManager();
const autoChangeManager = new AutoChangeManager();
const messageHandler = new MessageHandler();
const proxyManager = new MainProxyManager();

// Set up message listener
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  messageHandler.handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async responses
});

// Initialize extension
const initializeExtension = async () => {
  await proxyRequestManager.loadSettings();
  proxyRequestManager.initializeListener();
};

// Extension event listeners
browserAPI.runtime.onStartup.addListener(() => {
  initializeExtension();
});

browserAPI.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

// Initialize on load
initializeExtension();
