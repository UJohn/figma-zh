#!/usr/bin/env node
/* 用法：
 *   node tools/diff-coverage.js figma-official-strings.json dist/dict.zh.json
 * 输出：
 *   dist/translation-backlog.json  未翻译的 key + 英文原文（已去重）
 *   dist/translation-backlog.csv   同上的 CSV
 */
'use strict';
const fs = require('fs');
const path = require('path');
const [,, officialPath, dictPath] = process.argv;
if (!officialPath || !dictPath) {
  console.error('用法: node tools/diff-coverage.js <figma-official-strings.json> <dict.zh.json>');
  process.exit(1);
}
let official = JSON.parse(fs.readFileSync(officialPath, 'utf8'));
if (!Array.isArray(official)) {
  const out = [];
  (function walk(obj, prefix) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.string === 'string') out.push({ key: prefix, en: obj.string });
    for (const k of Object.keys(obj)) {
      if (k === 'string') continue;
      walk(obj[k], prefix ? prefix + '.' + k : k);
    }
  })(official, '');
  official = out;
}
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
const have = new Set(Object.keys(dict).map(norm));
const seen = new Set();
const missing = [];
for (const item of official) {
  const key = item.key || '';
  const en = String(item.en || '').trim();
  if (!en || !/[A-Za-z]{2,}/.test(en)) continue;
  if (have.has(norm(en))) continue;
  const n = norm(en);
  if (seen.has(n)) continue;
  seen.add(n);
  missing.push({ key, en });
}
missing.sort((a, b) => a.en.length - b.en.length || a.en.localeCompare(b.en));
const outDir = path.resolve('dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'translation-backlog.json'), JSON.stringify(missing, null, 1));
const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(outDir, 'translation-backlog.csv'),
  'key,en\n' + missing.map(x => esc(x.key) + ',' + esc(x.en)).join('\n'));
console.log('官方词条：' + official.length);
console.log('未翻译唯一英文：' + missing.length);
console.log('输出：dist/translation-backlog.json / .csv');
