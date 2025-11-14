const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');
const configManager = require('./config-manager');
const { ipcRenderer } = require('electron');

const API_CONFIG = configManager.loadConfig();

function debugLog(emoji, message, data = null) {
  const logMessage = `${emoji} [RENDERER] ${message}`;
  const logData = data || '';

  try {
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
      ipcRenderer.send('log-message', logMessage, logData);
    }
  } catch (_) {
    // running in main, ignore silently
  }

  console.log(logMessage, logData);
}

class Logger {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB default
    this.maxFiles = options.maxFiles || 10;
    this.logDir =
      options.logDir ||
      path.join(os.homedir(), 'logs', 'OHIP Reservation Scanner');
    this.logFileName = options.logFileName || 'OHIP Reservation Scanner';
    this.currentLogFile = null;
    this.currentDate = null;
    this.deviceId = os.hostname();
    this.serverUrl = `${API_CONFIG?.Mrz_baseURL}/upload-log`;
    this.uploadEnabled = API_CONFIG?.Log_uploadEnabled;
    this.retentionDays = API_CONFIG?.Log_retentionDays || 14;
    this.isUploading = false;
    this.isInitialized = false;

    this.ensureLogDirectory();
    this.initializeCurrentLogFile();
    this.cleanupOldLogs(); // Clean up on startup
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir))
      fs.mkdirSync(this.logDir, { recursive: true });
  }

  getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  initializeCurrentLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentLogFile = path.join(
      this.logDir,
      `${this.logFileName}-${timestamp}.log`
    );
    this.currentDate = this.getDateString();
  }

  // NEW: Clean up old logs on startup
  cleanupOldLogs() {
    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter((f) => f.startsWith(this.logFileName) && f.endsWith('.log'))
        .sort()
        .reverse();

      // Delete files beyond maxFiles limit
      if (files.length > this.maxFiles) {
        const filesToDelete = files.slice(this.maxFiles);
        filesToDelete.forEach((file) => {
          try {
            const fullPath = path.join(this.logDir, file);
            fs.unlinkSync(fullPath);
            debugLog('🗑️', `Cleaned up old log: ${file}`);
          } catch (err) {
            debugLog('⚠️', `Failed to delete old log ${file}:`, err.message);
          }
        });
      }
    } catch (err) {
      debugLog('⚠️', 'Error during log cleanup:', err.message);
    }
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.uploadEnabled) {
      setTimeout(() => {
        this.uploadAllLogs().catch((err) => {
          debugLog('❌', 'Error in deferred upload:', err.message);
        });
      }, 5000);
    }
  }

  getCurrentFileSize() {
    try {
      return fs.statSync(this.currentLogFile).size;
    } catch {
      return 0;
    }
  }

  // FIX: Check BEFORE writing, not after
  shouldRotateLog() {
    const today = this.getDateString();

    // Rotate if date changed
    if (today !== this.currentDate) {
      return true;
    }

    // Rotate if file exists and is at max size (check current size)
    if (fs.existsSync(this.currentLogFile)) {
      const size = this.getCurrentFileSize();
      if (size >= this.maxFileSize) {
        debugLog(
          '⚠️',
          `Log file size (${(size / 1024 / 1024).toFixed(
            2
          )}MB) reached limit (${(this.maxFileSize / 1024 / 1024).toFixed(
            2
          )}MB), rotating...`
        );
        return true;
      }
    }

    return false;
  }

  rotateLog() {
    if (this.currentLogFile && fs.existsSync(this.currentLogFile)) {
      // Archive current log with timestamp
      const stats = fs.statSync(this.currentLogFile);
      const archiveTime = new Date(stats.mtime)
        .toISOString()
        .replace(/[:.]/g, '-');
      const archivePath = this.currentLogFile.replace(
        '.log',
        `.archive-${archiveTime}.log`
      );

      try {
        fs.renameSync(this.currentLogFile, archivePath);
        debugLog('📦', `Rotated log to: ${path.basename(archivePath)}`);

        // Trigger async upload of archived file
        if (this.uploadEnabled && !this.isUploading) {
          this.uploadAndDelete(archivePath).catch((err) => {
            debugLog('⚠️', 'Background upload error:', err.message);
          });
        }
      } catch (err) {
        debugLog('⚠️', 'Error archiving log:', err.message);
      }
    }

    // Create new log file
    this.initializeCurrentLogFile();
  }

  async uploadAndDelete(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        debugLog('⚠️', `File not found: ${filePath}, skipping upload`);
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        debugLog(`⚠️ Skipping upload (empty file): ${path.basename(filePath)}`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return false;
      }

      const modifiedAgo = Date.now() - stats.mtimeMs;
      if (modifiedAgo < 10000) {
        debugLog(
          `⚠️ File "${path.basename(filePath)}" modified ${Math.round(
            modifiedAgo / 1000
          )}s ago — likely still being written. Will retry later.`
        );
        return false;
      }

      debugLog('⬆️', `Uploading ${path.basename(filePath)}...`);

      const form = new FormData();
      form.append('deviceId', this.deviceId);
      form.append('timestamp', new Date().toISOString());
      form.append('retentionDays', String(this.retentionDays));
      form.append(
        'file',
        fs.createReadStream(filePath),
        path.basename(filePath)
      );

      const res = await axios.post(this.serverUrl, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000,
      });

      debugLog(
        '☁️',
        `Uploaded log: ${path.basename(filePath)} → ${res.data.message}`
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        debugLog('🗑️', `Deleted local log: ${path.basename(filePath)}`);
      }
      return true;
    } catch (err) {
      debugLog(
        '❌',
        `Upload failed for ${path.basename(filePath)}: ${err.message}`
      );
      if (err.response?.status === 422) {
        debugLog('❌', '   Validation error - check form data format');
      } else if (err.response?.status === 400) {
        debugLog('❌', '   Bad request - missing required fields');
      }
      return false;
    }
  }

  async uploadAllLogs() {
    if (this.isUploading) {
      debugLog('⏳', 'Upload already in progress, skipping...');
      return;
    }

    this.isUploading = true;

    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter(
          (f) =>
            f.startsWith(this.logFileName) &&
            f.endsWith('.log') &&
            path.join(this.logDir, f) !== this.currentLogFile
        )
        .sort();

      if (files.length === 0) {
        debugLog('📭', 'No old logs to upload');
        return;
      }

      debugLog('📤', `Starting upload of ${files.length} log file(s)...`);
      let uploaded = 0;
      let failed = 0;

      for (const file of files) {
        const fullPath = path.join(this.logDir, file);

        if (!fs.existsSync(fullPath)) continue;

        const result = await this.uploadAndDelete(fullPath);

        if (result === true) {
          uploaded++;
        } else {
          failed++;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      debugLog(
        '✅',
        `Upload complete: ${uploaded} succeeded, ${failed} failed`
      );
    } catch (err) {
      debugLog('❌', 'Error during batch upload:', err.message);
    } finally {
      this.isUploading = false;
    }
  }

  logToFile(...args) {
    try {
      // Check BEFORE writing if we need to rotate
      if (this.shouldRotateLog()) {
        this.rotateLog();
      }

      // Write to current log file (synchronous, fast)
      const msg = `[${new Date().toISOString()}] ${args.map(String).join(' ')}`;
      fs.appendFileSync(this.currentLogFile, msg + '\n');
    } catch (err) {
      debugLog('❌', 'Error writing to log file:', err.message);
    }
  }
}

let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

function logToFile(...args) {
  getLogger().logToFile(...args);
}

async function initializeLogger() {
  await getLogger().initialize();
}

module.exports = {
  Logger,
  logToFile,
  getLogger,
  initializeLogger,
};
