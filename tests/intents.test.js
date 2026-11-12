'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/intents.js');

// Every intent a sender can build reaches the matching receiver handler.
test('intents built by senders are routed to the matching handler', () => {
  const calls = [];
  const handlers = { sprintPage: (t) => calls.push(['sprint', t]), openReader: () => calls.push(['reader']), feedback: (v) => calls.push(['feedback', v]) };
  for (const intent of [I.sprintPage(), I.sprintPage('some text'), I.sprintPage(''), I.openReader(), I.feedback('yes'), I.forCommand('sprint-page'), I.forCommand('open-reader')]) I.handle(intent, handlers);
  assert.deepEqual(calls, [['sprint', undefined], ['sprint', 'some text'], ['sprint', undefined], ['reader'], ['feedback', 'yes'], ['sprint', undefined], ['reader']]);
});

test('unknown messages and non-page commands are ignored', () => {
  const fail = () => assert.fail('no handler should run');
  for (const msg of [null, undefined, {}, { type: 'nope' }]) I.handle(msg, { sprintPage: fail, openReader: fail, feedback: fail });
  assert.equal(I.forCommand('toggle-enabled'), null);
});

test('send delivers to the tab, swallows delivery errors and then calls done', () => {
  const sent = [];
  let lastErrorRead = false;
  globalThis.chrome = {
    tabs: { sendMessage: (id, msg, cb) => { sent.push([id, msg]); cb(); } },
    runtime: { get lastError() { lastErrorRead = true; return { message: 'Could not establish connection' }; } }
  };
  try {
    let done = 0;
    I.send(7, I.openReader(), () => done++);
    I.send(null, I.openReader(), () => done++);
    assert.deepEqual(sent, [[7, { type: 'open-reader' }]]);
    assert.equal(done, 1, 'no tab: nothing sent, done not called');
    assert.ok(lastErrorRead, 'lastError is read so Chrome does not log it as unchecked');
  } finally { delete globalThis.chrome; }
});
