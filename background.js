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
    GET_CURRENT_PROXY_NO_CHANGE: "getCurrentProxyNoChange", // NEW: Non-invasive proxy info
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
    }

    // Always ensure listener is active
    this.initializeListener();
  }

  async loadFirefoxProxyState() {
    if (!IS_FIREFOX) return false;

    try {
      const result = await browserAPI.storage.local.get([
        CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE,
      ]);
      const state = result[CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE] || false;
      return state;
    } catch (error) {
      console.error(
        "ProxyRequestManager: Error loading Firefox proxy state:",
        error
      );
      return false;
    }
  }
  async forceClearFirefoxProxy() {
    if (IS_FIREFOX) {
      try {
        // Set state to false
        this.isFirefoxProxyActive = false;
        await this.saveFirefoxProxyState(false);

        // Clear all proxy-related data
        this.mode = "";
        this.proxy = {};
        this.isInitialized = false;

        // Clear storage
        try {
          await browserAPI.storage.local.remove([
            CONFIG.STORAGE_KEYS.PROXY_MODE,
            CONFIG.STORAGE_KEYS.PROXY_DATA,
            CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE,
          ]);
        } catch (storageError) {
          console.error(
            "ProxyRequestManager: Error clearing Firefox storage:",
            storageError
          );
        }

        // Force set state again to ensure it's saved
        await this.saveFirefoxProxyState(false);

        // Verify the state was actually cleared
        const verifyState = await this.loadFirefoxProxyState();
        if (verifyState) {
          console.warn(
            "ProxyRequestManager: Firefox proxy state not properly cleared, retrying..."
          );
          await browserAPI.storage.local.set({
            [CONFIG.STORAGE_KEYS.FIREFOX_PROXY_ACTIVE]: false,
          });
        }
      } catch (error) {
        console.error(
          "ProxyRequestManager: Error in forceClearFirefoxProxy:",
          error
        );
      }
    }
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
      return { type: "direct" };
    }

    const result = this.processProxy(this.proxy);
    if (IS_FIREFOX && result.type !== "direct") {
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
    this.mode = "";
    this.proxy = null;
    this.isInitialized = false;

    if (IS_FIREFOX) {
      this.isFirefoxProxyActive = false;
      await this.saveFirefoxProxyState(false);
    }

    try {
      await browserAPI.storage.local.remove([
        CONFIG.STORAGE_KEYS.PROXY_MODE,
        CONFIG.STORAGE_KEYS.PROXY_DATA,
      ]);
    } catch (error) {
      console.error("ProxyRequestManager: Error clearing storage:", error);
    }

    console.log("ProxyRequestManager: Proxy state cleared completely");
  }

  // NEW: Force refresh Firefox proxy state
  async forceRefreshFirefoxState() {
    if (IS_FIREFOX) {
      // Reload current settings
      await this.loadSettings();

      // If we have valid proxy settings, activate Firefox proxy
      if (this.mode && this.proxy && this.proxy.hostname) {
        this.isFirefoxProxyActive = true;
        await this.saveFirefoxProxyState(true);
      } else {
        this.isFirefoxProxyActive = false;
        await this.saveFirefoxProxyState(false);
      }
    }
  }

  // NEW: Force clear method for Firefox
  async forceClearFirefoxProxy() {
    if (IS_FIREFOX) {
      this.isFirefoxProxyActive = false;
      await this.saveFirefoxProxyState(false);

      // Additional cleanup
      this.mode = "";
      this.proxy = {};
      this.isInitialized = false;
    }
  }

  getCurrentProxy() {
    const isProxyActive = !!(
      this.proxy &&
      this.proxy.hostname &&
      this.proxy.port &&
      this.proxy.type &&
      this.proxy.type !== "direct" &&
      this.mode &&
      this.isInitialized
    );

    return {
      mode: this.mode,
      proxy: this.proxy,
      isActive: isProxyActive,
      isInitialized: this.isInitialized,
      firefoxProxyActive: IS_FIREFOX ? this.isFirefoxProxyActive : undefined,
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
        // Firefox proxy is handled entirely by ProxyRequestManager.process()
      } else {
        await this.setChromeProxy(config);
      }
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
      }
    } catch (error) {
      console.error("Error setting Chrome proxy:", error);
      throw error;
    }
  }

  static async clearBrowserProxy() {
    try {
      if (IS_FIREFOX) {
        // Firefox proxy clearing is handled by ProxyRequestManager.clearProxy()
      } else {
        await this.clearChromeProxy();
      }
    } catch (error) {
      console.error("Error clearing browser proxy:", error);
    }
  }

  static async clearChromeProxy() {
    try {
      if (browserAPI.proxy?.settings) {
        await browserAPI.proxy.settings.clear({ scope: "regular" });
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

    // Validate config
    if (!config || !config.apiKey) {
      console.error("AutoChangeManager: Invalid config provided");
      return false;
    }

    if (
      !config.isAutoChangeIP ||
      !config.timeAutoChangeIP ||
      config.timeAutoChangeIP <= 0
    ) {
      return false;
    }

    this.config = config;
    this.originalDuration = parseInt(config.timeAutoChangeIP);
    this.remainingTime = this.originalDuration;
    this.isRunning = true;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();

    await this.saveState();
    this.scheduleTimer();

    return true;
  }

  scheduleTimer() {
    if (!this.isRunning || !this.config) {
      return;
    }

    this.timer = setTimeout(async () => {
      if (!this.isRunning || !this.config) {
        this.stop();
        return;
      }

      this.remainingTime--;
      this.lastUpdateTime = Date.now();
      await this.saveState();

      // Log every 10 seconds or when less than 10 seconds remain
      if (this.remainingTime % 10 === 0 || this.remainingTime <= 10) {
      }

      if (this.remainingTime <= 0) {
        await this.executeAutoChange();
      } else {
        this.scheduleTimer();
      }
    }, 1000);
  }

  async executeAutoChange() {
    // Validate config exists
    if (!this.config || !this.config.apiKey) {
      console.error("AutoChangeManager: No valid config for auto change");
      this.stop();
      return;
    }

    if (this.isChangingIP) return;

    const now = Date.now();
    if (now - this.lastChangeTime < this.changeDebounce) return;

    this.isChangingIP = true;
    this.lastChangeTime = now;

    try {
      console.log("AutoChangeManager: Starting executeAutoChange");
      this.sendToPopup("showProcessingNewIpConnect", {});

      // Step 1: Disconnect proxy with verification
      console.log("AutoChangeManager: Step 1 - Disconnecting proxy");
      const disconnectSuccess = await proxyManager.disconnectProxyOnly();

      if (!disconnectSuccess) {
        console.warn(
          "AutoChangeManager: disconnectProxyOnly returned false, but continuing"
        );
      }

      // Step 2: Verify proxy is truly disconnected with retries
      console.log("AutoChangeManager: Step 2 - Verifying disconnection");
      const verifySuccess = await this.verifyProxyDisconnected();

      if (!verifySuccess) {
        console.warn(
          "AutoChangeManager: Proxy verification failed, but continuing with IP change"
        );
      }

      // Step 3: Wait for proxy state to settle
      const waitTime = IS_FIREFOX ? 2000 : 1000; // Reduced wait time since we have verification
      console.log(
        `AutoChangeManager: Step 3 - Waiting ${waitTime}ms for proxy state to settle`
      );
      await this.sleep(waitTime);

      // Step 4: Double check config still exists after wait
      if (!this.config || !this.config.apiKey) {
        console.error("AutoChangeManager: Config lost during execution");
        this.stop();
        return;
      }

      // Step 5: Call API to change IP
      console.log("AutoChangeManager: Step 4 - Calling changeIP API");
      const result = await APIService.changeIP(
        this.config.apiKey,
        this.config.location
      );

      if (result && result.code === 200) {
        console.log("AutoChangeManager: Step 5 - Setting up new proxy");
        await proxyManager.handleProxyResponse(
          result.data,
          this.config.apiKey,
          this.config.proxyType
        );

        // Force refresh Firefox state after successful change
        if (IS_FIREFOX) {
          await proxyRequestManager.forceRefreshFirefoxState();
          await this.sleep(300);
        }

        // Reset timer
        this.remainingTime = this.originalDuration;
        this.startTime = Date.now();
        this.lastUpdateTime = Date.now();
        await this.saveState();

        this.sendToPopup("successGetProxyInfo", result.data);

        if (this.isRunning) {
          this.scheduleTimer();
        }

        console.log(
          "AutoChangeManager: executeAutoChange completed successfully"
        );
      } else {
        console.error("AutoChangeManager: API call failed:", result);
        const error =
          result?.code === 500
            ? "Kết Nối Thất Bại"
            : result?.message || "Lỗi không xác định";

        this.sendToPopup("failureGetProxyInfo", { error });

        // On failure, ensure we stay in direct proxy mode
        await proxyManager.disconnectProxyOnly();

        if (this.isRunning) {
          this.remainingTime = 30;
          this.lastUpdateTime = Date.now();
          await this.saveState();
          this.scheduleTimer();
        }
      }
    } catch (error) {
      console.error(
        "AutoChangeManager: Unexpected error during IP change:",
        error
      );

      // On any error, ensure direct proxy
      try {
        await proxyManager.disconnectProxyOnly();
      } catch (directError) {
        console.error(
          "AutoChangeManager: Failed to disconnect proxy after error:",
          directError
        );
      }

      if (this.isRunning) {
        this.remainingTime = 30;
        this.lastUpdateTime = Date.now();
        await this.saveState();

        this.scheduleTimer();
      }
    } finally {
      this.isChangingIP = false;
      console.log("AutoChangeManager: executeAutoChange finished");
    }
  }

  async verifyProxyDisconnected() {
    try {
      console.log(
        "AutoChangeManager: Starting proxy disconnection verification"
      );

      let attempts = 0;
      const maxAttempts = 10; // Increased attempts
      const baseDelay = 200; // Base delay between attempts

      while (attempts < maxAttempts) {
        // Check internal proxy state
        const currentProxy = proxyRequestManager.getCurrentProxy();
        console.log(
          `AutoChangeManager: Verification attempt ${
            attempts + 1
          }/${maxAttempts}:`,
          {
            isActive: currentProxy.isActive,
            mode: currentProxy.mode,
            hasProxy: !!currentProxy.proxy,
            isInitialized: currentProxy.isInitialized,
            firefoxActive: currentProxy.firefoxProxyActive,
          }
        );

        // FIXED: More comprehensive proxy state checking
        const isProxyActive =
          currentProxy.isActive ||
          currentProxy.mode ||
          (currentProxy.proxy && currentProxy.proxy.hostname) ||
          (IS_FIREFOX && currentProxy.firefoxProxyActive);

        if (!isProxyActive) {
          console.log("AutoChangeManager: Proxy successfully disconnected");
          return true;
        }

        // If still active, try to clear again
        if (attempts < maxAttempts - 1) {
          // Don't clear on last attempt
          console.log(
            `AutoChangeManager: Proxy still active, clearing again (attempt ${
              attempts + 1
            })`
          );

          // Clear with increasing delay
          await proxyRequestManager.clearProxy();

          if (IS_FIREFOX) {
            await proxyRequestManager.forceClearFirefoxProxy();
          }

          // Exponential backoff delay
          const delay = baseDelay * Math.pow(1.5, attempts);
          await this.sleep(delay);
        }

        attempts++;
      }

      // Final verification after all attempts
      const finalProxy = proxyRequestManager.getCurrentProxy();
      console.warn(
        "AutoChangeManager: Could not fully verify proxy disconnection after all attempts:",
        {
          isActive: finalProxy.isActive,
          mode: finalProxy.mode,
          hasProxy: !!finalProxy.proxy,
          firefoxActive: finalProxy.firefoxProxyActive,
        }
      );

      // Return true if at least the main indicators are cleared
      return !finalProxy.isActive && !finalProxy.mode;
    } catch (error) {
      console.error(
        "AutoChangeManager: Error verifying proxy disconnection:",
        error
      );
      return false;
    }
  }

  async saveState() {
    try {
      // Only save if we have valid config
      if (!this.config || !this.config.apiKey) {
        console.warn(
          "AutoChangeManager: Cannot save state without valid config"
        );
        return;
      }

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

      if (state && state.isRunning && state.config) {
        const now = Date.now();
        const timeSinceLastUpdate = Math.floor(
          (now - state.lastUpdateTime) / 1000
        );

        // Only restore if not too old (less than 10 minutes)
        if (timeSinceLastUpdate < 600) {
          // Validate config has required fields
          if (!state.config.apiKey || !state.config.timeAutoChangeIP) {
            console.warn("AutoChangeManager: Invalid config in saved state");
            await this.clearState();
            return false;
          }

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
      await this.clearState();
    }

    return false;
  }

  getStatus() {
    return {
      isActive: this.isRunning,
      remainingTime: this.remainingTime,
      originalDuration: this.originalDuration,
      isChangingIP: this.isChangingIP,
      config: this.config
        ? {
            hasApiKey: !!this.config.apiKey,
            location: this.config.location,
            timeAutoChangeIP: this.config.timeAutoChangeIP,
          }
        : null,
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

    // Clear all properties
    this.remainingTime = 0;
    this.originalDuration = 0;
    this.config = null;
    this.isChangingIP = false;
    this.lastUpdateTime = 0;
    this.lastChangeTime = 0;
    this.startTime = 0;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Public getter for isChangingIP
  get isChangingIPActive() {
    return this.isChangingIP;
  }

  sendToPopup(message, data = null) {
    try {
      // Check if runtime is still valid before sending
      if (browserAPI.runtime?.id) {
        browserAPI.runtime
          .sendMessage({ greeting: message, data })
          .catch(() => {
            // Popup might be closed, ignore error
          });
      }
    } catch (error) {
      // Popup might be closed, ignore error
    }
  }
}

class MessageHandler {
  sendToPopup(message, data = null) {
    try {
      // Check if runtime is still valid before sending
      if (browserAPI.runtime?.id) {
        browserAPI.runtime
          .sendMessage({ greeting: message, data })
          .catch(() => {
            // Popup might be closed, ignore error
          });
      }
    } catch (error) {
      // Popup is closed or not responding, ignore
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

        // NEW: Handle non-invasive proxy info request
        case CONFIG.MESSAGES.GET_CURRENT_PROXY_NO_CHANGE:
          await this.getCurrentProxyNoChange(
            request.data.apiKey,
            request.data.proxyType,
            request.data.preserveTimer
          );
          sendResponse({ success: true });
          break;

        // NEW: Handle force disconnect for Firefox
        case CONFIG.MESSAGES.FORCE_DISCONNECT:
          // Send response immediately
          sendResponse({ success: true });

          // Process disconnection asynchronously
          (async () => {
            try {
              // Stop any running auto change
              await autoChangeManager.stop();

              // Force clear Firefox proxy state multiple times
              if (IS_FIREFOX) {
                for (let i = 0; i < 3; i++) {
                  await proxyRequestManager.forceClearFirefoxProxy();
                  await this.sleep(200);
                }
              }

              // Clear authentication
              authManager.clear();

              // Clear browser proxy
              await BrowserProxyManager.clearBrowserProxy();

              // Clear proxy settings
              await proxyRequestManager.clearProxy();

              // Update badge
              proxyManager.setBadgeOff();

              // Clear storage
              await browserAPI.storage.sync.set({
                [CONFIG.STORAGE_KEYS.TX_PROXY]: null,
              });
            } catch (error) {
              console.error(
                "Background: Error during force disconnect:",
                error
              );
              // Try one more time
              try {
                await proxyManager.setDirectProxy();
              } catch (e) {
                console.error(
                  "Background: Final attempt to disconnect failed:",
                  e
                );
              }
            }
          })();
          break;

        case CONFIG.MESSAGES.CANCEL_ALL:
          // Don't wait for response, process immediately
          sendResponse({ success: true });

          // Process disconnect asynchronously
          (async () => {
            try {
              this.deleteAlarm("flagLoop");
              this.deleteAlarm("refreshPage");
              await autoChangeManager.stop();

              // Ensure complete disconnection

              await proxyManager.setDirectProxy();

              // For Firefox, extra verification
              if (IS_FIREFOX) {
                await this.sleep(500);
                // Double check Firefox state
                const state = await proxyRequestManager.loadFirefoxProxyState();
                if (state) {
                  await proxyRequestManager.forceClearFirefoxProxy();
                }
              }
            } catch (error) {
              console.error("Background: Error during cancel all:", error);
              // Even on error, try to ensure proxy is disconnected
              try {
                await proxyManager.setDirectProxy();
              } catch (e) {
                console.error(
                  "Background: Failed to set direct proxy on error:",
                  e
                );
              }
            }
          })();
          break;

        case CONFIG.MESSAGES.CHANGE_IP:
          await autoChangeManager.stop();

          // Ensure proxy is disconnected before changing IP
          await proxyManager.setDirectProxy();
          await this.sleep(IS_FIREFOX ? 2000 : 1000);

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

          // Ensure proxy is disconnected before starting auto change

          await proxyManager.setDirectProxy();
          await this.sleep(IS_FIREFOX ? 2000 : 1000);

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

  // NEW: Non-invasive proxy info retrieval
  async getCurrentProxyNoChange(apiKey, proxyType, preserveTimer = false) {
    console.log("Background: getCurrentProxyNoChange - UI refresh only, no disconnect");
    
    this.sendToPopup("processingGetProxyInfo", {});

    try {
      const result = await APIService.getInfoKey(apiKey);
      if (result?.code === 200) {
        // CRITICAL: Use non-invasive proxy response handling
        await proxyManager.handleProxyResponseNoChange(
          result.data, 
          apiKey, 
          proxyType,
          preserveTimer
        );
      } else {
        const error =
          result?.status === 500
            ? CONFIG.ERRORS.CONNECTION_FAILED
            : result?.message || CONFIG.ERRORS.UNKNOWN_ERROR;
        this.sendToPopup("failureGetProxyInfo", { error });
      }
    } catch (error) {
      console.error("Background: Error in getCurrentProxyNoChange:", error);
      this.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.UNKNOWN_ERROR,
      });
    }
  }

  async changeIP(apiKey, location, proxyType) {
    this.sendToPopup("showProcessingNewIpConnect", {});

    try {
      // First, ensure proxy is completely disconnected
      await proxyManager.setDirectProxy();

      // Wait for proxy to be fully disconnected
      const waitTime = IS_FIREFOX ? 2000 : 1000;
      await this.sleep(waitTime);

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
    } catch (error) {
      console.error("MessageHandler: Error during changeIP:", error);
      this.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.UNKNOWN_ERROR,
      });
    }
  }

  async disconnectProxy(apiKey, whitelistIp) {
    try {
      // Stop auto change if running
      if (autoChangeManager.isRunning) {
        await autoChangeManager.stop();
      }

      // Disconnect proxy
      await proxyManager.setDirectProxy();

      // Clear all stored states
      await browserAPI.storage.local.remove([
        "proxyConnected",
        "isAutoChangeIP",
        "timeAutoChangeIP",
        "timeAutoChangeIPDefault",
        "autoChangeState",
        "firefoxProxyActive",
      ]);

      return true;
    } catch (error) {
      console.error("MessageHandler: Error disconnecting proxy:", error);

      // Try once more
      try {
        await proxyManager.setDirectProxy();
      } catch (e) {
        console.error(
          "MessageHandler: Second attempt to disconnect failed:",
          e
        );
      }

      return false;
    }
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
      // Only stop auto change if it's not in the middle of changing IP
      if (
        autoChangeManager.isRunning &&
        !autoChangeManager.isChangingIPActive
      ) {
        await autoChangeManager.stop();
      } else if (autoChangeManager.isChangingIPActive) {
      }

      // Clear internal proxy settings first
      await this.requestManager.clearProxy();

      // For Firefox, ensure proxy state is cleared multiple times
      if (IS_FIREFOX) {
        for (let i = 0; i < 3; i++) {
          await this.requestManager.forceClearFirefoxProxy();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // Verify it's actually cleared
        const state = await this.requestManager.loadFirefoxProxyState();
        if (state) {
          console.warn(
            "Background: Firefox proxy still active after clearing, trying once more"
          );
          await this.requestManager.forceClearFirefoxProxy();
        }
      }

      // Clear browser proxy settings
      await BrowserProxyManager.clearBrowserProxy();

      // Clear authentication
      this.authManager.clear();

      // Update badge and storage
      this.setBadgeOff();
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: null,
      });

      // Clear local storage flags
      await browserAPI.storage.local.remove([
        "proxyConnected",
        "isAutoChangeIP",
        "timeAutoChangeIP",
        "autoChangeState",
      ]);

      return true;
    } catch (error) {
      console.error("Error setting direct proxy:", error);

      // Even on error, try to at least clear the proxy
      try {
        await BrowserProxyManager.clearBrowserProxy();
        this.setBadgeOff();
      } catch (e) {
        console.error("Failed to clear proxy on error:", e);
      }

      return false;
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

      // FIXED: Force refresh Firefox state after setting proxy
      if (IS_FIREFOX) {
        await this.requestManager.forceRefreshFirefoxState();
      }

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

  // NEW: Non-invasive proxy response handling for UI refresh
  async handleProxyResponseNoChange(response, apiKey, proxyType, preserveTimer = false) {
    console.log("Background: handleProxyResponseNoChange - processing for UI only");
    
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

    // CRITICAL: NO proxy settings change, only update cache and send to popup
    try {
      // Update storage/cache for consistency
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
      });

      // Update badge to reflect current state
      this.setBadgeOn(proxyInfo.location);

      // Send to popup with preserve timer flag
      messageHandler.sendToPopup("successGetProxyInfo", {
        ...proxyInfo,
        preserveTimer: preserveTimer
      });

      console.log("Background: Proxy info updated for UI refresh without changing connection");
    } catch (error) {
      console.error("Background: Error updating proxy info for UI refresh:", error);
      messageHandler.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.UNKNOWN_ERROR,
      });
    }
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

  setBadgeOn() {
    try {
      browserAPI.action.setBadgeBackgroundColor({ color: [36, 162, 36, 255] });
      browserAPI.action.setBadgeText({ text: "ON" });
    } catch (error) {
      console.error("Error setting badge on:", error);
    }
  }

  async disconnectProxyOnly() {
    try {
      console.log("MainProxyManager: Starting disconnectProxyOnly");

      // Clear internal proxy settings with proper sequencing
      await this.requestManager.clearProxy();

      // Small delay to ensure state is updated
      await new Promise((resolve) => setTimeout(resolve, 100));

      // For Firefox, ensure proxy state is cleared with retries
      if (IS_FIREFOX) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          await this.requestManager.forceClearFirefoxProxy();
          await new Promise((resolve) => setTimeout(resolve, 200));

          const state = await this.requestManager.loadFirefoxProxyState();
          if (!state) {
            console.log(
              "MainProxyManager: Firefox proxy state cleared successfully"
            );
            break;
          }

          attempts++;
          console.log(
            `MainProxyManager: Firefox clear attempt ${attempts}/${maxAttempts}`
          );
        }
      }

      // Clear browser proxy settings
      await BrowserProxyManager.clearBrowserProxy();

      // Clear authentication
      this.authManager.clear();

      // Update badge
      this.setBadgeOff();

      // Verify final state
      const finalState = this.requestManager.getCurrentProxy();
      console.log("MainProxyManager: Final proxy state after disconnect:", {
        isActive: finalState.isActive,
        mode: finalState.mode,
        hasProxy: !!finalState.proxy,
        firefoxActive: finalState.firefoxProxyActive,
      });

      return !finalState.isActive; // Return true if successfully disconnected
    } catch (error) {
      console.error("MainProxyManager: Error in disconnectProxyOnly:", error);
      return false;
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
  // Handle message asynchronously to prevent blocking
  (async () => {
    try {
      await messageHandler.handleMessage(request, sender, sendResponse);
    } catch (error) {
      console.error("Background: Error in message handler:", error);
      sendResponse({ error: error.message });
    }
  })();

  // Return true to indicate async response
  return true;
});

