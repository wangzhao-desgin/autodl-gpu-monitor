# 📧 邮件通知配置说明

开机成功后可以通过邮件通知你。有多种配置方案可选。

## 🚀 快速配置（推荐方案）

### 方案 1：Server酱（微信通知，最简单）

**优点**：
- ✅ 完全免费
- ✅ 配置超简单（1 分钟）
- ✅ 微信接收通知
- ✅ 国内访问快

**步骤**：

1. **获取 SendKey**
   - 访问：https://sct.ftqq.com/
   - 使用微信扫码登录
   - 复制你的 SendKey

2. **修改代码**

在 `background.js` 的 `sendEmailViaAPI` 函数中添加：

```javascript
async function sendEmailViaAPI(emailData) {
  // 使用 Server酱发送微信通知
  const SENDKEY = 'YOUR_SENDKEY_HERE'; // 替换为你的 SendKey
  
  const url = `https://sctapi.ftqq.com/${SENDKEY}.send`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: emailData.subject,
        desp: emailData.body
      })
    });
    
    const result = await response.json();
    console.log("Server酱通知发送成功:", result);
  } catch (error) {
    console.error("Server酱通知发送失败:", error);
  }
}
```

3. **完成！**
   - 开机成功后会收到微信通知

---

### 方案 2：EmailJS（真实邮件）

**优点**：
- ✅ 发送真实邮件
- ✅ 免费额度（每月 200 封）
- ✅ 无需后端

**步骤**：

1. **注册 EmailJS**
   - 访问：https://www.emailjs.com/
   - 注册账号（免费）

2. **配置邮件服务**
   - 添加邮件服务（Gmail/Outlook 等）
   - 创建邮件模板
   - 获取以下信息：
     - Service ID
     - Template ID
     - Public Key

3. **修改代码**

在 `manifest.json` 中添加 EmailJS CDN：

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://cdn.jsdelivr.net; object-src 'self'"
}
```

在 `background.js` 中：

```javascript
// 加载 EmailJS（在文件开头）
importScripts('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');

async function sendEmailViaAPI(emailData) {
  const SERVICE_ID = 'YOUR_SERVICE_ID';
  const TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
  const PUBLIC_KEY = 'YOUR_PUBLIC_KEY';
  
  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      to_email: emailData.to,
      subject: emailData.subject,
      message: emailData.body
    }, PUBLIC_KEY);
    
    console.log("邮件发送成功");
  } catch (error) {
    console.error("邮件发送失败:", error);
  }
}
```

---

### 方案 3：钉钉机器人

**优点**：
- ✅ 完全免费
- ✅ 钉钉接收通知
- ✅ 支持群聊

**步骤**：

1. **创建钉钉机器人**
   - 打开钉钉群聊
   - 群设置 → 智能群助手 → 添加机器人
   - 选择"自定义"机器人
   - 复制 Webhook 地址

2. **修改代码**

```javascript
async function sendEmailViaAPI(emailData) {
  const WEBHOOK_URL = 'YOUR_DINGTALK_WEBHOOK_URL';
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype: 'text',
        text: {
          content: `${emailData.subject}\n\n${emailData.body}`
        }
      })
    });
    
    console.log("钉钉通知发送成功");
  } catch (error) {
    console.error("钉钉通知发送失败:", error);
  }
}
```

---

### 方案 4：Bark（iOS 推送）

**优点**：
- ✅ iOS 原生推送
- ✅ 完全免费
- ✅ 配置简单

**步骤**：

1. **安装 Bark App**
   - App Store 搜索"Bark"
   - 安装并打开
   - 复制你的推送 URL

2. **修改代码**

```javascript
async function sendEmailViaAPI(emailData) {
  const BARK_URL = 'YOUR_BARK_URL'; // 例如：https://api.day.app/YOUR_KEY
  
  try {
    const url = `${BARK_URL}/${encodeURIComponent(emailData.subject)}/${encodeURIComponent(emailData.body)}`;
    await fetch(url);
    console.log("Bark 推送发送成功");
  } catch (error) {
    console.error("Bark 推送发送失败:", error);
  }
}
```

---

## 📝 使用说明

配置完成后：

1. 打开插件弹窗
2. 勾选"开机成功后发送邮件通知"
3. 输入接收邮箱（如果使用邮件方案）
4. 开始监控

开机成功后会自动发送通知！

## 🔧 测试通知

修改代码后，可以手动测试：

```javascript
// 在浏览器控制台执行
sendEmailNotification({
  instanceName: '测试实例',
  spec: 'RTX 4090 * 1',
  gpuInfo: { available: 1, total: 5 }
});
```

## ⚠️ 注意事项

1. **API Key 安全**：不要将 API Key 提交到公开仓库
2. **免费额度**：注意各服务的免费额度限制
3. **网络访问**：确保插件有网络访问权限

## 💡 推荐

- **国内用户**：推荐 Server酱（微信通知）
- **需要邮件**：推荐 EmailJS
- **iOS 用户**：推荐 Bark
- **企业用户**：推荐钉钉/企业微信机器人
