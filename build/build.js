#!/usr/bin/env node
/* Figma 中文化 构建脚本：一套核心，两个外壳
 *  - dist/figma-zh.user.js       油猴脚本（开发/高级用户）
 *  - dist/extension/             MV3 浏览器扩展（主发布渠道）
 * 源文件：根目录 figma-zh.user.js（当前唯一真源）
 * 环境变量：FIGMA_ZH_BASE_URL 可选，用于生成 @updateURL/@downloadURL
 *  例：FIGMA_ZH_BASE_URL=https://raw.githubusercontent.com/<you>/<repo>/main/dist
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// 图标是二进制，仓库只存 base64 生成器；构建前确保存在
try {
  const iconDir = path.join(root, 'extension/icons');
  if (!fs.existsSync(path.join(iconDir, '128.png'))) {
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js')], { stdio: 'inherit' });
  }
} catch (e) { console.warn('⚠️ 图标生成失败：', e.message); }
const srcPath = path.join(root, 'figma-zh.user.js');
const distDir = path.join(root, 'dist');
const extDir = path.join(distDir, 'extension');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }
function copy(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }

let src = read(srcPath);
const officialPath = path.join(root, 'data/official-zh.json');
if (fs.existsSync(officialPath)) {
  const official = read(officialPath);
  if (!src.includes('const OFFICIAL_DICT =')) {
    src = src.replace('  const RAW_DICT = {', '  const OFFICIAL_DICT = ' + official + ';\n  const RAW_DICT = {');
    src = src.replace('  for (const k of Object.keys(RAW_DICT)) {', '  const MERGED = Object.assign({}, OFFICIAL_DICT, RAW_DICT);\n  for (const k of Object.keys(MERGED)) {');
    src = src.replace('    const v = RAW_DICT[k];', '    const v = MERGED[k];');
  }
}
const start = src.indexOf('// ==UserScript==');
const endMarker = '// ==/UserScript==';
const end = src.indexOf(endMarker);
if (start < 0 || end < 0) throw new Error('未找到 UserScript 头');
const header = src.slice(start, end + endMarker.length);
const body = src.slice(end + endMarker.length).replace(/^\s+/, '');
const version = (header.match(/@version\s+([^\s]+)/) || [])[1] || '0.0.0';

// 1) dist 油猴脚本：头部（可选加 updateURL/downloadURL）
let outHeader = header;
const base = (process.env.FIGMA_ZH_BASE_URL || '').replace(/\/$/, '');
if (base) {
  const extra = [];
  if (!/@updateURL/.test(outHeader)) extra.push('// @updateURL    ' + base + '/figma-zh.user.js');
  if (!/@downloadURL/.test(outHeader)) extra.push('// @downloadURL  ' + base + '/figma-zh.user.js');
  if (extra.length) outHeader = outHeader.replace('// ==/UserScript==', extra.join('\n') + '\n// ==/UserScript==');
}
write(path.join(distDir, 'figma-zh.user.js'), outHeader + '\n\n' + body);

// 2) 扩展 content script：共用同一份引擎 + 消息桥
const bridge = `
/* ---- extension bridge (only active when running as extension) ---- */
(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
  function api() { return window.__FIGMA_ZH_API__ || null; }
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var a = api();
    if (!a) { sendResponse({ ok: false, error: 'engine-not-ready' }); return; }
    if (msg && msg.type === 'FIGMA_ZH_GET') {
      sendResponse({ ok: true, enabled: a.enabled, stats: a.stats, dictionarySize: a.dictionarySize });
      return;
    }
    if (msg && msg.type === 'FIGMA_ZH_SET') {
      a.setEnabled(!!msg.enabled);
      sendResponse({ ok: true, enabled: a.enabled });
      return;
    }
    if (msg && msg.type === 'FIGMA_ZH_RESCAN') {
      a.rescan();
      sendResponse({ ok: true });
      return;
    }
  });
})();
`;
write(path.join(extDir, 'content.js'), body + '\n' + bridge);

// 2.5) 导出纯词表 JSON，方便做翻译/校对工具
const dm = src.match(/const RAW_DICT = \{([\s\S]*?)\n  \};/);
if (dm) {
  try {
    const dict = Function('return ({' + dm[1] + '\n})')();
    write(path.join(distDir, 'dict.zh.json'), JSON.stringify(dict, null, 2));
  } catch (e) { console.warn('⚠️ 词表 JSON 导出失败：', e.message); }
}

// 3) 扩展静态文件
copy(path.join(root, 'extension/manifest.json'), path.join(extDir, 'manifest.json'));
copy(path.join(root, 'extension/popup.html'), path.join(extDir, 'popup.html'));
copy(path.join(root, 'extension/popup.js'), path.join(extDir, 'popup.js'));
for (const size of [16, 32, 48, 128]) {
  copy(path.join(root, `extension/icons/${size}.png`), path.join(extDir, `icons/${size}.png`));
}
copy(path.join(root, 'LICENSE'), path.join(extDir, 'LICENSE'));

// 4) 简单校验
const sizeKB = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('✅ build done');
console.log('   userscript : dist/figma-zh.user.js  (' + sizeKB(fs.statSync(path.join(distDir, 'figma-zh.user.js')).size) + ')');
console.log('   extension  : dist/extension/         (' + sizeKB(fs.statSync(path.join(extDir, 'content.js')).size) + ' content.js)');
console.log('   version    : ' + version);
