if (typeof browser === 'undefined') {
  var browser = chrome;
}

// Fix for Manifest V3 API differences
if (browser.browserAction) {
  browser.action = browser.browserAction;
}

var Authentication = (function() {
  var credentials = [];
  
  function init(proxyData) {
    credentials = proxyData || [];
    console.log("Authentication initialized with", credentials.length, "proxies");
    
    // Set up webRequest listener for authentication
    if (browser.webRequest && browser.webRequest.onAuthRequired) {
      // Remove existing listener if any
      if (browser.webRequest.onAuthRequired.hasListener(handleAuthRequired)) {
        browser.webRequest.onAuthRequired.removeListener(handleAuthRequired);
      }
      
      // Add new listener
      browser.webRequest.onAuthRequired.addListener(
        handleAuthRequired,
        { urls: ["<all_urls>"] },
        ["blocking"]
      );
    }
  }
  
  function handleAuthRequired(details) {
    console.log("Auth required for:", details.url);
    
    // Find matching credentials for this proxy
    for (var i = 0; i < credentials.length; i++) {
      var cred = credentials[i];
      if (cred.username && cred.password) {
        console.log("Providing auth for proxy:", cred.hostname);
        return {
          authCredentials: {
            username: cred.username,
            password: cred.password
          }
        };
      }
    }
    
    // No credentials found
    console.log("No credentials found for auth request");
    return {};
  }
  
  function clear() {
    credentials = [];
    if (browser.webRequest && browser.webRequest.onAuthRequired) {
      if (browser.webRequest.onAuthRequired.hasListener(handleAuthRequired)) {
        browser.webRequest.onAuthRequired.removeListener(handleAuthRequired);
      }
    }
    console.log("Authentication cleared");
  }
  
  return {
    init: init,
    clear: clear
  };
})();

// === ON-REQUEST MODULE ===
var OnRequest = (function() {
  var mode = "";
  var proxy = {};
  var isInitialized = false;
  var isListenerAdded = false;

  // Initialize proxy listener
  function initializeListener() {
    if (!isListenerAdded && browser.proxy && browser.proxy.onRequest) {
      browser.proxy.onRequest.addListener(function(e) {
        return OnRequest.process(e);
      }, {
        urls: ["<all_urls>"],
      });
      isListenerAdded = true;
      console.log("Proxy listener initialized");
    }
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await browser.storage.local.get(['proxyMode', 'proxyData']);
      if (result.proxyMode && result.proxyData) {
        mode = result.proxyMode;
        const data = result.proxyData.filter(function(i) {
          return i.type !== "pac" && i.hostname;
        });
        proxy = /:\d+[^/]*$/.test(result.proxyMode) &&
          data.find(function(i) {
            return result.proxyMode === (i.hostname + ":" + i.port);
          });
        isInitialized = true;
        console.log("Proxy settings loaded from storage:", mode, proxy);
      }
    } catch (error) {
      console.error("Failed to load proxy settings:", error);
    }
  }

  // Save settings to storage
  async function saveSettings(pref) {
    try {
      await browser.storage.local.set({
        proxyMode: pref.mode,
        proxyData: pref.data
      });
      console.log("Proxy settings saved to storage");
    } catch (error) {
      console.error("Failed to save proxy settings:", error);
    }
  }

  // Public methods
  return {
    async init(pref) {
      // Save to storage first
      await saveSettings(pref);
      
      // Update current settings
      mode = pref.mode;
      const data = pref.data.filter(function(i) {
        return i.type !== "pac" && i.hostname;
      });

      proxy = /:\d+[^/]*$/.test(pref.mode) &&
        data.find(function(i) {
          return pref.mode === (i.hostname + ":" + i.port);
        });
      
      isInitialized = true;
      console.log("Proxy initialized:", mode, proxy);
    },

    process(e) {
      // If not initialized, try to load from storage
      if (!isInitialized) {
        loadSettings();
        return { type: "direct" };
      }
      
      return this.processProxy(proxy);
    },

    processProxy(proxyData) {
      var type = proxyData && proxyData.type;
      var host = proxyData && proxyData.hostname;
      var port = proxyData && proxyData.port;
      var username = proxyData && proxyData.username;
      var password = proxyData && proxyData.password;
      var proxyDNS = proxyData && proxyData.proxyDNS;
      
      if (!type || type === "direct") {
        return { type: "direct" };
      }

      var response = { type: type, host: host, port: parseInt(port) };
      
      // Handle SOCKS5 type
      if (response.type === "socks5") {
        response.type = "socks";
      }
      
      // Set proxyDNS for SOCKS
      if (type.startsWith("socks")) {
        response.proxyDNS = !!proxyDNS;
      }

      // Add authentication
      if (username && password) {
        response.username = username;
        response.password = password;
        response.proxyAuthorizationHeader =
          "Basic " + btoa(username + ":" + password);
      }

      console.log("Proxy response:", response);
      return response;
    },

    // Method to clear proxy settings
    async clearProxy() {
      mode = "";
      proxy = {};
      isInitialized = false;
      await browser.storage.local.remove(['proxyMode', 'proxyData']);
      console.log("Proxy settings cleared");
    },

    // Method to get current proxy status
    getCurrentProxy() {
      return {
        mode: mode,
        proxy: proxy,
        isActive: !!proxy && proxy.type !== "direct"
      };
    },

    // Load settings method for external use
    loadSettings: loadSettings,

    // Initialize listener method for external use
    initializeListener: initializeListener
  };
})();

