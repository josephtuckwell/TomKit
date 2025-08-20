const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

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

// Check Tomcat status
function checkTomcatStatus(installPath, type, port) {
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
}

module.exports = {
  updateTomcatPort,
  startTomcat: handleStartTomcat,
  stopTomcat: handleStopTomcat,
  checkTomcatStatus
};