// NEW: Handle disconnect when extension popup closes
browserAPI.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    // If there's a pending disconnect operation, ensure it completes
    setTimeout(async () => {
      try {
        const currentProxy = proxyRequestManager.getCurrentProxy();
        if (currentProxy.isActive) {
          // Only disconnect if auto-change is not running
          if (!autoChangeManager.isRunning) {
            const result = await browserAPI.storage.local.get([
              "proxyConnected",
            ]);
            if (!result.proxyConnected) {
              await proxyManager.setDirectProxy();
            }
          }
        }
      } catch (error) {
        console.error(
          "Background: Error checking proxy state on popup close:",
          error
        );
      }
    }, 1000);
  });
});

// Initialize extension
const initializeExtension = async () => {
  try {
    // Load proxy settings first
    await proxyRequestManager.loadSettings();

    // Initialize proxy listener
    proxyRequestManager.initializeListener();

    // ENHANCED: For Firefox, ensure proper state management
    if (IS_FIREFOX) {
      const currentState = await proxyRequestManager.loadFirefoxProxyState();

      // If proxy should be active but extension is starting fresh, refresh the state
      if (
        currentState &&
        proxyRequestManager.mode &&
        proxyRequestManager.proxy
      ) {
        await proxyRequestManager.forceRefreshFirefoxState();
      } else if (
        currentState &&
        (!proxyRequestManager.mode || !proxyRequestManager.proxy)
      ) {
        // If state says active but no proxy config, clear it
        await proxyRequestManager.forceClearFirefoxProxy();
      }
    }

    // Restore auto change manager state
    const restored = await autoChangeManager.loadState();
    if (restored) {
      // ENHANCED: For Firefox, ensure proxy state is consistent with auto change
      if (IS_FIREFOX && autoChangeManager.isRunning) {
        setTimeout(async () => {
          // Verify autoChangeManager still has valid config
          if (!autoChangeManager.config || !autoChangeManager.config.apiKey) {
            console.warn(
              "Background: Auto change manager has no valid config, stopping"
            );
            await autoChangeManager.stop();
            return;
          }

          const firefoxState =
            await proxyRequestManager.loadFirefoxProxyState();
          if (!firefoxState && proxyRequestManager.mode) {
            await proxyRequestManager.forceRefreshFirefoxState();
          }
        }, 1000);
      }
    }
  } catch (error) {
    console.error("Background: Error during initialization:", error);

    // ENHANCED: On error, ensure Firefox is in clean state
    if (IS_FIREFOX) {
      try {
        await proxyRequestManager.forceClearFirefoxProxy();
      } catch (cleanupError) {
        console.error("Background: Firefox cleanup error:", cleanupError);
      }
    }
  }
};

browserAPI.runtime.onStartup.addListener(() => {
  initializeExtension();
});

browserAPI.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

initializeExtension();