// AutoDL 页面内容脚本

console.log("✓ AutoDL Content Script 已加载");

window.__AUTODL_MONITOR_VERSION = '2026-01-19-8';

// 监听来自 background 的消息
if (!window.__AUTODL_GPU_MONITOR_LISTENER_ADDED) {
  window.__AUTODL_GPU_MONITOR_LISTENER_ADDED = true;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("收到消息:", request);
    
    if (request.action === "ping") {
      sendResponse({ ok: true, version: window.__AUTODL_MONITOR_VERSION });
      return false;
    }
    
    if (request.action === "getInstanceList") {
      getInstanceList().then(sendResponse);
      return true;
    } else if (request.action === "checkInstance") {
      checkInstanceStatus(request.instanceName).then(sendResponse);
      return true;
    } else if (request.action === "shutdownInstance") {
      shutdownInstance(request.instanceName).then(sendResponse);
      return true;
    } else if (request.action === "startInstance") {
      startInstance(request.instanceName).then(sendResponse);
      return true;
    }
  });
}

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return !!rect && rect.width > 0 && rect.height > 0;
}

function safeClick(el) {
  if (!el) return false;
  try {
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    }
    if (typeof el.focus === 'function') {
      el.focus();
    }
  } catch (e) {
    // ignore
  }

  try {
    if (typeof el.click === 'function') {
      el.click();
    }
  } catch (e) {
    // ignore
  }

  try {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    return true;
  } catch (e) {
    return false;
  }
}

function closeNotificationsIfPresent() {
  const closeBtns = Array.from(document.querySelectorAll(
    '.el-notification__closeBtn, .el-message__closeBtn, .el-notification .el-icon-close, .el-message .el-icon-close'
  )).filter(isElementVisible);
  if (closeBtns.length === 0) return false;
  closeBtns[closeBtns.length - 1].click();
  return true;
}

function closeTimedShutdownIfPresent() {
  const wrappers = Array.from(document.querySelectorAll('.el-dialog__wrapper, .el-message-box__wrapper'))
    .filter(isElementVisible);
  for (const w of wrappers) {
    const text = (w.innerText || '').trim();
    if (!text.includes('定时关机')) continue;

    const cancelBtn = Array.from(w.querySelectorAll('button')).find(b => {
      const t = (b.innerText || '').trim();
      return (t.includes('取消') || t.includes('关闭')) && !b.disabled;
    });
    if (cancelBtn) {
      cancelBtn.click();
      return true;
    }

    const closeBtn = w.querySelector('.el-dialog__headerbtn, .el-message-box__headerbtn');
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
  }
  return false;
}

function clickConfirmOnce() {
  if (closeTimedShutdownIfPresent()) return true;
  if (closeNotificationsIfPresent()) return true;

  const okTexts = ['确定', '确认', '我知道了', '知道了', '好的', 'OK', 'Ok', 'ok', '是'];

  const modalRoots = Array.from(document.querySelectorAll(
    '.el-message-box__wrapper, .el-dialog__wrapper, .el-popconfirm, .el-overlay, .el-overlay-dialog, .el-message-box, .el-dialog'
  )).filter(isElementVisible);

  const searchRoots = modalRoots.length > 0 ? [modalRoots[modalRoots.length - 1]] : [document.body];
  for (const root of searchRoots) {
    const allButtons = Array.from(root.querySelectorAll('button, [role="button"], .el-button'))
      .filter(isElementVisible)
      .filter(b => !b.disabled);

    const okButtons = allButtons.filter(b => {
      const t = (b.innerText || '').trim();
      if (!t) return false;
      if (t.includes('取消') || t.includes('关闭')) return false;
      if (isUnsafeText(t)) return false;
      return okTexts.some(x => t === x || t.includes(x));
    });

    const primaryOk = okButtons.find(b => (b.className || '').includes('el-button--primary'));
    if (primaryOk) {
      safeClick(primaryOk);
      return true;
    }

    if (okButtons.length > 0) {
      safeClick(okButtons[okButtons.length - 1]);
      return true;
    }
  }
  return false;
}

async function autoHandlePrompts() {
  if (closeTimedShutdownIfPresent()) return;
  if (closeNotificationsIfPresent()) return;

  const modals = Array.from(document.querySelectorAll(
    '.el-message-box__wrapper, .el-message-box, .el-dialog__wrapper, .el-dialog, .el-popconfirm, .el-overlay, .el-overlay-dialog'
  )).filter(isElementVisible);
  const visibleText = modals.map(w => (w.innerText || '').trim()).join('\n');
  if (!visibleText) return;
  if (isUnsafeText(visibleText)) return;

  if (visibleText.includes('无卡') || visibleText.includes('GPU') || visibleText.includes('开机')) {
    await selectGpuModeIfPresent();
  }

  clickConfirmOnce();
}

