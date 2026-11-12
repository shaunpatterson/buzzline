// Background script: context menu entries and keyboard commands.
// Everything else lives in the content script; this only forwards intents.
// Chrome runs this file as a service worker and loads the shared modules with
// importScripts below; Firefox runs it as an event page whose manifest lists
// the same modules first (scripts/build_firefox.js reads this call).
'use strict';
if (typeof importScripts === 'function') importScripts('core.js', 'settings.js', 'intents.js');
const S = globalThis.BuzzlineSettings;
const I = globalThis.BuzzlineIntents;

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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  // The content script's sprint-page handler prefers the current selection
  // when there is one, so both menu entries map to the same intent.
  // selectionText also covers selections the content script cannot see
  // (inside <textarea>/<input> or a sub-frame; the script runs top-frame only).
  if (info.menuItemId === MENU_SELECTION) I.send(tab.id, I.sprintPage(info.selectionText));
  else if (info.menuItemId === MENU_PAGE) I.send(tab.id, I.sprintPage());
  else if (info.menuItemId === MENU_READER) I.send(tab.id, I.openReader());
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-enabled') {
    S.load((s) => chrome.storage.sync.set({ enabled: !s.enabled }));
    return;
  }
  const intent = I.forCommand(command);
  if (intent) I.send(tab && tab.id, intent);
});
