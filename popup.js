// Popup 脚本

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const instanceSelect = document.getElementById('instanceSelect');
const refreshBtn = document.getElementById('refreshBtn');
const checkIntervalSelect = document.getElementById('checkInterval');
const statusText = document.getElementById('statusText');
const monitoringInstance = document.getElementById('monitoringInstance');
const intervalText = document.getElementById('intervalText');
const instanceInfo = document.getElementById('instanceInfo');
const currentStatus = document.getElementById('currentStatus');
const gpuStatus = document.getElementById('gpuStatus');
const enableEmail = document.getElementById('enableEmail');
const emailConfig = document.getElementById('emailConfig');
const serverChanSendKey = document.getElementById('serverChanSendKey');
const enableEmailNotify = document.getElementById('enableEmailNotify');
const emailNotifyConfig = document.getElementById('emailNotifyConfig');
const emailRecipient = document.getElementById('emailRecipient');
const emailjsPublicKey = document.getElementById('emailjsPublicKey');
const emailjsServiceId = document.getElementById('emailjsServiceId');
const emailjsTemplateId = document.getElementById('emailjsTemplateId');
const showServerChanSendKey = document.getElementById('showServerChanSendKey');
const showEmailjsPublicKey = document.getElementById('showEmailjsPublicKey');
const showEmailjsServiceId = document.getElementById('showEmailjsServiceId');
const showEmailjsTemplateId = document.getElementById('showEmailjsTemplateId');
const clearNotifySettingsBtn = document.getElementById('clearNotifySettingsBtn');

function withTimeout(promise, ms, timeoutMessage) {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    timeoutPromise
  ]);
}

async function persistNotifySettingsFromUI() {
  const wechatEnabled = !!enableEmail.checked;
  const sendKey = (serverChanSendKey && serverChanSendKey.value) ? serverChanSendKey.value.trim() : '';

  const emailEnabled = !!enableEmailNotify.checked;
  const toEmail = (emailRecipient && emailRecipient.value) ? emailRecipient.value.trim() : '';
  const pubKey = (emailjsPublicKey && emailjsPublicKey.value) ? emailjsPublicKey.value.trim() : '';
  const svcId = (emailjsServiceId && emailjsServiceId.value) ? emailjsServiceId.value.trim() : '';
  const tplId = (emailjsTemplateId && emailjsTemplateId.value) ? emailjsTemplateId.value.trim() : '';

  await chrome.storage.local.set({
    notifyWeChatEnabled: wechatEnabled,
    serverChanSendKey: sendKey,
    notifyEmailEnabled: emailEnabled,
    emailRecipient: toEmail,
    emailjsPublicKey: pubKey,
    emailjsServiceId: svcId,
    emailjsTemplateId: tplId
  });
  return { wechatEnabled, sendKey, emailEnabled, toEmail, pubKey, svcId, tplId };
}

function tabsQuery(queryInfo) {
  return withTimeout(new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs || []);
    });
  }), 3000, 'tabs.query 超时');
}

function isAutoDLInstanceListUrl(url) {
  return typeof url === 'string' && url.includes('https://www.autodl.com/console/instance/list');
}

async function getBestAutoDLInstanceListTab() {
  const activeTabs = await tabsQuery({ active: true, currentWindow: true });
  if (activeTabs.length > 0 && isAutoDLInstanceListUrl(activeTabs[0].url)) {
    return activeTabs[0];
  }

  const tabs = await tabsQuery({ url: 'https://www.autodl.com/console/instance/list*' });
  if (tabs.length === 0) return null;

  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function injectContentScript(tabId) {
  // 直接在 popup 中注入，不经过 background
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  // 等待 content script 初始化
  await new Promise(resolve => setTimeout(resolve, 300));
  return true;
}

async function sendMessageToTab(tabId, message, retryWithInject = true) {
  try {
    return await withTimeout(new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(resp);
      });
    }), 5000, '发送消息超时');
  } catch (err) {
    if (!retryWithInject) throw err;

    const msg = err?.message || '';
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      instanceSelect.innerHTML = '<option value="">正在注入脚本...</option>';
      await injectContentScript(tabId);
      return await sendMessageToTab(tabId, message, false);
    }
    throw err;
  }
}