function scheduleAutoHandlePrompts() {
  if (window.__AUTODL_AUTO_HANDLE_TIMER) return;
  window.__AUTODL_AUTO_HANDLE_TIMER = setTimeout(async () => {
    window.__AUTODL_AUTO_HANDLE_TIMER = null;
    try {
      if (typeof window.__AUTODL_AUTO_HANDLE_PROMPTS === 'function') {
        await window.__AUTODL_AUTO_HANDLE_PROMPTS();
      }
    } catch (e) {
      // ignore
    }
  }, 100);
}

window.__AUTODL_AUTO_HANDLE_PROMPTS = autoHandlePrompts;
window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS = scheduleAutoHandlePrompts;

function setupAutoHandler() {
  if (window.__AUTODL_GPU_MONITOR_OBSERVER) {
    try { window.__AUTODL_GPU_MONITOR_OBSERVER.disconnect(); } catch (e) {}
  }
  if (window.__AUTODL_GPU_MONITOR_INTERVAL_ID) {
    try { clearInterval(window.__AUTODL_GPU_MONITOR_INTERVAL_ID); } catch (e) {}
  }

  window.__AUTODL_GPU_MONITOR_OBSERVER = new MutationObserver(() => {
    if (typeof window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS === 'function') {
      window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS();
    }
  });
  window.__AUTODL_GPU_MONITOR_OBSERVER.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-hidden']
  });

  window.__AUTODL_GPU_MONITOR_INTERVAL_ID = setInterval(() => {
    if (typeof window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS === 'function') {
      window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS();
    }
  }, 500);

  window.__AUTODL_GPU_MONITOR_AUTO_HANDLER_VERSION = window.__AUTODL_MONITOR_VERSION;
  window.__AUTODL_SCHEDULE_AUTO_HANDLE_PROMPTS();
}

if (window.__AUTODL_GPU_MONITOR_AUTO_HANDLER_VERSION !== window.__AUTODL_MONITOR_VERSION) {
  setupAutoHandler();
}

