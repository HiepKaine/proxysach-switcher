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
    FORCE_DISCONNECT: "forceDisconnect",
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
  }

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
        console.log("BrowserProxyManager: Firefox proxy setup via ProxyRequestManager");
      } else {
        await this.setChromeProxy(config);
        console.log("BrowserProxyManager: Chrome proxy set successfully");
      }
    } catch (error) {
      console.error("BrowserProxyManager: Error setting browser proxy:", error);
      throw error;
    }
  }

  static async clearBrowserProxy() {
    try {
      console.log("BrowserProxyManager: Starting clearBrowserProxy...");
      
      if (IS_FIREFOX) {
        // Firefox proxy clearing is handled by ProxyRequestManager
        console.log("BrowserProxyManager: Firefox proxy clearing via ProxyRequestManager");
        return true;
      } else {
        // For Chrome, clear proxy settings
        const success = await this.clearChromeProxy();
        if (success) {
          console.log("BrowserProxyManager: Chrome proxy cleared successfully");
        } else {
          console.warn("BrowserProxyManager: Chrome proxy clear may have failed");
        }
        return success;
      }
    } catch (error) {
      console.error("BrowserProxyManager: Error clearing browser proxy:", error);
      return false;
    }
  }

  static async clearChromeProxy() {
    try {
      console.log("BrowserProxyManager: Clearing Chrome proxy settings...");
      
      if (!browserAPI.proxy?.settings) {
        console.warn("BrowserProxyManager: browserAPI.proxy.settings not available");
        return false;
      }

      // Multiple attempts to clear Chrome proxy
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          await browserAPI.proxy.settings.clear({ scope: "regular" });
          console.log(`BrowserProxyManager: Chrome proxy cleared on attempt ${attempts + 1}`);
          
          // Verify it was cleared
          const settings = await browserAPI.proxy.settings.get({ incognito: false });
          if (settings.value.mode === "direct" || !settings.value.mode) {
            console.log("BrowserProxyManager: Chrome proxy verified as cleared");
            return true;
          } else {
            console.warn("BrowserProxyManager: Chrome proxy still active after clear:", settings.value);
          }
          
          break;
        } catch (clearError) {
          attempts++;
          console.error(`BrowserProxyManager: Chrome proxy clear attempt ${attempts} failed:`, clearError);
          
          if (attempts < maxAttempts) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            // Final attempt with direct mode setting
            try {
              await browserAPI.proxy.settings.set({
                value: { mode: "direct" },
                scope: "regular"
              });
              console.log("BrowserProxyManager: Chrome proxy set to direct mode as fallback");
              return true;
            } catch (fallbackError) {
              console.error("BrowserProxyManager: Fallback direct mode setting failed:", fallbackError);
              throw clearError;
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error("BrowserProxyManager: Error in clearChromeProxy:", error);
      throw error;
    }
  }

  static async setChromeProxy(preferences) {
    try {
      console.log("BrowserProxyManager: Setting Chrome proxy...");
      
      if (!browserAPI.proxy?.settings) {
        throw new Error("browserAPI.proxy.settings not available");
      }

      const config = { value: {}, scope: "regular" };
      const proxy = this.findActiveProxy(preferences);

      if (proxy) {
        config.value.mode = "fixed_servers";
        config.value.rules = this.getSingleProxyRule(proxy);
        
        await browserAPI.proxy.settings.set(config);
        console.log("BrowserProxyManager: Chrome proxy set successfully");
        
        // Verify it was set
        const settings = await browserAPI.proxy.settings.get({ incognito: false });
        console.log("BrowserProxyManager: Chrome proxy verification:", settings.value);
      } else {
        throw new Error("No active proxy found in preferences");
      }
    } catch (error) {
      console.error("BrowserProxyManager: Error setting Chrome proxy:", error);
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

  // NEW: Method to verify proxy state
  static async verifyProxyCleared() {
    try {

      MainProxyManager.setBadgeOff()

      if (IS_FIREFOX) {
        // For Firefox, check through ProxyRequestManager
        const proxyState = proxyRequestManager.getCurrentProxy();
        return !proxyState.isActive && !proxyState.firefoxProxyActive;
      } else {
        // For Chrome, check proxy settings
        if (browserAPI.proxy?.settings) {
          const settings = await browserAPI.proxy.settings.get({ incognito: false });
          const isCleared = settings.value.mode === "direct" || !settings.value.mode;
          console.log("BrowserProxyManager: Chrome proxy verification result:", {
            mode: settings.value.mode,
            isCleared: isCleared
          });
          return isCleared;
        }
      }
      return true;
    } catch (error) {
      console.error("BrowserProxyManager: Error verifying proxy state:", error);
      return false;
    }
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
    this.isProtected = false;
    this.executionMutex = false;
    this.lastConfigValidation = 0;
  }

  // ENHANCED: Validate config before execution
  validateConfig() {
    const now = Date.now();

    // Cache validation for 1 second to prevent repeated checks
    if (now - this.lastConfigValidation < 1000) {
      return !!this.config;
    }

    this.lastConfigValidation = now;

    if (!this.config) {
      console.error("AutoChangeManager: Config is null");
      return false;
    }

    if (!this.config.apiKey) {
      console.error("AutoChangeManager: API key is missing");
      return false;
    }

    if (!this.config.timeAutoChangeIP || this.config.timeAutoChangeIP <= 0) {
      console.error("AutoChangeManager: Invalid timeAutoChangeIP");
      return false;
    }

    return true;
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
    await this.initializeNextChangeIPTimer();
    this.scheduleTimer();
    return true;
  }

  async initializeNextChangeIPTimer() {
    try {
      const result = await browserAPI.storage.sync.get(["tx_proxy"]);
      const proxyInfo = result.tx_proxy;

      if (proxyInfo && proxyInfo.nextChangeIP && proxyInfo.nextChangeIP > 0) {
        const targetTime = Date.now() + proxyInfo.nextChangeIP * 1000;

        await browserAPI.storage.local.set({
          nextChangeTarget: targetTime,
          nextChangeDuration: proxyInfo.nextChangeIP,
          nextChangeStartTime: Date.now(),
          nextChangeExpired: false,
        });
      }
    } catch (error) {
      console.error(
        "AutoChangeManager: Error initializing nextChangeIP timer:",
        error
      );
    }
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

      if (this.remainingTime <= 0) {
        await this.executeAutoChange();
      } else {
        this.scheduleTimer();
      }
    }, 1000);
  }

  async executeAutoChange() {
    // CRITICAL FIX: Add mutex protection to prevent double execution
    if (this.executionMutex) {
      return;
    }

    // CRITICAL FIX: Validate config before proceeding
    if (!this.validateConfig()) {
      console.error("AutoChangeManager: Invalid config, stopping auto change");
      await this.stop();
      return;
    }

    // CRITICAL FIX: Check if already changing IP
    if (this.isChangingIP) {
      return;
    }

    const now = Date.now();
    if (now - this.lastChangeTime < this.changeDebounce) {
      return;
    }

    // Set mutex to prevent double execution
    this.executionMutex = true;
    this.isChangingIP = true;
    this.isProtected = true;
    this.lastChangeTime = now;

    try {
      // ENHANCED: Validate config again after setting mutex
      if (!this.validateConfig()) {
        console.error(
          "AutoChangeManager: Config became invalid during execution"
        );
        return;
      }

      // Notify popup if it's open
      this.sendToPopup("showProcessingNewIpConnect", {
        isAutoChanging: true,
        isProtected: true,
      });

      // Disconnect current proxy
      const disconnectSuccess = await proxyManager.disconnectProxyOnly();
      if (!disconnectSuccess) {
        console.warn(
          "AutoChangeManager: Proxy disconnect may have failed, continuing..."
        );
      }

      // Verify disconnection
      const verifySuccess = await this.verifyProxyDisconnected();
      if (!verifySuccess) {
        console.warn(
          "AutoChangeManager: Could not verify proxy disconnection, continuing..."
        );
      }

      // Wait before API call
      await this.sleep(1000);

      // CRITICAL FIX: Validate config one more time before API call
      if (!this.validateConfig()) {
        console.error(
          "AutoChangeManager: Config lost during process, aborting"
        );
        return;
      }

      const result = await APIService.changeIP(
        this.config.apiKey,
        this.config.location
      );

      if (result && result.code === 200) {
        await this.handleSuccessfulIPChange(result);
      } else {
        console.error("AutoChangeManager: ❌ API call failed:", result);
        await this.handleFailedIPChange(result);
      }
    } catch (error) {
      console.error(
        "AutoChangeManager: ❌ Unexpected error during IP change:",
        error
      );
      await this.handleIPChangeError(error);
    } finally {
      // CRITICAL FIX: Always clean up mutex and flags
      this.executionMutex = false;
      this.isChangingIP = false;
      this.isProtected = false;
    }
  }

  // NEW: Handle successful IP change
  async handleSuccessfulIPChange(result) {
    try {
      // CRITICAL: Validate config before building proxy info
      if (!this.validateConfig()) {
        console.error(
          "AutoChangeManager: Config invalid during success handling"
        );
        return;
      }

      // Build proxy info from API response
      const proxyInfo = await proxyManager.buildProxyInfo(
        result.data,
        this.config.apiKey,
        this.config.proxyType
      );

      // Set proxy settings
      await proxyManager.setProxySettings(proxyInfo);

      // Update storage
      await this.updateStorageWithProxyInfo(proxyInfo);

      // Sync nextChangeIP timer
      await this.syncNextChangeIPTimer(result.data);

      // Reset auto change timer for next cycle
      this.remainingTime = this.originalDuration;
      this.startTime = Date.now();
      this.lastUpdateTime = Date.now();
      await this.saveState();

      // Notify popup
      this.sendToPopup("successGetProxyInfo", {
        ...proxyInfo,
        isAutoChanging: false,
        isProtected: false,
        updateCache: true,
        cacheSource: "autoChangeIP",
        autoChangeCompleted: true,
      });

      // Continue auto change cycle if still running
      if (this.isRunning && this.validateConfig()) {
        this.scheduleTimer();
      }
    } catch (error) {
      console.error(
        "AutoChangeManager: Error handling successful IP change:",
        error
      );
      await this.handleIPChangeError(error);
    }
  }

  // NEW: Handle failed IP change
  async handleFailedIPChange(result) {
    const error =
      result?.code === 500
        ? "Kết Nối Thất Bại"
        : result?.message || "Lỗi không xác định";

    // Notify popup if open
    this.sendToPopup("failureGetProxyInfo", { error });

    // Try to recover proxy connection
    await proxyManager.disconnectProxyOnly();

    if (this.isRunning && this.validateConfig()) {
      // Retry after 30 seconds on error
      this.remainingTime = 30;
      this.lastUpdateTime = Date.now();
      await this.saveState();
      this.scheduleTimer();
    }
  }

  // NEW: Handle IP change error
  async handleIPChangeError(error) {
    try {
      await proxyManager.disconnectProxyOnly();
    } catch (directError) {
      console.error(
        "AutoChangeManager: Failed to disconnect proxy after error:",
        directError
      );
    }

    if (this.isRunning && this.validateConfig()) {
      this.remainingTime = 30;
      this.lastUpdateTime = Date.now();
      await this.saveState();
      this.scheduleTimer();
    }
  }

  // NEW: Update storage with proxy info
  async updateStorageWithProxyInfo(proxyInfo) {
    try {
      // Update chrome.storage.sync (main bridge to popup)
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
        cacheUpdateFlag: {
          timestamp: Date.now(),
          source: "autoChangeIP",
          proxyInfo: proxyInfo,
          needsLocalStorageUpdate: true,
          reason: "Auto change IP completed while popup closed",
        },
      });

      // Update chrome.storage.local (backup + immediate access)
      await browserAPI.storage.local.set({
        proxyInfo: proxyInfo,
        lastProxyUpdate: Date.now(),
        cachedProxyInfo: {
          proxyInfo: proxyInfo,
          timestamp: Date.now(),
          version: 1,
          source: "autoChangeIP",
        },
      });
    } catch (cacheError) {
      console.error(
        "AutoChangeManager: ❌ Error updating proxy cache:",
        cacheError
      );
    }
  }

  // NEW: Sync nextChangeIP timer
  async syncNextChangeIPTimer(data) {
    if (data.nextChangeIP && data.nextChangeIP > 0) {
      try {
        const currentTime = Date.now();
        const nextChangeTarget = currentTime + data.nextChangeIP * 1000;
        await browserAPI.storage.local.set({
          nextChangeTarget: nextChangeTarget,
          nextChangeDuration: data.nextChangeIP,
          nextChangeStartTime: currentTime,
          nextChangeExpired: false,
        });
      } catch (error) {
        console.error("AutoChangeManager: Error synchronizing timers:", error);
      }
    }
  }

  // NEW: Check if auto change is in protected state
  isInProtectedState() {
    return this.isChangingIP || this.isProtected;
  }

  // NEW: Check if auto change is in protected or changing state
  isInProtectedOrChangingState() {
    return this.isChangingIP || this.isProtected || this.executionMutex;
  }

  // ENHANCED: getStatus with protection info
  getStatus() {
    return {
      isActive: this.isRunning,
      remainingTime: this.remainingTime,
      originalDuration: this.originalDuration,
      isChangingIP: this.isChangingIP,
      isProtected: this.isProtected,
      executionMutex: this.executionMutex,
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

  async verifyProxyDisconnected() {
    try {
      let attempts = 0;
      const maxAttempts = 10;
      const baseDelay = 200;

      while (attempts < maxAttempts) {
        // Check internal proxy state
        const currentProxy = proxyRequestManager.getCurrentProxy();

        // FIXED: More comprehensive proxy state checking
        const isProxyActive =
          currentProxy.isActive ||
          currentProxy.mode ||
          (currentProxy.proxy && currentProxy.proxy.hostname) ||
          (IS_FIREFOX && currentProxy.firefoxProxyActive);

        if (!isProxyActive) {
          return true;
        }

        // If still active, try to clear again
        if (attempts < maxAttempts - 1) {
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

  // ENHANCED: Better state validation
  async saveState() {
    try {
      // Validate config before saving
      if (!this.validateConfig()) {
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
        isProtected: this.isProtected,
        executionMutex: this.executionMutex,
        version: Date.now(),
      };

      await browserAPI.storage.local.set({ autoChangeState: state });
    } catch (error) {
      console.error("AutoChangeManager: Error saving state", error);
    }
  }

  // ENHANCED: Better state loading with validation
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
          this.isProtected = state.isProtected || false;
          this.executionMutex = state.executionMutex || false;

          // CRITICAL FIX: Clear mutex if it was stuck
          if (this.executionMutex) {
            console.warn("AutoChangeManager: Clearing stuck execution mutex");
            this.executionMutex = false;
          }

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

  async clearState() {
    try {
      await browserAPI.storage.local.remove(["autoChangeState"]);
    } catch (error) {
      console.error("AutoChangeManager: Error clearing state", error);
    }
  }

  // ENHANCED: Better stop method
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
    this.isProtected = false;
    this.executionMutex = false;
    this.lastUpdateTime = 0;
    this.lastChangeTime = 0;
    this.startTime = 0;
    this.lastConfigValidation = 0;
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
  constructor() {
    // NEW: Add request tracking to prevent duplicates
    this.activeRequests = new Map();
    this.requestTimeout = 5000; // 5 seconds
  }

  // NEW: Generate unique request ID
  generateRequestId(greeting, data) {
    const key = `${greeting}_${data?.apiKey || "no_key"}_${Date.now()}`;
    return key;
  }

  // NEW: Check if request is duplicate
  isDuplicateRequest(greeting, data) {
    const baseKey = `${greeting}_${data?.apiKey || "no_key"}`;

    // Check for active requests with same base key
    for (const [requestId, requestData] of this.activeRequests.entries()) {
      if (requestId.startsWith(baseKey)) {
        const timeDiff = Date.now() - requestData.timestamp;
        if (timeDiff < 3000) {
          // 3 second window
          return true;
        }
      }
    }

    return false;
  }

  // NEW: Enhanced duplicate detection for auto change IP
  isDuplicateAutoChangeRequest(data) {
    // Check if auto change is already running
    if (autoChangeManager.isRunning) {
      return true;
    }

    // Check if auto change is in protected state
    if (
      autoChangeManager.isInProtectedOrChangingState &&
      autoChangeManager.isInProtectedOrChangingState()
    ) {
      return true;
    }

    // Check for recent similar requests
    const baseKey = `${CONFIG.MESSAGES.AUTO_CHANGE_IP}_${
      data?.apiKey || "no_key"
    }`;
    const now = Date.now();

    for (const [requestId, requestData] of this.activeRequests.entries()) {
      if (requestId.startsWith(baseKey)) {
        const timeDiff = now - requestData.timestamp;
        if (timeDiff < 5000) {
          // 5 second window for auto change
          return true;
        }
      }
    }

    return false;
  }

  // NEW: Track request
  trackRequest(requestId, greeting, data) {
    this.activeRequests.set(requestId, {
      greeting,
      data,
      timestamp: Date.now(),
    });

    // Auto cleanup after timeout
    setTimeout(() => {
      this.activeRequests.delete(requestId);
    }, this.requestTimeout);
  }

  // NEW: Complete request
  completeRequest(requestId) {
    this.activeRequests.delete(requestId);
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
      // Popup is closed or not responding, ignore
    }
  }

  async handleMessage(request, sender, sendResponse) {
    const requestId = this.generateRequestId(request.greeting, request.data);

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

        case CONFIG.MESSAGES.FORCE_DISCONNECT:
          sendResponse({ success: true });
          this.handleForceDisconnect(request.data);
          break;

        case CONFIG.MESSAGES.CANCEL_ALL:
          sendResponse({ success: true });
          this.handleCancelAll(request.data);
          break;

        case CONFIG.MESSAGES.CHANGE_IP:
          // CRITICAL FIX: Check for duplicate requests
          if (this.isDuplicateRequest(request.greeting, request.data)) {
            sendResponse({ success: true, duplicate: true });
            break;
          }

          this.trackRequest(requestId, request.greeting, request.data);

          try {
            await autoChangeManager.stop();
            await proxyManager.setDirectProxy();
            await this.sleep(1000);
            await this.changeIP(
              request.data.apiKey,
              request.data.location,
              request.data.proxyType
            );
            sendResponse({ success: true });
          } finally {
            this.completeRequest(requestId);
          }
          break;

        case CONFIG.MESSAGES.AUTO_CHANGE_IP:
          // CRITICAL FIX: Enhanced duplicate detection for auto change
          if (this.isDuplicateAutoChangeRequest(request.data)) {
            sendResponse({ success: true, duplicate: true });
            break;
          }

          this.trackRequest(requestId, request.greeting, request.data);

          try {
            await this.handleAutoChangeIP(request.data);
            sendResponse({ success: true });
          } finally {
            this.completeRequest(requestId);
          }
          break;

        default:
          sendResponse({ error: "Unknown message type" });
          break;
      }
    } catch (error) {
      console.error("Background: Error handling message:", error);
      this.completeRequest(requestId);
      sendResponse({ error: error.message });
    }
  }

  // NEW: Enhanced auto change IP handler
  async handleAutoChangeIP(data) {
    try {
      // CRITICAL FIX: Ensure auto change is fully stopped first
      await autoChangeManager.stop();
      await this.sleep(500);

      // Ensure proxy is disconnected before starting auto change
      await proxyManager.setDirectProxy();
      await this.sleep(1000);

      // CRITICAL FIX: Validate data before proceeding
      if (!data.apiKey) {
        console.error("MessageHandler: No API key provided for auto change");
        return;
      }

      // First, change IP
      await this.changeIP(data.apiKey, data.location, data.proxyType);

      // CRITICAL FIX: Wait a bit before starting auto change to avoid conflicts
      await this.sleep(2000);

      // Then start auto change manager
      const started = await autoChangeManager.start(data);

      if (!started) {
        console.error("MessageHandler: Failed to start auto change manager");
        this.sendToPopup("failureGetProxyInfo", {
          error: "Không thể khởi động tự động đổi IP",
        });
      } else {
      }
    } catch (error) {
      console.error("MessageHandler: Error in handleAutoChangeIP:", error);
      this.sendToPopup("failureGetProxyInfo", {
        error: "Lỗi khi khởi động tự động đổi IP",
      });
    }
  }

  // NEW: Enhanced force disconnect handler
  async handleForceDisconnect(data) {
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
        console.error("MessageHandler: Error during force disconnect:", error);
        try {
          await proxyManager.setDirectProxy();
        } catch (e) {
          console.error(
            "MessageHandler: Final attempt to disconnect failed:",
            e
          );
        }
      }
    })();
  }

  // NEW: Enhanced cancel all handler
  async handleCancelAll(data) {
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
          const state = await proxyRequestManager.loadFirefoxProxyState();
          if (state) {
            await proxyRequestManager.forceClearFirefoxProxy();
          }
        }
      } catch (error) {
        console.error("MessageHandler: Error during cancel all:", error);
        try {
          await proxyManager.setDirectProxy();
        } catch (e) {
          console.error(
            "MessageHandler: Failed to set direct proxy on error:",
            e
          );
        }
      }
    })();
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

  // ENHANCED: Better change IP method with duplicate protection
  async changeIP(apiKey, location, proxyType) {
    this.sendToPopup("showProcessingNewIpConnect", {});

    try {
      await proxyManager.setDirectProxy();
      const waitTime = IS_FIREFOX ? 2000 : 1000;
      await this.sleep(waitTime);

      const result = await APIService.changeIP(apiKey, location);

      if (result?.code === 200) {
        await proxyManager.handleProxyResponse(result.data, apiKey, proxyType);

        // Update cached proxy info after successful change IP
        try {
          const proxyInfo = await proxyManager.buildProxyInfo(
            result.data,
            apiKey,
            proxyType
          );

          await browserAPI.storage.sync.set({
            [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
            cacheUpdateFlag: {
              timestamp: Date.now(),
              source: "changeIP",
              proxyInfo: proxyInfo,
            },
          });
        } catch (cacheError) {
          console.error(
            "MessageHandler: Error updating proxy cache:",
            cacheError
          );
        }
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

  // Clean up old requests periodically
  cleanupOldRequests() {
    const now = Date.now();
    for (const [requestId, requestData] of this.activeRequests.entries()) {
      if (now - requestData.timestamp > this.requestTimeout) {
        this.activeRequests.delete(requestId);
      }
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

    await browserAPI.storage.sync.set({
      [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
      cacheUpdateFlag: {
        timestamp: Date.now(),
        source: "changeIP_background",
        proxyInfo: proxyInfo,
        needsLocalStorageUpdate: true,
      },
    });

    await browserAPI.storage.local.set({
      proxyInfo: proxyInfo,
      lastProxyUpdate: Date.now(),
      cachedProxyInfo: {
        proxyInfo: proxyInfo,
        timestamp: Date.now(),
        version: 1,
      },
    });

    try {
      messageHandler.sendToPopup("successGetProxyInfo", {
        ...proxyInfo,
        updateCache: true,
        cacheSource: "background_while_closed",
      });
    } catch (error) {
      // Popup đã đóng, ignore error
    }

    if (!proxyInfo.public_ip || !proxyInfo.port) {
      messageHandler.sendToPopup("failureGetProxyInfo", {
        error: CONFIG.ERRORS.INVALID_PROXY,
      });
      return;
    }

    await this.setProxySettings(proxyInfo);

    // ENHANCED: Always update storage with latest proxy info
    try {
      await browserAPI.storage.sync.set({
        [CONFIG.STORAGE_KEYS.TX_PROXY]: proxyInfo,
        cacheUpdateFlag: {
          timestamp: Date.now(),
          source: "proxyResponse",
          proxyInfo: proxyInfo,
        },
      });
    } catch (error) {
      console.error("MainProxyManager: Error updating proxy cache:", error);
    }

    const autoChangeStatus = autoChangeManager.getStatus();
    if (!autoChangeStatus.isActive || !autoChangeStatus.isChangingIP) {
      messageHandler.sendToPopup("successGetProxyInfo", {
        ...proxyInfo,
        updateCache: true,
        cacheSource: "proxyResponse",
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
            break;
          }

          attempts++;
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

// NEW: Set up periodic cleanup
setInterval(() => {
  if (messageHandler && messageHandler.cleanupOldRequests) {
    messageHandler.cleanupOldRequests();
  }
}, 30000); // Every 30 seconds

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