// 邮件通知开关
enableEmail.addEventListener('change', () => {
  emailConfig.style.display = enableEmail.checked ? 'block' : 'none';
  // 保存设置
  chrome.storage.local.set({ 
    notifyWeChatEnabled: enableEmail.checked
  });
});

enableEmailNotify.addEventListener('change', () => {
  emailNotifyConfig.style.display = enableEmailNotify.checked ? 'block' : 'none';
  chrome.storage.local.set({
    notifyEmailEnabled: enableEmailNotify.checked
  });
});

showServerChanSendKey.addEventListener('change', () => {
  serverChanSendKey.type = showServerChanSendKey.checked ? 'text' : 'password';
});
showEmailjsPublicKey.addEventListener('change', () => {
  emailjsPublicKey.type = showEmailjsPublicKey.checked ? 'text' : 'password';
});
showEmailjsServiceId.addEventListener('change', () => {
  emailjsServiceId.type = showEmailjsServiceId.checked ? 'text' : 'password';
});
showEmailjsTemplateId.addEventListener('change', () => {
  emailjsTemplateId.type = showEmailjsTemplateId.checked ? 'text' : 'password';
});

clearNotifySettingsBtn.addEventListener('click', async () => {
  const ok = confirm('确定要清除通知配置吗？这会清除 Server酱 SendKey 与 EmailJS 配置。');
  if (!ok) return;

  await chrome.storage.local.remove([
    'notifyWeChatEnabled',
    'serverChanSendKey',
    'notifyEmailEnabled',
    'emailRecipient',
    'emailjsPublicKey',
    'emailjsServiceId',
    'emailjsTemplateId',
    'notifyEnabled',
    'emailEnabled'
  ]);

  enableEmail.checked = false;
  enableEmailNotify.checked = false;
  emailConfig.style.display = 'none';
  emailNotifyConfig.style.display = 'none';
  serverChanSendKey.value = '';
  emailRecipient.value = '';
  emailjsPublicKey.value = '';
  emailjsServiceId.value = '';
  emailjsTemplateId.value = '';
  showServerChanSendKey.checked = false;
  showEmailjsPublicKey.checked = false;
  showEmailjsServiceId.checked = false;
  showEmailjsTemplateId.checked = false;
  serverChanSendKey.type = 'password';
  emailjsPublicKey.type = 'password';
  emailjsServiceId.type = 'password';
  emailjsTemplateId.type = 'password';
});

chrome.storage.local.get([
  'notifyWeChatEnabled',
  'serverChanSendKey',
  'notifyEmailEnabled',
  'emailRecipient',
  'emailjsPublicKey',
  'emailjsServiceId',
  'emailjsTemplateId'
], (result) => {
  if (result.notifyWeChatEnabled) {
    enableEmail.checked = true;
    emailConfig.style.display = 'block';
  }
  if (result.serverChanSendKey && serverChanSendKey) {
    serverChanSendKey.value = result.serverChanSendKey;
  }

  if (result.notifyEmailEnabled) {
    enableEmailNotify.checked = true;
    emailNotifyConfig.style.display = 'block';
  }
  if (result.emailRecipient && emailRecipient) emailRecipient.value = result.emailRecipient;
  if (result.emailjsPublicKey && emailjsPublicKey) emailjsPublicKey.value = result.emailjsPublicKey;
  if (result.emailjsServiceId && emailjsServiceId) emailjsServiceId.value = result.emailjsServiceId;
  if (result.emailjsTemplateId && emailjsTemplateId) emailjsTemplateId.value = result.emailjsTemplateId;
});

// 保存 SendKey
serverChanSendKey.addEventListener('blur', () => {
  chrome.storage.local.set({ 
    serverChanSendKey: serverChanSendKey.value.trim()
  });
});

