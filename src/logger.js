const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');
const configManager = require('./config-manager');

const API_CONFIG = configManager.loadConfig();

class Logger {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles || 10;
    this.logDir =
      options.logDir ||
      path.join(os.homedir(), 'logs', 'OHIP Reservation Scanner');
    this.logFileName = options.logFileName || 'OHIP Reservation Scanner';
    this.currentLogFile = null;
    this.previousLogFile = null;
    this.currentDate = null;
    this.deviceId = os.hostname();
    this.serverUrl = `${API_CONFIG?.Mrz_baseURL}/upload-log`;
    this.uploadEnabled = API_CONFIG?.Log_uploadEnabled;
    this.retentionDays = API_CONFIG?.Log_retentionDays || 14;
    this.isUploading = false;
    this.isInitialized = false;

    this.ensureLogDirectory();
    this.initializeCurrentLogFile();
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

  // Call this once after app is ready
  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      if (this.uploadEnabled) {
        // Wait for app to settle before uploading
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.uploadAllLogs();
      }
    } catch (err) {
      console.error('Error in logger initialization:', err.message);
    }
  }

  getCurrentFileSize() {
    try {
      return fs.statSync(this.currentLogFile).size;
    } catch {
      return 0;
    }
  }

  shouldRotateLog() {
    const today = this.getDateString();
    return (
      today !== this.currentDate ||
      this.getCurrentFileSize() >= this.maxFileSize
    );
  }

  rotateLog() {
    if (this.currentLogFile) {
      this.previousLogFile = this.currentLogFile;
    }
    this.initializeCurrentLogFile();
  }

  async uploadAndDelete(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found: ${filePath}, skipping upload`);
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        console.warn(
          `⚠️ Skipping upload (empty file): ${path.basename(filePath)}`
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return false;
      }

      const modifiedAgo = Date.now() - stats.mtimeMs;
      if (modifiedAgo < 10000) {
        console.warn(
          `⚠️ File "${path.basename(filePath)}" modified ${Math.round(
            modifiedAgo / 1000
          )}s ago — likely still being written. Will retry later.`
        );
        return false;
      }

      console.log(`⬆️ Uploading ${path.basename(filePath)}...`);

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

      console.log(
        `☁️ Uploaded log: ${path.basename(filePath)} →`,
        res.data.message
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted local log: ${path.basename(filePath)}`);
      }
      return true;
    } catch (err) {
      console.error(
        `❌ Upload failed for ${path.basename(filePath)}: ${err.message}`
      );
      if (err.response?.status === 422) {
        console.error('   Validation error - check form data format');
      } else if (err.response?.status === 400) {
        console.error('   Bad request - missing required fields');
      }
      return false;
    }
  }

  async uploadAllLogs() {
    if (this.isUploading) {
      console.log('⏳ Upload already in progress, skipping...');
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
        console.log('📭 No old logs to upload');
        return;
      }

      console.log(`📤 Starting upload of ${files.length} log file(s)...`);

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

        // Delay between uploads
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(
        `✅ Upload complete: ${uploaded} succeeded, ${failed} failed`
      );
    } catch (err) {
      console.error('Error during batch upload:', err.message);
    } finally {
      this.isUploading = false;
    }
  }

  logToFile(...args) {
    try {
      // Rotate if needed
      if (this.shouldRotateLog()) {
        this.rotateLog();
      }

      // Write to current log file
      const msg = `[${new Date().toISOString()}] ${args.map(String).join(' ')}`;
      fs.appendFileSync(this.currentLogFile, msg + '\n');

      // Trigger background upload ONLY after rotation and ONLY if not already uploading
      if (
        this.uploadEnabled &&
        !this.isUploading &&
        this.previousLogFile &&
        fs.existsSync(this.previousLogFile)
      ) {
        // Fire and forget - don't await
        this.uploadAllLogs().catch((err) =>
          console.error('Background upload error:', err.message)
        );
        this.previousLogFile = null; // Clear so we don't re-trigger
      }
    } catch (err) {
      console.error('Error writing to log file:', err.message);
    }
  }
}

// Singleton instance - only one logger for the entire app
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

// Convenience function that uses the singleton
function logToFile(...args) {
  getLogger().logToFile(...args);
}

// Initialize after app is ready
async function initializeLogger() {
  await getLogger().initialize();
}

module.exports = {
  Logger,
  logToFile,
  getLogger,
  initializeLogger,
};
