'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const APP_PATH = path.join(__dirname, '..');
let mainWindow;
let activeProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Pixel Asset Generator',
    backgroundColor: '#0d0d0d',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (activeProcess) activeProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Run a Node.js script as a child process, streaming output to renderer ──
ipcMain.handle('run-command', (event, { script, args }) => {
  return new Promise((resolve) => {
    if (activeProcess) {
      activeProcess.kill();
      activeProcess = null;
    }

    const scriptPath = path.join(APP_PATH, script);
    const child = spawn('node', [scriptPath, ...args], {
      cwd: APP_PATH,
      env: { ...process.env },
      shell: false,
    });

    activeProcess = child;

    child.stdout.on('data', (data) => {
      mainWindow.webContents.send('command-output', { type: 'stdout', text: data.toString() });
    });

    child.stderr.on('data', (data) => {
      mainWindow.webContents.send('command-output', { type: 'stderr', text: data.toString() });
    });

    child.on('close', (code) => {
      activeProcess = null;
      mainWindow.webContents.send('command-done', { code });
      resolve({ code });
    });

    child.on('error', (err) => {
      activeProcess = null;
      mainWindow.webContents.send('command-output', { type: 'error', text: `Process error: ${err.message}` });
      mainWindow.webContents.send('command-done', { code: 1 });
      resolve({ code: 1 });
    });
  });
});

// ── Kill the active process ──
ipcMain.handle('kill-command', () => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
});

// ── File picker ──
ipcMain.handle('pick-file', async (event, { filters, defaultPath } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ],
    defaultPath: defaultPath || APP_PATH,
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── Directory picker ──
ipcMain.handle('pick-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: path.join(APP_PATH, 'output'),
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── List image files in a directory (optionally only those newer than `since` ms) ──
ipcMain.handle('list-output-files', (event, { dir, since }) => {
  const targetDir = path.isAbsolute(dir) ? dir : path.join(APP_PATH, dir);
  if (!fs.existsSync(targetDir)) return [];

  const results = [];

  function scan(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (/\.(png|gif|jpg|jpeg)$/i.test(entry.name)) {
        const stat = fs.statSync(fullPath);
        if (!since || stat.mtimeMs >= since) {
          results.push({
            name: entry.name,
            path: fullPath,
            relPath: path.relative(APP_PATH, fullPath),
            mtime: stat.mtimeMs,
          });
        }
      }
    }
  }

  scan(targetDir);
  return results.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
});

// ── Read a file as base64 data URL for display in renderer ──
ipcMain.handle('read-file-base64', (event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };
  const mime = mimeMap[ext] || 'image/png';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${data}`;
});

// ── Reveal a file/folder in system explorer ──
ipcMain.handle('open-path', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ── Get the project root path ──
ipcMain.handle('get-app-path', () => APP_PATH);
