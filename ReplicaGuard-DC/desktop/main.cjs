const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let cluster = null;
let mainWindow = null;
const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const logDir = path.join(root, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const serviceLog = fs.createWriteStream(path.join(logDir, 'desktop-services.log'), { flags: 'a' });
function log(...args) { const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`; serviceLog.write(line); }
function ping(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}
async function waitForWeb() {
  for (let i = 0; i < 120; i++) {
    if (await ping('http://127.0.0.1:5173')) return true;
    if (cluster && cluster.exitCode !== null) { log('Service process exited early with code', cluster.exitCode); return false; }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}
function startCluster() {
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWindows ? ['/d', '/s', '/c', 'npm run dev'] : ['run', 'dev'];
  cluster = spawn(command, args, { cwd: root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } });
  cluster.stdout.on('data', chunk => { serviceLog.write(chunk); });
  cluster.stderr.on('data', chunk => { serviceLog.write(chunk); });
  cluster.on('error', err => log('Could not start services:', err.message));
  cluster.on('exit', (code, signal) => log('Service process exited:', code, signal));
  log('Started service process', cluster.pid);
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 650,
    title: 'ReplicaGuard', backgroundColor: '#101827', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  startCluster();
  const ready = await waitForWeb();
  if (ready) {
    log('Web app ready; loading UI');
    await mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    log('Web app did not become ready. See logs/desktop-services.log');
    await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <html><body style="font:16px Segoe UI;background:#101827;color:#eef2ff;padding:48px;max-width:760px;margin:auto">
      <h1>ReplicaGuard could not start</h1><p>The local web service did not respond within two minutes.</p>
      <p>Open the project's <b>logs/desktop-services.log</b> file to see the exact error. Common causes are missing dependencies or ports already in use.</p>
      <p>Close this window, stop any older ReplicaGuard terminals, then run START-REPLICAGUARD-DESKTOP.bat again.</p></body></html>`));
  }
}
app.whenReady().then(createWindow).catch(err => { log('Electron startup error:', err.stack || err.message); });
app.on('window-all-closed', () => { if (cluster && !cluster.killed) cluster.kill(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (cluster && !cluster.killed) cluster.kill(); serviceLog.end(); });
