(() => {
  'use strict';

  // Intents: what the popup, the context menu and keyboard commands can ask a
  // page to do. One definition shared by the senders (popup.js,
  // background.js) and the receiver (content.js).
  const SPRINT_PAGE = 'sprint-page', OPEN_READER = 'open-reader', FEEDBACK = 'feedback';

  // Sprint the given text, else the page's selection, else the whole page.
  const sprintPage = (text) => (text ? { type: SPRINT_PAGE, text } : { type: SPRINT_PAGE });
  const openReader = () => ({ type: OPEN_READER });
  // verdict: 'yes' (the selected block is reading text) or 'no'.
  const feedback = (verdict) => ({ type: FEEDBACK, verdict });

  // Keyboard commands (manifest "commands") that are page intents; null for others.
  const forCommand = (command) => (command === SPRINT_PAGE ? sprintPage() : command === OPEN_READER ? openReader() : null);

  // Deliver an intent to a tab. Pages without the content script (chrome://,
  // the Web Store) and closing popups make delivery fail; that is ignored.
  // done() runs once delivery has settled.
  function send(tabId, intent, done) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, intent, () => { void chrome.runtime.lastError; if (done) done(); });
  }

  // Receiver side: route a message to handlers { sprintPage(text),
  // openReader(), feedback(verdict) }. Unknown messages are ignored.
  function handle(msg, handlers) {
    if (!msg) return;
    if (msg.type === SPRINT_PAGE) handlers.sprintPage(msg.text);
    else if (msg.type === OPEN_READER) handlers.openReader();
    else if (msg.type === FEEDBACK) handlers.feedback(msg.verdict);
  }

  const api = { sprintPage, openReader, feedback, forCommand, send, handle };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineIntents = api;
})();