emailRecipient.addEventListener('blur', () => {
  chrome.storage.local.set({ emailRecipient: emailRecipient.value.trim() });
});
emailjsPublicKey.addEventListener('blur', () => {
  chrome.storage.local.set({ emailjsPublicKey: emailjsPublicKey.value.trim() });
});
emailjsServiceId.addEventListener('blur', () => {
  chrome.storage.local.set({ emailjsServiceId: emailjsServiceId.value.trim() });
});
emailjsTemplateId.addEventListener('blur', () => {
  chrome.storage.local.set({ emailjsTemplateId: emailjsTemplateId.value.trim() });
});

// 加载当前状态
loadStatus();

// 加载实例列表
loadInstances();

// 刷新实例列表
refreshBtn.addEventListener('click', () => {
  loadInstances();
});

// 实例选择变化时显示详情
instanceSelect.addEventListener('change', async () => {
  const selectedInstance = instanceSelect.value;
  if (selectedInstance) {
    await showInstanceDetails(selectedInstance);
  } else {
    instanceInfo.style.display = 'none';
  }
});

// 加载实例列表
async function loadInstances() {
  try {
    instanceSelect.innerHTML = '<option value="">加载中...</option>';

    const tab = await getBestAutoDLInstanceListTab();
    if (!tab) {
      instanceSelect.innerHTML = '<option value="">请先打开 AutoDL 实例列表页面</option>';
      return;
    }

    const tabId = tab.id;
    console.log('使用 AutoDL 页面 Tab:', tabId, tab.url);
    
    // 直接执行内联代码获取实例列表（绕过 content.js 缓存）
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const rows = document.querySelectorAll('table.el-table__body tbody tr');
        const instances = [];
        for (let row of rows) {
          const nameElem = row.querySelector('td:nth-child(1)');
          if (!nameElem) continue;
          const fullText = nameElem.innerText.trim();
          const instanceName = fullText.split('\n')[0].trim();
          const statusElem = row.querySelector('td:nth-child(2)');
          const statusText = statusElem ? statusElem.innerText.trim() : "";
          const statusLines = statusText.split('\n').map(s => s.trim()).filter(s => s);
          const status = statusLines.join(' ');
          instances.push({ name: instanceName, status: status });
        }
        return instances;
      }
    });
    
    const instances = results[0]?.result || [];
    console.log('获取到实例:', instances);
    
    if (instances.length > 0) {
      instanceSelect.innerHTML = '<option value="">请选择实例</option>';
      
      instances.forEach(inst => {
        const option = document.createElement('option');
        option.value = inst.name;
        option.textContent = `${inst.name} (${inst.status})`;
        instanceSelect.appendChild(option);
      });
      
      console.log('成功加载', instances.length, '个实例');
    } else {
      console.log('未找到实例');
      instanceSelect.innerHTML = '<option value="">未找到实例</option>';
    }
  } catch (error) {
    console.error('加载实例列表失败:', error);
    const msg = (error && error.message) ? error.message : String(error);
    if (msg.includes('Cannot access') || msg.includes('tabs')) {
      instanceSelect.innerHTML = '<option value="">权限未生效：请在 chrome://extensions 里重新加载插件</option>';
    } else {
      instanceSelect.innerHTML = `<option value="">加载失败：${msg}</option>`;
    }
  }
}

// 显示实例详情
async function showInstanceDetails(instanceName) {
  try {
    const tab = await getBestAutoDLInstanceListTab();
    if (!tab) return;

    const tabId = tab.id;
    const response = await sendMessageToTab(tabId, { action: 'checkInstance', instanceName });
    if (response && response.success) {
      const data = response.data;
      instanceInfo.style.display = 'block';
      currentStatus.textContent = data.status;
      
      if (data.gpuInfo) {
        gpuStatus.textContent = `${data.gpuInfo.available}/${data.gpuInfo.total} 可用`;
        gpuStatus.style.color = data.gpuInfo.available > 0 ? '#4CAF50' : '#999';
      } else {
        gpuStatus.textContent = '获取中...';
      }
    }
  } catch (error) {
    console.error('获取实例详情失败:', error);
  }
}

