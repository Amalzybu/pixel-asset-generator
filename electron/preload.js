'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  runCommand: (opts) => ipcRenderer.invoke('run-command', opts),
  killCommand: () => ipcRenderer.invoke('kill-command'),
  pickFile: (opts) => ipcRenderer.invoke('pick-file', opts || {}),
  pickFiles: (opts) => ipcRenderer.invoke('pick-files', opts || {}),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  listOutputFiles: (opts) => ipcRenderer.invoke('list-output-files', opts),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  readPreset: (filePath) => ipcRenderer.invoke('read-preset', filePath),

  onCommandOutput: (cb) => ipcRenderer.on('command-output', (_e, data) => cb(data)),
  onCommandDone: (cb) => ipcRenderer.on('command-done', (_e, data) => cb(data)),
  removeCommandListeners: () => {
    ipcRenderer.removeAllListeners('command-output');
    ipcRenderer.removeAllListeners('command-done');
  },
});
