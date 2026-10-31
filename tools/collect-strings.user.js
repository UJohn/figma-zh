// ==UserScript==
// @name         Figma 汉化词条收集器
// @namespace    https://github.com/figma-zh
// @version      0.1.0
// @description  从 Figma 自己的英文词典和当前页面 DOM 导出待翻译词条，方便独立翻译（不依赖任何第三方译文）
// @match        https://www.figma.com/*
// @match        https://figma.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @license      GPL-3.0
// ==/UserScript==
(function () {
  'use strict';

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function walk(obj, prefix, out) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.string === 'string') out.push({ key: prefix, en: obj.string });
    for (const k of Object.keys(obj)) {
      if (k === 'string') continue;
      walk(obj[k], prefix ? prefix + '.' + k : k, out);
    }
  }

  async function exportOfficial() {
    const link = document.querySelector('link#englishDictionaryUrl');
    if (!link) return alert('没找到 Figma 英文词典地址（请刷新 Figma 页面再试）');
    const res = await fetch(link.href);
    const json = await res.json();
    const out = [];
    walk(json, '', out);
    const seen = new Set();
    const list = out.filter(x => {
      const t = (x.en || '').trim();
      if (!t || seen.has(x.key + '|' + t)) return false;
      seen.add(x.key + '|' + t); return true;
    });
    download('figma-official-strings.json', JSON.stringify(list, null, 1));
    alert('已导出 ' + list.length + ' 条官方英文词条。\n文件：figma-official-strings.json');
  }

  function exportDom() {
    const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
    const SKIP = 'script,style,noscript,textarea,code,pre,canvas,svg,math,iframe,object,[contenteditable="true"],[role="textbox"]';
    const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tooltip'];
    const map = new Map();
    function add(text, kind, el) {
      text = (text || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length > 200 || CJK.test(text) || !/[A-Za-z]{2,}/.test(text)) return;
      const k = kind + '|' + text;
      if (map.has(k)) { map.get(k).count++; return; }
      map.set(k, { text, kind, count: 1, tag: el ? el.tagName.toLowerCase() : '', aria: el && el.getAttribute ? (el.getAttribute('aria-label') || '') : '' });
    }
    const stack = [document.body];
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeType === 3) { add(n.data, 'text', n.parentElement); continue; }
      if (n.nodeType !== 1) continue;
      try { if (n.closest(SKIP)) continue; } catch (e) {}
      for (const a of ATTRS) if (n.hasAttribute && n.hasAttribute(a)) add(n.getAttribute(a), a, n);
      for (let c = n.lastChild; c; c = c.previousSibling) stack.push(c);
    }
    const arr = [...map.values()].sort((a, b) => b.count - a.count);
    download('figma-dom-strings.json', JSON.stringify(arr, null, 1));
    alert('已导出当前页面 ' + arr.length + ' 条英文文本/属性。\n（切换到其它页面/菜单后再点一次可继续收集）');
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('① 导出 Figma 官方英文词条（JSON）', exportOfficial);
    GM_registerMenuCommand('② 导出当前页面 DOM 英文清单（JSON）', exportDom);
  }
  console.log('[Figma 词条收集器] 已加载');
})();
