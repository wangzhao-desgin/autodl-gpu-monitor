// AutoDL GPU 监控后台脚本

let monitoringEnabled = false;
let targetInstanceNames = ["西北B区 / 007机"];  // 改为数组
let checkInterval = 5; // 秒
let intervalId = null;

let checkInProgress = false;
const instanceOperationLocks = new Set();

const EXPECTED_CONTENT_SCRIPT_VERSION = '2026-01-19-8';

function isAutoDLInstanceListUrl(url) {
  return typeof url === 'string' && url.includes('https://www.autodl.com/console/instance/list');
}

async function sendEmailViaEmailJS(emailData) {
  const settings = await chrome.storage.local.get([
    'emailRecipient',
    'emailjsPublicKey',
    'emailjsServiceId',
    'emailjsTemplateId'
  ]);

  const toEmail = (settings.emailRecipient || '').trim();
  const publicKey = (settings.emailjsPublicKey || '').trim();
  const serviceId = (settings.emailjsServiceId || '').trim();
  const templateId = (settings.emailjsTemplateId || '').trim();

  if (!toEmail || !publicKey || !serviceId || !templateId) {
    console.error('❌ EmailJS 邮箱配置未完成');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: '邮箱通知失败',
      message: '未配置 EmailJS/收件邮箱'
    });
    return;
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: toEmail,
          subject: emailData.subject,
          message: emailData.body
        }
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('❌ EmailJS 请求失败:', response.status, text);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: '邮箱通知失败',
        message: `HTTP ${response.status}`
      });
      return;
    }

    console.log('✓ EmailJS 邮箱通知发送成功');
  } catch (e) {
    console.error('❌ EmailJS 邮箱通知发送失败:', e);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: '邮箱通知失败',
      message: e?.message || String(e)
    });
  }
}

async function getBestAutoDLInstanceListTab() {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTabs.length > 0 && isAutoDLInstanceListUrl(activeTabs[0].url)) {
    return activeTabs[0];
  }

  const tabs = await chrome.tabs.query({ url: 'https://www.autodl.com/console/instance/list*' });
  if (!tabs || tabs.length === 0) return null;

  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function sendMessageToTab(tabId, message, ensureInjected = true) {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });
    return response;
  } catch (err) {
    if (!ensureInjected) {
      throw err;
    }
    await ensureContentScript(tabId);
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });
    return response;
  }
}

async function ensureContentScript(tabId) {
  // 先尝试 ping，如果成功说明已注入
  try {
    const ping = await sendMessageToTab(tabId, { action: 'ping' }, false);
    if (ping && ping.ok && ping.version === EXPECTED_CONTENT_SCRIPT_VERSION) {
      return; // 已注入且版本一致
    }
    // 已注入但版本不一致，继续执行注入
  } catch (e) {
    // content script 未注入，继续执行注入
  }

  // 执行注入
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  // 等待 content script 初始化
  await new Promise(resolve => setTimeout(resolve, 300));

  // 验证注入成功（用 try-catch 包裹，失败也不阻塞）
  try {
    await sendMessageToTab(tabId, { action: 'ping' }, false);
  } catch (e) {
    console.log('注入后 ping 失败，但继续执行:', e.message);
  }
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startMonitoring") {
    monitoringEnabled = true;
    // 支持单个或多个实例
    targetInstanceNames = request.instanceNames || (request.instanceName ? [request.instanceName] : []);
    checkInterval = request.interval || 5;

    if (typeof request.serverChanSendKey === 'string') {
      chrome.storage.local.set({
        serverChanSendKey: request.serverChanSendKey.trim()
      });
    }

    if (typeof request.notifyWeChatEnabled === 'boolean') {
      chrome.storage.local.set({
        notifyWeChatEnabled: request.notifyWeChatEnabled
      });
    }

    if (typeof request.notifyEmailEnabled === 'boolean') {
      chrome.storage.local.set({
        notifyEmailEnabled: request.notifyEmailEnabled
      });
    }
    if (typeof request.emailRecipient === 'string') {
      chrome.storage.local.set({
        emailRecipient: request.emailRecipient.trim()
      });
    }
    if (typeof request.emailjsPublicKey === 'string') {
      chrome.storage.local.set({
        emailjsPublicKey: request.emailjsPublicKey.trim()
      });
    }
    if (typeof request.emailjsServiceId === 'string') {
      chrome.storage.local.set({
        emailjsServiceId: request.emailjsServiceId.trim()
      });
    }
    if (typeof request.emailjsTemplateId === 'string') {
      chrome.storage.local.set({
        emailjsTemplateId: request.emailjsTemplateId.trim()
      });
    }
    
    // 清除旧的定时器
    if (intervalId) {
      clearInterval(intervalId);
    }
    
    // 立即执行一次检查
    checkGPUStatus();
    
    // 创建新的定时器（使用 setInterval 支持秒级间隔）
    intervalId = setInterval(() => {
      if (monitoringEnabled) {
        checkGPUStatus();
      }
    }, checkInterval * 1000);
    
    console.log(`监控已启动: ${targetInstanceNames.join(', ')}, 间隔: ${checkInterval}秒`);
    sendResponse({ success: true, message: "监控已启动" });
  } else if (request.action === "stopMonitoring") {
    monitoringEnabled = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log("监控已停止");
    sendResponse({ success: true, message: "监控已停止" });
  } else if (request.action === "getStatus") {
    sendResponse({ 
      enabled: monitoringEnabled, 
      instanceName: targetInstanceNames.join(', '),
      instanceNames: targetInstanceNames,
      interval: checkInterval
    });
  } else if (request.action === "injectContentScript") {
    const tabId = request.tabId;
    ensureContentScript(tabId)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
  }
  return true;
});

