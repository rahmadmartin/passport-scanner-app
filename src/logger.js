const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles || 10; // Keep 10 files max
    this.logDir =
      options.logDir ||
      path.join(os.homedir(), 'logs', 'OHIP Reservation Scanner');
    this.logFileName = options.logFileName || 'OHIP Reservation Scanner';
    this.currentLogFile = null;
    this.currentDate = null;

    // Ensure log directory exists
    this.ensureLogDirectory();
    this.initializeCurrentLogFile();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getDateString() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  initializeCurrentLogFile() {
    const today = this.getDateString();
    this.currentDate = today;

    // Try to find an existing log file for today
    const existingFile = this.findExistingLogFileForDate(today);

    if (existingFile) {
      this.currentLogFile = existingFile;
    } else {
      // Create new log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.currentLogFile = path.join(
        this.logDir,
        `${this.logFileName}-${timestamp}.log`
      );
    }
  }

  findExistingLogFileForDate(date) {
    try {
      const files = fs.readdirSync(this.logDir);
      const pattern = new RegExp(
        `^${this.logFileName}-${date.replace(/-/g, '')}`
      );

      for (const file of files) {
        if (file.match(pattern) && file.endsWith('.log')) {
          return path.join(this.logDir, file);
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  getCurrentFileSize() {
    try {
      const stats = fs.statSync(this.currentLogFile);
      return stats.size;
    } catch (error) {
      return 0; // File doesn't exist yet
    }
  }

  shouldRotateLog() {
    // Rotate if:
    // 1. The date has changed OR
    // 2. The file size exceeds the maximum
    const today = this.getDateString();
    return (
      today !== this.currentDate ||
      this.getCurrentFileSize() >= this.maxFileSize
    );
  }

  rotateLog() {
    // Check if we just need to update the date (no size limit hit)
    const today = this.getDateString();
    if (
      today !== this.currentDate &&
      this.getCurrentFileSize() < this.maxFileSize
    ) {
      this.currentDate = today;
      return; // Keep using the same file
    }

    // Otherwise create new log file
    this.initializeCurrentLogFile();

    // Clean up old log files if we exceed maxFiles
    this.cleanupOldLogs();
  }

  cleanupOldLogs() {
    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter(
          (file) => file.startsWith(this.logFileName) && file.endsWith('.log')
        )
        .map((file) => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first

      // Remove excess files
      if (files.length > this.maxFiles) {
        const filesToDelete = files.slice(this.maxFiles);
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path);
          console.log(`Deleted old log file: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('Error cleaning up old logs:', error.message);
    }
  }

  logToFile(...args) {
    try {
      // Check if we need to rotate the log
      if (this.shouldRotateLog()) {
        this.rotateLog();
      }

      const timestamp = new Date().toISOString();
      const msg = `[${timestamp}] ` + args.map(String).join(' ');

      fs.appendFileSync(this.currentLogFile, msg + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error.message);
    }
  }

  // Get current log file path
  getCurrentLogPath() {
    return this.currentLogFile;
  }

  // Get all log files
  getLogFiles() {
    try {
      return fs
        .readdirSync(this.logDir)
        .filter(
          (file) => file.startsWith(this.logFileName) && file.endsWith('.log')
        )
        .map((file) => path.join(this.logDir, file));
    } catch (error) {
      return [];
    }
  }
}

// Create a default logger instance
const defaultLogger = new Logger();

// Convenience function that matches your original API
function logToFile(...args) {
  defaultLogger.logToFile(...args);
}

// Export both the class and convenience function
module.exports = {
  Logger,
  logToFile,
  defaultLogger,
};
