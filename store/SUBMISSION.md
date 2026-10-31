# Edge Add-ons 提交信息（可直接复制）

- 扩展名称：Figma 中文汉化
- 版本：1.3.0
- 包：`dist/figma-zh-extension.zip`
- 源码：https://github.com/UJohn/figma-zh
- 隐私政策 URL：https://ujohn.github.io/figma-zh/privacy.html
- 支持页面：https://github.com/UJohn/figma-zh/issues
- 网站：https://github.com/UJohn/figma-zh

## 简短说明
把 Figma 网页版界面汉化为简体中文，离线词表，不收集数据。

## 详细说明（≥250 字符）
Figma 网页版目前没有官方中文界面。本扩展把 Figma 的界面文字替换为简体中文，覆盖文件浏览器、编辑器菜单、图层右键菜单、设计/原型面板、账户设置、分享与订阅页面等常见界面。扩展使用本地离线词表与上下文规则，不联网、不收集任何数据，也不会修改你的设计稿、图层名、文件名或评论。安装后可在扩展弹窗中随时开启/关闭中文界面，或重新扫描当前页面。适合希望用中文界面学习和使用 Figma 的设计师与团队。

## 分类
开发者工具 / 生产工具（按商店分类实际选项选择）

## 隐私与权限
- 是否收集用户数据：否
- 是否使用远程代码：否
- `activeTab`：读取当前标签页地址，判断是否在 Figma 页面，并向页面脚本发送开关指令。
- `storage`：保存“是否启用中文界面”开关。
- 主机权限 `www.figma.com` / `figma.com` / `support-chat.figma.com`：仅在 Figma 页面注入翻译脚本。

## 认证测试说明
打开任意 figma.com 页面即可看到中文界面；若未生效，点击扩展图标确认“启用中文界面”为开，并刷新页面。无需登录特殊账号，无网络请求。

## 素材
- 徽标：`store/logo-300.png`（300×300）
- 小促销图：`store/promo-440x280.png`
- 大促销图：`store/large-promo-1400x560.png`
- 截图：`store/screenshots/01-help-menu.png`、`02-account-settings.png`、`03-editor.png`（1280×800）
