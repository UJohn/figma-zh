'use strict';
const $ = (id) => document.getElementById(id);
let tabId = null;

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status' + (cls ? ' ' + cls : '');
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}

function send(msg) {
  return new Promise((resolve) => {
    if (tabId == null) return resolve(null);
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(resp || null);
    });
  });
}

async function refresh() {
  const tab = await getActiveTab();
  const isFigma = tab && tab.url && /https:\/\/(www\.)?figma\.com\//.test(tab.url);
  if (!isFigma) {
    $('stateSub').textContent = '当前不是 Figma 页面';
    setStatus('请打开 https://www.figma.com/ 后使用。', 'warn');
    $('toggle').disabled = true;
    $('rescan').disabled = true;
    return;
  }
  tabId = tab.id;
  const resp = await send({ type: 'FIGMA_ZH_GET' });
  if (!resp) {
    $('stateSub').textContent = '脚本尚未注入';
    setStatus('请刷新一次 Figma 页面，然后再打开本弹窗。', 'warn');
    return;
  }
  $('toggle').disabled = false;
  $('rescan').disabled = false;
  $('toggle').checked = !!resp.enabled;
  $('stateSub').textContent = resp.enabled ? '已开启（界面为中文）' : '已关闭（界面为英文）';
  $('stateSub').className = 'sub ' + (resp.enabled ? 'ok' : '');
  if (resp.dictionarySize) $('ver').textContent = '1.3.0 · ' + resp.dictionarySize + ' 词条';
  const s = resp.stats || {};
  setStatus('本次已翻译：离线 ' + (s.offline || 0) + ' 处' + (s.online ? ' · 在线 ' + s.online + ' 处' : ''));
}

$('toggle').addEventListener('change', async (e) => {
  const want = e.target.checked;
  const resp = await send({ type: 'FIGMA_ZH_SET', enabled: want });
  if (!resp) {
    e.target.checked = !want;
    setStatus('操作失败：请刷新页面后重试。', 'warn');
    return;
  }
  $('stateSub').textContent = resp.enabled ? '已开启（界面为中文）' : '已关闭（界面为英文）';
  $('stateSub').className = 'sub ' + (resp.enabled ? 'ok' : '');
  setStatus(resp.enabled ? '已开启，页面已切换为中文。' : '已关闭，界面已还原英文。');
});

$('rescan').addEventListener('click', async () => {
  const resp = await send({ type: 'FIGMA_ZH_RESCAN' });
  setStatus(resp ? '已重新扫描。' : '操作失败：请刷新页面后重试。');
});

$('closeBtn').addEventListener('click', () => window.close());

refresh();
