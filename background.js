const browserAPI = typeof browser !== "undefined" ? browser : chrome;
if (browserAPI.browserAction && !browserAPI.action) {
  browserAPI.action = browserAPI.browserAction;
}

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
    FIREFOX_PROXY_ACTIVE: "firefoxProxyActive",
  },
  MESSAGES: {
    GET_LOCATIONS_DATA: "getLocationsData",
    CHECK_VERSION: "checkVersion",
    GET_INFO_KEY: "getInfoKey",
    GET_CURRENT_PROXY: "getCurrentProxy",
    CANCEL_ALL: "cancelALL",
    CHANGE_IP: "changeIp",
    AUTO_CHANGE_IP: "autoChangeIp",
    FORCE_DISCONNECT: "forceDisconnect", // New message for Firefox
  },
  ERRORS: {
    CONNECTION_FAILED: "Kết Nối Thất Bại",
    UNKNOWN_ERROR: "Lỗi không xác định",
    INVALID_PROXY: "Không thể lấy thông tin proxy",
    SETUP_FAILED: "Không thể thiết lập proxy",
  },
};

// Browser detection
const IS_FIREFOX =
  typeof browser !== "undefined" || navigator.userAgent.includes("Firefox");
const IS_CHROME = !IS_FIREFOX;

console.log("Background: Browser detected:", IS_FIREFOX ? "Firefox" : "Chrome");

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

class ProxyRequestManager {
  constructor() {
    this.mode = "";
    this.proxy = {};
    this.isInitialized = false;
    this.isListenerAdded = false;
    this.isFirefoxProxyActive = false;
  }

