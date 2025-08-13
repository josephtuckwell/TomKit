const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startTomcat: (path, type) => ipcRenderer.invoke('start-tomcat', path, type),
  stopTomcat: (path, type) => ipcRenderer.invoke('stop-tomcat', path, type),
  openLogWindow: (logPath) => ipcRenderer.send('open-log-window', logPath),
  onCatalinaData: (callback) => ipcRenderer.on('catalina-data', (event, data) => callback(data)),
});