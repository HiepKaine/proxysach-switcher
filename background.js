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
    this.remainingTime = 0;
    this.originalDuration = 0;
    this.config = null;
    this.timer = null;
    this.isChangingIP = false;
    this.lastChangeTime = 0;
    this.changeDebounce = 3000; // 3 second debounce
    this.startTime = 0;
    this.lastUpdateTime = 0; // FIXED: Track last update time
  }

  async start(config) {
    console.log("AutoChangeManager: Starting with config", config);
    
    // Stop any existing timer
    await this.stop();

    if (!config.isAutoChangeIP || !config.timeAutoChangeIP || config.timeAutoChangeIP <= 0) {
      console.log("AutoChangeManager: Invalid config, not starting");
      return;
    }

    this.config = config;
    this.originalDuration = parseInt(config.timeAutoChangeIP);
    this.remainingTime = this.originalDuration;
    this.isRunning = true;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now(); // FIXED: Initialize last update time

    // Save state immediately
    await this.saveState();

    console.log(`AutoChangeManager: Started with ${this.remainingTime}s`);
    this.scheduleTimer();
  }

  scheduleTimer() {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;

      this.remainingTime--;
      this.lastUpdateTime = Date.now(); // FIXED: Update last update time
      
      console.log(`AutoChangeManager: ${this.remainingTime}s remaining`);

      // Save current state every update
      await this.saveState();

      if (this.remainingTime <= 0) {
        console.log("AutoChangeManager: Timer expired, executing change IP");
        await this.executeAutoChange();
      } else {
        // Continue countdown
        this.scheduleTimer();
      }
    }, 1000);
  }

  async executeAutoChange() {
    if (this.isChangingIP) {
      console.log("AutoChangeManager: Already changing IP, skipping");
      return;
    }

    const now = Date.now();
    if (now - this.lastChangeTime < this.changeDebounce) {
      console.log("AutoChangeManager: Debouncing change IP request");
      return;
    }

    this.isChangingIP = true;
    this.lastChangeTime = now;

    try {
      console.log("AutoChangeManager: Starting IP change process");
      
      // Notify popup
      this.sendToPopup("showProcessingNewIpConnect", {});

      // Disconnect current proxy
      await proxyManager.setDirectProxy();
      await this.sleep(1000);

      // Call change IP API
      const result = await APIService.changeIP(this.config.apiKey, this.config.location);

      if (result && result.code === 200) {
        console.log("AutoChangeManager: IP change successful");
        
        // Set new proxy
        await proxyManager.handleProxyResponse(result.data, this.config.apiKey, this.config.proxyType);
        
        // FIXED: Reset timer for next cycle with proper state management
        this.remainingTime = this.originalDuration;
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        await this.saveState();
        
        // Notify popup of success
        this.sendToPopup("successGetProxyInfo", result.data);
        
        // Continue the cycle
        if (this.isRunning) {
          console.log(`AutoChangeManager: Restarting cycle with ${this.remainingTime}s`);
          this.scheduleTimer();
        }
      } else {
        console.error("AutoChangeManager: IP change failed", result);
        const error = result?.code === 500 ? "Kết Nối Thất Bại" : (result?.message || "Lỗi không xác định");
        this.sendToPopup("failureGetProxyInfo", { error });
        
        // Retry after 30 seconds on error
        if (this.isRunning) {
          this.remainingTime = 30;
          this.lastUpdateTime = Date.now();
          await this.saveState();
          this.scheduleTimer();
        }
      }
    } catch (error) {
      console.error("AutoChangeManager: Unexpected error during IP change", error);
      
      // Retry after 30 seconds on error
      if (this.isRunning) {
        this.remainingTime = 30;
        this.lastUpdateTime = Date.now();
        await this.saveState();
        this.scheduleTimer();
      }
    } finally {
      this.isChangingIP = false;
    }
  }

  // FIXED: Enhanced state saving with better tracking
  async saveState() {
    try {
      const state = {
        isRunning: this.isRunning,
        remainingTime: this.remainingTime,
        originalDuration: this.originalDuration,
        config: this.config,
        startTime: this.startTime,
        lastUpdateTime: this.lastUpdateTime,
        isChangingIP: this.isChangingIP,
        version: Date.now() // Version for conflict resolution
      };

      await browserAPI.storage.local.set({
        autoChangeState: state
      });

      console.log("AutoChangeManager: State saved", state);
    } catch (error) {
      console.error("AutoChangeManager: Error saving state", error);
    }
  }

  // FIXED: Enhanced state loading with time synchronization
  async loadState() {
    try {
      const result = await browserAPI.storage.local.get(['autoChangeState']);
      const state = result.autoChangeState;
      
      if (state && state.isRunning) {
        console.log("AutoChangeManager: Loading previous state", state);
        
        const now = Date.now();
        const timeSinceLastUpdate = Math.floor((now - state.lastUpdateTime) / 1000);
        
        // FIXED: More robust time calculation
        if (timeSinceLastUpdate < 600) { // 10 minutes threshold
          this.isRunning = state.isRunning;
          this.originalDuration = state.originalDuration;
          this.config = state.config;
          this.startTime = state.startTime;
          this.isChangingIP = state.isChangingIP || false;
          
          // FIXED: Calculate remaining time based on elapsed time
          this.remainingTime = Math.max(0, state.remainingTime - timeSinceLastUpdate);
          this.lastUpdateTime = now;
          
          console.log(`AutoChangeManager: Calculated remaining time: ${this.remainingTime}s (elapsed: ${timeSinceLastUpdate}s)`);
          
          // Save updated state
          await this.saveState();
          
          if (this.remainingTime > 0) {
            console.log(`AutoChangeManager: Resuming with ${this.remainingTime}s remaining`);
            this.scheduleTimer();
            return true;
          } else if (!this.isChangingIP) {
            console.log("AutoChangeManager: Timer expired while background was inactive");
            await this.executeAutoChange();
            return true;
          }
        } else {
          console.log("AutoChangeManager: State too old, clearing");
          await this.clearState();
        }
      }
    } catch (error) {
      console.error("AutoChangeManager: Error loading state", error);
    }
    
    return false;
  }

  // FIXED: Enhanced status with better synchronization data
  getStatus() {
    return {
      isActive: this.isRunning,
      remainingTime: this.remainingTime,
      originalDuration: this.originalDuration,
      isChangingIP: this.isChangingIP,
      config: this.config,
      lastChangeTime: this.lastChangeTime,
      startTime: this.startTime,
      lastUpdateTime: this.lastUpdateTime,
      currentTime: Date.now() // Current time for sync calculation
    };
  }

  // FIXED: Clear state method
  async clearState() {
    try {
      await browserAPI.storage.local.remove(['autoChangeState']);
      console.log("AutoChangeManager: State cleared");
    } catch (error) {
      console.error("AutoChangeManager: Error clearing state", error);
    }
  }

  async stop() {
    console.log("AutoChangeManager: Stopping");
    
    this.isRunning = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Clear state
    await this.clearState();

    this.remainingTime = 0;
    this.originalDuration = 0;
    this.config = null;
    this.isChangingIP = false;
    this.lastUpdateTime = 0;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
      // Popup might be closed, ignore error
    }
  }
}

