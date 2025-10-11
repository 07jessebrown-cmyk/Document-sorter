const fs = require('fs');
const crashLog = require('path').join(require('os').homedir(), 'Desktop', 'CRASH.log');
fs.writeFileSync(crashLog, 'Starting...\n');

try {
  const { app } = require('electron');
  fs.appendFileSync(crashLog, 'Electron loaded\n');
  
  fs.appendFileSync(crashLog, 'Loading main-enhanced...\n');
  require('./src/main/main-enhanced.js');
  
} catch (err) {
  fs.appendFileSync(crashLog, `ERROR: ${err.message}\n${err.stack}\n`);
}