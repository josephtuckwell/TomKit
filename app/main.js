const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

// Create the main application window
const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      // Preload script to securely expose APIs to renderer
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Load the main HTML file
  win.loadFile('index.html')
}

// Called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow()

  // On macOS, re-create a window when the dock icon is clicked and there are no other windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Handle "start-tomcat" requests from the renderer process
ipcMain.handle('start-tomcat', async (event, installPath, type) => {
  let scriptPath = '';
  let args;

  // If using Homebrew, start Tomcat as a service
  if (type !== 'Homebrew') {
    scriptPath = 'brew';
    args = ['services', 'start', 'tomcat'];
  } else {
    // Otherwise, run the startup.sh script from the manual install path
    scriptPath = path.join(installPath, 'startup.sh');
    args = [];
  }

  // Execute the appropriate command/script
  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error starting Tomcat:', error);
      return;
    }
    console.log('Tomcat started:', stdout);
  });
});

// Handle "stop-tomcat" requests from the renderer process
ipcMain.handle('stop-tomcat', async (event, installPath, type) => {
  let scriptPath = '';
  let args;

  // If using Homebrew, stop Tomcat as a service
  if (type !== 'Homebrew') {
    scriptPath = 'brew';
    args = ['services', 'stop', 'tomcat'];
  } else {
    // Otherwise, run the shutdown.sh script from the manual install path
    scriptPath = path.join(installPath, 'shutdown.sh');
    args = [];
  }

  // Execute the appropriate command/script
  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error stopping Tomcat:', error);
      return;
    }
    console.log('Tomcat stopped:', stdout);
  });
});