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
const MENU_PDF = 'bzln-open-pdf';
const MENU_PDF_LINK = 'bzln-open-pdf-link';
const MENU_PACE = 'bzln-pace-page';

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_SELECTION, title: 'Sprint-read selection', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_PAGE, title: 'Sprint-read this page', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_READER, title: 'Open Buzzline reader', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_PACE, title: 'Pace-read from here', contexts: ['page', 'selection'] });
    // The background cannot tell whether a tab shows a PDF, so this entry is on
    // every page; the PDF reader says so when the address is not a PDF.
    chrome.contextMenus.create({ id: MENU_PDF, title: 'Open in PDF reader', contexts: ['page', 'frame'] });
    chrome.contextMenus.create({ id: MENU_PDF_LINK, title: 'Open link in PDF reader', contexts: ['link'], targetUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.pdf#*'] });
  });
}
chrome.runtime.onInstalled.addListener(installMenus);
chrome.runtime.onStartup.addListener(installMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === MENU_PDF || info.menuItemId === MENU_PDF_LINK) {
    // In Chrome's own PDF viewer the frame is the viewer's; the tab's address is the PDF's.
    const file = info.menuItemId === MENU_PDF_LINK ? info.linkUrl : tab.url || info.pageUrl;
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pdf.html') + '?file=' + encodeURIComponent(file), index: tab.index + 1 });
    return;
  }
  // The content script's sprint-page handler prefers the current selection
  // when there is one, so both menu entries map to the same intent.
  // selectionText also covers selections the content script cannot see
  // (inside <textarea>/<input> or a sub-frame; the script runs top-frame only).
  if (info.menuItemId === MENU_SELECTION) I.send(tab.id, I.sprintPage(info.selectionText));
  else if (info.menuItemId === MENU_PAGE) I.send(tab.id, I.sprintPage());
  else if (info.menuItemId === MENU_READER) I.send(tab.id, I.openReader());
  else if (info.menuItemId === MENU_PACE) I.send(tab.id, I.pacePage());
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-enabled') {
    S.load((s) => chrome.storage.sync.set({ enabled: !s.enabled }));
    return;
  }
  if (command === 'toggle-ruler') {
    S.load((s) => chrome.storage.sync.set({ rulerOn: !s.rulerOn }));
    return;
  }
  const intent = I.forCommand(command);
  if (intent) I.send(tab && tab.id, intent);
});
