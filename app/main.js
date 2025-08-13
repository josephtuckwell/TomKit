const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const fs = require('fs');

// Get version from package.json
function getAppVersion() {
  try {
    const packagePath = path.join(__dirname, 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageData.version;
  } catch (error) {
    console.error('Error reading version from package.json:', error);
    return '0.0.0';
  }
}

// Function to update Tomcat port in server.xml
async function updateTomcatPort(installPath, port) {
  const serverXmlPath = path.join(installPath, 'conf', 'server.xml');
  
  if (!fs.existsSync(serverXmlPath)) {
    throw new Error(`server.xml not found at ${serverXmlPath}`);
  }

  try {
    const data = fs.readFileSync(serverXmlPath, 'utf8');
    
    // Replace the HTTP connector port (find the first HTTP connector)
    const updatedData = data.replace(
      /<Connector\s+port="\d+"\s+protocol="HTTP\/1\.1"/,
      `<Connector port="${port}" protocol="HTTP/1.1"`
    );
    
    fs.writeFileSync(serverXmlPath, updatedData);
    console.log(`Updated Tomcat port to ${port} in ${serverXmlPath}`);
  } catch (error) {
    throw new Error(`Failed to update server.xml: ${error.message}`);
  }
}

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
ipcMain.handle('start-tomcat', async (event, installPath, type, port) => {
  let scriptPath = '';
  let args;

  // If a custom port is specified, update server.xml before starting
  if (port && port !== '') {
    try {
      if (type === 'homebrew') 
      {
        installPath = path.join(installPath, '/', 'usr', 'local', 'opt', 'tomcat', 'libexec');
      }

      console.log(`Updating Tomcat port to ${port} in ${installPath}`);
      await updateTomcatPort(installPath, port);
    } catch (error) {
      console.error('Error updating Tomcat port:', error);
      return;
    }
  }

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
  return new Promise((resolve, reject) => {
    execFile(scriptPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('Error starting Tomcat:', error);
        reject({ success: false, error: error.message });
      } else {
        console.log('Tomcat started successfully:', stdout);
        resolve({ success: true, message: 'Server started successfully' });
      }
    });
  });
});

// Handle "stop-tomcat" requests from the renderer process
ipcMain.handle('stop-tomcat', async (event, installPath, type, port) => {
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
  return new Promise((resolve, reject) => {
    execFile(scriptPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('Error stopping Tomcat:', error);
        reject({ success: false, error: error.message });
      } else {
        console.log('Tomcat stopped successfully:', stdout);
        resolve({ success: true, message: 'Server stopped successfully' });
      }
    });
  });
});

// Handle version request
ipcMain.handle('get-app-version', async () => {
  return getAppVersion();
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