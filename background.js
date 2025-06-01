// Browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Fix for Manifest V3 API differences
if (browserAPI.browserAction && !browserAPI.action) {
  browserAPI.action = browserAPI.browserAction;
}

// Constants
const CONFIG = {
  SERVER_URL: "https://api.vnproxy.com",
  ENDPOINTS: {
    STATUS_IP: "/webservice/statusIP",
    CHANGE_IP: "/webservice/changeIP",
    GET_LOCATION: "/webservice/getLocation"
  },
  STORAGE_KEYS: {
    PROXY_MODE: "proxyMode",
    PROXY_DATA: "proxyData",
    TIME_CHANGE_IP: "TIME_CHANGE_IP",
    TX_PROXY: "tx_proxy"
  },
  MESSAGES: {
    GET_LOCATIONS_DATA: "getLocationsData",
    CHECK_VERSION: "checkVersion",
    GET_INFO_KEY: "getInfoKey",
    GET_CURRENT_PROXY: "getCurrentProxy",
    CANCEL_ALL: "cancelALL",
    CHANGE_IP: "changeIp",
    AUTO_CHANGE_IP: "autoChangeIp"
  },
  ERRORS: {
    CONNECTION_FAILED: "Kết Nối Thất Bại",
    UNKNOWN_ERROR: "Lỗi không xác định",
    INVALID_PROXY: "Không thể lấy thông tin proxy",
    SETUP_FAILED: "Không thể thiết lập proxy"
  }
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
    console.log("Authentication initialized with", this.credentials.length, "proxies");
    this.setupWebRequestListener();
  }

  setupWebRequestListener() {
    if (!browserAPI.webRequest?.onAuthRequired) return;

    // Remove existing listener
    if (browserAPI.webRequest.onAuthRequired.hasListener(this.handleAuthRequired)) {
      browserAPI.webRequest.onAuthRequired.removeListener(this.handleAuthRequired);
    }

    // Add new listener
    browserAPI.webRequest.onAuthRequired.addListener(
      this.handleAuthRequired.bind(this),
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
  }

  handleAuthRequired(details) {
    console.log("Auth required for:", details.url);

    const credential = this.credentials.find(cred => cred.username && cred.password);
    if (credential) {
      console.log("Providing auth for proxy:", credential.hostname);
      return {
        authCredentials: {
          username: credential.username,
          password: credential.password
        }
      };
    }

    console.log("No credentials found for auth request");
    return {};
  }

  clear() {
    this.credentials = [];
    if (browserAPI.webRequest?.onAuthRequired?.hasListener(this.handleAuthRequired)) {
      browserAPI.webRequest.onAuthRequired.removeListener(this.handleAuthRequired);
    }
    console.log("Authentication cleared");
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
    console.log("Proxy initialized:", this.mode, this.proxy);
  }

  updateSettings(preferences) {
    this.mode = preferences.mode;
    const validProxies = preferences.data.filter(proxy => 
      proxy.type !== "pac" && proxy.hostname
    );
    
    this.proxy = this.findMatchingProxy(validProxies, preferences.mode);
  }

  findMatchingProxy(proxies, mode) {
    return /:\d+[^/]*$/.test(mode) && 
      proxies.find(proxy => mode === `${proxy.hostname}:${proxy.port}`);
  }

  initializeListener() {
    if (this.isListenerAdded || !browserAPI.proxy?.onRequest) return;

    browserAPI.proxy.onRequest.addListener(
      (e) => this.process(e),
      { urls: ["<all_urls>"] }
    );
    this.isListenerAdded = true;
    console.log("Proxy listener initialized");
  }

  async loadSettings() {
    try {
      const result = await browserAPI.storage.local.get([
        CONFIG.STORAGE_KEYS.PROXY_MODE,
        CONFIG.STORAGE_KEYS.PROXY_DATA
      ]);
      
      if (result.proxyMode && result.proxyData) {
        this.mode = result.proxyMode;
        const validProxies = result.proxyData.filter(proxy => 
          proxy.type !== "pac" && proxy.hostname
        );
        this.proxy = this.findMatchingProxy(validProxies, result.proxyMode);
        this.isInitialized = true;
        console.log("Proxy settings loaded from storage:", this.mode, this.proxy);
      }
    } catch (error) {
      console.error("Failed to load proxy settings:", error);
    }
  }

  async saveSettings(preferences) {
    try {
      await browserAPI.storage.local.set({
        [CONFIG.STORAGE_KEYS.PROXY_MODE]: preferences.mode,
        [CONFIG.STORAGE_KEYS.PROXY_DATA]: preferences.data
      });
      console.log("Proxy settings saved to storage");
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
      port: parseInt(proxyData.port)
    };

    // Set proxyDNS for SOCKS
    if (proxyData.type.startsWith("socks")) {
      response.proxyDNS = !!proxyData.proxyDNS;
    }

    // Add authentication
    if (proxyData.username && proxyData.password) {
      response.username = proxyData.username;
      response.password = proxyData.password;
      response.proxyAuthorizationHeader = `Basic ${btoa(`${proxyData.username}:${proxyData.password}`)}`;
    }

    console.log("Proxy response:", response);
    return response;
  }

  async clearProxy() {
    this.mode = "";
    this.proxy = {};
    this.isInitialized = false;
    await browserAPI.storage.local.remove([
      CONFIG.STORAGE_KEYS.PROXY_MODE, 
      CONFIG.STORAGE_KEYS.PROXY_DATA
    ]);
    console.log("Proxy settings cleared");
  }

  getCurrentProxy() {
    return {
      mode: this.mode,
      proxy: this.proxy,
      isActive: !!this.proxy && this.proxy.type !== "direct"
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
        headers
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
      const randomAnswer = result.Answer[Math.floor(Math.random() * result.Answer.length)];
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
      data: [{
        hostname: proxyInfo.public_ip,
        username: proxyInfo.username,
        password: proxyInfo.password,
        port: proxyInfo.port,
        type: proxyInfo.type || "http",
        proxyDNS: true,
        active: true
      }]
    };

    try {
      if (navigator.userAgent.includes("Firefox")) {
        await this.setFirefoxProxy(config);
      } else {
        await this.setChromeProxy(config);
      }
      console.log("Browser proxy set:", config.mode);
    } catch (error) {
      console.error("Error setting browser proxy:", error);
    }
  }

  static async setFirefoxProxy(preferences) {
    if (navigator.userAgent.includes("Android")) return;

    try {
      const isIncognitoAllowed = browserAPI.extension?.isAllowedIncognitoAccess ? 
        await browserAPI.extension.isAllowedIncognitoAccess() : true;
      
      if (!isIncognitoAllowed) {
        console.log("Incognito access not allowed");
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
    return preferences.data.find(proxy => 
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
        port: parseInt(proxy.port)
      }
    };
  }
}

/**
 * Auto Change Manager - Handles automatic IP changing
 */
class AutoChangeManager {
  constructor() {
    this.isRunning = false;
    this.timeInterval = 0;
    this.currentTimer = null;
    this.config = null;
  }

  async start(config) {
    // Stop any existing timer
    this.stop();

    // Validate config
    if (!config.isAutoChangeIP || config.timeAutoChangeIP <= 0) {
      console.log("Auto change IP disabled or invalid time");
      return;
    }

    // Save time setting to storage
    if (config.timeAutoChangeIP > 0) {
      await browserAPI.storage.sync.set({ [CONFIG.STORAGE_KEYS.TIME_CHANGE_IP]: config.timeAutoChangeIP });
    }

    this.isRunning = true;
    this.timeInterval = config.timeAutoChangeIP;
    this.config = config;

    console.log(`Starting auto change IP with interval: ${this.timeInterval} seconds`);
    
    // Start the auto change cycle
    this.scheduleNextChange();
  }

  scheduleNextChange() {
    if (!this.isRunning) return;

    console.log(`Next IP change in ${this.timeInterval} seconds`);
    
    this.currentTimer = setTimeout(async () => {
      if (!this.isRunning) return;

      try {
        // Step 1: Disconnect current proxy
        console.log("Auto change: Disconnecting current proxy...");
        messageHandler.sendToPopup("disconnectProxy", {});
        await proxyManager.setDirectProxy();
        
        // Wait a moment for cleanup
        await this.sleep(1000);
        
        // Step 2: Get new IP
        console.log("Auto change: Getting new IP...");
        messageHandler.sendToPopup("showProcessingNewIpConnect", {});
        
        const result = await APIService.changeIP(this.config.apiKey, this.config.location);
        
        if (result?.code === 200) {
          // Step 3: Set new proxy
          console.log("Auto change: Setting new proxy...");
          await proxyManager.handleProxyResponse(result.data, this.config.apiKey, this.config.proxyType);
          
          // Step 4: Schedule next change if still running
          if (this.isRunning) {
            console.log("Auto change: IP changed successfully, scheduling next change");
            this.scheduleNextChange();
          }
        } else {
          // Handle error
          const error = result?.code === 500 ? 
            CONFIG.ERRORS.CONNECTION_FAILED : 
            (result?.message || CONFIG.ERRORS.UNKNOWN_ERROR);
          
          console.error("Auto change failed:", error);
          messageHandler.sendToPopup("failureGetProxyInfo", { error });
          
          // Try again after a shorter interval on error
          if (this.isRunning) {
            console.log("Auto change: Retrying in 30 seconds due to error");
            this.currentTimer = setTimeout(() => this.scheduleNextChange(), 30000);
          }
        }
      } catch (error) {
        console.error("Auto change error:", error);
        if (this.isRunning) {
          // Retry on unexpected error
          console.log("Auto change: Retrying in 30 seconds due to unexpected error");
          this.currentTimer = setTimeout(() => this.scheduleNextChange(), 30000);
        }
      }
    }, this.timeInterval * 1000);
  }

  stop() {
    console.log("Stopping auto change IP");
    this.isRunning = false;
    
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    
    this.config = null;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      timeInterval: this.timeInterval,
      hasConfig: !!this.config
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
      console.error("Error sending message to popup:", error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.greeting) {
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
          autoChangeManager.stop();
          await proxyManager.setDirectProxy();
          // First change IP immediately, then start auto change
          await this.changeLocationProxy(request.data.apiKey, request.data.location, request.data.proxyType);
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
    this.sendToPopup("failureGetProxyInfo", { error: CONFIG.ERRORS.CONNECTION_FAILED });
    return null;
  }

  async getInfoKey(data) {
    const result = await APIService.getInfoKey(data.apiKey);
    if (result?.code === 200) {
      this.sendToPopup("successGetInfoKey", result);
      return result.data;
    }
    const error = result?.status === 500 ? 
      CONFIG.ERRORS.CONNECTION_FAILED : 
      result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;
    this.sendToPopup("failureGetProxyInfo", { error });
  }

  async getCurrentProxy(apiKey, proxyType) {
    this.sendToPopup("processingGetProxyInfo", {});
    const result = await APIService.getInfoKey(apiKey);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    }
  }

  async changeIP(apiKey, location, proxyType) {
    this.sendToPopup("showProcessingNewIpConnect", {});
    const result = await APIService.changeIP(apiKey, location);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    }
  }

  async changeLocationProxy(apiKey, location, proxyType) {
    const result = await APIService.changeIP(apiKey, location);
    if (result?.code === 200) {
      await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);
    }
  }

  async disconnectProxy(apiKey, whitelistIp) {
    // Implementation for disconnect if needed
    return true;
  }

  deleteAlarm(name) {
    browserAPI.alarms.clear(name);
  }

  checkVersion() {
    console.log("Version check called");
  }
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
      await browserAPI.storage.sync.set({ [CONFIG.STORAGE_KEYS.TX_PROXY]: null });
      
      console.log("Proxy set to direct");
    } catch (error) {
      console.error("Error setting direct proxy:", error);
    }
  }

  async setProxySettings(proxyInfo) {
    try {
      const proxyConfig = {
        mode: `${proxyInfo.public_ip}:${proxyInfo.port}`,
        data: [{
          type: proxyInfo.type || "http",
          hostname: proxyInfo.public_ip,
          port: proxyInfo.port,
          username: proxyInfo.username,
          password: proxyInfo.password,
          proxyDNS: true,
          active: true
        }]
      };

      await this.requestManager.init(proxyConfig);
      this.authManager.init(proxyConfig.data);
      await BrowserProxyManager.setBrowserProxy(proxyInfo);
      
      this.setBadgeOn(proxyInfo.location);
      await browserAPI.storage.sync.set({ [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo });
      
      console.log("Proxy set successfully:", proxyConfig.mode);
    } catch (error) {
      console.error("Error setting proxy:", error);
      messageHandler.sendToPopup("failureGetProxyInfo", { error: CONFIG.ERRORS.SETUP_FAILED });
    }
  }

  async handleProxyResponse(response, apiKey, proxyType) {
    if (!response?.ipv4 && !response?.ipv6) {
      const error = response?.code === 500 ? 
        CONFIG.ERRORS.CONNECTION_FAILED : 
        CONFIG.ERRORS.INVALID_PROXY;
      messageHandler.sendToPopup("failureGetProxyInfo", { error });
      return;
    }

    const proxyInfo = await this.buildProxyInfo(response, apiKey, proxyType);
    if (!proxyInfo.public_ip || !proxyInfo.port) {
      messageHandler.sendToPopup("failureGetProxyInfo", { error: CONFIG.ERRORS.INVALID_PROXY });
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
      nextTime: Math.floor(Date.now() / 1000) + parseInt(response.nextChangeIP || 0),
      location: response.location,
      apiKey,
      port: this.selectPort(proxyType, portV4, portV6),
      type: response.proxyType || "http"
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
});

// Initialize extension
const initializeExtension = async () => {
  console.log("VNProxy Extension initializing...");
  await proxyRequestManager.loadSettings();
  proxyRequestManager.initializeListener();
};

// Extension event listeners
browserAPI.runtime.onStartup.addListener(() => {
  console.log("VNProxy Extension started");
  initializeExtension();
});

browserAPI.runtime.onInstalled.addListener(() => {
  console.log("VNProxy Extension installed/enabled");
  initializeExtension();
});

// Initialize on load
initializeExtension();