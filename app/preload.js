const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // Tell renderer to start or stop Tomcat by sending a message to main process
  startTomcat: (path, type) => ipcRenderer.invoke('start-tomcat', path, type),
  stopTomcat: (path, type) => ipcRenderer.invoke('stop-tomcat', path, type)
});