/**
 * FIXED Message Handler - Better timer coordination
 */
class MessageHandler {
  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
      // Popup might be closed, ignore error
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.greeting) {
        case "ping":
          sendResponse({ pong: true });
          break;

        case "getBackgroundTimerStatus":
          const status = autoChangeManager.getStatus();
          console.log("Background: Sending timer status", status);
          sendResponse(status);
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
          // FIXED: KHÔNG stop background timer - chỉ get proxy info
          console.log("Background: GET_CURRENT_PROXY request - keeping timer running");
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
          console.log("Background: Received AUTO_CHANGE_IP request", request.data);
          
          // Stop any existing timer
          await autoChangeManager.stop();
          await this.sleep(500);
          
          // Disconnect current proxy
          await proxyManager.setDirectProxy();
          
          // Execute immediate IP change
          await this.changeIP(request.data.apiKey, request.data.location, request.data.proxyType);
          
          // Start auto change manager
          await autoChangeManager.start(request.data);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const error = result?.status === 500 ? CONFIG.ERRORS.CONNECTION_FAILED : (result?.message || CONFIG.ERRORS.UNKNOWN_ERROR);
    this.sendToPopup("failureGetProxyInfo", { error });
  }

  async getCurrentProxy(apiKey, proxyType) {
    this.sendToPopup("processingGetProxyInfo", {});

    const result = await APIService.getInfoKey(apiKey);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    } else {
      const error = result?.status === 500 ? CONFIG.ERRORS.CONNECTION_FAILED : (result?.message || CONFIG.ERRORS.UNKNOWN_ERROR);
      this.sendToPopup("failureGetProxyInfo", { error });
    }
  }

  async changeIP(apiKey, location, proxyType) {
    this.sendToPopup("showProcessingNewIpConnect", {});

    const result = await APIService.changeIP(apiKey, location);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    } else {
      const error = result?.code === 500 ? CONFIG.ERRORS.CONNECTION_FAILED : (result?.message || CONFIG.ERRORS.UNKNOWN_ERROR);
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
  console.log("Background: Initializing extension");
  
  await proxyRequestManager.loadSettings();
  proxyRequestManager.initializeListener();
  
  // Try to restore auto change manager state
  const restored = await autoChangeManager.loadState();
  if (restored) {
    console.log("Background: Auto change manager state restored");
  }
};

// Extension event listeners
browserAPI.runtime.onStartup.addListener(() => {
  console.log("Background: Extension startup");
  initializeExtension();
});

browserAPI.runtime.onInstalled.addListener(() => {
  console.log("Background: Extension installed");
  initializeExtension();
});

// Initialize on load
initializeExtension();
