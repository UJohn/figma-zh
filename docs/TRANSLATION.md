# 翻译工作流（不依赖第三方译文）

目标：**知道 Figma 哪里需要翻译 + 自己按英文原文翻译**，不复制任何第三方中文译文。

## 1. 导出 Figma 官方英文词条
在 Tampermonkey 安装 `tools/collect-strings.user.js`，打开 figma.com，菜单里点：

- **① 导出 Figma 官方英文词条（JSON）** → `figma-official-strings.json`
  - 来源是 Figma 自己的 `link#englishDictionaryUrl` 指向的英文词典，不是第三方仓库。
  - 每条是 `{ key, en }`，`key` 是 Figma 内部词条名，`en` 是英文原文。

## 2. 导出当前页面 DOM 里的英文
同一个收集器菜单点 **② 导出当前页面 DOM 英文清单**。
切换不同页面/菜单后再点，可以继续收集官方词典没覆盖的动态文本。

## 3. 生成未翻译清单
```bash
node build/build.js                       # 先得到 dist/dict.zh.json
node tools/diff-coverage.js figma-official-strings.json dist/dict.zh.json
```
输出：
- `dist/translation-backlog.json`
- `dist/translation-backlog.csv`（列：key, en）

按 `en` 自己翻译，把结果补进根目录 `figma-zh.user.js` 的 `RAW_DICT`（或未来的 `core/dict.zh.json`）。

## 4. 法律注意
- 只使用 Figma 的英文原文和 key 作为“待翻译位置”，不读取/复制 `figma-cn` 等第三方仓库的中文 JSON。
- 本项目的代码与词表以 GPL-3.0 发布；如果将来引用任何 GPL 项目的代码或译文，必须遵守 GPL（保留声明、提供源码）。
