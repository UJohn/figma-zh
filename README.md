# Figma 中文化

把 [Figma 网页版](https://www.figma.com/) 的界面汉化为简体中文。

提供两种安装方式：

- **浏览器扩展**（推荐，适合设计师）：Edge / Chrome，安装后自动生效
- **油猴脚本**：Tampermonkey / Violentmonkey，适合开发调试或高级用户

## 汉化范围

覆盖 Figma 网页版常见界面：

- 文件浏览器：最近、草稿、团队项目、回收站、搜索
- 编辑器：顶部菜单、工具栏、图层面板、右键菜单、设计/原型面板、开发模式
- 账户设置：账户、社区、通知、安全、主题、字体
- 分享与订阅页面
- 按钮提示、占位符、动态弹出的菜单与弹窗

## 不翻译什么

为避免误改你的文件，以下内容保持原样：

- 画布上的设计内容与画板标签（Canvas 绘制）
- 图层名、页面名、文件名、评论内容
- 你的团队名、用户名、邮箱等个人数据
- 品牌/产品名（Figma Design、FigJam、Make、Buzz 等）
- 语言名称（English、日本語、한국어…）
- 输入框中自动轮播的 AI 示例提示词

## 安装

### 浏览器扩展（推荐）

Edge Add-ons 版本即将上线，上线后可直接在商店搜索 **Figma 中文汉化** 安装。

在此之前，也可以从 [Releases](https://github.com/UJohn/figma-zh/releases/latest) 下载 `figma-zh-extension.zip`，解压后在 `edge://extensions` / `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」选择解压目录。

### 油猴脚本

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey
2. 打开 [Releases](https://github.com/UJohn/figma-zh/releases/latest) 安装 `figma-zh.user.js`

> 油猴脚本和扩展不要同时启用，否则会重复替换页面文字。

## 使用

- 扩展：点击工具栏图标，可开启/关闭中文界面、重新扫描当前页
- 油猴脚本：右上角菜单可开启/关闭；快捷键 `Ctrl + Alt + Z`

## 隐私

- 不联网、不上传任何数据
- 不收集账号、文件、设计稿或浏览记录
- 仅在浏览器本地保存“是否启用中文界面”的开关
- 不修改设计内容、图层名、文件名或评论

隐私政策：https://ujohn.github.io/figma-zh/privacy.html

## 已知限制

- Figma 经常更新界面，极少数字符串可能暂时仍为英文，后续版本会补上
- 画布上由 Canvas 绘制的文字（例如画板名称标签）无法通过浏览器扩展替换
- 登录页、管理后台等部分页面可能尚未完全覆盖

## 词表来源

部分界面译文参考并合并自 [figma-cn](https://github.com/cooky-dance/figma-cn)（GPL-3.0），详见 [NOTICE](NOTICE)。本项目同样以 GPL-3.0 发布。

## 许可

[GPL-3.0](LICENSE)

非 Figma 官方项目，与 Figma, Inc. 无关联。Figma 是 Figma, Inc. 的商标。
