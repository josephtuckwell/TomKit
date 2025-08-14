const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, globalShortcut } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Set the app name
app.setName('TomKit');

// Set app user model ID for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.josephtuckwell.tomkit');
}

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

// Configuration file management
function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  
  // Return default configuration
  return {
    installType: 'homebrew',
    installLocation: '',
    tomcatPort: '8080',
    theme: 'dark',
    notifications: true,
    autoStart: false,
    minimizeToTray: true
  };
}

function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    const userDataPath = path.dirname(configPath);
    
    // Ensure the user data directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Configuration saved successfully');
    return { success: true };
  } catch (error) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
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
let tray = null;
let mainWindow = null;

// Notification helper
function showNotification(title, body) {
  const config = loadConfig();
  if (config.notifications && Notification.isSupported()) {
    new Notification({
      title: title,
      body: body,
      icon: path.join(__dirname, 'public', 'TomKit-icon.png')
    }).show();
  }
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, 'public', 'TomKit-icon.png');
  let icon;
  
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.error('Failed to load tray icon from:', iconPath);
      // Try to create a simple fallback icon
      icon = nativeImage.createEmpty();
    }
    
    // Resize icon for tray (16x16 is standard for system tray)
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }
  } catch (error) {
    console.error('Error creating tray icon:', error);
    icon = nativeImage.createEmpty();
  }
  
  try {
    tray = new Tray(icon);
    console.log('System tray created successfully');
    
    // Set up tray menu and events
    setupTrayMenu();
    
  } catch (error) {
    console.error('Failed to create system tray:', error);
    tray = null;
    return;
  }
}

// Set up tray menu and events
function setupTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show TomKit',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Start Tomcat',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('shortcut-start-tomcat');
        }
      }
    },
    {
      label: 'Stop Tomcat',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('shortcut-stop-tomcat');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('TomKit - Tomcat Manager');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (process.platform === 'darwin') {
        app.dock.show();
      }
    } else {
      createWindow();
    }
  });

  console.log('Tray menu and events set up successfully');
}
// Create the main application window
const createWindow = () => {
  const config = loadConfig();
  
  const win = new BrowserWindow({
    title: 'TomKit',
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    webPreferences: {
      // Preload script to securely expose APIs to renderer
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow = win;

  // Load the main HTML file
  win.loadFile('public/index.html')

  // Handle window close - minimize to tray if enabled
  win.on('close', (event) => {
    if (config.minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      win.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // Register keyboard shortcuts
  registerShortcuts();
}

// Register global keyboard shortcuts
function registerShortcuts() {
  // Start Tomcat (Cmd/Ctrl + R)
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-start-tomcat');
    }
  });

  // Stop Tomcat (Cmd/Ctrl + S)
  globalShortcut.register('CommandOrControl+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-stop-tomcat');
    }
  });

  // Toggle Log Window (Cmd/Ctrl + L)
  globalShortcut.register('CommandOrControl+L', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-toggle-log');
    }
  });

  // Show/Hide Main Window (Cmd/Ctrl + Shift + T)
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// Helper functions for Tomcat operations
async function handleStartTomcat(installPath, type, port) {
  let scriptPath = '';
  let args;

  // If a custom port is specified, update server.xml before starting
  if (port && port !== '') {
    try {
      if (type === 'homebrew') {
        installPath = path.join('/', 'usr', 'local', 'opt', 'tomcat', 'libexec');
      }

      console.log(`Updating Tomcat port to ${port} in ${installPath}`);
      await updateTomcatPort(installPath, port);
    } catch (error) {
      console.error('Error updating Tomcat port:', error);
      throw error;
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
}

async function handleStopTomcat(installPath, type, port) {
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
}

// Called when Electron has finished initialization
app.whenReady().then(() => {
  const config = loadConfig();
  
  // Create tray first
  createTray();
  
  // Then create window
  createWindow();

  // Set auto-launch
  if (config.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true
    });
  }

  // On macOS, re-create a window when the dock icon is clicked and there are no other windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', (event) => {
  const config = loadConfig();
  if (process.platform !== 'darwin' && !config.minimizeToTray) {
    app.quit();
  }
})

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// Handle "start-tomcat" requests from the renderer process
ipcMain.handle('start-tomcat', async (event, installPath, type, port) => {
  try {
    const result = await handleStartTomcat(installPath, type, port);
    showNotification('TomKit', 'Tomcat started successfully');
    return result;
  } catch (error) {
    showNotification('TomKit Error', 'Failed to start Tomcat');
    throw error;
  }
});

