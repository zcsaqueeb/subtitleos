const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
const fakeApp = { requestSingleInstanceLock: () => false, quit: () => {} };
const sandbox = { require: name => name === 'electron' ? { app: fakeApp } : require(name), __dirname, console, setTimeout, URL, exports: {} };
vm.runInNewContext(source + '\nexports.trustedOrigin=trustedOrigin; exports.serveStatic=serveStatic; exports.safeDownloadName=safeDownloadName;', sandbox);
test('desktop trusts only its exact loopback and published origins', () => {
  assert.equal(sandbox.exports.trustedOrigin('http://127.0.0.1:41730/app'), true);
  assert.equal(sandbox.exports.trustedOrigin('https://subtitleos.lovable.app/burn'), true);
  assert.equal(sandbox.exports.trustedOrigin('http://127.0.0.1:9999/'), false);
  assert.equal(sandbox.exports.trustedOrigin('https://subtitleos.lovable.app.evil.example/'), false);
  assert.equal(sandbox.exports.trustedOrigin('file:///etc/passwd'), false);
});
test('desktop rejects encoded traversal to client-prefix siblings', () => {
  assert.equal(sandbox.exports.serveStatic({ url: '/%2e%2e%2fclient-secret/key.txt' }, {}), false);
});
test('download names preserve subtitle extensions and reject unsafe Windows names', () => {
  assert.equal(sandbox.exports.safeDownloadName('../../translated-Urdu.srt'), 'translated-Urdu.srt');
  assert.equal(sandbox.exports.safeDownloadName('CON.txt'), 'SubtitleOS-export');
  assert.equal(sandbox.exports.safeDownloadName('captions?.vtt'), 'captions_.vtt');
  assert.equal(sandbox.exports.safeDownloadName('a'.repeat(200) + '.mp4').length, 180);
  assert.equal(sandbox.exports.safeDownloadName('a'.repeat(200) + '.mp4').endsWith('.mp4'), true);
});
test('Windows starts on the latest published homepage and saves exports through its dialog', async () => {
  const { EventEmitter } = require('node:events');
  let window;
  const session = new EventEmitter();
  session.setPermissionCheckHandler = () => {};
  session.setPermissionRequestHandler = () => {};
  class FakeWindow extends EventEmitter {
    constructor() {
      super(); window = this;
      this.webContents = new EventEmitter();
      this.webContents.session = session;
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.getURL = () => this.loaded;
    }
    loadURL(url) { this.loaded = url; }
    isDestroyed() { return false; }
    setProgressBar(value) { this.progress = value; }
  }
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  app.getPath = () => '/tmp/browser/native-test';
  const messages = [];
  const electron = { app, BrowserWindow: FakeWindow, screen: {}, Menu: { setApplicationMenu: () => {}, buildFromTemplate: v => v }, shell: {}, dialog: { showMessageBox: async (w, value) => { messages.push(value); return { response: value.cancelId }; } } };
  const context = { require: name => name === 'electron' ? electron : require(name), __dirname, console, setTimeout: () => {}, URL };
  vm.runInNewContext(source + '\nstartServer=async()=>{};', context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.loaded, 'https://subtitleos.lovable.app/');
  const item = new EventEmitter();
  item.getFilename = () => 'Urdu.srt';
  item.setSaveDialogOptions = options => { item.options = options; };
  item.getTotalBytes = () => 100;
  item.getReceivedBytes = () => 50;
  session.emit('will-download', {}, item, window.webContents);
  assert.equal(item.options.defaultPath, '/tmp/browser/native-test/Urdu.srt');
  item.emit('updated');
  assert.equal(window.progress, 0.5);
  item.emit('done', {}, 'completed');
  assert.equal(window.progress, -1);
  assert.equal(messages[0].title, 'Export saved');
});