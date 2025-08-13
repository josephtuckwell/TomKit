const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('start-tomcat', async (event, installPath, type) => {
  let scriptPath = '';

  if (type !== 'Homebrew') {
    scriptPath = 'brew';
    args = ['services', 'start', 'tomcat'];
  } else {
    scriptPath = path.join(installPath, 'startup.sh');
    args = [];
  }

  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error starting Tomcat:', error);
      return;
    }
    console.log('Tomcat started:', stdout);
  });
});

ipcMain.handle('stop-tomcat', async (event, installPath, type) => {
  let scriptPath = '';

  if (type !== 'Homebrew') {
    scriptPath = 'brew';
    args = ['services', 'stop', 'tomcat'];
  } else {
    scriptPath = path.join(installPath, 'shutdown.sh');
    args = [];
  }

  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error stopping Tomcat:', error);
      return;
    }
    console.log('Tomcat stopped:', stdout);
  });
});