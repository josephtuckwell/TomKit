const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startTomcat: (path) => ipcRenderer.invoke('start-tomcat', path),
  stopTomcat: (path) => ipcRenderer.invoke('stop-tomcat', path)
});