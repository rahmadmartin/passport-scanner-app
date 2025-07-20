const fs = require('fs');
const path = require('path');
const os = require('os');

const logPath = path.join(os.homedir(), 'scanner-app.log');

function logToFile(...args) {
  const msg = `[${new Date().toISOString()}] ` + args.map(String).join(' ');
  fs.appendFileSync(logPath, msg + '\n');
}

module.exports = { logToFile };