// === MAIN BACKGROUND SCRIPT ===
var worker = null;
var timeChangeProxyLeft = 0;
var isRunningAutoChange = false;
var timer = 0;
var cancelSleep;
var isCancelled = false;
var SERVER = "https://api.vnproxy.com";

function sendMessageForPopup(message, data) {
  try {
    browser.runtime.sendMessage({ greeting: message, data: data || null });
  } catch (error) {
    console.error("Error sending message to popup:", error);
  }
}

browser.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
  try {
    switch (request.greeting) {
      case "getLocationsData":
        const locations = await getLocations(request.data);
        if (locations) sendResponse({ data: locations });
        break;
      case "checkVersion":
        checkVersion();
        await setDirectProxy();
        break;
      case "getInfoKey":
        getInfoKey(request.data);
        break;
      case "getCurrentProxy":
        stopThreadAutoChangeIp();
        await setDirectProxy();
        handleGetCurrentProxy(request.data.apiKey, request.data.proxyType);
        break;
      case "cancelALL":
        deleteAlarm("flagLoop");
        deleteAlarm("refreshPage");
        stopThreadAutoChangeIp();
        handleDisconnectProxy(request.data.apiKey, request.data.whitelist_ip);
        await setDirectProxy();
        break;
      case "changeIp":
        stopThreadAutoChangeIp();
        await setDirectProxy();
        handleChangeIpProxy(
          request.data.apiKey,
          request.data.location,
          request.data.proxyType
        );
        break;
      case "autoChangeIp":
        stopThreadAutoChangeIp();
        await setDirectProxy();
        handleChangeLocationProxy(
          request.data.apiKey,
          request.data.location,
          request.data.proxyType
        );
        startThreadAutoChangeIp(request.data);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
});

// Initialize OnRequest when background script loads
OnRequest.loadSettings().then(function() {
  OnRequest.initializeListener();
});

var getInfoKey = async function(data) {
  var url = SERVER + "/webservice/statusIP?key=" + data.apiKey;
  var result = await callRequest(url);
  if (result.code == 200) {
    sendMessageForPopup("successGetInfoKey", result);
    return result.data;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: result.status == 500 ? "Kết Nối Thất Bại" : result.message,
    }
  );
  return result;
};

