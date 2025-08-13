const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startTomcat: (path, type, port) => ipcRenderer.invoke('start-tomcat', path, type, port),
  stopTomcat: (path, type, port) => ipcRenderer.invoke('stop-tomcat', path, type, port),
  openLogWindow: (logPath) => ipcRenderer.send('open-log-window', logPath),
  onCatalinaData: (callback) => ipcRenderer.on('catalina-data', (event, data) => callback(data)),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});