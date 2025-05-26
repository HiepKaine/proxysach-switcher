if (typeof browser === 'undefined') {
  var browser = chrome;
}

let nextTimeChange;
let timeChangeIP;
let countDowntime;
let totalTimeChangeIp;

const sendMessageForBackground = async (message, data) => {
  return await browser.runtime.sendMessage({ greeting: message, data: data });
};

const countDownWorker = () => {
  if (!countDowntime) {
    return;
  }
  nextTimeChange = setInterval(() => {
    document.getElementById("next_time").innerText = `${countDowntime} s`;
    countDowntime--;
    if (countDowntime < 0) {
      document.getElementById("next_time").innerText = `0 s`;
      clearInterval(nextTimeChange);
      return;
    }

    const proxyInfo = localStorage.getItem("proxyInfo");
    const obj = proxyInfo ? JSON.parse(proxyInfo) : {};

    localStorage.setItem(
      "proxyInfo",
      JSON.stringify({
        ...obj,
        nextChangeIP: countDowntime > 0 ? countDowntime : 0,
      })
    );
  }, 1000);
};

const countDowntimeChangeIp = () => {
  if (!totalTimeChangeIp) {
    return;
  }
  timeChangeIP = setInterval(() => {
    document.getElementById("time-change-ip").value = `${totalTimeChangeIp}`;

    totalTimeChangeIp--;
    if (totalTimeChangeIp < 0) {
      document.getElementById("time-change-ip").value = `0`;
      clearInterval(timeChangeIP);
      return;
    }

    const isAutoChangeIP = localStorage.getItem("isAutoChangeIP");
    if (isAutoChangeIP) {
      localStorage.setItem(
        "timeAutoChangeIP",
        totalTimeChangeIp > 0 ? totalTimeChangeIp : 0
      );
    }
  }, 1000);
};

browser.runtime.onMessage.addListener((request) => {
  switch (request.greeting) {
    case "getLocationsSuccess":
      var list = document.getElementById("location_select");
      while (list.hasChildNodes()) {
        list.removeChild(list.firstChild);
      }

      if (request.data !== null) {
        const locations = request.data;
        locations.forEach((location) => {
          const option = document.createElement("option");
          option.textContent = location.name;
          option.value = location.code;
          document.getElementById("location_select").append(option);
        });
      }

      const proxyInfo = localStorage.getItem("proxyInfo");
      const timeAutoChangeIP2 = localStorage.getItem("timeAutoChangeIP2");
      const isAutoChangeIP2 = localStorage.getItem("isAutoChangeIP");

      if (isAutoChangeIP2 && JSON.parse(isAutoChangeIP2)) {
        totalTimeChangeIp = Number(timeAutoChangeIP2);
      }

      if (proxyInfo) {
        showProxyInfo(JSON.parse(proxyInfo), true);
      }
      break;
    case "processingGetProxyInfo":
      showProcessingConnect();
      break;
    case "showProcessingNewIpConnect":
      showProcessingNewIpConnect();
      break;
    case "failureGetProxyInfo":
      alertGetProxyInfo(request);
      break;
    case "successGetProxyInfo":
      clearInterval(nextTimeChange);
      clearInterval(timeChangeIP);
      storeProxyCache(request.data);
      showProxyInfo(request.data);
      updateProxyUIStatus();
      countDowntime = request.data.nextChangeIP;
      const isAutoChangeIP = localStorage.getItem("isAutoChangeIP");
      const timeAutoChangeIP = localStorage.getItem("timeAutoChangeIP");
      localStorage.setItem("proxyInfo", JSON.stringify(request.data));
      if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
        totalTimeChangeIp = Number(timeAutoChangeIP);
      }
      break;
    case "successGetInfoKey":
      getInfoKey(request.data);
      break;
    default:
      break;
  }
});

