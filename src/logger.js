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

    // Ensure log directory exists
    this.ensureLogDirectory();
    this.initializeCurrentLogFile();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  initializeCurrentLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentLogFile = path.join(
      this.logDir,
      `${this.logFileName}-${timestamp}.log`
    );
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
    return this.getCurrentFileSize() >= this.maxFileSize;
  }

  rotateLog() {
    // Create new log file
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

  // Archive logs to a zip file (requires additional dependency)
  archiveLogs(archivePath) {
    // This would require a library like 'archiver' or 'adm-zip'
    // Implementation left as an exercise based on your needs
    console.log('Archive functionality would go here');
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

// Example usage:
/*
// Using the convenience function (same as your original)
logToFile('This is a test message');

// Using a custom logger
const customLogger = new Logger({
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 5,
  logDir: path.join(__dirname, 'custom-logs'),
  logFileName: 'my-app'
});

customLogger.logToFile('Custom logger message');
*/