  async init(preferences) {
    await this.saveSettings(preferences);
    this.updateSettings(preferences);
    this.isInitialized = true;

    // For Firefox, set proxy active state
    if (IS_FIREFOX) {
      this.isFirefoxProxyActive = true;
      await this.saveFirefoxProxyState(true);
      console.log("Background: Firefox proxy state set to active");
    }

    // Always ensure listener is active
    this.initializeListener();
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

  async saveFirefoxProxyState(isActive) {
    try {
      await browserAPI.storage.local.set({
        [CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE]: isActive,
      });
      console.log("Background: Firefox proxy state saved:", isActive);
    } catch (error) {
      console.error("Failed to save Firefox proxy state:", error);
    }
  }

  async loadFirefoxProxyState() {
    try {
      const result = await browserAPI.storage.local.get([
        CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE,
      ]);
      return result[CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE] || false;
    } catch (error) {
      return false;
    }
  }

  initializeListener() {
    if (this.isListenerAdded || !browserAPI.proxy?.onRequest) return;

    browserAPI.proxy.onRequest.addListener((e) => this.process(e), {
      urls: ["<all_urls>"],
    });
    this.isListenerAdded = true;
    console.log("Background: Proxy onRequest listener initialized");
  }

  async loadSettings() {
    try {
      const result = await browserAPI.storage.local.get([
        CONFIG.STORAGE_KEYS.PROXY_MODE,
        CONFIG.STORAGE_KEYS.PROXY_DATA,
        CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE,
      ]);

      if (result.proxyMode && result.proxyData) {
        this.mode = result.proxyMode;
        const validProxies = result.proxyData.filter(
          (proxy) => proxy.type !== "pac" && proxy.hostname
        );
        this.proxy = this.findMatchingProxy(validProxies, result.proxyMode);
        this.isInitialized = true;

        // Load Firefox proxy state
        if (IS_FIREFOX) {
          this.isFirefoxProxyActive =
            result[CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE] || false;
          console.log(
            "Background: Firefox proxy state loaded:",
            this.isFirefoxProxyActive
          );
        }
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

    // For Firefox, check if proxy should be active
    if (IS_FIREFOX && !this.isFirefoxProxyActive) {
      console.log("Background: Firefox proxy inactive, returning direct");
      return { type: "direct" };
    }

    const result = this.processProxy(this.proxy);
    if (IS_FIREFOX && result.type !== "direct") {
      console.log("Background: Firefox proxy active, returning:", result);
    }
    return result;
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
    console.log("Background: Clearing proxy settings");

    this.mode = "";
    this.proxy = {};
    this.isInitialized = false;

    // For Firefox, mark proxy as inactive
    if (IS_FIREFOX) {
      this.isFirefoxProxyActive = false;
      await this.saveFirefoxProxyState(false);
      console.log("Background: Firefox proxy state cleared");
    }

    await browserAPI.storage.local.remove([
      CONFIG.STORAGE_KEYS.PROXY_MODE,
      CONFIG.STORAGE_KEYS.PROXY_DATA,
    ]);
  }

  // NEW: Force refresh Firefox proxy state
  async forceRefreshFirefoxState() {
    if (IS_FIREFOX) {
      console.log("Background: Force refreshing Firefox proxy state");

      // Reload current settings
      await this.loadSettings();

      // If we have valid proxy settings, activate Firefox proxy
      if (this.mode && this.proxy && this.proxy.hostname) {
        this.isFirefoxProxyActive = true;
        await this.saveFirefoxProxyState(true);
        console.log("Background: Firefox proxy state refreshed to active");
      } else {
        this.isFirefoxProxyActive = false;
        await this.saveFirefoxProxyState(false);
        console.log("Background: Firefox proxy state refreshed to inactive");
      }
    }
  }

  // NEW: Force clear method for Firefox
  async forceClearFirefoxProxy() {
    console.log("Background: Force clearing Firefox proxy");

    if (IS_FIREFOX) {
      this.isFirefoxProxyActive = false;
      await this.saveFirefoxProxyState(false);

      // Additional cleanup
      this.mode = "";
      this.proxy = {};
      this.isInitialized = false;

      console.log("Background: Firefox proxy force cleared");
    }
  }

  getCurrentProxy() {
    return {
      mode: this.mode,
      proxy: this.proxy,
      isActive: !!this.proxy && this.proxy.type !== "direct",
    };
  }
}

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
      if (IS_FIREFOX) {
        console.log("Background: Firefox - Using proxy.onRequest only");
        // Firefox proxy is handled entirely by ProxyRequestManager.process()
      } else {
        console.log("Background: Chrome - Using proxy.settings API");
        await this.setChromeProxy(config);
      }
      console.log("Background: Browser proxy configured successfully");
    } catch (error) {
      console.error("Error setting browser proxy:", error);
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
        console.log("Background: Chrome proxy configured:", config);
      }
    } catch (error) {
      console.error("Error setting Chrome proxy:", error);
      throw error;
    }
  }

  static async clearBrowserProxy() {
    try {
      console.log("Background: Clearing browser proxy...");

      if (IS_FIREFOX) {
        console.log(
          "Background: Firefox proxy cleared via ProxyRequestManager state"
        );
        // Firefox proxy clearing is handled by ProxyRequestManager.clearProxy()
      } else {
        console.log("Background: Chrome - Clearing proxy.settings");
        await this.clearChromeProxy();
      }

      console.log("Background: Browser proxy cleared successfully");
    } catch (error) {
      console.error("Error clearing browser proxy:", error);
    }
  }

  static async clearChromeProxy() {
    try {
      if (browserAPI.proxy?.settings) {
        await browserAPI.proxy.settings.clear({ scope: "regular" });
        console.log("Background: Chrome proxy cleared successfully");
      }
    } catch (error) {
      console.error("Error clearing Chrome proxy:", error);
      throw error;
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
    this.changeDebounce = 3000;
    this.startTime = 0;
    this.lastUpdateTime = 0;
  }

  async start(config) {
    await this.stop();

    if (
      !config.isAutoChangeIP ||
      !config.timeAutoChangeIP ||
      config.timeAutoChangeIP <= 0
    ) {
      return;
    }

    this.config = config;
    this.originalDuration = parseInt(config.timeAutoChangeIP);
    this.remainingTime = this.originalDuration;
    this.isRunning = true;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();

    await this.saveState();
    this.scheduleTimer();
  }

  scheduleTimer() {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;

      this.remainingTime--;
      this.lastUpdateTime = Date.now();
      await this.saveState();

      if (this.remainingTime <= 0) {
        await this.executeAutoChange();
      } else {
        this.scheduleTimer();
      }
    }, 1000);
  }

  async executeAutoChange() {
    if (this.isChangingIP) return;

    const now = Date.now();
    if (now - this.lastChangeTime < this.changeDebounce) return;

    this.isChangingIP = true;
    this.lastChangeTime = now;

    try {
      this.sendToPopup("showProcessingNewIpConnect", {});
      await proxyManager.setDirectProxy();
      await this.sleep(1000);

      const result = await APIService.changeIP(
        this.config.apiKey,
        this.config.location
      );

      if (result && result.code === 200) {
        await proxyManager.handleProxyResponse(
          result.data,
          this.config.apiKey,
          this.config.proxyType
        );

        this.remainingTime = this.originalDuration;
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        await this.saveState();

        this.sendToPopup("successGetProxyInfo", result.data);

        if (this.isRunning) {
          this.scheduleTimer();
        }
      } else {
        const error =
          result?.code === 500
            ? "Kết Nối Thất Bại"
            : result?.message || "Lỗi không xác định";
        this.sendToPopup("failureGetProxyInfo", { error });

        if (this.isRunning) {
          this.remainingTime = 30;
          this.lastUpdateTime = Date.now();
          await this.saveState();
          this.scheduleTimer();
        }
      }
    } catch (error) {
      console.error(
        "AutoChangeManager: Unexpected error during IP change",
        error
      );

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
        version: Date.now(),
      };

      await browserAPI.storage.local.set({ autoChangeState: state });
    } catch (error) {
      console.error("AutoChangeManager: Error saving state", error);
    }
  }

  async loadState() {
    try {
      const result = await browserAPI.storage.local.get(["autoChangeState"]);
      const state = result.autoChangeState;

      if (state && state.isRunning) {
        const now = Date.now();
        const timeSinceLastUpdate = Math.floor(
          (now - state.lastUpdateTime) / 1000
        );

        if (timeSinceLastUpdate < 600) {
          this.isRunning = state.isRunning;
          this.originalDuration = state.originalDuration;
          this.config = state.config;
          this.startTime = state.startTime;
          this.isChangingIP = state.isChangingIP || false;

          this.remainingTime = Math.max(
            0,
            state.remainingTime - timeSinceLastUpdate
          );
          this.lastUpdateTime = now;
          await this.saveState();

          if (this.remainingTime > 0) {
            this.scheduleTimer();
            return true;
          } else if (!this.isChangingIP) {
            await this.executeAutoChange();
            return true;
          }
        } else {
          await this.clearState();
        }
      }
    } catch (error) {
      console.error("AutoChangeManager: Error loading state", error);
    }

    return false;
  }

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
      currentTime: Date.now(),
    };
  }

  async clearState() {
    try {
      await browserAPI.storage.local.remove(["autoChangeState"]);
    } catch (error) {
      console.error("AutoChangeManager: Error clearing state", error);
    }
  }

  async stop() {
    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.clearState();

    this.remainingTime = 0;
    this.originalDuration = 0;
    this.config = null;
    this.isChangingIP = false;
    this.lastUpdateTime = 0;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {
      // Popup might be closed, ignore error
    }
  }
}

