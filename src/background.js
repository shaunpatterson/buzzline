// Background service worker: context menu entries and keyboard commands.
// Everything else lives in the content script; this only forwards intents.
'use strict';

const MENU_SELECTION = 'bzln-sprint-selection';
const MENU_PAGE = 'bzln-sprint-page';
const MENU_READER = 'bzln-open-reader';

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_SELECTION, title: 'Sprint-read selection', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_PAGE, title: 'Sprint-read this page', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_READER, title: 'Open Buzzline reader', contexts: ['page'] });
  });
}
chrome.runtime.onInstalled.addListener(installMenus);
chrome.runtime.onStartup.addListener(installMenus);

function send(tabId, message) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  // The content script's sprint-page handler prefers the current selection
  // when there is one, so both menu entries map to the same message.
  if (info.menuItemId === MENU_SELECTION || info.menuItemId === MENU_PAGE) send(tab.id, { type: 'sprint-page' });
  else if (info.menuItemId === MENU_READER) send(tab.id, { type: 'open-reader' });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-enabled') {
    chrome.storage.sync.get(['enabled'], (s) => chrome.storage.sync.set({ enabled: !s.enabled }));
  } else if (command === 'sprint-page') {
    send(tab && tab.id, { type: 'sprint-page' });
  } else if (command === 'open-reader') {
    send(tab && tab.id, { type: 'open-reader' });
  }
});
