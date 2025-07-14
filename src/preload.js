// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const { jwtDecode } = require('jwt-decode');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  jwtDecode: (token) => jwtDecode(token)
});