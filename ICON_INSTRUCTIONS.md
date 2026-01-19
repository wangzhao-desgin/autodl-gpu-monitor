# 图标创建说明

Chrome 插件需要三个尺寸的图标文件：

- `icon16.png` (16x16 像素)
- `icon48.png` (48x48 像素)
- `icon128.png` (128x128 像素)

## 快速解决方案

### 方案 1：使用在线工具生成

访问以下网站生成图标：
- https://www.favicon-generator.org/
- https://realfavicongenerator.net/

上传任意图片，生成不同尺寸的图标，重命名为对应文件名。

### 方案 2：使用 Emoji 作为图标

在 macOS 上：
1. 打开"预览"应用
2. 文件 → 新建 → 从剪贴板新建
3. 复制这个 emoji：🎯 或 💻 或 ⚡
4. 调整大小并导出为 PNG

### 方案 3：使用纯色占位符

临时使用纯色方块作为图标：
1. 打开任意图片编辑软件
2. 创建绿色方块（#4CAF50）
3. 导出为三个不同尺寸的 PNG

### 方案 4：使用命令行生成（macOS）

```bash
# 需要安装 ImageMagick
brew install imagemagick

# 生成图标
convert -size 128x128 xc:#4CAF50 -pointsize 60 -fill white -gravity center -annotate +0+0 "GPU" icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## 当前状态

插件的所有功能代码已完成，只缺少图标文件。你可以：

1. **暂时跳过图标**：在 manifest.json 中注释掉 icons 相关配置
2. **使用任意 PNG 图片**：找三张图片重命名即可
3. **使用上述方法生成**：推荐方案 4（如果已安装 ImageMagick）

## 修改 manifest.json（临时方案）

如果暂时没有图标，可以注释掉 manifest.json 中的图标配置：

```json
{
  "manifest_version": 3,
  "name": "AutoDL GPU 自动抢机助手",
  "version": "1.0.0",
  ...
  // 暂时注释掉图标配置
  /*
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    }
  },
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
  */
  "action": {
    "default_popup": "popup.html"
  }
}
```