var startThreadAutoChangeIp = async function(data) {
  if (data.timeAutoChangeIP > 0) {
    browser.storage.sync.set({ TIME_CHANGE_IP: data.timeAutoChangeIP });
  }
  if (
    data.isAutoChangeIP &&
    data.timeAutoChangeIP > 0 &&
    !isRunningAutoChange
  ) {
    isRunningAutoChange = true;
    timer = data.timeAutoChangeIP;
    while (isRunningAutoChange && timer > 0) {
      await sleep(1000);
      if (timer == 0) {
        timer = data.timeAutoChangeIP;
        await setDirectProxy();
      }

      cancelSleep = await sleep(timer * 1000);
      if (isRunningAutoChange) {
        var newProxyData = await getChangeIpApiPrime(data.apiKey, data.type);
        if (newProxyData && newProxyData.code === 200) {
          await handleProxyResponse(newProxyData.data, data.apiKey, data.proxyType);
        } else {
          sendMessageForPopup(
            "failureGetProxyInfo",
            {
              error:
                newProxyData && newProxyData.code == 500
                  ? "Kết Nối Thất Bại"
                  : (newProxyData && newProxyData.message) || "Lỗi không xác định",
            }
          );
        }
        timer--;
      }
    }
  } else {
    isRunningAutoChange = false;
    if (cancelSleep) {
      var cancel = cancelSleep();
      cancel();
    }
    await setDirectProxy();
    if (worker) {
      worker.terminate();
    }
  }
};

var sleep = function(timeout) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      if (!isCancelled) {
        resolve();
      }
    }, timeout);

    return function() {
      isCancelled = true;
      clearTimeout(timer);
    };
  });
};

var getChangeIpApiPrime = async function(apiKey) {
  var url = SERVER + "/webservice/changeIP?key=" + apiKey;
  var result = await callRequest(url);

  if (result && result.code === 200) {
    return result;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: result && result.status == 500 ? "Kết Nối Thất Bại" : (result && result.message) || "Lỗi kết nối",
    }
  );
  return result;
};

var handleChangeLocationProxy = async function(apiKey, location, proxyType) {
  var response = await getChangeLocationApi(apiKey, location);
  if (response && response.status === 500) {
    return;
  }
  await handleProxyResponse(response, apiKey, proxyType);
};

var getChangeLocationApi = async function(apiKey, location) {
  var url = SERVER + "/webservice/changeIP?key=" + apiKey;

  if (location) {
    url = url + "&location=" + location;
  }

  var result = await callRequest(url);

  if (result && result.code === 200) {
    return result.data;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: result && result.status == 500 ? "Kết Nối Thất Bại" : (result && result.message) || "Lỗi kết nối",
    }
  );
  return result;
};

var handleChangeIpProxy = async function(apiKey, location, proxyType) {
  sendMessageForPopup("showProcessingNewIpConnect", {});
  var response = await getChangeIpApi(apiKey, location);
  if (response && response.status === 500) {
    return;
  }
  await handleProxyResponse(response, apiKey, proxyType);
};

var getChangeIpApi = async function(apiKey, location) {
  var url = SERVER + "/webservice/changeIP?key=" + apiKey;

  if (location) {
    url = url + "&location=" + location;
  }

  var result = await callRequest(url);

  if (result && result.code === 200) {
    return result.data;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: result && result.status == 500 ? "Kết Nối Thất Bại" : (result && result.message) || "Lỗi kết nối",
    }
  );

  return result;
};

function deleteAlarm(name) {
  browser.alarms.clear(name);
}

var handleDisconnectProxy = async function(apiKey, whitelist_ip) {
  disconnectProxyApi(apiKey, whitelist_ip);
};

var disconnectProxyApi = async function(apiKey) {
  return true;
};

var getLocations = async function() {
  var url = SERVER + "/webservice/getLocation";
  var result = await callRequest(url);
  if (result && result.code === 200) {
    sendMessageForPopup("getLocationsSuccess", result.data);
    return result.data;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: "Kết Nối Thất Bại",
    }
  );
  return result;
};

var callRequest = async function(url, headers) {
  return new Promise(function(resolve, reject) {
    var header = {
      method: "GET",
      mode: "cors",
      headers: headers,
    };

    try {
      fetch(url, header)
        .then(function(response) { return response.json(); })
        .then(function(data) {
          return resolve(data);
        })
        .catch(function(error) {
          console.error("Fetch error:", error);
          return resolve(null);
        });
    } catch (error) {
      console.error("Request error:", error);
      return resolve(null);
    }
  });
};

// Set direct proxy properly
var setDirectProxy = async function() {
  try {
    // Clear OnRequest proxy
    await OnRequest.clearProxy();
    
    // Clear browser proxy settings
    if (browser.proxy && browser.proxy.settings) {
      await browser.proxy.settings.clear({});
    }
    
    // Clear authentication
    Authentication.clear();
    
    // Update UI and storage
    setBadgeOff();
    await browser.storage.sync.set({ tx_proxy: null });
    
    console.log("Proxy set to direct");
  } catch (error) {
    console.error("Error setting direct proxy:", error);
  }
};

