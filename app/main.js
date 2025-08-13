const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const fs = require('fs');

let tailProcess = null;
// Create the main application window
const createWindow = () => {
  const win = new BrowserWindow({
    webPreferences: {
      // Preload script to securely expose APIs to renderer
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Load the main HTML file
  win.loadFile('public/index.html')
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
  if (type === 'homebrew') {
    scriptPath = 'brew';
    args = ['services', 'start', 'tomcat'];
  } else {
    // Otherwise, run the startup.sh in the bin dir from the manual install path
    scriptPath = path.join(installPath, 'bin', 'startup.sh');
    args = [];
  }

  console.log('Attempting to start Tomcat with:', scriptPath);

  // Execute the appropriate command/script
  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error starting Tomcat:', error);
      return;
    }
    console.log(stdout);
  });
});

// Handle "stop-tomcat" requests from the renderer process
ipcMain.handle('stop-tomcat', async (event, installPath, type) => {
  let scriptPath = '';
  let args;

  // If using Homebrew, stop Tomcat as a service
  if (type === 'homebrew') {
    scriptPath = 'brew';
    args = ['services', 'stop', 'tomcat'];
  } else {
    // Otherwise, run the shutdown.sh from bin dir in manual install path
    scriptPath = path.join(installPath, 'bin', 'shutdown.sh');
    args = [];
  }

  console.log('Attempting to stop Tomcat with:', scriptPath);

  // Execute the appropriate command/script
  execFile(scriptPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Error stopping Tomcat:', error);
      return;
    }
    console.log(stdout);
  });
});

// Stop tailing when renderer requests
ipcMain.on('stop-tail-catalina', () => {
  if (tailProcess) {
    tailProcess.kill();
    tailProcess = null;
  }
});

let logWindow = null;
let logTailProcess = null;

ipcMain.on('open-log-window', (event, logPath) => {
  if (logWindow) {
    logWindow.focus();
    return;
  }
  logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  logWindow.loadFile('public/log.html');
  logWindow.on('closed', () => {
    logWindow = null;
    if (logTailProcess) {
      logTailProcess.kill();
      logTailProcess = null;
    }
  });

  logWindow.webContents.on('did-finish-load', () => {
    if (logTailProcess) {
      logTailProcess.kill();
      logTailProcess = null;
    }
    if (!fs.existsSync(logPath)) {
      logWindow.webContents.send('catalina-data', '[Log file does not exist]');
      return;
    }
    logTailProcess = spawn('tail', ['-n', '100', '-f', logPath]);
    logTailProcess.stdout.on('data', (data) => {
      logWindow.webContents.send('catalina-data', data.toString());
    });
    logTailProcess.stderr.on('data', (data) => {
      logWindow.webContents.send('catalina-data', '[stderr] ' + data.toString());
    });
    logTailProcess.on('close', () => {
      if (logWindow) logWindow.webContents.send('catalina-data', '[tail stopped]');
    });
    logTailProcess.on('error', (err) => {
      console.error('Tail process error:', err);
    });
  });
});