const handleClick = () => {
  const listProxyType = document.querySelectorAll("#radio-switch-5");
  let proxyType = "";
  for (let i of listProxyType) {
    if (i.checked == true) {
      proxyType = i.value;
    }
  }

  const location = document.getElementById("location_select").value;
  const listChangeIp = document.querySelectorAll("#radio-switch-change-ip");
  let typeChangeIp = "keep";
  for (let i of listChangeIp) {
    if (i.checked == true && i.value == "change") {
      typeChangeIp = "change";
    }
  }

  const isAutoChangeIP = document.getElementById("is-auto-change").checked;
  const timeAutoChangeIP = document.getElementById("time-change-ip").value;

  if (isAutoChangeIP) {
    localStorage.setItem("isAutoChangeIP", isAutoChangeIP);
    localStorage.setItem("timeAutoChangeIP", timeAutoChangeIP);
  } else {
    localStorage.removeItem("isAutoChangeIP");
    localStorage.removeItem("timeAutoChangeIP");
  }

  const apiKey = document.getElementById("api_key").value;
  const config = {
    apiKey: apiKey,
    isAutoChangeIP: isAutoChangeIP,
    timeAutoChangeIP: timeAutoChangeIP,
    proxyType: proxyType ? proxyType : "ipv4",
  };
  localStorage.setItem("change_ip_type", typeChangeIp);
  localStorage.setItem("proxyType", proxyType);
  localStorage.setItem("apiKey", apiKey);

  if (isAutoChangeIP) {
    if (location) {
      config.location = location;
    }
    sendMessageForBackground("autoChangeIp", config);
  } else {
    if (typeChangeIp == "change") {
      if (location) {
        config.location = location;
      }
      sendMessageForBackground("changeIp", config);
    } else {
      sendMessageForBackground("getCurrentProxy", config);
    }
  }
};

const handleStart = () => {
  const apiKey = localStorage.getItem("apiKey");
  const change_ip_type = localStorage.getItem("change_ip_type");
  const proxyType = localStorage.getItem("proxyType");
  const isAutoChangeIP = localStorage.getItem("isAutoChangeIP");
  const timeAutoChangeIP = localStorage.getItem("timeAutoChangeIP");

  if (apiKey && change_ip_type && proxyType) {
    document.getElementById("api_key").value = apiKey;
    const listChangeIp = document.querySelectorAll("#radio-switch-change-ip");
    for (let i of listChangeIp) {
      if (i.value == change_ip_type) {
        i.checked = true;
      }
    }

    const listProxyType = document.querySelectorAll("#radio-switch-5");
    for (let i of listProxyType) {
      if (i.value == proxyType) {
        i.checked = true;
      }
    }
  }

  if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
    document.getElementById("is-auto-change").checked = isAutoChangeIP;
    document.getElementById("time-change-ip").value = Number(timeAutoChangeIP);
    totalTimeChangeIp = Number(timeAutoChangeIP);
  }
};

const getInfoKey = (res) => {
  handleClick();
};

const updateProxyUIStatus = () => {
  localStorage.setItem("proxyConnected", "true");
};

const direct = () => {
  localStorage.removeItem("proxyInfo");
  localStorage.removeItem("proxyConnected");
};

const start = async () => {
  clearInterval(nextTimeChange);
  clearInterval(timeChangeIP);
  sendMessageForBackground("getLocationsData");
  document.getElementById("proxy-status").classList.add("text-danger");
  const apiKey = localStorage.getItem("apiKey");
  if (apiKey === undefined || apiKey === "" || apiKey === null) {
    return;
  } else {
    handleStart();
  }
};

//click-btn-connect
document
  .getElementById("btn-connect")
  .addEventListener("click", async function () {
    disableBtn("btn-connect");
    popupPageClear();
    clearInterval(nextTimeChange);
    clearInterval(timeChangeIP);
    const apiKey = document.getElementById("api_key").value;

    if (apiKey === undefined || apiKey === "") {
      document.getElementById("proxy-status").innerText = "• Key Không Hợp Lệ";
      return;
    } else {
      handleClick();
    }
  });

