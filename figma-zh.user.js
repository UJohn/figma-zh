// ==UserScript==
// @name         Figma 中文化（界面汉化）
// @name:en      Figma Chinese UI Translator
// @namespace    https://github.com/figma-zh
// @version      1.5.0
// @description  把 Figma 网页版（figma.com）的界面汉化为简体中文：工具栏、菜单、右键菜单、右侧属性面板、原型/开发模式、分享弹窗、文件浏览器、提示气泡、占位符等。内置离线词表（零请求），动态出现的内容自动补译；不改动画布里的设计内容和你的图层/文件名。
// @description:en  Translate the Figma web app UI into Simplified Chinese with an offline dictionary and live DOM observation.
// @author       Yujan
// @match        https://www.figma.com/*
// @match        https://figma.com/*
// @match        https://support-chat.figma.com/*
// @icon         https://static.figma.com/app/icon/1/favicon.png
// @homepageURL  https://github.com/UJohn/figma-zh
// @supportURL   https://github.com/UJohn/figma-zh/issues
// @updateURL    https://raw.githubusercontent.com/UJohn/figma-zh/main/figma-zh.user.js
// @downloadURL  https://raw.githubusercontent.com/UJohn/figma-zh/main/figma-zh.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @license      GPL-3.0
// ==/UserScript==