// 检查 GPU 状态
async function checkGPUStatus() {
  if (checkInProgress) {
    return;
  }
  checkInProgress = true;
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 开始检查 GPU 状态...`);
    console.log(`监控实例: ${targetInstanceNames.join(', ')}`);

    const tab = await getBestAutoDLInstanceListTab();
    if (!tab) {
      console.log("❌ 未找到 AutoDL 实例列表页面");
      return;
    }

    console.log(`✓ 使用页面，Tab ID: ${tab.id}`);

    // 遍历检查每个实例
    for (const instanceName of targetInstanceNames) {
      console.log(`检查实例: ${instanceName}`);
      
      const response = await sendMessageToTab(tab.id, {
        action: "checkInstance",
        instanceName: instanceName
      });

      console.log("收到响应:", response);
      
      if (response && response.success) {
        // 如果某个实例可以开机，处理它
        const handled = await handleInstanceStatus(response.data, tab.id);
        if (handled) {
          // 成功开机一个实例后，从监控列表中移除
          targetInstanceNames = targetInstanceNames.filter(n => n !== instanceName);
          console.log(`✓ ${instanceName} 已开机，从监控列表移除`);
          
          // 如果所有实例都处理完了，停止监控
          if (targetInstanceNames.length === 0) {
            monitoringEnabled = false;
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            console.log("✓ 所有实例都已开机，监控已停止");
          }
          break; // 一次只处理一个
        }
      } else {
        console.error(`❌ 检查 ${instanceName} 失败:`, response?.error);
      }
    }
  } catch (error) {
    console.error("❌ 检查 GPU 状态时出错:", error);
  } finally {
    checkInProgress = false;
  }
}

async function waitForInstanceCondition(tabId, instanceName, predicate, timeoutMs = 60000, intervalMs = 3000) {
  const end = Date.now() + timeoutMs;
  let lastData = null;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = await sendMessageToTab(tabId, { action: 'checkInstance', instanceName });
    if (res && res.success && res.data) {
      lastData = res.data;
      if (predicate(res.data)) {
        return { ok: true, data: res.data };
      }
    }
  }
  return { ok: false, lastData };
}

// 处理实例状态，返回是否成功开机
async function handleInstanceStatus(data, tabId) {
  console.log("实例状态:", data);
  
  const { status, gpuAvailable, isNoCardRunning, isShutdown } = data;
  const instanceName = data.instanceName;

  if (instanceOperationLocks.has(instanceName)) {
    return false;
  }
  
  // 情况 1: 无卡模式运行中 + GPU 可用 → 关机重启
  if (isNoCardRunning && gpuAvailable) {
    instanceOperationLocks.add(instanceName);
    console.log("检测到：无卡模式运行 且 GPU 可用！执行关机重启...");
    
    // 发送通知
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "AutoDL GPU 监控",
      message: `检测到 ${instanceName} 有 GPU 可用！正在执行关机重启...`
    });
    
    // 执行关机
    try {
      const shutdownResponse = await sendMessageToTab(tabId, {
        action: "shutdownInstance",
        instanceName: instanceName
      });

      if (shutdownResponse && shutdownResponse.success) {
        let shutdownWait = await waitForInstanceCondition(tabId, instanceName, (d) => d.isShutdown, 120000, 3000);
        if (!shutdownWait.ok) {
          console.error('❌ 关机后等待已关机超时:', instanceName, 'lastStatus=', shutdownWait.lastData?.status);
          console.log('尝试重新点击关机一次:', instanceName);
          const retryShutdown = await sendMessageToTab(tabId, { action: 'shutdownInstance', instanceName });
          if (!retryShutdown || !retryShutdown.success) {
            console.error('❌ 重试点击关机失败:', instanceName, retryShutdown);
            return false;
          }
          shutdownWait = await waitForInstanceCondition(tabId, instanceName, (d) => d.isShutdown, 120000, 3000);
          if (!shutdownWait.ok) {
            console.error('❌ 重试后仍未关机:', instanceName, 'lastStatus=', shutdownWait.lastData?.status);
            return false;
          }
        }

        if (!shutdownWait.data.gpuAvailable) {
          console.log('⚠️ 关机后 GPU 可用性未知/为 false，仍尝试开机:', instanceName);
        }

        const startClick = await sendMessageToTab(tabId, {
          action: 'startInstance',
          instanceName: instanceName
        });

        if (!startClick || !startClick.success) {
          console.error('❌ 点击开机失败:', instanceName, startClick);
          return false;
        }

        const startWait = await waitForInstanceCondition(
          tabId,
          instanceName,
          (d) => !d.isShutdown && !d.isNoCardRunning,
          60000,
          3000
        );

        if (!startWait.ok) {
          console.error('❌ 开机后等待运行状态超时:', instanceName);
          return false;
        }

        chrome.notifications.create({
          type: 'basic',
          title: 'AutoDL GPU 抢机成功！',
          message: `${instanceName} 已成功开机（带 GPU）`
        });
        sendEmailNotification(startWait.data);
        return true;
      }

      console.error('❌ 点击关机失败:', instanceName, shutdownResponse);
      return false;
    } finally {
      instanceOperationLocks.delete(instanceName);
    }
  }
  // 情况 2: 已关机 + GPU 可用 → 直接开机
  else if (isShutdown && gpuAvailable) {
    instanceOperationLocks.add(instanceName);
    console.log("检测到：已关机 且 GPU 可用！执行开机...");
    
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "AutoDL GPU 监控",
      message: `检测到 ${instanceName} 有 GPU 可用！正在开机...`
    });

    try {
      const response = await sendMessageToTab(tabId, {
        action: "startInstance",
        instanceName: instanceName
      });

      if (response && response.success) {
        const startWait = await waitForInstanceCondition(
          tabId,
          instanceName,
          (d) => !d.isShutdown && !d.isNoCardRunning,
          60000,
          3000
        );

        if (startWait.ok) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon128.png",
            title: "AutoDL GPU 抢机成功！",
            message: `${instanceName} 已成功开机`
          });
          sendEmailNotification(startWait.data);
          return true;
        }
      }
      return false;
    } finally {
      instanceOperationLocks.delete(instanceName);
    }
  }
  // 情况 3 & 4: 继续等待
  else {
    const gpuText = data.gpuInfo ? `${data.gpuInfo.available}/${data.gpuInfo.total}` : '未知';
    console.log(`${instanceName} 继续等待... GPU 状态: ${gpuText}`);
    return false;
  }
}

// 发送邮件通知
async function sendEmailNotification(instanceData) {
  try {
    const settings = await chrome.storage.local.get([
      'notifyWeChatEnabled',
      'serverChanSendKey',
      'notifyEmailEnabled',
      'emailRecipient',
      'emailjsPublicKey',
      'emailjsServiceId',
      'emailjsTemplateId'
    ]);

    const wechatEnabled = !!settings.notifyWeChatEnabled;
    const emailEnabled = !!settings.notifyEmailEnabled;

    if (!wechatEnabled && !emailEnabled) {
      console.log('通知未启用（notifyWeChatEnabled/notifyEmailEnabled=false）');
      return;
    }
    
    const emailData = {
      to: '',
      subject: '🎉 AutoDL GPU 抢机成功通知',
      body: `
您好！

AutoDL GPU 自动抢机成功！

实例信息：
- 实例名称：${instanceData.instanceName}
- 规格配置：${instanceData.spec}
- GPU 状态：${instanceData.gpuInfo?.available}/${instanceData.gpuInfo?.total} 可用
- 开机时间：${new Date().toLocaleString('zh-CN')}

请及时登录 AutoDL 控制台查看：
https://www.autodl.com/console/instance/list

---
此邮件由 AutoDL GPU 监控插件自动发送
      `.trim()
    };
    
    if (wechatEnabled) {
      console.log("准备发送微信通知（Server酱）");
      await sendEmailViaAPI(emailData);
    }

    if (emailEnabled) {
      await sendEmailViaEmailJS(emailData);
    }
    
  } catch (error) {
    console.error("发送邮件通知失败:", error);
  }
}

// 通过 API 发送邮件（使用免费邮件服务）
async function sendEmailViaAPI(emailData) {
  const settings = await chrome.storage.local.get(['serverChanSendKey']);
  const sendKey = (settings.serverChanSendKey || '').trim();
  if (!sendKey) {
    console.error('❌ Server酱 SendKey 未配置');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Server酱通知失败',
      message: '未配置 SendKey'
    });
    return;
  }
  const url = `https://sctapi.ftqq.com/${sendKey}.send`;
  
  try {
    const body = new URLSearchParams({
      title: emailData.subject,
      desp: emailData.body.replace(/\n/g, '\n\n')
    }).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('❌ Server酱请求失败:', response.status, text);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Server酱通知失败',
        message: `HTTP ${response.status}`
      });
      return;
    }

    const result = await response.json();

    if (result.code === 0) {
      console.log('✓ Server酱通知发送成功，请查看微信');
    } else {
      console.error('❌ Server酱通知发送失败:', result);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Server酱通知失败',
        message: result.message || '未知错误'
      });
    }
  } catch (error) {
    console.error("❌ Server酱通知发送失败:", error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Server酱通知失败',
      message: error?.message || String(error)
    });
  }
}