// 开始监控
startBtn.addEventListener('click', () => {
  // 获取所有选中的实例
  const selectedOptions = Array.from(instanceSelect.selectedOptions);
  const instanceNames = selectedOptions.map(opt => opt.value).filter(v => v);
  const interval = parseInt(checkIntervalSelect.value);
  
  if (instanceNames.length === 0) {
    alert('请选择要监控的实例');
    return;
  }

  Promise.resolve()
    .then(persistNotifySettingsFromUI)
    .then(({ wechatEnabled, sendKey, emailEnabled, toEmail, pubKey, svcId, tplId }) => {
      chrome.runtime.sendMessage({
        action: 'startMonitoring',
        instanceNames: instanceNames,  // 改为数组
        interval: interval,
        notifyWeChatEnabled: wechatEnabled,
        serverChanSendKey: sendKey,
        notifyEmailEnabled: emailEnabled,
        emailRecipient: toEmail,
        emailjsPublicKey: pubKey,
        emailjsServiceId: svcId,
        emailjsTemplateId: tplId
      }, (response) => {
        if (response && response.success) {
          updateUI(true, instanceNames.join(', '), interval);
        }
      });
    })
    .catch((e) => {
      console.error('保存通知设置失败:', e);
      chrome.runtime.sendMessage({
        action: 'startMonitoring',
        instanceNames: instanceNames,
        interval: interval
      }, (response) => {
        if (response && response.success) {
          updateUI(true, instanceNames.join(', '), interval);
        }
      });
    });
});

// 停止监控
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    action: 'stopMonitoring'
  }, (response) => {
    if (response.success) {
      updateUI(false);
    }
  });
});

// 加载状态
function loadStatus() {
  chrome.runtime.sendMessage({
    action: 'getStatus'
  }, (response) => {
    if (response) {
      updateUI(response.enabled, response.instanceName, response.interval);
    }
  });
}

// 更新 UI
function updateUI(enabled, instanceName = '-', interval = 5) {
  if (enabled) {
    statusText.textContent = '监控中';
    statusText.className = 'status-value status-running';
    monitoringInstance.textContent = instanceName;
    intervalText.textContent = `${interval} 秒`;
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    instanceSelect.disabled = true;
    refreshBtn.disabled = true;
    checkIntervalSelect.disabled = true;
    enableEmail.disabled = true;
    serverChanSendKey.disabled = true;
    showServerChanSendKey.disabled = true;
    enableEmailNotify.disabled = true;
    emailRecipient.disabled = true;
    emailjsPublicKey.disabled = true;
    emailjsServiceId.disabled = true;
    emailjsTemplateId.disabled = true;
    showEmailjsPublicKey.disabled = true;
    showEmailjsServiceId.disabled = true;
    showEmailjsTemplateId.disabled = true;
    clearNotifySettingsBtn.disabled = true;
  } else {
    statusText.textContent = '未启动';
    statusText.className = 'status-value status-stopped';
    monitoringInstance.textContent = '-';
    intervalText.textContent = '-';
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    instanceSelect.disabled = false;
    refreshBtn.disabled = false;
    checkIntervalSelect.disabled = false;
    enableEmail.disabled = false;
    serverChanSendKey.disabled = false;
    showServerChanSendKey.disabled = false;
    enableEmailNotify.disabled = false;
    emailRecipient.disabled = false;
    emailjsPublicKey.disabled = false;
    emailjsServiceId.disabled = false;
    emailjsTemplateId.disabled = false;
    showEmailjsPublicKey.disabled = false;
    showEmailjsServiceId.disabled = false;
    showEmailjsTemplateId.disabled = false;
    clearNotifySettingsBtn.disabled = false;
  }
}