/*
 * Figma 中文化 v1.0.0
 * ------------------------------------------------------------------
 * 设计要点（为什么这么写）：
 * 1. Figma 是重度 React + Canvas 应用，界面文字分散在运行时不断增删的 DOM 里，
 *    所以用 MutationObserver 监听、增量扫描，而不是一次性替换。
 * 2. 只翻译「精确命中词表」的字符串。设计稿画布（canvas）里的文字、图层名、
 *    页面名、评论正文等都是用户内容，一律不碰（见 SKIP_SELECTOR）。
 * 3. 文本节点用 WeakMap 记录「上次写入值」，避免自己改自己造成的死循环；
 *    外部把文字改回英文时会自动重新翻译。
 * 4. 默认纯离线（词表），可选的「在线补译」是实验功能，默认关闭，只对
 *    按钮/菜单/提示等交互控件里的短文本兜底，不会去翻用户内容。
 * 5. 关闭汉化时会按记录的原文还原，而不是留一半中文。
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ============================================================
   * 一、配置
   * ============================================================ */
  const CFG = {
    online: false,        // 实验性在线补译（默认关；只补词表没命中的短 UI 文本）
    onlineDelay: 260,     // 在线请求间隔(ms)，防限流
    maxTextLen: 60,       // 参与在线补译的文本最大长度
    rescanMs: 12000,      // 兜底全量重扫间隔(ms)
    debounceMs: 60,       // Mutation 后的合并延迟(ms)
  };

  const KEY_ENABLED = 'figma_zh_enabled_v1';
  const KEY_ONLINE = 'figma_zh_online_v1';

  const store = {
    get(k, d) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(k, undefined);
          return v === undefined ? d : v;
        }
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try {
        if (typeof GM_setValue === 'function') GM_setValue(k, v);
        else localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  let enabled = store.get(KEY_ENABLED, true);
  CFG.online = store.get(KEY_ONLINE, false);

  const stats = { offline: 0, online: 0 };

  /* ============================================================
   * 二、离线词表（Figma 界面高频术语）
   *    精确匹配、官方/社区通用译法；键是 Figma 英文原文
   * ============================================================ */
  const RAW_DICT = {
    /* —— 顶部主菜单 —— */
    'File': '文件', 'Edit': '编辑', 'View': '视图', 'Object': '对象',
    'Text': '文本', 'Arrange': '排列', 'Plugins': '插件',
    'Preferences': '偏好设置', 'Help': '帮助', 'Main menu': '主菜单',
    'New': '新建', 'Open': '打开', 'Save': '保存', 'Save as': '另存为',
    'Print': '打印', 'Close': '关闭', 'Quit': '退出',

    /* —— 通用动作 —— */
    'Cancel': '取消', 'Done': '完成', 'OK': '确定', 'Yes': '是', 'No': '否',
    'Apply': '应用', 'Reset': '重置', 'Revert': '还原', 'Confirm': '确认',
    'Delete': '删除', 'Remove': '移除', 'Clear': '清除', 'Add': '添加',
    'Create': '创建', 'Open': '打开', 'Back': '返回', 'Next': '下一步',
    'Previous': '上一步', 'Continue': '继续', 'Finish': '完成', 'Skip': '跳过',
    'Got it': '知道了', 'Learn more': '了解更多', 'Try again': '重试', 'Retry': '重试',
    'Copy': '复制', 'Cut': '剪切', 'Paste': '粘贴', 'Paste here': '粘贴到此处',
    'Duplicate': '创建副本', 'Rename': '重命名', 'Move': '移动', 'Edit': '编辑',
    'Undo': '撤销', 'Redo': '重做', 'Select all': '全选', 'Deselect all': '取消全选',
    'Search': '搜索', 'Find': '查找', 'Replace': '替换', 'Filter': '筛选', 'Sort': '排序',
    'Download': '下载', 'Upload': '上传', 'Import': '导入', 'Export': '导出',
    'Refresh': '刷新', 'Reload': '重新加载', 'Share': '分享', 'Publish': '发布',
    'Update': '更新', 'Settings': '设置', 'Save changes': '保存更改',
    'Discard': '放弃', 'Discard changes': '放弃更改', 'Unsaved changes': '未保存的更改',
    'Leave': '离开', 'Loading': '加载中', 'Loading…': '加载中…', 'Please wait': '请稍候',
    'Something went wrong': '出错了', 'No results': '没有结果', 'Not found': '未找到',
    'Show': '显示', 'Hide': '隐藏', 'Lock': '锁定', 'Unlock': '解锁',
    'Show more': '显示更多', 'Show less': '收起', 'More': '更多', 'Less': '更少',
    'All': '全部', 'None': '无', 'Other': '其他', 'Custom': '自定义',
    'Default': '默认', 'Advanced': '高级', 'Basic': '基础',

    /* —— 左侧工具栏 —— */
    'Move tool': '移动工具', 'Move': '移动', 'Scale': '缩放', 'Frame': '画板',
    'Section': '分区', 'Slice': '切片', 'Rectangle': '矩形', 'Ellipse': '椭圆',
    'Line': '直线', 'Arrow': '箭头', 'Pen': '钢笔', 'Pencil': '铅笔',
    'Text': '文本', 'Hand tool': '抓手工具', 'Hand': '抓手', 'Comment': '评论',
    'Comments': '评论', 'Actions': '操作', 'Dev Mode': '开发模式', 'Present': '演示',
    'Zoom': '缩放', 'Zoom in': '放大', 'Zoom out': '缩小',
    'Zoom to fit': '缩放到适合', 'Zoom to selection': '缩放到所选',
    'Zoom to 50%': '缩放到 50%', 'Zoom to 100%': '缩放到 100%',
    'Pixel grid': '像素网格', 'Layout grid': '布局网格', 'Layout grids': '布局网格',
    'Rulers': '标尺', 'Show rulers': '显示标尺', 'Show layout grids': '显示布局网格',
    'Show pixel grid': '显示像素网格', 'Snap to pixel grid': '对齐到像素网格',
    'Snap to geometry': '对齐到几何', 'Multiplayer cursors': '多人光标',
    'Full screen': '全屏', 'Enter full screen': '进入全屏', 'Exit full screen': '退出全屏',
    'Show UI': '显示界面', 'Hide UI': '隐藏界面', 'Minimize UI': '最小化界面',
    'Plugins': '插件', 'Widgets': '小组件', 'Resources': '资源', 'Assets': '素材',

    /* —— 顶栏/产品 —— */
    'Design': '设计', 'Prototype': '原型', 'Inspect': '检查', 'Animate': '动画',
    'Design file': '设计文件', 'FigJam': 'FigJam', 'Slides': '幻灯片', 'Sites': '站点',
    'Make': 'Make', 'Buzz': 'Buzz', 'Draw': '绘图', 'Design': '设计',

    /* —— 左侧面板 —— */
    'Layers': '图层', 'Pages': '页面', 'Page': '页面', 'Layer': '图层',
    'Local styles': '本地样式', 'Local variables': '本地变量', 'Team library': '团队库',
    'Components': '组件', 'Component': '组件', 'Instance': '实例', 'Variants': '变体',
    'Variant': '变体', 'Search layers': '搜索图层', 'Search components': '搜索组件',
    'Search styles': '搜索样式', 'Search variables': '搜索变量', 'Search fonts': '搜索字体',

    /* —— 右侧属性面板 —— */
    'Properties': '属性', 'Layout': '布局', 'Position': '位置', 'Size': '尺寸',
    'Appearance': '外观', 'Fill': '填充', 'Fills': '填充', 'Stroke': '描边',
    'Strokes': '描边', 'Effects': '效果', 'Effect': '效果', 'Typography': '排版',
    'Constraints': '约束', 'Auto layout': '自动布局', 'Alignment': '对齐',
    'Selection': '所选内容', 'Selection colors': '所选颜色', 'Nothing selected': '未选择任何内容',
    'No selection': '未选择', 'Properties panel': '属性面板',

    /* —— 布局 / 自动布局 —— */
    'Direction': '方向', 'Spacing': '间距', 'Gap': '间隙', 'Padding': '内边距',
    'Horizontal': '水平', 'Vertical': '垂直', 'Wrap': '换行',
    'Resizing': '尺寸调整', 'Width': '宽度', 'Height': '高度',
    'Hug contents': '适应内容', 'Fill container': '填充容器', 'Fixed': '固定',
    'Min width': '最小宽度', 'Max width': '最大宽度', 'Min height': '最小高度',
    'Max height': '最大高度', 'Clip content': '裁剪内容', 'Corner radius': '圆角',
    'Corner smoothing': '圆角平滑', 'Individual corners': '单独圆角',
    'Add auto layout': '添加自动布局', 'Remove auto layout': '移除自动布局',
    'Switch direction': '切换方向', 'Pack horizontal': '水平堆叠', 'Pack vertical': '垂直堆叠',
    'Tidy up': '整理', 'Alignment': '对齐', 'Distribute': '分布',

    /* —— 外观 / 颜色 / 效果 —— */
    'Opacity': '不透明度', 'Blend mode': '混合模式', 'Normal': '正常',
    'Multiply': '正片叠底', 'Screen': '滤色', 'Overlay': '叠加', 'Darken': '变暗',
    'Lighten': '变亮', 'Color dodge': '颜色减淡', 'Color burn': '颜色加深',
    'Hard light': '强光', 'Soft light': '柔光', 'Difference': '差值',
    'Exclusion': '排除', 'Hue': '色相', 'Saturation': '饱和度', 'Color': '颜色',
    'Luminosity': '明度', 'Pass through': '穿透', 'Isolate': '隔离',
    'Drop shadow': '投影', 'Inner shadow': '内阴影', 'Layer blur': '图层模糊',
    'Background blur': '背景模糊', 'Stroke properties': '描边属性',
    'Center': '居中', 'Inside': '内侧', 'Outside': '外侧', 'Dash': '虚线',
    'Add fill': '添加填充', 'Add stroke': '添加描边', 'Add effect': '添加效果',
    'Remove fill': '移除填充', 'Remove stroke': '移除描边', 'Remove effect': '移除效果',

    /* —— 文字排版 —— */
    'Font': '字体', 'Font size': '字号', 'Line height': '行高',
    'Letter spacing': '字距', 'Paragraph spacing': '段间距', 'Paragraph indent': '首行缩进',
    'Text case': '文本大小写', 'Text decoration': '文本装饰', 'Text align': '文本对齐',
    'Vertical trim': '垂直裁剪', 'Type settings': '字体设置', 'Text styles': '文本样式',
    'Apply text style': '应用文本样式', 'Resize to fit': '调整以适合',
    'Auto width': '自动宽度', 'Auto height': '自动高度', 'Fixed size': '固定尺寸',
    'Bold': '粗体', 'Regular': '常规', 'Medium': '中等', 'Semibold': '半粗',
    'Extra light': '极细', 'Thin': '细体', 'Extra bold': '特粗', 'Black': '黑体',
    'Heavy': '粗黑', 'Italic': '斜体', 'Underline': '下划线', 'Strikethrough': '删除线',
    'Uppercase': '大写', 'Lowercase': '小写', 'Capitalize': '首字母大写', 'Small caps': '小型大写',
    'Align left': '左对齐', 'Align center': '居中对齐', 'Align right': '右对齐',
    'Justify': '两端对齐', 'Align top': '顶部对齐', 'Align middle': '垂直居中',
    'Align bottom': '底部对齐', 'Align horizontal centers': '水平居中对齐',
    'Align vertical centers': '垂直居中对齐', 'Distribute horizontal spacing': '水平分布间距',
    'Distribute vertical spacing': '垂直分布间距',

    /* —— 约束 —— */
    'Left': '左', 'Right': '右', 'Top': '上', 'Bottom': '下',
    'Left and right': '左右', 'Top and bottom': '上下', 'Left and right and scale': '左右并缩放',

    /* —— 网格 / 导出 —— */
    'Grid': '网格', 'Columns': '列', 'Rows': '行', 'Gutter': '槽宽',
    'Margin': '外边距', 'Offset': '偏移', 'Count': '数量', 'Type': '类型',
    'Export selection': '导出所选', 'Add export': '添加导出', 'Remove export': '移除导出',
    'Preview': '预览', 'Format': '格式', 'Scale': '缩放', 'Suffix': '后缀',

    /* —— 原型 —— */
    'Interactions': '交互', 'Interaction': '交互', 'Trigger': '触发', 'Action': '动作',
    'Animation': '动画', 'Smart animate': '智能动画', 'Instant': '瞬间', 'Dissolve': '溶解',
    'Move in': '移入', 'Move out': '移出', 'Push': '推入', 'Slide in': '滑入',
    'Slide out': '滑出', 'Navigate to': '跳转到', 'Back': '返回',
    'Open overlay': '打开浮层', 'Close overlay': '关闭浮层', 'Open in new tab': '在新标签页打开',
    'Scroll to': '滚动到', 'Swap with': '替换为', 'Change to': '更改为',
    'While hovering': '悬停时', 'While pressing': '按下时', 'On click': '点击时',
    'On drag': '拖动时', 'After delay': '延迟后', 'Mouse enter': '鼠标移入',
    'Mouse leave': '鼠标移出', 'Mouse down': '鼠标按下', 'Mouse up': '鼠标抬起',
    'Key down': '按键按下', 'Key up': '按键抬起', 'Delay': '延迟', 'Duration': '时长',
    'Easing': '缓动', 'Linear': '线性', 'Ease in': '缓入', 'Ease out': '缓出',
    'Ease in and out': '缓入缓出', 'Gentle': '柔和', 'Quick': '快捷', 'Bouncy': '弹跳',
    'Slow': '缓慢', 'Device': '设备', 'Flow': '流程', 'Flows': '流程',
    'Starting point': '起点', 'Overflow': '溢出', 'Horizontal scrolling': '水平滚动',
    'Vertical scrolling': '垂直滚动', 'Both directions': '双向',
    'Fix position when scrolling': '滚动时固定位置', 'Scroll behavior': '滚动行为',
    'Presentation': '演示', 'Present in new tab': '在新标签页演示',

    /* —— 开发模式 —— */
    'Code': '代码', 'Measure': '测量', 'Annotations': '标注', 'Add annotation': '添加标注',
    'Ready for dev': '开发就绪', 'Changes': '更改', 'Compare changes': '比较更改',
    'Copy code': '复制代码', 'Copy as CSS': '复制为 CSS', 'Copy as iOS': '复制为 iOS',
    'Copy as Android': '复制为 Android', 'Copy as Compose': '复制为 Compose',
    'Copy as SwiftUI': '复制为 SwiftUI', 'Variables': '变量', 'Styles': '样式',
    'Export assets': '导出资源', 'Component properties': '组件属性',

    /* —— 组件 / 实例 —— */
    'Main component': '主组件', 'Detach instance': '分离实例', 'Create component': '创建组件',
    'Create instance': '创建实例', 'Create component set': '创建组件集',
    'Swap instance': '替换实例', 'Reset instance': '重置实例',
    'Go to main component': '转到主组件', 'Copy properties': '复制属性',
    'Paste properties': '粘贴属性',

    /* —— 排列 / 布尔 / 蒙版 —— */
    'Bring to front': '置于顶层', 'Send to back': '置于底层',
    'Bring forward': '上移一层', 'Send backward': '下移一层',
    'Group selection': '编组所选', 'Frame selection': '为所选创建画板', 'Ungroup': '取消编组',
    'Union selection': '合并所选', 'Subtract selection': '减去所选',
    'Intersect selection': '相交所选', 'Exclude selection': '排除所选',
    'Flatten selection': '拼合所选', 'Outline stroke': '描边轮廓',
    'Use as mask': '用作蒙版', 'Set as mask': '设为蒙版', 'Remove mask': '移除蒙版',
    'Select inverse': '反向选择', 'Toggle visibility': '切换可见性', 'Toggle lock': '切换锁定',
    'Copy as PNG': '复制为 PNG', 'Copy as SVG': '复制为 SVG', 'Copy link': '复制链接',

    /* —— 分享弹窗 —— */
    'Invite': '邀请', 'Invite people': '邀请成员', 'People': '成员', 'Permissions': '权限',
    'Anyone with the link': '拥有链接的任何人', 'Can view': '可查看', 'Can edit': '可编辑',
    'Can comment': '可评论', 'View only': '仅查看', 'Owner': '所有者', 'Editor': '编辑者',
    'Viewer': '查看者', 'Send invite': '发送邀请', 'Send': '发送', 'Manage access': '管理访问权限',
    'Transfer ownership': '转移所有权', 'Publish to Community': '发布到社区',
    'Unpublish': '取消发布', 'Embed': '嵌入', 'Public': '公开', 'Private': '私密',
    'Only people invited': '仅受邀成员', 'Copy link to file': '复制文件链接',
    'Anyone with the link can view': '拥有链接的任何人可查看',
    'Anyone with the link can edit': '拥有链接的任何人可编辑',
    'Anyone with the link can comment': '拥有链接的任何人可评论',

    /* —— 文件浏览器 —— */
    'Recents': '最近', 'Drafts': '草稿', 'Community': '社区', 'Templates': '模板',
    'Your teams': '你的团队', 'Team': '团队', 'Projects': '项目', 'Project': '项目',
    'Folder': '文件夹', 'Files': '文件', 'All files': '所有文件',
    'Shared with you': '与你共享', 'Shared with me': '与我共享', 'Created by me': '我创建的',
    'Recently viewed': '最近查看', 'Recently modified': '最近修改',
    'New file': '新建文件', 'New design file': '新建设计文件', 'New FigJam file': '新建 FigJam 文件',
    'New Slides file': '新建幻灯片文件', 'New Site': '新建站点', 'New folder': '新建文件夹',
    'Create new': '新建', 'Import file': '导入文件', 'Search files': '搜索文件',
    'Last modified': '最近修改', 'Date created': '创建时间', 'Name': '名称', 'Actions': '操作',
    'Move to trash': '移至回收站', 'Delete forever': '永久删除', 'Trash': '回收站',
    'Restore': '恢复', 'Grid view': '网格视图', 'List view': '列表视图',
    'Sort by': '排序方式', 'Sort by name': '按名称排序',
    'Sort by last modified': '按最近修改排序', 'Sort by date created': '按创建时间排序',
    'Selected': '已选中', 'Create project': '创建项目', 'New project': '新建项目',

    /* —— 评论 —— */
    'Add comment': '添加评论', 'Post': '发布', 'Reply': '回复', 'Resolve': '解决',
    'Reopen': '重新打开', 'Show comments': '显示评论', 'Hide comments': '隐藏评论',
    'Delete comment': '删除评论', 'Copy link to comment': '复制评论链接',
    'No comments yet': '还没有评论', 'Add a comment': '添加评论',

    /* —— 版本 / 状态 —— */
    'Version history': '版本历史', 'Save to version history': '保存到版本历史',
    'Name this version': '命名此版本', 'Restore this version': '恢复此版本',
    'Show version history': '显示版本历史', 'Autosave': '自动保存', 'Saved': '已保存',
    'Saving': '保存中', 'Saving…': '保存中…', 'All changes saved': '所有更改已保存',
    'Offline': '离线', 'Reconnecting': '重新连接中', 'Connected': '已连接',
    'Connection lost': '连接已断开', 'Read only': '只读',

    /* —— 设置 / 账户 —— */
    'Account': '账户', 'Account settings': '账户设置', 'Notifications': '通知',
    'Language': '语言', 'Theme': '主题', 'Light': '浅色', 'Dark': '深色',
    'System': '跟随系统', 'Log out': '退出登录', 'Sign out': '退出登录',
    'Sign in': '登录', 'Sign up': '注册', 'Profile': '个人资料', 'Billing': '账单',
    'Plans': '套餐', 'Upgrade': '升级', 'Keyboard shortcuts': '键盘快捷键',
    "What's new": '新功能', 'Release notes': '发行说明', 'Feedback': '反馈',
    'Report a bug': '报告问题', 'Support': '支持', 'New to Figma?': '第一次使用 Figma？',

    /* —— 其他零碎 —— */
    'Page': '页面', 'Frame': '画板', 'Group': '编组', 'Boolean': '布尔',
    'Mask': '蒙版', 'Opacity': '不透明度', 'Radius': '半径', 'Rotation': '旋转',
    'Topic': '主题', 'Title': '标题', 'Description': '描述', 'Notes': '备注',
    'Color': '颜色', 'Style': '样式', 'Weight': '字重', 'Paragraph': '段落',
    'Align': '对齐', 'Position': '位置', 'Size': '尺寸', 'Spacing': '间距',
    'Cover': '封面', 'Thumbnail': '缩略图', 'Border': '边框',

    /* —— 实测补充（BSK 遍历 figma.com 抓到的残留英文，按设计师用语翻译） —— */
    /* 文件浏览器 / 侧边栏 / 分享 */
    'Edited': '已编辑',
    'Add to Starred': '添加到星标',
    'Remove from Starred': '从星标中移除',
    'Add to sidebar': '添加到侧边栏',
    'Shared files': '共享文件',
    'Shared folders': '共享文件夹',
    'All organizations': '所有组织',
    'Open Community in new tab': '在新标签页打开社区',
    'Sidebar': '侧边栏',
    'Free': '免费',
    'Free plan': '免费套餐',
    'All folders': '所有文件夹',
    'See what’s included': '查看包含的内容',
    "See what's included": '查看包含的内容',
    'Your plan and usage': '套餐与用量',
    'Starred': '星标',
    'Move row down': '下移一行',
    'Move row up': '上移一行',
    'Upgrade your team': '升级团队',
    'New Make file': '新建 Make 文件',
    'Describe your idea and make it come to life': '描述你的想法，让它成为现实',
    'Learn about AI tools in Figma Design': '了解 Figma Design 中的 AI 工具',
    'Dismiss prompt box': '关闭提示框',
    'Prompt input field': '提示词输入框',
    'Design a file from this': '据此创建文件',
    'View mode': '视图模式',
    'Show as grid': '以网格显示',
    'Show as list': '以列表显示',
    'Help and resources': '帮助与资源',
    'Help/zoom toolbar': '帮助/缩放工具栏',
    'Help and account': '帮助与账户',
    'Back to files': '返回文件列表',
    'Actions…': '操作…',
    'Actions...': '操作…',
    'Vector': '矢量',
    'Libraries': '组件库',
    'Open in desktop app': '在桌面应用中打开',
    'AI balance': 'AI 余额',

    /* 编辑器：顶部栏 / 侧栏 / 画布 */
    'Agents': '智能体',
    'Tools': '工具',
    'Missing fonts': '缺失字体',
    'Edit file menu': '编辑文件菜单',
    'File name': '文件名',
    'Add new page': '新建页面',
    'Navigation Bar': '导航栏',
    'Left sidebar': '左侧栏',
    'Right sidebar': '右侧栏',
    'Application toolbar': '应用工具栏',
    'Resize handle': '调整大小手柄',
    'Comments on canvas': '画布评论',
    'Create new comment': '新建评论',
    'Multiplayer tools': '协作工具',
    'Prototype view': '原型视图',
    'Zoom/view options': '缩放/视图选项',
    'Move tools': '移动工具',
    'Region tools': '区域工具',
    'Shape tools': '形状工具',
    'Type tools': '文字工具',
    'Creation tools': '绘制工具',
    'Toolbelt Mode': '工具带模式',
    'Motion': '动效',
    'Plugin': '插件',
    'Copy colors': '复制颜色',
    'Toggle layer locking': '切换图层锁定',
    'Toggle layer visibility': '切换图层可见性',
    'Toggle auto layout': '切换自动布局',
    'Toggle ready for dev status': '切换开发就绪状态',
    'Apply styles': '应用样式',
    'Apply styles and variables': '应用样式和变量',
    'Apply variable': '应用变量',
    'Apply blend mode': '应用混合模式',
    'More actions': '更多操作',
    'Create style': '创建样式',
    'Add export settings': '添加导出设置',
    'Add layout guide': '添加布局参考线',
    'Layout guide': '布局参考线',
    'Layout guides': '布局参考线',
    'Lock aspect ratio': '锁定宽高比',
    'Dimensions': '尺寸',
    'Freeform': '自由布局',
    'Autofill available. Type to see suggestions.': '可自动填充。输入以查看建议。',
    'Rotate 90˚ right': '顺时针旋转 90°',
    'Flip horizontal': '水平翻转',
    'Flip vertical': '垂直翻转',
    'Frame, Frame Dimension Presets': '画板，画板尺寸预设',
    'Set up agents for Figma MCP': '为 Figma MCP 设置智能体',
    '2 connections': '2 个连接',

    /* 原型面板 */
    'Add interactivity with Make': '使用 Make 添加交互',
    'Figma Make opens up new ways to prototype—from responsive components to micro-interactions.': 'Figma Make 为原型设计带来全新方式——从响应式组件到微交互。',
    'Try Figma Make': '试用 Figma Make',
    'Flow starting point': '流程起点',
    'Add flow starting point': '添加流程起点',
    'No scrolling': '不滚动',
    'Show prototype settings': '显示原型设置',
    'Creating a connection': '创建连接',
    'Select a frame or object in a frame and use the circular node to drag a connection to another frame.': '在画板中选择一个画板或对象，用圆形节点拖拽连接到另一个画板。',
    'Running your prototype': '运行原型',
    'Use the play button in the toolbar to play your prototype. If there are no connections, the play button can be used to play a presentation of your frames.': '用工具栏中的播放按钮运行原型。若没有任何连接，播放按钮可用于演示你的画板。',
    'Add action': '添加动作',

    /* 分享弹窗 */
    'Share this file': '分享此文件',
    'Add comma separated emails to invite': '输入用逗号分隔的邮箱以邀请',
    'Who has access': '谁可以访问',
    'can access': '可访问',
    '(you)': '（你）',
    'Copy Dev Mode link': '复制开发模式链接',
    'Share selected frames to Community': '将所选画板分享到社区',

    /* 新版 AI 引导 */
    'Code, now on canvas': '代码，现已登陆画布',
    'Use': '使用',
    'Mock video of sample images shuffling': '示例图片轮播的演示视频',
    /* 分享 / 文本格式菜单 */
    'Share a riff': '分享灵感',
    'Create link': '创建链接',
    'Bulleted list': '项目符号列表',
    'Numbered list': '编号列表',
    'Adjust': '调整',
    'Case': '大小写',
    'Text direction': '文字方向',
    'Spell check': '拼写检查',
    /* 右键菜单 / 图层操作 */
    'Paste to replace': '粘贴并替换',
    'Copy/Paste as': '复制/粘贴为',
    'Build this with code': '用代码构建',
    'Add motion': '添加动效',
    'Move to page': '移至页面',
    'Convert to section': '转换为分区',
    'Flatten': '拼合',
    'Set as thumbnail': '设为缩略图',
    'More layout options': '更多布局选项',
    'Show/Hide': '显示/隐藏',
    'Lock/Unlock': '锁定/解锁',

    /* —— 第二轮全功能实测补充（账户 / 帮助 / 举报 / 套餐 / 资源 / 文件夹 / 通知 / 入门中心） —— */
    /* 账户菜单 */
    'Change theme': '更改主题',
    'Get desktop app': '获取桌面应用',
    'View Community profile': '查看社区个人资料',
    'Saved from Community': '从社区保存',
    'Add account': '添加账户',

    /* 帮助菜单 */
    'Help Center': '帮助中心',
    'Support Forum': '支持论坛',
    'YouTube videos': 'YouTube 视频',
    'Legal summary': '法律摘要',
    'Submit feedback': '提交反馈',
    'Ask the community': '向社区提问',
    'Contact support': '联系支持',
    'Report abuse': '举报滥用',
    'Report Abuse': '举报滥用',
    'Change language…': '更改语言…',
    'Change language': '更改语言',
    "Pick which language to use for Figma's app, website, and marketing emails.": '选择 Figma 应用、网站和营销邮件使用的语言。',

    /* 举报滥用 */
    'All fields marked with * are required': '所有带 * 的字段均为必填',
    'Type of issue with the content': '内容的问题类型',
    'Please select a category': '请选择一个类别',
    'DMCA, Copyright or Trademark Infringement': 'DMCA、版权或商标侵权',
    'Fraud, Scam or Impersonation': '欺诈、骗局或冒充',
    'Illegal Content': '违法内容',
    'Inappropriate Content': '不当内容',
    'Malware': '恶意软件',
    'Phishing': '钓鱼',
    'Spam': '垃圾信息',
    'Other Type of Abuse': '其他滥用类型',
    'I need help with something else': '我需要其他帮助',

    /* 套餐 / 席位 */
    'Which plan and seats would you like?': '你想选择哪个套餐和席位？',
    'Starter': '入门版',
    'Best for anyone who wants to sample Figma': '适合想体验 Figma 的任何人',
    'Free, but limited features': '免费，但功能有限',
    'Current plan': '当前套餐',
    '3 files to try out': '可试用 3 个文件',
    'Basic design, prototyping, and collaboration': '基础设计、原型和协作',
    'Professional': '专业版',
    'Most popular': '最受欢迎',
    'Best for small teams to create and collaborate': '适合小型团队创作与协作',
    'Billing period': '计费周期',
    'Monthly': '按月',
    'Annual (Save 20%)': '按年（节省 20%）',
    'Full': '完整',
    'Dev': '开发',
    'Collab': '协作',
    'Upgrade and choose seats': '升级并选择席位',
    'Unlimited files and folders': '无限文件与文件夹',
    'Advanced prototyping': '高级原型',
    'A team-wide design library for components, variables, and modes': '团队级的设计库，涵盖组件、变量和模式',
    'File handoff tools like annotation, statuses, and advanced inspection': '标注、状态和高级检查等交付工具',
    '3000 AI credits/month for Full seats': '完整席位每月 3000 AI 额度',
    'Organization': '组织版',
    'Best for teams who need org-wide libraries and easy admin control': '适合需要组织级资源库和简便管理控制的团队',
    'Billed annually': '按年计费',
    'Or, contact sales': '或联系销售',
    'Everything on Professional, plus:': '包含专业版全部功能，另加：',
    'A centralized admin hub': '集中式管理中心',
    'Org-wide design libraries': '组织级设计库',
    'SCIM provisioning': 'SCIM 配置',
    'File features like branching and merging': '分支与合并等文件功能',
    'Code Connect and private plugins': 'Code Connect 与私有插件',
    '3500 AI credits/month for Full seats': '完整席位每月 3500 AI 额度',
    'about products and features. Applicable taxes will be calculated at checkout.': '了解产品和功能。结账时将计算适用税费。',

    /* 资源页 */
    'Search for internal resources': '搜索内部资源',
    'Search templates and tools': '搜索模板和工具',
    'Custom templates—just for your team': '专为你的团队打造的自定义模板',
    'Upgrade to the Professional plan, and build templates for your team’s rituals and workflows—without creating a new file each time.': '升级到专业版，为团队的日常流程和工作流打造模板——无需每次新建文件。',
    'Upgrade to Professional': '升级到专业版',
    'Browse resources from Community': '浏览社区资源',

    /* 文件列表 / 文件夹 */
    'All types': '所有类型',
    'Folders': '文件夹',
    'Breadcrumbs': '面包屑导航',
    'Remove from sidebar': '从侧边栏移除',
    'Open folder dropdown': '打开文件夹菜单',
    'Star': '星标',
    'Created': '创建时间',
    'Active in file': '最近活跃',
    'Share…': '分享…',
    'Share...': '分享…',
    'Move…': '移动…',
    'Move...': '移动…',
    'Change folder color': '更改文件夹颜色',
    'Add a description for this folder': '为此文件夹添加描述',
    'Transfer': '转移',
    'Send a copy': '发送副本',
    'Start this transfer': '开始转移',
    'Warning:': '警告：',
    'Warning': '警告',
    'You can only transfer this folder to another organization with nested folders enabled.': '只能将此文件夹转移到启用了嵌套文件夹的其他组织。',
    'You can transfer this folder and its content to an external team in a Professional, Organization, or Enterprise plan.': '你可以将此文件夹及其内容转移到专业版、组织版或企业版套餐中的外部团队。',
    'Once an admin accepts, the transfer cannot be undone.': '管理员接受后，转移将无法撤销。',
    'Members of your team may still have access if the receiving team chooses to keep individual collaborators.': '如果接收团队选择保留个人协作者，你团队的成员可能仍拥有访问权限。',
    'Site': '站点',
    'Blue': '蓝色',

    /* 通知 */
    'Unread': '未读',
    'View notifications from the selected plan. Currently All notifications': '查看所选套餐的通知。当前为所有通知',
    'All notifications': '所有通知',
    "You don't have any notifications.": '你还没有任何通知。',
    'Get notified about activity?': '想接收活动通知吗？',
    'Mentions and replies will show up right in your browser, so you never miss an update.': '提及和回复会直接显示在浏览器中，不错过任何更新。',
    'Not now': '暂不',
    'Notify me': '通知我',

    /* 入门中心 Starter hub */
    'Starter hub': '入门中心',
    'Learn': '学习',
    'Usage': '用量',
    'Designers, meet your Figma agent': '设计师，来认识你的 Figma 智能体',
    'Prompt to generate designs, apply your design system, and more.': '用提示词生成设计、应用设计系统等。',
    'Try it out': '试一试',
    'Set your designs in motion': '让你的设计动起来',
    'Bring your designs to life on canvas with motion.': '用动效在画布上让设计活起来。',
    'A few ways to get started': '几种入门方式',
    'Use a design template': '使用设计模板',
    'Start from an existing design': '从现有设计开始',
    'Learn the shortcuts': '学习快捷键',
    'Navigate your design file like a pro': '像专家一样浏览设计文件',
    'Browse community resources': '浏览社区资源',
    'Get inspired by others': '从他人作品中获取灵感',
    "There's more to explore": '还有更多可探索',
    'Design on a canvas': '在画布上设计',
    'Build a working product': '构建可运行的产品',
    'Connect an AI agent': '连接 AI 智能体',
    'Draw on a canvas': '在画布上绘图',
    'Create a whiteboard': '创建白板',
    'Build a presentation': '制作演示文稿',
    'Publish a website': '发布网站',
    'Create marketing assets': '创建营销素材',
    'AI credits': 'AI 额度',
    'Low on Design & Sites files': 'Design 与 Sites 文件即将用尽',
    'Monthly MCP tool calls': '每月 MCP 工具调用',

    /* 支持聊天（Decagon 组件） */
    'Ask Support': '寻求支持',
    "Hi! I'm Figma's AI Support Agent.": '你好！我是 Figma 的 AI 支持助手。',
    "Ask me a question. I'll help you solve it or get you to the right place.": '有疑问尽管问我，我会帮你解决或引导你到正确的地方。',
    "By joining this chat, you confirm that you agree to Figma's Privacy Policy and understand that responses provided by Figma's Support AI Chatbot are for informational purposes only and responses are not legally binding. Please review specific help center articles for the most up to date information.": '加入本聊天即表示你同意 Figma 的隐私政策，并理解 Figma 支持 AI 聊天机器人提供的回答仅供参考、不具法律约束力。请查阅具体帮助中心文章以获取最新信息。',
    'Ask a detailed question...': '输入详细问题…',
    'Privacy Policy': '隐私政策',
    'Add another agent': '添加另一个智能体',
    'daily credits used': '每日已用额度',
    'Seat pricing': '席位价格',
    'Or,': '或',
    'contact sales': '联系销售',
    'Figma product listing': 'Figma 产品列表',
    "Screenreader support for the board is currently disabled. To enable it via Accessibility settings, press ⌘K, type Accessibility Settings, and press Enter. To see available keyboard shortcuts, enter ⌃⇧Question mark .": '画布的屏幕阅读器支持当前已关闭。如需通过无障碍设置启用，请按 ⌘K，输入“Accessibility Settings”后按回车。查看可用键盘快捷键请按 ⌃⇧?。',
    'Accessibility Settings': '无障碍设置',
    'Accessibility settings': '无障碍设置',
    /* Figma 会把整句拆成多个文本节点，这里补片段 */
    'All fields marked with': '所有带',
    'are required': '的字段均为必填',
    'Submit abuse report': '提交滥用举报',
    'Do you want to submit this abuse report? By submitting, you confirm that this report is true and accurate to the best of your knowledge. Figma may take moderation action(s) based on the information provided.': '要提交此滥用举报吗？提交即表示你确认该举报真实准确（尽你所知）。Figma 可能会根据所提供信息采取处理措施。',
    'Submit': '提交',

    /* —— 第三轮：画布右键 / 命令面板 / 插件与小组件 / 账户设置 —— */
    'Show/Hide UI': '显示/隐藏界面',
    'Show/Hide comments': '显示/隐藏评论',
    'Cursor chat': '光标聊天',
    'Say something': '说点什么',
    'Plugins & widgets': '插件与小组件',
    'Find and replace…': '查找和替换…',
    'Suggestions': '建议',
    'Common settings': '常用设置',
    'Find assets by name, or simply describe them': '按名称查找素材，或直接描述它们',
    'Ex: "help icon"': '例：“帮助图标”',
    'View details': '查看详情',
    'Saved plugins': '已保存的插件',
    'Manage plugins…': '管理插件…',
    'Manage plugins...': '管理插件…',
    'Suggested': '推荐',
    'Widget': '小组件',
    'In-app purchases': '应用内购买',

    /* 账户设置 */
    'Security': '安全',
    'Change name': '更改名称',
    'Email': '邮箱',
    'Change email': '更改邮箱',
    'Role': '角色',
    'Change role': '更改角色',
    'Upgrade Figma plan': '升级 Figma 套餐',
    'Upgrade plan for unlimited design files in teams.': '升级套餐，获得团队内无限设计文件。',
    'View plans': '查看套餐',
    'Your spaces': '你的空间',
    'what products are included in each seat.': '每个席位包含哪些产品。',
    'Display name': '显示名称',
    'Unique handle': '唯一用户名',
    'Change handle': '更改用户名',
    'Public profile:': '公开个人资料：',
    'Public profile': '公开个人资料',
    'Profile connections': '个人资料关联',
    'Connect multiple Figma accounts to use a single Community profile and merge multiple profiles into one. Publish content, follower creators, save likes, and receive notifications without having to switch accounts.': '关联多个 Figma 账户，使用统一的社区个人资料并将多个资料合并为一个。无需切换账户即可发布内容、关注创作者、收藏点赞并接收通知。',
    'Add profile connection': '添加个人资料关联',
    'Delete public profile': '删除公开个人资料',

    /* 通知设置 */
    'Browser notifications': '浏览器通知',
    'Enable browser notifications': '启用浏览器通知',
    'Email notifications': '邮件通知',
    'Send notifications by email': '通过邮件发送通知',
    'You’ll still get other emails from Figma, like important account or billing info.': '你仍会收到 Figma 的其他邮件，例如重要的账户或账单信息。',
    "You'll still get other emails from Figma, like important account or billing info.": '你仍会收到 Figma 的其他邮件，例如重要的账户或账单信息。',
    'File comments': '文件评论',
    'All comments, mentions, and replies': '所有评论、提及和回复',
    'Only mentions and replies': '仅提及和回复',
    'Invites and requests': '邀请和请求',
    'All types of invites and requests': '所有类型的邀请和请求',
    'Only invites and requests that need my response': '仅需要我回复的邀请和请求',
    'Community comments': '社区评论',
    'All comments on my published resources': '我发布资源上的所有评论',
    'Workspace': '工作区',
    'All activity on my workspace': '我工作区的所有活动',
    'Activity digests': '活动摘要',
    'Activity on my Community resources · Weekly': '我的社区资源活动 · 每周',
    'Product tips and news': '产品技巧和新闻',

    /* 安全设置 */
    'Password': '密码',
    'Change password': '更改密码',
    'Enable two-factor authentication': '启用双重验证',
    'Sessions': '会话',
    "All of your active sessions are listed below. End any sessions you don't recognize or trust.": '你所有活跃会话列于下方。请结束任何你不认识或不信任的会话。',
    'Location & IP': '位置与 IP',
    'OS & Browser': '系统与浏览器',
    'Last accessed': '上次访问',
    'Manage': '管理',
    'Current': '当前',
    'Personal access tokens': '个人访问令牌',
    "Personal access tokens allow you to access your own data via the API. Do not give out your personal access tokens to anybody who you don't want to access your files.": '个人访问令牌允许你通过 API 访问自己的数据。请勿将个人访问令牌透露给任何你不想让其访问文件的人。',
    'Generate new token': '生成新令牌',
    'Connected apps': '已连接的应用',
    "The following apps have been given permission to access your Figma files on your behalf. If you see any apps you're not expecting here, remove their permissions below.": '以下应用已获得代表你访问 Figma 文件的权限。如果你看到任何意料之外的应用，请在下方移除其权限。',
    'Revoke access': '撤销访问权限',

    /* 账户设置：主题 / 新功能 / 字体 / 库 */
    'System theme': '跟随系统主题',
    'Enhance contrast': '增强对比度',
    'When enabled, contrast between text and controls and their backgrounds will be increased': '启用后，文字与控件及其背景之间的对比度将提高',
    'New features': '新功能',
    'Closed captions': '隐藏式字幕',
    'Learn more about captioning here': '在此了解更多关于字幕的信息',
    'Fonts': '字体',
    'Local fonts are currently not enabled. To use them, you’ll need to download Figma’s font installer or desktop app.': '本地字体当前未启用。如需使用，你需要下载 Figma 字体安装程序或桌面应用。',
    "Local fonts are currently not enabled. To use them, you'll need to download Figma's font installer or desktop app.": '本地字体当前未启用。如需使用，你需要下载 Figma 字体安装程序或桌面应用。',
    'Use local fonts': '使用本地字体',
    'Your uploaded fonts': '你上传的字体',
    'Upload fonts for your personal use. These fonts will be available across the files you view or edit.': '上传字体供个人使用。这些字体将适用于你查看或编辑的文件。',
    'Upload font': '上传字体',
    "You haven't uploaded any fonts yet.": '你还没有上传任何字体。',
    'Library': '组件库',
    'Enable libraries for all files in your drafts': '为草稿中的所有文件启用组件库',
    'Enable libraries': '启用组件库',
    'Delete account': '删除账户',

    /* 通知页底部 */
    'Send me occasional emails with updates and promotions from Figma': '偶尔向我发送 Figma 的更新和推广邮件',
    'You can unsubscribe from Figma emails any time. For more information, review our': '你可以随时退订 Figma 邮件。了解更多信息，请查看我们的',
    /* Figma 把这些整句拆成了两个文本节点 */
    'Learn more about captioning': '了解更多关于字幕的信息：',
    'for all files in your drafts': '（适用于草稿中的所有文件）',
    'here': '点此',

    /* —— 第四轮：编辑器菜单/缩放/原型/MCP/文件菜单/协作 —— */
    'Show in exports': '包含在导出中',
    'Prototype settings': '原型设置',
    'No device': '无设备',
    'Background color': '背景颜色',
    'Scroll with parent': '随父级滚动',
    'Apply animation style…': '应用动画样式…',
    'Apply animation style...': '应用动画样式…',
    'Copy link to selection': '复制所选内容的链接',
    'Copy as code': '复制为代码',
    'Paste animation': '粘贴动画',
    'CSS (all layers)': 'CSS（所有图层）',
    'Generate code for Tailwind, React, and more in Dev Mode': '在开发模式中生成 Tailwind、React 等代码',
    'Suggest auto layout': '建议自动布局',
    'Remove all auto layout': '移除所有自动布局',
    'Pixel preview': '像素预览',
    'Outlines': '轮廓',
    'Additional labels': '附加标签',
    'Disabled': '已禁用',
    'Show outlines': '显示轮廓',
    'Include hidden layers': '包含隐藏图层',
    'Include object bounds': '包含对象边界',
    'Spotlight me': '聚焦我',
    'Waiting for followers...': '等待跟随者…',
    'Waiting for followers…': '等待跟随者…',
    'Publish library...': '发布组件库…',
    'Publish library…': '发布组件库…',
    'Export...': '导出…',
    'Export…': '导出…',
    'Create branch...': '创建分支…',
    'Create branch…': '创建分支…',
    'File color profile': '文件颜色配置文件',
    'Move file...': '移动文件…',
    'Move file…': '移动文件…',

    /* Figma MCP 弹窗 */
    'Integrate Figma MCP with third-party agents': '将 Figma MCP 与第三方智能体集成',
    'There are different ways to integrate depending on which agent or tool you use.': '根据你使用的智能体或工具，有不同的集成方式。',
    'Other AI tools': '其他 AI 工具',
    'Install manually': '手动安装',
    'Add with one click:': '一键添加：',
    'Add via a Claude Desktop plugin:': '通过 Claude Desktop 插件添加：',
    'Recommended': '推荐',
    'Open your terminal and run:': '打开终端并运行：',
    'Or, add manually in Claude Desktop settings:': '或在 Claude Desktop 设置中手动添加：',
    'Use the following commands to check MCP settings and manage servers:': '使用以下命令检查 MCP 设置并管理服务器：',
    'List all configured servers': '列出所有已配置的服务器',
    'Other agents': '其他智能体',

    /* —— 第五轮：主菜单各子菜单 / 页面菜单 / 查找 / 导出 / 音频升级 —— */
    /* 文件 */
    'New Design': '新建设计',
    'Place image…': '放置图片…',
    'Place image...': '放置图片…',
    'Save local copy…': '保存本地副本…',
    'Save local copy...': '保存本地副本…',
    'Save to version history…': '保存到版本历史…',
    'Save to version history...': '保存到版本历史…',
    'Export frames to PDF…': '将画板导出为 PDF…',
    'Export frames to PDF...': '将画板导出为 PDF…',
    'Import from Sketch': '从 Sketch 导入',
    'Add starting point': '添加起点',

    /* 编辑 */
    'Copy as': '复制为',
    'Paste over selection': '粘贴并覆盖所选',
    'Find next': '查找下一个',
    'Find previous': '查找上一个',
    'Set default properties': '设置默认属性',
    'Pick color': '取色',
    'Select matching layers': '选择匹配的图层',
    'Select none': '取消选择',
    'Select all with': '全选符合条件的图层',

    /* 视图 */
    'Show slices': '显示切片',
    'Mask outlines': '蒙版轮廓',
    'Frame outlines': '画板轮廓',
    'Memory usage': '内存占用',
    'Minimize left navigation bar': '最小化左侧导航栏',
    'Switch to Draw': '切换到绘图',
    'Switch to Dev Mode': '切换到开发模式',
    'Panels': '面板',
    'Previous page': '上一页',
    'Next page': '下一页',
    'Zoom to previous frame': '缩放到上一个画板',
    'Zoom to next frame': '缩放到下一个画板',
    'Find previous frame': '查找上一个画板',
    'Find next frame': '查找下一个画板',

    /* 对象 */
    'Ungroup selection': '取消编组所选',
    'Wrap in new section': '用新分区包裹',
    'Convert to frame': '转换为画板',
    'Restore default thumbnail': '恢复默认缩略图',
    'Slots': '插槽',
    'Rotate 180˚': '旋转 180°',
    'Rotate 180°': '旋转 180°',
    'Rotate 90˚ left': '左旋 90°',
    'Rotate 90° left': '左旋 90°',
    'Boolean groups': '布尔组',
    'Show/Hide selection': '显示/隐藏所选',
    'Lock/Unlock selection': '锁定/解锁所选',
    'Hide other layers': '隐藏其他图层',
    'Collapse layers': '折叠图层',
    'Swap fill and stroke': '交换填充与描边',
    'Remove interactions': '移除交互',
    'Delete contents': '删除内容',

    /* 排列 */
    'Round to pixel': '对齐到像素',
    'Distribute left': '左分布',
    'Distribute horizontal centers': '水平居中分布',
    'Distribute right': '右分布',
    'Distribute top': '顶部分布',
    'Distribute vertical centers': '垂直居中分布',
    'Distribute bottom': '底部分布',

    /* 矢量 */
    'Join selection': '连接所选',
    'Smooth join selection': '平滑连接所选',
    'Delete and heal selection': '删除并修复所选',
    'Split vector': '拆分矢量',
    'Simplify vector': '简化矢量',
    'Offset vector': '偏移矢量',

    /* 插件 / 小组件 */
    'Run last plugin': '运行上次的插件',
    'Manage widgets…': '管理小组件…',
    'Manage widgets...': '管理小组件…',
    'Select all widgets': '全选所有小组件',

    /* 偏好设置 */
    'Snap to objects': '对齐到对象',
    'Keep tool selected after use': '使用后保持工具选中',
    'Highlight layers on hover': '悬停时高亮图层',
    'Rename duplicated layers': '重命名复制的图层',
    'Show dimensions on objects': '在对象上显示尺寸',
    'Hide canvas UI during changes': '更改时隐藏画布界面',
    'Use smart quotes/symbols': '使用智能引号/符号',
    'Flip objects while resizing': '调整大小时翻转对象',
    'Keyboard zooms into selection': '键盘缩放聚焦所选',
    'Invert zoom direction': '反转缩放方向',
    'Ctrl+click opens right click menus': 'Ctrl+单击打开右键菜单',
    'Use number keys for opacity': '使用数字键设置不透明度',
    'Use old shortcuts for outlines': '使用旧版轮廓快捷键',
    'Use ⌘⌥↑/↓ to rotate layers': '使用 ⌘⌥↑/↓ 旋转图层',
    'Play audio notifications in AI chat': '在 AI 聊天中播放音频通知',
    'Open links in desktop app': '在桌面应用中打开链接',
    'Show Agents on canvas': '在画布上显示智能体',
    'Use scroll wheel zoom': '使用滚轮缩放',
    'Right-click and drag to pan': '右键拖拽平移画布',
    'Color profile…': '颜色配置文件…',
    'Color profile...': '颜色配置文件…',
    'Keyboard layout…': '键盘布局…',
    'Keyboard layout...': '键盘布局…',
    'Accessibility settings…': '无障碍设置…',
    'Accessibility settings...': '无障碍设置…',
    'Permissions and helpers…': '权限与辅助功能…',
    'Permissions and helpers...': '权限与辅助功能…',
    'Nudge amount…': '微调量…',
    'Nudge amount...': '微调量…',

    /* 页面列表右键 */
    'Copy link to page': '复制页面链接',
    'Rename page': '重命名页面',
    'Duplicate page': '创建页面副本',
    'Move up': '上移',
    'Delete page': '删除页面',

    /* 颜色配置文件 */
    'Same as preferred profile (sRGB)': '与首选配置文件相同（sRGB）',
    'Assign to sRGB': '分配到 sRGB',
    'Assign to Display P3': '分配到 Display P3',

    /* 查找栏 */
    'Find...': '查找…',
    'Find…': '查找…',
    'Frame / Group': '画板 / 编组',
    'Image': '图片',
    'Shape': '形状',
    'Match case': '区分大小写',
    'Whole words': '全字匹配',

    /* 导出 */
    'Export frames to PDF': '将画板导出为 PDF',
    'Color profile': '颜色配置文件',
    'sRGB (same as file)': 'sRGB（与文件相同）',
    'Quality': '质量',
    'No selected layers have export settings. Click + in the export section of the properties panel to add one.': '所选图层没有导出设置。点击属性面板导出区域中的 + 添加。',

    /* 音频升级弹窗 */
    'Talk it through with audio': '用语音沟通',
    'Upgrade to have quick, easy conversations—right from your file.': '升级后即可直接在文件中进行快速便捷的对话。',
    'Text comments': '文本评论',
    '3 Figma Design files and 1 folder': '3 个 Figma Design 文件和 1 个文件夹',
    '3 pages per Figma Design file': '每个 Figma Design 文件 3 个页面',
    'Audio conversations': '语音对话',
    'Unlimited pages in Figma Design files': 'Figma Design 文件中的无限页面',
    'See all features →': '查看全部功能 →',
    'Copy as text': '复制为文本',
    'Copy as animated SVG': '复制为动态 SVG',
    /* 嵌套子菜单 */
    'Unlock aspect ratio': '解锁宽高比',
    'Set width to hug contents': '设置宽度为适应内容',
    'Set height to hug contents': '设置高度为适应内容',
    'Set width to fill container': '设置宽度为填充容器',
    'Set height to fill container': '设置高度为填充容器',
    'Convert to slot': '转换为插槽',
    'Wrap in new slot': '用新插槽包裹',
    'Reset slot': '重置插槽',
    'Push changes to main component': '推送更改到主组件',
    'Restore main component': '恢复主组件',
    'Union': '合并',
    'Subtract': '减去',
    'Intersect': '相交',
    'Exclude': '排除',
    'Figma Design & Sites': 'Figma Design 与 Sites',

    /* —— 第六轮：工作区/排序/2FA/令牌/分享/视图 —— */
    'View members': '查看成员',
    'View settings': '查看设置',
    'Change icon': '更改图标',
    'Delete...': '删除…',
    'Delete…': '删除…',
    'Alphabetical': '按字母顺序',
    'Order': '顺序',
    'Oldest first': '最早优先',
    'Newest first': '最新优先',
    'Upgrade to create more folders': '升级以创建更多文件夹',
    'Unlimited on the Professional plan': '专业版中无限',

    /* 双重验证 / 密码 */
    'Set up two-factor authentication': '设置双重验证',
    'For security purposes, please re-enter your password below.': '为了安全起见，请在下方重新输入密码。',
    'Current password': '当前密码',
    'New password': '新密码',
    'Confirm password': '确认密码',
    'Forgot password?': '忘记密码？',
    'We sent an email to': '我们已向',
    'with instructions to reset your password!': '发送邮件，内含重置密码的说明！',

    /* 个人访问令牌 */
    'A personal access token gives you access to the Figma API as if you were a single user.': '个人访问令牌让你能以单一用户身份访问 Figma API。',
    'Token name': '令牌名称',
    'Expiration': '过期时间',
    'Scopes': '权限范围',
    'Users': '用户',
    "Read the current user's name, email, and profile image": '读取当前用户的姓名、邮箱和个人资料图片',
    'Read comments in accessible files': '读取可访问文件中的评论',
    'Create, modify, and delete comments in accessible files': '在可访问文件中创建、修改和删除评论',
    'Read the contents of and render images from files': '读取文件内容并渲染文件中的图片',
    'Read metadata of files': '读取文件的元数据',
    'Read version history of files': '读取文件的版本历史',
    'Design systems': '设计系统',
    'Read data about individual components and styles': '读取单个组件和样式的数据',
    'Read components and styles published from individual files': '读取从单个文件发布的组件和样式',
    'Read components and styles published in team libraries': '读取团队库中发布的组件和样式',
    'Development': '开发',
    'Read and list dev resources in accessible files': '读取并列出可访问文件中的开发资源',
    'Create and modify dev resources in accessible files': '在可访问文件中创建和修改开发资源',
    'Generate token': '生成令牌',

    /* 分享 / 协作 / 创建菜单 / 视图 */
    'Share this board': '分享此画板',
    'To invite people to edit, move this draft into your folders.': '要邀请他人编辑，请将此草稿移动到你的文件夹中。',
    'Move file': '移动文件',
    'Anyone': '任何人',
    'Start open session': '开启开放会话',
    'Anyone can edit—no account required. Sessions end automatically after 24 hours.': '任何人都可以编辑——无需账户。会话将在 24 小时后自动结束。',
    'Start': '开始',
    'Create Figma Slides outline': '创建 Figma Slides 大纲',
    'Get everyone to follow you': '让大家跟随你',
    'New FigJam': '新建 FigJam',
    'Import...': '导入…',
    'Export as...': '导出为…',
    'Show dot grid': '显示点状网格',
    'Resource use': '资源使用',
    'Unlock all objects': '解锁所有对象',
    'Snap to geometry enabled': '已启用对齐到几何',
    'Snap to objects enabled': '已启用对齐到对象',
    'Snap to pixel grid enabled': '已启用对齐到像素网格',
    'Pixel grid visible': '像素网格可见',
    'Pixel grid hidden': '像素网格隐藏',

    /* —— 第七轮：组件库 / 变量 / 渐变 / 效果 / AI 智能体 / 离线条 —— */
    'All libraries': '所有组件库',
    'Search all libraries': '搜索所有组件库',
    'Add more libraries': '添加更多组件库',
    'Variable': '变量',
    'Value': '值',
    'Create variable': '创建变量',
    'Gradient': '渐变',
    'Stops': '色标',
    'Noise': '噪点',
    'Texture': '纹理',
    'Glass': '玻璃',
    'Shader': '着色器',
    'New chat': '新对话',
    'Shared': '共享',
    "What's next?": '接下来做什么？',
    'Tidy and polish': '整理与润色',
    'Generate designs': '生成设计',
    'Build with code': '用代码构建',
    'Create plugins and shaders': '创建插件和着色器',
    'Ask for changes': '请求修改',
    'Changes you made to': '你在离线时对',
    "while offline haven't synced yet.": '所做的更改尚未同步。',
    'Open to sync': '打开以同步',
    'Later': '稍后',
    'Libraries and settings': '组件库与设置',
    'Stroke weight': '描边粗细',
    'Connection issue affecting saving. Click for details.': '保存受到影响。点击查看详情。',
    'Add stroke fill': '添加描边填充',
    'Linear gradient': '线性渐变',
    'Stroke align': '描边对齐',
    'Advanced stroke settings': '高级描边设置',
    'Individual strokes': '单独描边',
    'Layout guide settings': '布局参考线设置',
    'Layout guide type': '布局参考线类型',
    'Remove layout guide': '移除布局参考线',
    'More options': '更多选项',
    'What’s next?': '接下来做什么？',
    'The button action for this text area changes between Send and Stop as the agent works.': '此文本区域的按钮操作会随智能体工作状态在“发送”和“停止”之间切换。',
    'Add context': '添加上下文',
    'Dictate': '语音输入',
    'Microphone access required': '需要麦克风权限',
    'To use voice input, you need to allow Figma to access your microphone.': '若要使用语音输入，你需要允许 Figma 访问你的麦克风。',
    'To enable microphone access:': '启用麦克风权限的方法：',
    'Click the lock or settings icon in your browser’s address bar': '点击浏览器地址栏中的锁形或设置图标',
    'Find the microphone permission and change it to "Allow"': '找到麦克风权限并将其改为“允许”',
    'Reload the page and try again': '重新加载页面后重试',
    'Chat history': '聊天记录',
    'Today': '今天',
    'Not started': '未开始',
    'Fill in missing states': '补全缺失状态',
    'Add variations': '添加变体',
    'Extend flow': '扩展流程',
    'Improve roughest screen': '优化最粗糙的页面',
    'Summarize page': '总结页面',
    'Search all tools': '搜索所有工具',
    'Clear search': '清除搜索',
    'Filter by price and type': '按价格和类型筛选',
    'Filter by source': '按来源筛选', 'Source': '来源',
    'Filter by category': '按类别筛选', 'Category': '类别',
    'Filter by category': '按类别筛选',
    'No tools found': '未找到工具',
    'No results found': '未找到结果',
    'All sources': '所有来源',
    'From Figma': '来自 Figma',
    'Created by you': '你创建的',
    'Content generation': '内容生成',
    'Shaders': '着色器',
    'Styling': '样式',
    'Editing': '编辑',
    'Format & resize': '格式与尺寸',
    'Fun & creative': '趣味与创意',
    'Product & brand': '产品与品牌',
    'Prototyping & animation': '原型与动画',
    'File organization': '文件管理',
    'Import & export': '导入与导出',
    'Accessibility tools': '无障碍工具',
    'Hide panel': '隐藏面板',
    'Variable collections': '变量集合',
    'Collections': '集合',
    'Collections options': '集合选项',
    'Create collection': '创建集合',
    'Minimize': '最小化',
    'No variables created in this file': '此文件中尚未创建变量',
    'Save colors, numbers, text, and states to reuse them in styles, prototypes, and across files.': '保存颜色、数字、文本和状态，以便在样式、原型和跨文件中复用。',
    'Ex: "circle with a ? icon"': '例如：“带 ? 图标的圆形”',
  };

  // 建索引：精确 + 小写（应对 Figma 里首字母大写/全大写混用）
  const DICT = new Map();
  const LOWER = new Map();
  for (const k of Object.keys(RAW_DICT)) {
    const v = RAW_DICT[k];
    if (DICT.has(k)) continue;
    DICT.set(k, v);
    const lk = k.toLowerCase();
    if (!LOWER.has(lk)) LOWER.set(lk, v);
  }

  function dictGet(s) {
    if (s == null) return null;
    let v = DICT.get(s);
    if (v == null) v = LOWER.get(s.toLowerCase());
    return v == null ? null : v;
  }

  const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

  /* ============================================================
   * 三、带变量的句式（正则规则）
   * ============================================================ */
  // Figma 自动生成的默认命名（Frame 1 / Rectangle 2…）也属于界面文案
  const DEFAULT_NAME_RE = /^(Page|Frame|Group|Section|Slice|Component Set|Component|Instance|Rectangle|Ellipse|Line|Arrow|Polygon|Star|Vector|Text|Boolean Operation)\s+\d+$/i;

  const RULES = [
    [/^(Page|Frame|Group|Section|Slice|Component Set|Component|Instance|Rectangle|Ellipse|Line|Arrow|Polygon|Star|Vector|Text|Boolean Operation)\s+(\d+)$/i, (m) => `${dictGet(m[1]) || m[1]} ${m[2]}`],
    [/^Zoom to (\d+)%$/i, (m) => `缩放到 ${m[1]}%`],
    [/^(\d+) of (\d+) selected$/i, (m) => `已选 ${m[1]} / 共 ${m[2]}`],
    [/^This token will expire on (.+)\.$/i, (m) => `此令牌将于 ${m[1]} 过期。`],
    [/^(\d+)\s+components?$/i, (m) => `${m[1]} 个组件`],
    [/^Grid (\d+px)$/i, (m) => `网格 ${m[1]}`],
    [/^(\d+)\s+selected$/i, (m) => `已选中 ${m[1]} 项`],
    [/^(\d+)\s+items?\s+selected$/i, (m) => `已选中 ${m[1]} 项`],
    [/^(\d+)\s+layers?$/i, (m) => `${m[1]} 个图层`],
    [/^(\d+)\s+items?$/i, (m) => `${m[1]} 项`],
    [/^(\d+)\s+comments?$/i, (m) => `${m[1]} 条评论`],
    [/^(\d+)\s+results?$/i, (m) => `${m[1]} 个结果`],
    [/^(\d+)\s+files?$/i, (m) => `${m[1]} 个文件`],
    [/^(\d+)\s+pages?$/i, (m) => `${m[1]} 个页面`],
    [/^(\d+)\s+(people|members?)$/i, (m) => `${m[1]} 位成员`],
    [/^(\d+)\s+projects?$/i, (m) => `${m[1]} 个项目`],
    // 说明：「Frame 12」「Page 3」这类默认命名既可能是 UI、也可能是用户图层/页面名，
    // 为避免误改用户内容，这里不按模式翻译，交给图层树跳过逻辑处理。
    [/^Showing\s+(\d+)\s+of\s+(\d+)$/i, (m) => `显示 ${m[1]} / 共 ${m[2]}`],
    [/^(\d+)\s+of\s+(\d+)$/i, (m) => `${m[1]} / ${m[2]}`],
    [/^Last edited\s+(.+)$/i, (m) => `最近编辑于 ${m[1]}`],
    [/^Edited\s+(.+)$/i, (m) => `编辑于 ${m[1]}`],
    /* 相对时间（Figma 会拆成 "Edited" + "12 days ago" 两个节点） */
    [/^(\d+)\s+seconds?\s+ago$/i, (m) => `${m[1]} 秒前`],
    [/^(\d+)\s+minutes?\s+ago$/i, (m) => `${m[1]} 分钟前`],
    [/^(\d+)\s+hours?\s+ago$/i, (m) => `${m[1]} 小时前`],
    [/^(\d+)\s+days?\s+ago$/i, (m) => `${m[1]} 天前`],
    [/^(\d+)\s+weeks?\s+ago$/i, (m) => `${m[1]} 周前`],
    [/^(\d+)\s+months?\s+ago$/i, (m) => `${m[1]} 个月前`],
    [/^(\d+)\s+years?\s+ago$/i, (m) => `${m[1]} 年前`],
    [/^Just now$/i, () => '刚刚'],
    [/^Yesterday$/i, () => '昨天'],
    /* 其余动态文案 */
    [/^Figma Design,\s*(\d+)\s+items?\s+selected$/i, (m) => `Figma Design，已选中 ${m[1]} 项`],
    [/^(\d+)%,\s*zoom and view options$/i, (m) => `${m[1]}%，缩放与视图选项`],
    [/^Solid color hex:\s*(.+)$/i, (m) => `纯色 Hex：${m[1]}`],
    [/^Plan:\s*(.+)$/i, (m) => `套餐：${m[1]}`],
    [/^Change plan\.\s*(.+)\s+currently on\s+(.+)\s+plan$/i, (m) => `更改套餐。${m[1]} 当前为${dictGet(m[2]) || m[2]}套餐`],
    [/^Account dropdown for\s+(.+)$/i, (m) => `${m[1]} 的账户菜单`],
    [/^People from\s+(.+)$/i, (m) => `${m[1]} 的成员`],
    [/^Anyone in\s+(.+?)[’']?s team$/i, (m) => `${m[1]} 团队中的所有人`],
    [/^(\d+)\s+connections?$/i, (m) => `${m[1]} 个连接`],
    [/^(.+),\s*file name$/i, (m) => `${m[1]}，文件名`],
    [/^(.+),\s*Design file$/i, (m) => `${m[1]}，设计文件`],
    [/^(.+),\s*FigJam file$/i, (m) => `${m[1]}，FigJam 文件`],
    [/^(.+),\s*Slides file$/i, (m) => `${m[1]}，幻灯片文件`],
    [/^(Fill|Stroke|Effects|Layout guide),\s*Apply styles( and variables)?$/i, (m) => `${dictGet(m[1]) || m[1]}，应用样式${m[2] ? '和变量' : ''}`],
    [/^Use auto layout$/i, () => '使用自动布局'],
    [/^X-position$/i, () => 'X 位置'],
    [/^Y-position$/i, () => 'Y 位置'],
    /* 排序 / 步骤 / 颜色 / 额度 */
    [/^Sort by column:\s*(.+)$/i, (m) => `按列排序：${dictGet(m[1]) || m[1]}`],
    [/^Step (\d+) of (\d+)$/i, (m) => `第 ${m[1]} 步，共 ${m[2]} 步`],
    [/^Folder icon color:\s*(.+)$/i, (m) => `文件夹图标颜色：${dictGet(m[1]) || m[1]}`],
    [/^(\d+)\/(\d+) monthly$/i, (m) => `${m[1]}/${m[2]} 每月`],
    [/^(\d+)\/(\d+) daily credits used$/i, (m) => `已用 ${m[1]}/${m[2]} 每日额度`],
    [/^(\d+) available$/i, (m) => `可用 ${m[1]}`],
    [/^Resets\s+(.+)$/i, (m) => `重置于 ${m[1]}`],
    [/^(\d+) files total across Design and Sites$/i, (m) => `Design 和 Sites 中共 ${m[1]} 个文件`],
    [/^Products included in (.+) seat$/i, (m) => `${dictGet(m[1]) || m[1]}席位包含的产品`],
    [/^(.+?) seat:\s*(\$[\d.,]+) per month$/i, (m) => `${dictGet(m[1]) || m[1]}席位：每月 ${m[2]}`],
    [/^View profile for\s+(.+?)(?:,\s*(.+))?$/i, (m) => `查看 ${m[1]} 的个人资料${m[2] ? '，' + m[2] : ''}`],
    [/^([\d.]+)k users$/i, (m) => `${(parseFloat(m[1]) / 10).toFixed(1).replace(/\.0$/, '')} 万用户`],
  ];

  /* ============================================================
   * 四、翻译一个字符串（含首尾空白保留）
   * ============================================================ */
  function translateString(raw) {
    if (typeof raw !== 'string') return null;
    const lead = (raw.match(/^\s*/) || [''])[0];
    const trail = (raw.match(/\s*$/) || [''])[0];
    const core = raw.slice(lead.length, raw.length - trail.length);
    if (!core) return null;
    if (CJK_RE.test(core)) return null;          // 已经是中文，不重复处理

    const direct = dictGet(core);
    if (direct != null) return lead + direct + trail;

    for (let i = 0; i < RULES.length; i++) {
      const m = core.match(RULES[i][0]);
      if (m) {
        const out = RULES[i][1](m, core);
        if (out && out !== core) return lead + out + trail;
      }
    }

    // "Move tool — V" / "Rectangle – R"：只翻破折号左边的名字
    const sm = core.match(/^(.+?)\s*[—–]\s*([\s\S]+)$/);
    if (sm) {
      const left = dictGet(sm[1].trim());
      if (left) return lead + left + ' — ' + sm[2] + trail;
    }
    return null;
  }

  /* ============================================================
   * 五、DOM 扫描 / 状态记录
   * ============================================================ */
  const textOut = new WeakMap();        // Text -> 上次写入值（防自循环）
  const textOriginal = new WeakMap();   // Text -> 原始英文（用于还原）
  const attrOut = new WeakMap();        // Element -> Map<attr, 上次写入值>
  const attrOriginal = new WeakMap();   // Element -> Map<attr, 原始英文>
  const onlineTriedText = new WeakSet();
  const onlineTriedAttr = new WeakMap();

  const ATTRS = ['placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'data-tooltip'];
  const ONLINE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'data-tooltip']);
  const VALUE_HOSTS = /^(BUTTON|INPUT|OPTION)$/;

  // 完全跳过（连属性也不处理）：脚本/样式/代码/画布/可编辑区等
  const HARD_SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'textarea', 'code', 'pre', 'kbd', 'samp', 'var',
    'canvas', 'svg', 'math', 'iframe', 'object', 'template',
    '[contenteditable="true"]', '[contenteditable=""]', '[contenteditable="plaintext-only"]',
    '[data-figma-zh-skip]', '#figma-zh-toast',
  ].join(',');

  // 这些区域里的「文字」是用户内容（图层名 / 页面名）：只翻属性（aria-label、tooltip），不翻文本
  const USER_TEXT_SELECTOR = '[role="tree"],[role="treeitem"],[role="treegrid"]';

  function shouldSkipEl(el) {
    if (!el || el.nodeType !== 1) return false;
    try { if (el.closest(HARD_SKIP_SELECTOR)) return true; } catch (e) {}
    return false;
  }

  // 图层树里少数「本来就是界面文字」的标签（不是图层名），允许翻译
  const TREE_UI_ALLOW = new Set([
    'Toggle layer locking', 'Toggle layer visibility', 'Toggle layer selection',
  ]);

  function isUserTextNode(node) {
    const p = node.parentElement;
    if (!p) return false;
    try {
      if (!p.closest(USER_TEXT_SELECTOR)) return false;
      const s = (node.data || '').trim();
      if (TREE_UI_ALLOW.has(s)) return false;
      if (DEFAULT_NAME_RE.test(s)) return false; // 默认命名允许翻译
      return true;
    } catch (e) { return false; }
  }

  function looksEnglish(s) {
    if (!s) return false;
    if (CJK_RE.test(s)) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    // 至少含一个「像单词」的片段，过滤 "1x"、"16:9" 之类
    return /[A-Za-z]{2,}/.test(s);
  }

  function isUiHost(el) {
    if (!el) return false;
    try {
      return !!el.closest(
        'button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],' +
        '[role="tooltip"],label,summary,[role="menuitemcheckbox"],[role="menuitemradio"]'
      );
    } catch (e) { return false; }
  }

  /* ---------- 文本节点 ---------- */
  function processTextNode(node) {
    const raw = node.data;
    if (!raw || !raw.trim()) return;
    if (isUserTextNode(node)) return;
    if (textOut.get(node) === raw) return;

    const zh = translateString(raw);
    if (zh != null && zh !== raw) {
      if (!textOriginal.has(node)) textOriginal.set(node, raw);
      try { node.data = zh; } catch (e) { return; }
      textOut.set(node, zh);
      stats.offline++;
      return;
    }

    textOut.set(node, raw);

    // 在线补译：仅对交互控件里的短文本兜底
    if (CFG.online && !onlineTriedText.has(node) && looksEnglish(raw.trim())) {
      const core = raw.trim();
      const parent = node.parentElement;
      if (core.length >= 2 && core.length <= CFG.maxTextLen && isUiHost(parent)) {
        onlineTriedText.add(node);
        requestOnline(core, (out) => {
          if (!node.isConnected) return;
          if (node.data.trim() !== core) return;
          if (!textOriginal.has(node)) textOriginal.set(node, node.data);
          try { node.data = out; } catch (e) { return; }
          textOut.set(node, out);
          stats.online++;
        });
      }
    }
  }

  /* ---------- 属性（placeholder / title / aria-label ...） ---------- */
  function handleAttr(el, attr) {
    let val;
    try { val = el.getAttribute(attr); } catch (e) { return; }
    if (val == null || !val.trim()) return;

    let outMap = attrOut.get(el);
    if (!outMap) { outMap = new Map(); attrOut.set(el, outMap); }
    if (outMap.get(attr) === val) return;

    const zh = translateString(val);
    if (zh != null && zh !== val) {
      let origMap = attrOriginal.get(el);
      if (!origMap) { origMap = new Map(); attrOriginal.set(el, origMap); }
      if (!origMap.has(attr)) origMap.set(attr, val);
      try { el.setAttribute(attr, zh); } catch (e) { return; }
      outMap.set(attr, zh);
      stats.offline++;
      return;
    }

    outMap.set(attr, val);

    if (CFG.online && ONLINE_ATTRS.has(attr) && looksEnglish(val)) {
      const core = val.trim();
      if (core.length >= 2 && core.length <= CFG.maxTextLen) {
        let tried = onlineTriedAttr.get(el);
        if (!tried) { tried = new Set(); onlineTriedAttr.set(el, tried); }
        if (!tried.has(attr)) {
          tried.add(attr);
          requestOnline(core, (out) => {
            if (!el.isConnected) return;
            try { if (el.getAttribute(attr) !== val) return; } catch (e) { return; }
            let om = attrOriginal.get(el);
            if (!om) { om = new Map(); attrOriginal.set(el, om); }
            if (!om.has(attr)) om.set(attr, val);
            try { el.setAttribute(attr, out); } catch (e) { return; }
            const map = attrOut.get(el);
            if (map) map.set(attr, out);
            stats.online++;
          });
        }
      }
    }
  }

  function processAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    for (let i = 0; i < ATTRS.length; i++) handleAttr(el, ATTRS[i]);
    // 按钮类 input 的可见文字在 value 上
    const tag = el.tagName;
    if (VALUE_HOSTS.test(tag)) {
      const type = tag === 'INPUT' ? (el.getAttribute('type') || '').toLowerCase() : '';
      if (tag !== 'INPUT' || type === 'button' || type === 'submit' || type === 'reset') {
        handleAttr(el, 'value');
      }
    }
  }

  /* ---------- 遍历（含开放的 Shadow DOM，比如客服组件） ---------- */
  const observedShadowRoots = new WeakSet();

  function observeShadowRoot(root) {
    if (!root || observedShadowRoots.has(root)) return;
    try {
      mo.observe(root, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS.concat(['value']),
      });
      observedShadowRoots.add(root);
    } catch (e) {}
  }

  function pushChildren(node, stack) {
    for (let c = node.lastChild; c; c = c.previousSibling) stack.push(c);
    if (node.shadowRoot) {
      observeShadowRoot(node.shadowRoot);
      for (let c = node.shadowRoot.lastChild; c; c = c.previousSibling) stack.push(c);
    }
  }

  function walk(root) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeType === 3) { processTextNode(n); continue; }
      if (n.nodeType !== 1) continue;
      if (shouldSkipEl(n)) continue;
      processAttrs(n);
      pushChildren(n, stack);
    }
  }

  function scan(root) {
    if (!enabled) return;
    if (!root || !root.isConnected) return;
    try { walk(root); } catch (e) { console.warn('[Figma中文化] 扫描出错：', e); }
  }

  /* ---------- 还原 ---------- */
  function revertTree(root) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeType === 3) {
        const orig = textOriginal.get(n);
        if (orig != null) {
          textOut.delete(n);
          try { if (n.data !== orig) n.data = orig; } catch (e) {}
        }
        continue;
      }
      if (n.nodeType !== 1) continue;
      const om = attrOriginal.get(n);
      if (om) {
        const out = attrOut.get(n);
        om.forEach((orig, attr) => {
          if (out) out.delete(attr);
          try { if (n.getAttribute(attr) !== orig) n.setAttribute(attr, orig); } catch (e) {}
        });
      }
      pushChildren(n, stack);
    }
  }

  /* ============================================================
   * 六、增量监听
   * ============================================================ */
  const dirtyRoots = new Set();
  let dirtyTimer = null;

  function markDirty(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return;
    dirtyRoots.add(el);
    if (dirtyTimer) return;
    dirtyTimer = setTimeout(() => {
      dirtyTimer = null;
      const roots = Array.from(dirtyRoots);
      dirtyRoots.clear();
      if (!enabled) return;
      for (const r of roots) if (r.isConnected) scan(r);
    }, CFG.debounceMs);
  }

  const mo = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const mu of mutations) {
      if (mu.type === 'childList') {
        mu.addedNodes.forEach((n) => {
          if (n.nodeType === 1) markDirty(n);
          else if (n.nodeType === 3 && n.parentElement) markDirty(n.parentElement);
        });
      } else if (mu.type === 'characterData') {
        // 我们写入的值会被记录在 textOut；若对不上说明是外部（Figma）改了文字
        if (textOut.get(mu.target) !== mu.target.data) {
          textOut.delete(mu.target);
          if (mu.target.parentElement) markDirty(mu.target.parentElement);
        }
      } else if (mu.type === 'attributes') {
        const out = attrOut.get(mu.target);
        let cur = null;
        try { cur = mu.target.getAttribute(mu.attributeName); } catch (e) {}
        if (!out || out.get(mu.attributeName) !== cur) {
          if (out) out.delete(mu.attributeName);
          markDirty(mu.target);
        }
      }
    }
  });

  function startObserver() {
    if (!document.body) return;
    mo.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(['value']),
    });
  }

  /* ============================================================
   * 七、在线补译（可选，默认关；只补交互控件的短文本）
   * ============================================================ */
  const onlineQueue = [];
  const onlineCache = new Map();
  let onlineBusy = false;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('no GM_xmlhttpRequest'));
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 9000,
        onload: (r) => resolve(r.responseText),
        onerror: () => reject(new Error('net error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  async function googleOne(text) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' +
      encodeURIComponent(text);
    const data = JSON.parse(await gmGet(url));
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const out = data[0].map((x) => (x && x[0]) || '').join('');
      if (out && CJK_RE.test(out)) return out;
    }
    return null;
  }

  async function myMemoryOne(text) {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|zh-CN';
    const data = JSON.parse(await gmGet(url));
    const out = data && data.responseData && data.responseData.translatedText;
    if (out && !/MYMEMORY WARNING/i.test(out) && CJK_RE.test(out)) return out;
    return null;
  }

  function requestOnline(text, apply) {
    if (onlineCache.has(text)) {
      const v = onlineCache.get(text);
      if (v) { try { apply(v); } catch (e) {} }
      return;
    }
    onlineQueue.push({ text, apply });
    if (!onlineBusy) drainOnline();
  }

  async function drainOnline() {
    onlineBusy = true;
    try {
      while (onlineQueue.length) {
        const job = onlineQueue.shift();
        let out = null;
        try { out = await googleOne(job.text); } catch (e) {}
        if (!out) { try { out = await myMemoryOne(job.text); } catch (e) {} }
        if (out) {
          onlineCache.set(job.text, out);
          try { job.apply(out); } catch (e) {}
        } else {
          onlineCache.set(job.text, null);
        }
        await sleep(CFG.onlineDelay);
      }
    } finally { onlineBusy = false; }
  }

  /* ============================================================
   * 八、开关 & 提示条
   * ============================================================ */
  let toastEl = null, toastTimer = null;

  function injectStyle() {
    const css =
      '#figma-zh-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(12px);' +
      'background:rgba(28,28,30,.94);color:#fff;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",' +
      '"PingFang SC","Microsoft YaHei",sans-serif;padding:9px 16px;border-radius:10px;z-index:2147483647;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .22s,transform .22s;' +
      'max-width:72vw;text-align:center}' +
      '#figma-zh-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}';
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function toast(msg) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'figma-zh-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.classList.remove('show'); }, 2200);
  }

  function setEnabled(v) {
    enabled = !!v;
    store.set(KEY_ENABLED, enabled);
    if (enabled) {
      scan(document.body);
      toast('已开启 Figma 中文汉化');
    } else {
      revertTree(document.body);
      toast('已关闭汉化，界面已还原英文（刷新页面更彻底）');
    }
  }

  function setOnline(v) {
    CFG.online = !!v;
    store.set(KEY_ONLINE, CFG.online);
    if (CFG.online) scan(document.body);
    toast(CFG.online ? '在线补译：开（仅补按钮/菜单短文本）' : '在线补译：关');
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    const v = 'v1.5.0';
    GM_registerMenuCommand('① 开启/关闭汉化（当前：' + (enabled ? '开' : '关') + '） · ' + v, () => {
      setEnabled(!enabled);
    });
    GM_registerMenuCommand('② 立即重新扫描当前页', () => {
      scan(document.body);
      toast('已重新扫描并翻译当前页面');
    });
    GM_registerMenuCommand('③ 在线补译开关（当前：' + (CFG.online ? '开' : '关') + '）', () => {
      setOnline(!CFG.online);
    });
    GM_registerMenuCommand('④ 查看翻译统计', () => {
      alert('Figma 中文化 ' + v + '\n\n离线词表命中：' + stats.offline +
        ' 次\n在线补译：' + stats.online + ' 次\n在线补译开关：' + (CFG.online ? '开' : '关') +
        '\n\n提示：在线补译默认关闭，开启后可补充词表没收录的新界面词。');
    });
    GM_registerMenuCommand('⑤ 关于 / 使用说明', () => {
      alert('Figma 中文化 ' + v + '\n\n' +
        '· 只翻译 Figma 界面文字，不改动画布里的设计内容和你的图层/文件名。\n' +
        '· 支持工具栏、菜单、右键菜单、属性面板、原型/开发模式、分享弹窗、文件浏览器等。\n' +
        '· 快捷键 Ctrl+Alt+Z：快速开/关。\n' +
        '· 词表没覆盖到的新词可开启「在线补译」兜底。');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'z' || e.key === 'Z')) {
      const t = e.target;
      const typing = t && (t.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
      if (typing) return;
      e.preventDefault();
      setEnabled(!enabled);
    }
  }, true);

  /* ============================================================
   * 对外 API（供扩展 popup / 调试调用；油猴下也暴露，方便自动化）
   * ============================================================ */
  try {
    window.__FIGMA_ZH_API__ = {
      get enabled() { return enabled; },
      get stats() { return stats; },
      dictionarySize: DICT.size,
      setEnabled: setEnabled,
      toggle: function () { setEnabled(!enabled); },
      rescan: function () { scan(document.body); },
      translateString: translateString,
    };
  } catch (e) {}

  /* ============================================================
   * 九、启动
   * ============================================================ */
  function boot() {
    injectStyle();
    registerMenu();
    startObserver();
    scan(document.body);
    // 首屏异步渲染补齐
    setTimeout(() => scan(document.body), 700);
    setTimeout(() => scan(document.body), 2200);

    // 兜底全量重扫（应对个别未触发 Mutation 的替换）
    setInterval(() => {
      if (enabled && document.visibilityState === 'visible') scan(document.body);
    }, CFG.rescanMs);

    // 单页应用路由切换
    window.addEventListener('popstate', () => setTimeout(() => scan(document.body), 300));
    window.addEventListener('focus', () => { if (enabled) scan(document.body); });

    console.log('%c[Figma中文化] 已加载 ' + 'v1.5.0' + '（' + (enabled ? '已开启' : '已关闭') + '）',
      'color:#0d99ff;font-weight:bold');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