class MessageHandler {
  sendToPopup(message, data = null) {
    try {
      browserAPI.runtime.sendMessage({ greeting: message, data });
    } catch (error) {}
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      console.log(
        "Background: Received message:",
        request.greeting,
        "from",
        request.data?.browser || "unknown"
      );

      switch (request.greeting) {
        case "ping":
          sendResponse({ pong: true });
          break;

        case "getBackgroundTimerStatus":
          const status = autoChangeManager.getStatus();
          sendResponse(status);
          break;

        case CONFIG.MESSAGES.GET_LOCATIONS_DATA:
          const locations = await this.getLocations();
          if (locations) sendResponse({ data: locations });
          else sendResponse({ error: "Failed to get locations" });
          break;

        case CONFIG.MESSAGES.CHECK_VERSION:
          this.checkVersion();
          await proxyManager.setDirectProxy();
          sendResponse({ success: true });
          break;

        case CONFIG.MESSAGES.GET_INFO_KEY:
          await this.getInfoKey(request.data);
          sendResponse({ success: true });
          break;

        case CONFIG.MESSAGES.GET_CURRENT_PROXY:
          await this.getCurrentProxy(
            request.data.apiKey,
            request.data.proxyType
          );
          sendResponse({ success: true });
          break;

        // NEW: Handle force disconnect for Firefox
        case CONFIG.MESSAGES.FORCE_DISCONNECT:
          console.log("Background: Processing force disconnect for Firefox");

          // Force clear Firefox proxy state immediately
          await proxyRequestManager.forceClearFirefoxProxy();

          // Clear authentication
          authManager.clear();

          // Clear browser proxy if possible
          await BrowserProxyManager.clearBrowserProxy();

          // Update badge
          proxyManager.setBadgeOff();

          console.log("Background: Force disconnect completed");
          sendResponse({ success: true });
          break;

        case CONFIG.MESSAGES.CANCEL_ALL:
          console.log("Background: Processing cancel all");

          this.deleteAlarm("flagLoop");
          this.deleteAlarm("refreshPage");
          await autoChangeManager.stop();
          await this.disconnectProxy(
            request.data.apiKey,
            request.data.whitelist_ip
          );
          await proxyManager.setDirectProxy();
          sendResponse({ success: true });
          break;

        case CONFIG.MESSAGES.CHANGE_IP:
          await autoChangeManager.stop();
          await proxyManager.setDirectProxy();
          await this.changeIP(
            request.data.apiKey,
            request.data.location,
            request.data.proxyType
          );
          sendResponse({ success: true });
          break;

        case CONFIG.MESSAGES.AUTO_CHANGE_IP:
          await autoChangeManager.stop();
          await this.sleep(500);
          await proxyManager.setDirectProxy();
          await this.changeIP(
            request.data.apiKey,
            request.data.location,
            request.data.proxyType
          );
          await autoChangeManager.start(request.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: "Unknown message type" });
          break;
      }
    } catch (error) {
      console.error("Background: Error handling message:", error);
      sendResponse({ error: error.message });
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (browserAPI.alarms?.clear) {
      browserAPI.alarms.clear(name);
    }
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
      console.log("Background: Setting direct proxy...");

      // Clear internal proxy settings first
      await this.requestManager.clearProxy();

      // Clear browser proxy settings
      await BrowserProxyManager.clearBrowserProxy();

      // Clear authentication
      this.authManager.clear();

      // Update badge and storage
      this.setBadgeOff();
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: null,
      });

      console.log("Background: Direct proxy set successfully");
    } catch (error) {
      console.error("Error setting direct proxy:", error);
    }
  }

  async setProxySettings(proxyInfo) {
    try {
      console.log("Background: Setting proxy settings...", proxyInfo);

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

      // FIXED: Force refresh Firefox state after setting proxy
      if (IS_FIREFOX) {
        await this.requestManager.forceRefreshFirefoxState();
      }

      this.setBadgeOn(proxyInfo.location);
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
      });

      console.log("Background: Proxy settings applied successfully");
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
    try {
      browserAPI.action.setBadgeBackgroundColor({ color: [162, 36, 36, 255] });
      browserAPI.action.setBadgeText({ text: "OFF" });
    } catch (error) {
      console.error("Error setting badge off:", error);
    }
  }

  setBadgeOn(location) {
    try {
      browserAPI.action.setBadgeBackgroundColor({ color: [36, 162, 36, 255] });
      browserAPI.action.setBadgeText({ text: "ON" });
    } catch (error) {
      console.error("Error setting badge on:", error);
    }
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
  return true;
});

// Initialize extension
const initializeExtension = async () => {
  console.log(
    `Background: Initializing extension... (${
      IS_FIREFOX ? "Firefox" : "Chrome"
    } mode)`
  );

  try {
    await proxyRequestManager.loadSettings();
    proxyRequestManager.initializeListener();

    // FIXED: For Firefox, refresh state after loading settings
    if (IS_FIREFOX) {
      await proxyRequestManager.forceRefreshFirefoxState();
    }

    const restored = await autoChangeManager.loadState();
    if (restored) {
      console.log("Background: Auto change manager state restored");
    }

    console.log("Background: Extension initialized successfully");
  } catch (error) {
    console.error("Background: Error during initialization:", error);
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
