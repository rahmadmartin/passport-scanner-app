function createDebugLogger(ipcRenderer, targetConsole = console) {
  return function debugLog(emoji, message, data = null) {
    const logMessage = `${emoji} [RENDERER] ${message}`;
    const logData = data || '';

    ipcRenderer.send('log-message', logMessage, logData);
    targetConsole.log(logMessage, logData);
  };
}

module.exports = { createDebugLogger };