// Handle "stop-tomcat" requests from the renderer process
ipcMain.handle('stop-tomcat', async (event, installPath, type, port) => {
  try {
    const result = await handleStopTomcat(installPath, type, port);
    showNotification('TomKit', 'Tomcat stopped successfully');
    return result;
  } catch (error) {
    showNotification('TomKit Error', 'Failed to stop Tomcat');
    throw error;
  }
});

// Handle version request
ipcMain.handle('get-app-version', async () => {
  return getAppVersion();
});

// Handle configuration saving
ipcMain.handle('save-config', async (event, config) => {
  return saveConfig(config);
});

// Handle configuration loading
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

// Handle auto-start setting
ipcMain.handle('set-auto-start', async (event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled
    });
    return { success: true };
  } catch (error) {
    console.error('Error setting auto-start:', error);
    return { success: false, error: error.message };
  }
});

// Handle show/hide window
ipcMain.on('toggle-window-visibility', () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  }
});

// Handle minimize window
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    const config = loadConfig();
    console.log('Minimize window requested. Config minimizeToTray:', config.minimizeToTray);
    console.log('Tray exists:', !!tray);
    
    if (config.minimizeToTray && tray) {
      console.log('Hiding window to tray');
      mainWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
      
      // Show notification to let user know app is in tray
      if (config.notifications) {
        showNotification('TomKit', 'Application minimized to system tray');
      }
    } else {
      console.log('Minimizing window normally (tray not available or disabled)');
      mainWindow.minimize();
    }
  }
});

// Handle Tomcat status check
ipcMain.handle('check-tomcat-status', async (event, installPath, type, port) => {
  return new Promise((resolve) => {
    // Check if Tomcat is running by attempting to connect to the specified port
    const net = require('net');
    const client = new net.Socket();
    
    const checkPort = port || '8080'; // Default to 8080 if no port specified
    
    client.setTimeout(2000); // 2 second timeout
    
    client.connect(checkPort, 'localhost', () => {
      client.destroy();
      resolve({ running: true, port: checkPort });
    });
    
    client.on('error', () => {
      client.destroy();
      resolve({ running: false, port: checkPort });
    });
    
    client.on('timeout', () => {
      client.destroy();
      resolve({ running: false, port: checkPort });
    });
  });
});

// Handle quit request
ipcMain.on('quit-app', () => {
  app.quit();
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

function openLogWindow(logPath) {
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
    // Send the log path to the renderer so it knows which file to clear
    logWindow.webContents.send('start-tail', logPath);
    
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
}

ipcMain.on('open-log-window', (event, logPath) => {
  openLogWindow(logPath);
});

// Handle tail catalina request (if needed for future functionality)
ipcMain.on('tail-catalina', (event, logPath) => {
  // This could be used for manual tail requests, but currently handled in openLogWindow
  console.log('Manual tail request for:', logPath);
});

// Handle clear log file request
ipcMain.handle('clear-log-file', async (event, logPath) => {
  try {
    // If no specific path is provided, try to determine the catalina log path
    if (!logPath) {
      const config = loadConfig();
      let catalinaLogPath;
      
      if (config.installType === 'homebrew') {
        catalinaLogPath = '/usr/local/opt/tomcat/libexec/logs/catalina.out';
      } else if (config.installLocation) {
        catalinaLogPath = path.join(config.installLocation, 'logs', 'catalina.out');
      } else {
        throw new Error('Unable to determine log file path');
      }
      
      logPath = catalinaLogPath;
    }
    
    // Check if the log file exists
    if (!fs.existsSync(logPath)) {
      throw new Error('Log file does not exist');
    }
    
    // Clear the log file by writing an empty string to it
    fs.writeFileSync(logPath, '');
    
    console.log(`Log file cleared: ${logPath}`);
    showNotification('TomKit', 'Log file cleared successfully');
    
    return { success: true, message: 'Log file cleared successfully' };
  } catch (error) {
    console.error('Error clearing log file:', error);
    showNotification('TomKit Error', `Failed to clear log file: ${error.message}`);
    throw error;
  }
});