// LEGACY function for compatibility
var direct = function() {
  setDirectProxy();
};

var setBadgeOff = function() {
  browser.action.setBadgeBackgroundColor({ color: [162, 36, 36, 255] });
  browser.action.setBadgeText({ text: "OFF" });
};

var setBadgeOn = function(location) {
  browser.action.setBadgeBackgroundColor({ color: [36, 162, 36, 255] });
  browser.action.setBadgeText({ text: "ON" });
};

var stopThreadAutoChangeIp = function() {
  isRunningAutoChange = false;
  if (cancelSleep) {
    var cancel = cancelSleep();
    cancel();
  }

  setDirectProxy();
  if (worker) {
    worker.terminate();
  }
};

var handleGetCurrentProxy = async function(apiKey, proxyType) {
  sendMessageForPopup("processingGetProxyInfo", {});
  var response = await getCurrentProxyApi(apiKey);
  if (response && response.status === 500) {
    return;
  }
  await handleProxyResponse(response, apiKey, proxyType);
};

// Actually set proxy instead of just sending message
var handleProxyResponse = async function(response, apiKey, proxyType) {
  if (!response || (!response.ipv4 && !response.ipv6)) {
    sendMessageForPopup(
      "failureGetProxyInfo",
      {
        error: response && response.code == 500 ? "Kết Nối Thất Bại" : (response && response.message) || "Không thể lấy thông tin proxy",
      }
    );
    return;
  }

  var portV4 = "";
  var portV6 = "";
  
  if (response.ipv4) {
    var ipv4Parts = response.ipv4.split(":");
    portV4 = ipv4Parts.length >= 2 ? ipv4Parts[ipv4Parts.length - 1] : "";
  }

  if (response.ipv6) {
    var ipv6Parts = response.ipv6.split(":");
    portV6 = ipv6Parts.length >= 2 ? ipv6Parts[ipv6Parts.length - 1] : "";
  }

  var public_ip = response.public_ipv4;
  if (response.ipv4 && containsDomain(response.ipv4)) {
    try {
      public_ip = await getIptToDomain(response.ipv4.split(":")[0]);
    } catch (error) {
      console.error("Error resolving domain:", error);
    }
  }

  var proxyInfo = {
    public_ipv6: response.public_ipv6 || "",
    public_ipv4: response.public_ipv4 || "",
    public_ip: public_ip || response.public_ipv4,
    username: response.credential && response.credential.username,
    password: response.credential && response.credential.password,
    proxyTimeout: response.proxyTimeout,
    nextChangeIP: response.nextChangeIP,
    nextTime: Math.floor(Date.now() / 1000) + parseInt(response.nextChangeIP || 0),
    location: response.location,
    apiKey: apiKey,
    port:
      proxyType == "ipv4" && portV4
        ? parseInt(portV4)
        : proxyType == "ipv6" && portV6
        ? parseInt(portV6)
        : portV4 ? parseInt(portV4) : parseInt(portV6), // Default to IPv4 if available
    type: response.proxyType || "http",
  };

  if (!proxyInfo.public_ip || !proxyInfo.port) {
    sendMessageForPopup(
      "failureGetProxyInfo",
      {
        error: "Không thể lấy thông tin proxy",
      }
    );
    return;
  }

  // Actually set the proxy
  await setProxySettings(proxyInfo);
  
  // Send success message to popup
  sendMessageForPopup("successGetProxyInfo", proxyInfo);
};

