# Figma 中文化 · 油猴脚本 + 浏览器扩展

把 [Figma 网页版](https://www.figma.com/) 的**界面**汉化为简体中文；提供 Tampermonkey / Violentmonkey 油猴脚本与 MV3 浏览器扩展两种形态。

- 开发源：`figma-zh.user.js`（构建产物：`dist/figma-zh.user.js`、`dist/extension/`）
- 版本：v1.3.0
- 授权：GPL-3.0

---

---

## 零、双轨结构（v1.3.0 起）

本仓库同时产出两种形态，共用同一份词表和翻译引擎：

| 产物 | 用途 | 路径 |
| --- | --- | --- |
| 油猴脚本 | 开发调试 / 高级用户 | `dist/figma-zh.user.js` |
| MV3 浏览器扩展 | **主发布渠道**，给设计师用 | `dist/extension/` |

### 构建

```bash
npm run build                 # 生成 dist/figma-zh.user.js + dist/extension/ + dist/dict.zh.json
npm run package:extension     # 额外生成 dist/figma-zh-extension.zip（商店上传用）
```

### 扩展安装（开发）
1. 打开 Edge `edge://extensions` 或 Chrome `chrome://extensions`。
2. 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/extension`。
3. 刷新 figma.com。

> ⚠️ **不要同时启用油猴版和扩展版**：两者会同时替换 DOM，造成重复翻译/相互覆盖。选一个即可（开发调试用油猴，日常用扩展）。

### 商店上架
- Edge Add-ons：免费注册开发者；上传 `dist/figma-zh-extension.zip`。
- Chrome Web Store：一次性 $5 开发者注册费；上传同一个 zip。
- 上架材料见 [store/LISTING.md](store/LISTING.md)，隐私政策见 [store/PRIVACY.md](store/PRIVACY.md)。

### 词表/翻译工作流
见 [docs/TRANSLATION.md](docs/TRANSLATION.md)：从 Figma 自己的英文词典导出 `{key, en}`，用 `tools/diff-coverage.js` 生成未翻译清单，按英文原文独立翻译。

## 一、它翻译什么

| 区域 | 示例 |
| --- | --- |
| 顶部主菜单 | File / Edit / View / Object / Text / Arrange / Plugins … |
| 左侧工具栏 | Move tool、Frame、Rectangle、Pen、Text、Hand、Comment、Dev Mode … |
| 右侧属性面板 | Design / Prototype / Inspect、Layout、Fill、Stroke、Effects、Export、Auto layout、Constraints … |
| 右键菜单 | Copy、Paste here、Group selection、Bring to front、Use as mask、Outline stroke … |
| 原型交互 | Trigger、Action、Smart animate、Navigate to、Open overlay、Easing … |
| 开发模式 | Dev Mode、Inspect、Code、Measure、Copy as CSS、Ready for dev … |
| 分享 / 文件浏览器 | Share、Invite people、Can edit、Recents、Drafts、Community、Templates、Move to trash … |
| 提示与占位符 | 按钮 `aria-label`、`title`、`placeholder`、tooltip 等 |
| 动态内容 | 弹窗、下拉菜单、悬浮提示等运行时插入的节点会自动补译 |

内置 **1106 条**离线词表（零网络请求）+ 55 条句式正则，处理 `2 selected`、`12 days ago`、`Rectangle — R`、`Figma Design, 1 item selected` 之类带变量的文案。

> v1.1.0 起用 BSK 登录真实 figma.com 做了一轮**逐节点扫描补全**：文件浏览器、编辑器设计/原型面板、主菜单、右键菜单、分享弹窗、AI 引导等界面的残留英文都已补上（详见文末「实测补全记录」）。

## 二、它**不**翻译什么（重要）

为避免破坏你的设计文件，脚本刻意跳过：

- 画布里的设计内容（`canvas`）
- 图层名、页面名（`role="tree"` / `role="treeitem"` 区域）
- 可编辑文本（`contenteditable`、输入框内容）
- 代码块（`code` / `pre`）
- 已标记 `translate="no"` / `.notranslate` 的区域

也就是说：**只汉化 Figma 自己的界面，不动你的稿子和素材名。**

## 三、安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 打开扩展面板 → 「添加新脚本」，把 `figma-zh.user.js` 全文粘贴进去 → 保存。
   - 也可以把 `.user.js` 文件直接拖进浏览器，扩展会提示安装。
3. 打开 / 刷新 <https://www.figma.com/>，界面即为中文。

> 建议用 Edge / Chrome。脚本只作用于 `figma.com`，且 `@noframes` 不会注入到内嵌 iframe。

## 四、使用

脚本加载后自动生效，右下角（底部居中）会有一次轻提示。扩展菜单里有：

1. **开启/关闭汉化** —— 关闭时会按记录的原文**还原英文**，不留半中半英。
2. **立即重新扫描当前页** —— 手动触发一次全量翻译。
3. **在线补译开关（实验）** —— 见下。
4. **查看翻译统计** —— 看命中了多少条。
5. **关于 / 使用说明**。

快捷键：`Ctrl + Alt + Z` 快速开关（在输入框/可编辑区里不会触发）。

## 五、在线补译（可选，默认关闭）

Figma 界面更新很快，词表可能漏掉新词。打开「在线补译」后，脚本会用 Google / MyMemory 免费接口，**只对按钮、菜单、提示气泡里的短文本**兜底翻译，且：

- 长度 ≤ 60 字符；
- 不含中文、必须像英文单词；
- 不会去翻图层名、文件名、评论等用户内容。

接口不可用时自动静默失败，不影响离线词表。若不希望有任何网络请求，保持关闭即可。

## 六、自定义词表

打开脚本，找到 `RAW_DICT`（约在第 90 行），按 `'英文': '中文',` 的格式追加即可，例如：

```js
'My new button': '我的新按钮',
```

改完保存、刷新 Figma 生效。句式类文案可加到 `RULES` 数组里。

## 七、实现要点

- `MutationObserver` 增量监听 DOM，60ms 合并去抖，避免频繁重排。
- 文本节点用 `WeakMap` 记录「上次写入值」，防止自己改自己造成死循环；Figma 若把文字改回英文会自动重译。
- 属性（`placeholder` / `title` / `aria-label` / `alt` / `data-tooltip`）与按钮 `value` 一起翻译。
- 关闭时遍历 DOM 用 `WeakMap` 里的原文还原。
- 12 秒兜底全量扫描 + 路由切换（`popstate`）补扫，覆盖异步渲染。

## 八、已知限制

- Figma 是持续迭代的闭源应用，个别新界面文案可能暂时是英文；可开启「在线补译」或补词表。
- 若某个文件名恰好等于词表里的单词（例如文件名叫「Design」），显示层可能被误译——只影响显示，不改文件本身。
- 不处理封闭的 Shadow DOM 内部（Figma 主界面目前基本不用 Shadow DOM）。
- 脚本仅做「界面汉化」，不改变 Figma 的功能与数据。

## 九、本地测试

仓库内提供了一个基于 jsdom 的冒烟测试（17 项断言，覆盖翻译、跳过、动态插入、还原/再开启）：

```bash
cd /tmp/figma-zh-test
node test.js   # 17/17 通过
```

测试覆盖：按钮 `aria-label` 与文本、面板标签、图层树不翻译、`placeholder`、`contenteditable` 跳过、数量句式、快捷键提示、动态节点、外部改回英文重译、开关还原与再次开启。

## 十、实测补全记录（v1.1.0，BSK + Edge）

用 BrowserSkill 在 Edge 里登录真实账号，打开 `https://www.figma.com/`，按下面这些界面逐节点遍历 DOM（文本节点 + `placeholder` / `title` / `aria-label` / `data-tooltip` / `alt`），把仍为英文的界面词补进词表：

| 界面 | 补到的典型残留词 |
| --- | --- |
| 文件浏览器 | Edited、12 days ago、Add to Starred、Add to sidebar、Shared files/folders、All organizations、View mode、Show as grid/list、Upgrade your team、New Make file… |
| 编辑器顶栏 / 侧栏 | Agents、Tools、Missing fonts、Edit file menu、Add new page、File name、Navigation Bar、Left/Right sidebar、Multiplayer tools… |
| 设计属性面板 | Toggle auto layout、Toggle ready for dev status、Freeform、Dimensions、Lock aspect ratio、Apply styles and variables、Layout guide、Autofill available… |
| 原型面板 | Add interactivity with Make、Try Figma Make、Flow starting point、No scrolling、Show prototype settings、Creating a connection… |
| 主菜单 / 右键菜单 | Back to files、Actions…、Vector、Libraries、Open in desktop app、AI balance、Paste to replace、Copy/Paste as、Build this with code、Add motion、Convert to section… |
| 分享弹窗 | Share this file、Who has access、can access、Add comma separated emails to invite、Copy Dev Mode link、Share selected frames to Community… |
| 其他 | Share a riff、Create link、Bulleted/Numbered list、Text direction、Spell check、Code, now on canvas… |

补全后再次整页扫描，**可见界面文字已无英文**；剩余英文只有两类：

1. Figma 内部的 `data-tooltip` 机器键名（如 `main-menu`、`set-tool-pen`、`align-left`），根本不显示给用户；
2. 用户内容 —— 文件名、页面名、图层名、团队/用户名（如 `Untitled`、`Page 1`、`ujohn`），按设计**故意不翻译**。

同时在图层树里做了更精细的处理：**图层名/页面名的文字不翻译，但图层行里的 aria-label、锁定/可见性等控件提示照常翻译**，既不破坏你的命名，也不漏掉界面控件。

## 十一、第二轮全功能实测（v1.2.0）

按「每个功能都点一遍」的要求，在 Edge 登录态下依次打开了：

- 账户下拉菜单（Change theme / Get desktop app / View Community profile / Saved from Community / Add account）
- 帮助菜单（Help Center、Support Forum、YouTube videos、Legal summary、Submit feedback、Ask the community、Contact support、Report abuse、Change language…）
- 举报滥用弹窗（标题、必填提示、问题类型、全部类别选项）
- 更改语言弹窗（标题、说明、语言名保留各自母语写法）
- 升级套餐弹窗（三档套餐、席位、按月/按年、权益清单、价格句式）
- 资源页（搜索内部资源、自定义模板、升级引导）
- 文件列表（All types 下拉、Star/Created/Active in file 列头、Sort by column…）
- 文件夹设置与「Transfer」转移弹窗（警告、条款、Step 1 of 2）
- 通知面板（未读、空状态、开启通知引导）
- Starter hub / Usage（入门中心、AI 额度、MCP 调用、文件用量）
- 草稿页 / 回收站
- 编辑器无障碍状态提示
- 客服组件 Ask Support（`support-chat.figma.com` iframe）

针对客服组件这类跨域 iframe，脚本新增了：

1. `@match https://support-chat.figma.com/*`（让脚本能进入该 iframe 单独运行）；
2. **开放 Shadow DOM 遍历**（客服弹窗常用 Web Component + Shadow DOM，普通 DOM 遍历看不到）。

### 仍然保留英文的部分（刻意不翻）

- **品牌/产品名**：Figma Design、Figma Make、Figma Draw、FigJam、Figma Slides、Figma Motion、Figma Specs、Figma Sites、Figma Buzz、Make、Buzz、MCP、AI；
- **价格单位**：`$16/mo`、`/mo`、`Beta`；
- **语言选择器**：English / 日本語 / Français / Deutsch / Español / 한국어 / Português（语言名保留母语写法）；
- **AI 提示词示例占位符**：Figma 会在输入框里轮播一段很长的示例 prompt（每次刷新都不同、还会动态变化），属生成内容而非界面文案，强行替换会闪烁，故不改；需要时开「在线补译」可兜底；
- **你的数据**：文件名、页面名、图层名、团队/用户名、社区资源名。


## 十二、更新后为什么「看起来没变化」

用户脚本是在浏览器里**安装**后运行的，改工作区里的 `.user.js` 文件不会自动同步到浏览器。本次已通过 BSK 在 Edge 的 Tampermonkey 里完成 **v1.1.0 → v1.2.1** 升级，并在真实页面验证：

- 帮助菜单：帮助中心 / 支持论坛 / YouTube 视频 / 法律摘要 / 提交反馈 / 向社区提问 / 联系支持 / 举报滥用 / 更改语言…
- 资源页：专为你的团队打造的自定义模板 / 升级到专业版 / 浏览社区资源
- 套餐弹窗：入门版 / 专业版 / 组织版、席位、按月/按年、权益清单
- 文件列表：所有类型、星标、创建时间、最近活跃
- 举报滥用、更改语言、账户菜单等

如果你以后自己改词表：**保存脚本 → 在 Figma 页面刷新一次** 才会生效；也可以在 Tampermonkey 里确认版本号为 v1.2.1。


## 十三、第三轮补全（v1.2.4）

针对画布右键菜单、⌘K 命令面板、插件/小组件面板、账户设置（账户/社区/通知/安全）等又补了一轮：

- 右键菜单：Show/Hide UI、Show/Hide comments、Cursor chat
- 命令面板：Plugins & widgets、Find and replace…、Suggestions、Common settings
- 素材搜索：Find assets by name, or simply describe them、`Ex: "help icon"`、Suggested、Widget、In-app purchases
- 插件：Saved plugins、Manage plugins…、View details
- 账户设置：Security / Change name / Email / Change email / Role / Change role / Upgrade Figma plan / View plans / Your spaces
- 社区设置：Display name / Unique handle / Change handle / Profile connections / Delete public profile
- 通知设置：Browser notifications / Email notifications / 各细分通知项
- 安全设置：Password / Two-factor / Sessions / Personal access tokens / Connected apps / Revoke access
- 主题与字体：System theme / Enhance contrast / Closed captions / Fonts / Use local fonts / Library

> 注意：Figma 经常把一整句拆成多个文本节点（例如 “All fields marked with * are required”“Enable libraries for all files in your drafts”），脚本已按片段补译；这类地方如果截图里还混着英文，发我具体位置即可。


## 十四、第四轮：编辑器地毯式排查（v1.2.6）

用 BSK 在真实设计文件里逐个展开菜单、逐个看面板，补上：

- 图层右键菜单：复制/粘贴为、添加动效、更多布局选项等**全部子菜单**
- 复制/粘贴为：复制所选内容的链接、复制为代码、粘贴动画、CSS（所有图层）、在开发模式中生成 Tailwind/React…
- 添加动效：应用动画样式…
- 更多布局选项：建议自动布局、移除所有自动布局
- 缩放菜单：缩放到 200%（改为通用规则 `Zoom to N%`）、像素预览、轮廓、附加标签
- 像素预览：已禁用；轮廓：显示轮廓、包含隐藏图层、包含对象边界
- 原型面板：原型设置、无设备、背景颜色、随父级滚动
- Figma MCP 弹窗：将 Figma MCP 与第三方智能体集成、一键添加、通过 Claude Desktop 插件添加、推荐、手动安装、其他智能体…
- 文件菜单：发布组件库…、导出…、创建分支…、文件颜色配置文件、移动文件…
- 页面属性：包含在导出中
- 协作：聚焦我、等待跟随者…
- **默认命名也本地化**：`Frame 1 → 画板 1`、`Page 1 → 页面 1`、`Rectangle 2 → 矩形 2` 等（在画布标签和图层面板都生效；用户自定义名字不受影响）


## 十五、第五轮：主菜单/右键/页面/查找/导出 全量穷举（v1.3.0）

这轮用 BSK 把**主菜单 10 个子菜单**、**图层右键菜单 6 个子菜单**、**对象菜单里的嵌套子菜单**全部展开扫了一遍，并补上：

- 主菜单：文件（新建设计、放置图片…、保存本地副本…、保存到版本历史…、将画板导出为 PDF…、从 Sketch 导入）、编辑（复制为文本/动态 SVG、全选符合条件的图层、查找下一个/上一个…）、视图（显示切片、蒙版轮廓、画板轮廓、内存占用、切换到绘图/开发模式、面板、上一页/下一页、缩放到上/下一个画板…）、对象、排列、矢量、插件、偏好设置（几十项开关与颜色配置/键盘布局/无障碍/权限/微调量）
- 对象嵌套：修改宽度/高度为适应内容或填充容器、解锁宽高比、插槽（转换为插槽/用新插槽包裹/重置插槽）、主组件（推送更改/恢复主组件）、布尔组（合并/减去/相交/排除）
- 页面右键：复制页面链接、重命名页面、创建页面副本、上移、删除页面
- 查找栏：Find… 占位符、画板/编组、图片、形状、区分大小写、全字匹配
- 导出：将画板导出为 PDF 弹窗、颜色配置文件、质量；导出弹窗的 `0 of 0 selected` 与空状态说明
- 图层右键底部：添加起点、复制所选内容的链接、复制为代码、粘贴动画
- 音频升级弹窗：用语音沟通、文本评论、语音对话、无限页面、查看全部功能…
- 文件颜色配置文件子菜单：与首选配置文件相同（sRGB）/分配到 sRGB/分配到 Display P3

另外，查找输入框以前因 `role="textbox"` 被整体跳过，导致 `Find…` 不翻；已调整为**只跳过可编辑文本节点，仍翻译 placeholder**。