async function clickPrimaryConfirmIfPresent() {
  // 某些操作弹窗出现较慢（接口返回后才渲染），这里等待更久一点
  for (let i = 0; i < 50; i++) {
    if (closeTimedShutdownIfPresent()) {
      return true;
    }
    if (closeNotificationsIfPresent()) {
      return true;
    }
    if (clickConfirmOnce()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function isUnsafeText(text) {
  const t = (text || '').trim();
  return t.includes('释放') || t.includes('删除') || t.includes('销毁') || t.includes('移除');
}

function normalizeText(text) {
  return (text || '').trim();
}

function matchActionText(text, actionText) {
  const t = normalizeText(text);
  const a = normalizeText(actionText);
  if (!t || !a) return false;
  if (a === '关机') {
    if (t.includes('定时')) return false;
    return t === '关机' || t === '立即关机' || t === '一键关机';
  }
  if (a === '开机') {
    return t === '开机' || t === '立即开机' || t.includes('开机');
  }
  return t === a || t.includes(a);
}

async function selectGpuModeIfPresent() {
  const prefer = ['正常', '标准', '有卡', 'GPU', '带GPU', '使用GPU', '开启GPU', '默认'];
  const avoid = ['无卡'];

  for (let i = 0; i < 15; i++) {
    const dialog = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog');
    const msgbox = document.querySelector('.el-message-box__wrapper:not([style*="display: none"]) .el-message-box');
    const container = dialog || msgbox;

    if (container) {
      const candidates = Array.from(container.querySelectorAll('label, .el-radio, .el-radio__label, .el-checkbox, .el-checkbox__label, span, div'));
      const hit = candidates.find(el => {
        const txt = (el.innerText || '').trim();
        if (!txt) return false;
        if (avoid.some(k => txt.includes(k))) return false;
        return prefer.some(k => txt.includes(k));
      });

      if (hit) {
        // try click the closest actionable element
        const clickable = hit.closest('label') || hit.closest('.el-radio') || hit.closest('.el-checkbox') || hit;
        clickable.click();
        await new Promise(r => setTimeout(r, 200));
        return true;
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function clickActionInRow(row, actionText, beforeConfirm) {
  const directButtons = Array.from(row.querySelectorAll('button')).filter(btn => btn && !btn.disabled);
  const directExact = directButtons.find(btn => normalizeText(btn.innerText) === normalizeText(actionText));
  const direct = directExact || directButtons.find(btn => matchActionText(btn.innerText, actionText));
  if (direct) {
    direct.click();
    if (beforeConfirm) {
      await beforeConfirm();
    }
    await clickPrimaryConfirmIfPresent();
    return { success: true, message: `已点击${actionText}按钮` };
  }

  const moreBtn = Array.from(row.querySelectorAll('button')).find(btn => (btn.innerText || '').includes('更多'));
  if (moreBtn && !moreBtn.disabled) {
    moreBtn.click();
    await new Promise(r => setTimeout(r, 200));

    const items = Array.from(document.querySelectorAll('.el-dropdown-menu__item'))
      .filter(el => el && el.offsetParent !== null)
      .filter(el => !isUnsafeText(el.innerText || ''));
    const exactItem = items.find(el => normalizeText(el.innerText) === normalizeText(actionText));
    const item = exactItem || items.find(el => matchActionText(el.innerText, actionText));
    if (item) {
      item.click();
      if (beforeConfirm) {
        await beforeConfirm();
      }
      await clickPrimaryConfirmIfPresent();
      return { success: true, message: `已通过更多菜单点击${actionText}` };
    }
  }

  const btnTexts = Array.from(row.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(Boolean);
  return { success: false, error: `${actionText}按钮不可用或未找到`, debug: { buttons: btnTexts } };
}

// 获取所有实例列表
async function getInstanceList() {
  try {
    const rows = document.querySelectorAll('table.el-table__body tbody tr');
    const instances = [];
    
    for (let row of rows) {
      const nameElem = row.querySelector('td:nth-child(1)');
      if (!nameElem) continue;
      
      // 只获取第一行作为实例名称（去除 ID 和标签）
      const fullText = nameElem.innerText.trim();
      const instanceName = fullText.split('\n')[0].trim();
      
      const statusElem = row.querySelector('td:nth-child(2)');
      const statusText = statusElem ? statusElem.innerText.trim() : "";
      // 保留完整状态信息（包括无卡模式）
      const statusLines = statusText.split('\n').map(s => s.trim()).filter(s => s);
      const status = statusLines.join(' ');
      
      const specElem = row.querySelector('td:nth-child(3)');
      const specText = specElem ? specElem.innerText.trim() : "";
      // 只获取第一行作为规格
      const spec = specText.split('\n')[0].trim();
      
      instances.push({
        name: instanceName,
        status: status,
        spec: spec
      });
    }
    
    console.log(`获取到 ${instances.length} 个实例`);
    return { success: true, instances };
  } catch (error) {
    console.error("获取实例列表失败:", error);
    return { success: false, error: error.message, instances: [] };
  }
}

// 检查实例状态
async function checkInstanceStatus(targetInstanceName) {
  try {
    console.log(`检查实例: ${targetInstanceName}`);
    const rows = document.querySelectorAll('table.el-table__body tbody tr');
    console.log(`找到 ${rows.length} 行实例`);
    
    for (let row of rows) {
      const nameElem = row.querySelector('td:nth-child(1)');
      if (!nameElem) continue;
      
      // 只获取第一行作为实例名称
      const fullText = nameElem.innerText.trim();
      const instanceName = fullText.split('\n')[0].trim();
      console.log(`检查实例名称: ${instanceName}`);
      
      if (!instanceName.includes(targetInstanceName)) continue;
      
      console.log(`✓ 找到目标实例: ${instanceName}`);
      
      // 获取状态
      const statusElem = row.querySelector('td:nth-child(2)');
      const status = statusElem ? statusElem.innerText.trim() : "";
      console.log(`状态: ${status}`);
      
      // 获取规格
      const specElem = row.querySelector('td:nth-child(3)');
      const spec = specElem ? specElem.innerText.trim() : "";
      console.log(`规格: ${spec}`);
      
      // 获取 GPU 信息
      console.log("正在获取 GPU 信息...");
      const gpuInfo = await getGPUInfo(row);
      console.log("GPU 信息:", gpuInfo);
      
      // 判断状态
      const isNoCardRunning = status.includes('运行中') && status.includes('无卡模式');
      const isShutdown = status.includes('已关机');
      const rowText = row.innerText || '';
      const gpuAvailable = status.includes('GPU充足') || rowText.includes('GPU充足') || (gpuInfo && gpuInfo.available > 0);
      
      console.log(`无卡模式运行: ${isNoCardRunning}, 已关机: ${isShutdown}, GPU可用: ${gpuAvailable}`);
      
      // 查找按钮
      const allButtons = row.querySelectorAll('button');
      console.log(`找到 ${allButtons.length} 个按钮`);
      
      const startButton = Array.from(allButtons).find(btn => btn.innerText.includes('开机'));
      const shutdownButton = Array.from(allButtons).find(btn => btn.innerText.includes('关机'));
      
      console.log(`开机按钮: ${!!startButton}, 关机按钮: ${!!shutdownButton}`);
      
      return {
        success: true,
        data: {
          instanceName,
          status,
          spec,
          gpuInfo,
          isNoCardRunning,
          isShutdown,
          gpuAvailable,
          hasStartButton: !!startButton,
          hasShutdownButton: !!shutdownButton,
          row: null // 不能序列化 DOM 元素
        }
      };
    }
    
    console.log("❌ 未找到目标实例");
    return { success: false, error: "未找到目标实例" };
  } catch (error) {
    console.error("❌ 检查实例状态出错:", error);
    return { success: false, error: error.message };
  }
}

// 获取 GPU 信息（通过悬停）
async function getGPUInfo(row) {
  try {
    const candidates = [];
    const regionElem = row.querySelector('.region');
    if (regionElem) {
      candidates.push(regionElem);
    }

    const described = Array.from(row.querySelectorAll('[aria-describedby]'));
    for (const el of described) {
      if (!candidates.includes(el)) {
        candidates.push(el);
      }
    }

    // fallback: instance name link / first cell often has the tooltip
    const nameLink = row.querySelector('td:nth-child(1) a');
    if (nameLink && !candidates.includes(nameLink)) {
      candidates.push(nameLink);
    }
    const firstCell = row.querySelector('td:nth-child(1)');
    if (firstCell && !candidates.includes(firstCell)) {
      candidates.push(firstCell);
    }

    if (candidates.length === 0) {
      return null;
    }

    const pattern = /GPU\s*空闲\s*\/\s*总量\s*[：:]?\s*(\d+)\s*\/\s*(\d+)/;

    const readVisibleGpuPopper = () => {
      const poppers = Array.from(document.querySelectorAll('.el-tooltip__popper, .el-popover, [role="tooltip"]'))
        .filter(el => el && el.offsetParent !== null);
      for (const p of poppers) {
        const text = (p.innerText || '').trim();
        const m = text.match(pattern);
        if (m) {
          return { available: parseInt(m[1]), total: parseInt(m[2]) };
        }
      }
      return null;
    };

    for (const el of candidates) {
      const popperId = el.getAttribute('aria-describedby');

      // 先尝试触发悬停（无 aria-describedby 也可以，通过全局 popper 兜底）
      const enter = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window });
      const over = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(over);
      el.dispatchEvent(enter);

      await new Promise(r => setTimeout(r, 400));

      // 兜底：直接从可见 tooltip/popover 文本中解析
      const visible = readVisibleGpuPopper();
      if (visible) {
        return visible;
      }

      if (!popperId) {
        continue;
      }

      try {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        }
      } catch (e) {
        // ignore
      }

      const popper = document.getElementById(popperId);
      if (!popper) {
        continue;
      }

      const popperText = popper.innerText || '';
      const match = popperText.match(pattern);
      if (match) {
        return {
          available: parseInt(match[1]),
          total: parseInt(match[2])
        };
      }
    }

    return null;
  } catch (error) {
    console.error("获取 GPU 信息失败:", error);
    return null;
  }
}

// 关机实例
async function shutdownInstance(targetInstanceName) {
  try {
    const rows = document.querySelectorAll('table.el-table__body tbody tr');
    
    for (let row of rows) {
      const nameElem = row.querySelector('td:nth-child(1)');
      if (!nameElem) continue;
      
      const fullText = nameElem.innerText.trim();
      const instanceName = fullText.split('\n')[0].trim();
      if (!instanceName.includes(targetInstanceName)) continue;

      return await clickActionInRow(row, '关机');
    }
    
    return { success: false, error: "未找到目标实例" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 开机实例
async function startInstance(targetInstanceName) {
  try {
    const rows = document.querySelectorAll('table.el-table__body tbody tr');
    
    for (let row of rows) {
      const nameElem = row.querySelector('td:nth-child(1)');
      if (!nameElem) continue;
      
      const fullText = nameElem.innerText.trim();
      const instanceName = fullText.split('\n')[0].trim();
      if (!instanceName.includes(targetInstanceName)) continue;

      return await clickActionInRow(row, '开机', selectGpuModeIfPresent);
    }
    
    return { success: false, error: "未找到目标实例" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