// Function to actually set proxy settings
var setProxySettings = async function(proxyInfo) {
  try {
    // Create proxy config for OnRequest
    var proxyConfig = {
      mode: proxyInfo.public_ip + ":" + proxyInfo.port,
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

    // Set proxy using OnRequest
    await OnRequest.init(proxyConfig);
    
    // Set authentication
    Authentication.init(proxyConfig.data);
    
    // ALSO set browser proxy settings for immediate effect
    await setBrowserProxy(proxyInfo);
    
    // Update badge and storage
    setBadgeOn(proxyInfo.location);
    await browser.storage.sync.set({ tx_proxy: proxyInfo });
    
    console.log("Proxy set successfully:", proxyConfig.mode);
  } catch (error) {
    console.error("Error setting proxy:", error);
    sendMessageForPopup("failureGetProxyInfo", {
      error: "Không thể thiết lập proxy"
    });
  }
};

// Set browser proxy settings (moved from popup.js)
var setBrowserProxy = async function(proxyInfo) {
  try {
    var pref = {
      mode: proxyInfo.public_ip + ":" + proxyInfo.port,
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

    // Check if Firefox
    if (navigator.userAgent.includes("Firefox")) {
      await setFireFoxProxy(pref);
    } else {
      await setChromeProxy(pref);
    }
    
    console.log("Browser proxy set:", pref.mode);
  } catch (error) {
    console.error("Error setting browser proxy:", error);
  }
};

// Firefox proxy setting (moved from popup.js)
var setFireFoxProxy = async function(pref) {
  try {
    if (navigator.userAgent.includes("Android")) return;

    if (browser.extension && browser.extension.isAllowedIncognitoAccess) {
      var allowed = await browser.extension.isAllowedIncognitoAccess();
      if (!allowed) {
        console.log("Incognito access not allowed");
        return;
      }
    }

    var value = {};
    switch (true) {
      case pref.mode.includes("://") && !/:\d+$/.test(pref.mode):
        value.proxyType = "autoConfig";
        value.autoConfigUrl = pref.mode;
        value.proxyDNS = pref.proxyDNS;
        if (browser.proxy && browser.proxy.settings) {
          await browser.proxy.settings.set({ value: value, scope: "regular" });
        }
        break;
      default:
        if (browser.proxy && browser.proxy.settings) {
          await browser.proxy.settings.clear({});
        }
    }
  } catch (error) {
    console.error("Error setting Firefox proxy:", error);
  }
};

// Chrome proxy setting (moved from popup.js)  
var setChromeProxy = async function(pref) {
  try {
    var config = { value: {}, scope: "regular" };
    var pxy = findProxyForChrome(pref);
    if (pxy && browser.proxy && browser.proxy.settings) {
      config.value.mode = "fixed_servers";
      config.value.rules = getSingleProxyRule(pxy);
      await browser.proxy.settings.set(config);
    }
  } catch (error) {
    console.error("Error setting Chrome proxy:", error);
  }
};

// Find proxy helper (moved from popup.js)
var findProxyForChrome = function(pref, mode) {
  mode = mode || pref.mode;
  return pref.data.find(function(i) {
    return i.active &&
      i.type !== "pac" &&
      i.hostname &&
      mode === (i.hostname + ":" + i.port);
  });
};

// Get proxy rule helper (moved from popup.js)
var getSingleProxyRule = function(pxy) {
  return {
    singleProxy: {
      scheme: pxy.type,
      host: pxy.hostname,
      port: parseInt(pxy.port),
    },
  };
};

function containsDomain(text) {
  var domainRegex = /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/;
  return domainRegex.test(text);
}

var getCurrentProxyApi = async function(apiKey) {
  var url = SERVER + "/webservice/statusIP?key=" + apiKey;
  var result = await callRequest(url);

  if (result && result.code == 200) {
    return result.data;
  }
  sendMessageForPopup(
    "failureGetProxyInfo",
    {
      error: result && result.status == 500 ? "Kết Nối Thất Bại" : (result && result.message) || "Lỗi kết nối",
    }
  );
  return result;
};

var getIptToDomain = async function(domain) {
  var headers = { Accept: "application/dns-json" };
  var url = "https://cloudflare-dns.com/dns-query?name=" + domain + "&type=A";
  var result = await callRequest(url, headers);

  if (result && result.Answer && result.Answer.length > 0) {
    var obj = result.Answer[Math.floor(Math.random() * result.Answer.length)];
    return obj.data;
  }
  
  return null;
};

// Initialize extension
browser.runtime.onStartup.addListener(function() {
  console.log("VNProxy Extension started");
  OnRequest.loadSettings().then(function() {
    OnRequest.initializeListener();
  });
});

browser.runtime.onInstalled.addListener(function() {
  console.log("VNProxy Extension installed/enabled");
});

// Add checkVersion function if needed
function checkVersion() {
  console.log("Version check called");
}