document
  .getElementById("btn-disconnect")
  .addEventListener("click", async function () {
    const proxyInfo = await getProxyFromCache();
    const config = {
      apiKey: proxyInfo && proxyInfo.apiKey ? proxyInfo.apiKey : "",
      isAutoChangeIP: false,
      timeAutoChangeIP: document.getElementById("time-change-ip").value,
    };
    storeConfCache(config);
    popupPageClear();
    direct();
    clearInterval(timeChangeIP);
    sendMessageForBackground("cancelALL", config);
  });

const popupPageClear = () => {
  disableBtn("btn-disconnect");
  enableBtn("btn-connect");
  countDowntime = 0;
  document.getElementById("public_ipv4").innerText = "";
  document.getElementById("public_ipv6").innerText = "";
  document.getElementById("timeout").innerText = "";
  document.getElementById("next_time").innerText = "";
  document.getElementById("time-change-ip").innerText = `0`;
  document.getElementById("api_key_error").innerText = "";
  document.getElementById("ip-info").style.display = "none";
  document.getElementById("proxy-status").innerText = "• Chưa kết nối";
  document.getElementById("proxy-status").classList.add("text-danger");
};

const storeConfCache = (config) => {
  browser.storage.sync.set({ tx_conf: config });
};

const storeProxyCache = (proxy) => {
  browser.storage.sync.set({ tx_proxy: proxy });
};

const showProcessingConnect = () => {
  document.getElementById("ip-info").style.display = null;
  document.getElementById("proxy-status").innerText = "• Đang kết nối...";
  document.getElementById("proxy-status").classList.remove("text-danger");
  document.getElementById("proxy-status").classList.add("text-success");
};

const showProcessingNewIpConnect = () => {
  document.getElementById("ip-info").style.display = null;
  document.getElementById("proxy-status").innerText = "• Đang đổi IP...";
  document.getElementById("proxy-status").classList.remove("text-danger");
  document.getElementById("proxy-status").classList.add("text-success");
};

const showProxyInfo = (proxyInfo, start) => {
  document.getElementById("public_ipv4").innerText = proxyInfo.public_ipv4;
  document.getElementById("public_ipv6").innerText = proxyInfo.public_ipv6;
  document.getElementById("timeout").innerText = proxyInfo.proxyTimeout;
  document.getElementById("next_time").innerText = "-";
  document.getElementById("location_select").value = proxyInfo.location;
  if (!start) {
    enableBtn("btn-disconnect");
    disableBtn("btn-connect");
  }

  document.getElementById("api_key_error").innerText = "";
  document.getElementById("proxy-status").innerText = "• Đã kết nối";
  document.getElementById("ip-info").style.display = "block";
  document.getElementById("proxy-status").classList.remove("text-danger");
  document.getElementById("proxy-status").classList.add("text-success");

  countDowntime = proxyInfo.nextChangeIP;
  const timeAutoChangeIP = localStorage.getItem("timeAutoChangeIP");
  const isAutoChangeIP = localStorage.getItem("isAutoChangeIP");
  totalTimeChangeIp = timeAutoChangeIP;
  countDownWorker();
  if (JSON.parse(isAutoChangeIP) && timeAutoChangeIP) {
    countDowntimeChangeIp();
  }
};

const getProxyFromCache = async () => {
  let data = await getDataStorageChrome("tx_proxy");
  return data;
};

const getDataStorageChrome = (key) => {
  return new Promise((resolve, reject) => {
    try {
      browser.storage.sync.get([key], function (items) {
        let data = items[key];
        if (data) {
          resolve(data);
        } else {
          resolve(null);
        }
      });
    } catch (error) {
      resolve(null);
    }
  });
};

const alertGetProxyInfo = (message) => {
  document.getElementById("proxy-status").classList.add("text-danger");
  document.getElementById("proxy-status").innerText = `• ${message.data.error}`;
};

function disableBtn(id) {
  document.getElementById(id).disabled = true;
}

function enableBtn(id) {
  document.getElementById(id).disabled = false;
}

start();
