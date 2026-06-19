const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jarvis', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  hide: () => ipcRenderer.send('window-hide'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  notify: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  isDesktop: true,
})
