// SubtitleOS desktop — runs the full app locally, no cloud account needed.
const { app, BrowserWindow, shell, dialog, Menu, screen } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LIVE_URL = "https://subtitleos.lovable.app/";
const PREFERRED_PORT = 41730;
let port = PREFERRED_PORT;
const DIST_DIR = path.join(__dirname, "..", "dist");
const CLIENT_DIR = path.join(DIST_DIR, "client");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

function log(...args) {
  try {
    const file = path.join(app.getPath("userData"), "subtitleos.log");
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
  } catch {}
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return false;
  }
  const filePath = path.resolve(CLIENT_DIR, "." + pathname);
  const relative = path.relative(CLIENT_DIR, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  res.writeHead(200, {
    "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function listen(server, p) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListen);
      reject(err);
    };
    const onListen = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(p, "127.0.0.1");
  });
}

async function startServer() {
  // Windows paths (C:\...) must be turned into file:// URLs for ESM import.
  const entry = pathToFileURL(path.join(DIST_DIR, "server", "index.mjs")).href;
  const mod = await import(entry);
  const handler = mod.default;
  const server = http.createServer(async (req, res) => {
    if (serveStatic(req, res)) return;
    const url = `http://127.0.0.1:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    try {
      const cfReq = new Request(url, {
        method: req.method,
        headers,
        body: hasBody ? req : undefined,
        duplex: "half",
      });
      const out = await handler.fetch(cfReq, {}, { waitUntil: () => {} }, new URL(url));
      const h = Object.fromEntries(out.headers.entries());
      delete h["content-encoding"];
      delete h["content-length"];
      res.writeHead(out.status, h);
      if (out.body) res.end(Buffer.from(await out.arrayBuffer()));
      else res.end();
    } catch (e) {
      log("request error", String(e && e.stack ? e.stack : e));
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("SubtitleOS desktop error: " + String(e));
    }
  });
  try {
    port = await listen(server, PREFERRED_PORT);
  } catch {
    port = await listen(server, 0); // preferred port busy — pick any free one
  }
}

let mainWindow = null;
let downloadCount = 0;
let recoveryDialog = false;

function safeDownloadName(value) {
  const cleaned = path.basename(String(value || '').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  const name = cleaned && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(cleaned) ? cleaned : 'SubtitleOS-export';
  if (name.length <= 180) return name;
  const ext = path.extname(name).slice(0, 20);
  return name.slice(0, 180 - ext.length) + ext;
}

function showRecovery(failedUrl) {
  if (recoveryDialog || !mainWindow || mainWindow.isDestroyed()) return;
  recoveryDialog = true;
  dialog.showMessageBox(mainWindow, { title: 'Unable to open page', message: 'Check your connection, retry this page, or use the bundled tools.', buttons: ['Retry page', 'Homepage', 'Bundled tools', 'Close'], cancelId: 3 }).then(({ response }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (response === 0) mainWindow.loadURL(trustedOrigin(failedUrl) ? failedUrl : LIVE_URL);
    if (response === 1) mainWindow.loadURL(LIVE_URL);
    if (response === 2) mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }).catch(() => {}).finally(() => { recoveryDialog = false; });
}

function trustedOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return origin === `http://127.0.0.1:${port}` || origin === new URL(LIVE_URL).origin;
  } catch { return false; }
}
function openExternal(value) {
  try { if (["https:", "http:", "mailto:"].includes(new URL(value).protocol)) shell.openExternal(value); } catch {}
}

function createWindow(url) {
  let bounds = {};
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "window.json"), "utf8"));
    if ([saved.width, saved.height, saved.x, saved.y].every(Number.isFinite) && screen.getAllDisplays().some(({ workArea: a }) => saved.x < a.x + a.width && saved.y < a.y + a.height && saved.x + saved.width > a.x && saved.y + saved.height > a.y)) bounds = saved;
  } catch {}
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    ...bounds,
    title: "SubtitleOS",
    backgroundColor: "#0b0b0f",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  setTimeout(() => mainWindow && !mainWindow.isVisible() && mainWindow.show(), 4000);
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    openExternal(u);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    if (!trustedOrigin(destination)) { event.preventDefault(); openExternal(destination); }
  });
  const ses = mainWindow.webContents.session;
  // Install once per session even if a window is recreated.
  if (!ses.__subtitleosDownloads) {
    ses.__subtitleosDownloads = true;
    ses.on('will-download', (event, item, contents) => {
      if (contents !== mainWindow?.webContents || !trustedOrigin(contents.getURL())) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: 'Save SubtitleOS export', defaultPath: path.join(app.getPath('downloads'), safeDownloadName(item.getFilename())) });
      downloadCount += 1;
      item.on('updated', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const size = item.getTotalBytes();
        mainWindow.setProgressBar(size > 0 ? item.getReceivedBytes() / size : 2);
      });
      item.once('done', (e, state) => {
        downloadCount = Math.max(0, downloadCount - 1);
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setProgressBar(downloadCount ? 2 : -1);
        if (state === 'completed') {
          dialog.showMessageBox(mainWindow, { title: 'Export saved', message: safeDownloadName(item.getFilename()), buttons: ['Show in folder', 'Close'], cancelId: 1 }).then(({ response }) => { if (response === 0) shell.showItemInFolder(item.getSavePath()); }).catch(() => {});
        } else if (state !== 'cancelled') {
          dialog.showMessageBox(mainWindow, { title: 'Export not saved', message: 'The download was interrupted. Keep your project open and try exporting again.', buttons: ['OK'] }).catch(() => {});
        }
      });
    });
  }
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    contents === mainWindow?.webContents && trustedOrigin(requestingOrigin) && permission === "media",
  );
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    if (contents !== mainWindow?.webContents || !trustedOrigin(contents.getURL()) || permission !== "media") { callback(false); return; }
    dialog.showMessageBox(mainWindow, { type: "question", title: "Media access", message: "Allow SubtitleOS to use your microphone or camera?", buttons: ["Allow", "Don't allow"], defaultId: 1, cancelId: 1 }).then(({ response }) => callback(response === 0)).catch(() => callback(false));
  });
  mainWindow.on("close", () => {
    try { fs.writeFileSync(path.join(app.getPath("userData"), "window.json"), JSON.stringify(mainWindow.getBounds())); } catch {}
  });
  mainWindow.webContents.on("render-process-gone", () => {
    if (mainWindow) dialog.showMessageBox(mainWindow, { message: "The app stopped responding. Reopen this page?", buttons: ["Reload", "Close"], cancelId: 1 }).then(({ response }) => { if (response === 0) mainWindow?.reload(); });
  });
  mainWindow.webContents.on("did-fail-load", (event, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3 || !mainWindow) return;
    showRecovery(failedUrl);
  });
  mainWindow.webContents.on('did-navigate', (event, url, responseCode) => { if (responseCode >= 500) showRecovery(url); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "SubtitleOS", submenu: [
      { label: "Latest online version", click: () => mainWindow?.loadURL(LIVE_URL) },
      { label: "Bundled desktop version", click: () => mainWindow?.loadURL(`http://127.0.0.1:${port}/`) },
      { type: "separator" }, { role: "quit" },
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
  ]));
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.loadURL(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    let url;
    try {
      await startServer();
      url = LIVE_URL;
    } catch (e) {
      log("startup error", String(e && e.stack ? e.stack : e));
      url = LIVE_URL; // fall back to the online app so the window still opens
      // Online launch is intentional; a bundled-engine failure must not block it.
    }
    createWindow(url);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  });

  app.on("window-all-closed", () => app.quit());
}
