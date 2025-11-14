const fs = require('fs');
const path = require('path');
const os = require('os');
const { ipcRenderer } = require('electron');

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

class ConfigManager {
  constructor() {
    debugLog('📂', 'Initializing ConfigManager');
    // Cross-platform config directory
    if (process.platform === 'darwin') {
      // macOS
      this.configDir = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'ohip-reservation-scanner'
      );
    } else if (process.platform === 'win32') {
      // Windows
      this.configDir = path.join(
        process.env.APPDATA,
        'ohip-reservation-scanner'
      );
    } else {
      // Linux or others
      this.configDir = path.join(
        os.homedir(),
        '.config',
        'ohip-reservation-scanner'
      );
    }
    this.configPath = path.join(this.configDir, 'config.json');

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      debugLog('📁', 'Creating config directory');
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Create empty config if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      debugLog('📄', 'Creating initial config file');
      this.createEmptyConfig();
    }
  }

  getDefaultConfig() {
    return {
      Ohip_similarity: '50.0',
      Ohip_overwrite: false,
      Ohip_hotelId: '',
      Ohip_baseURL: '',
      Ohip_appKey: '',
      Ohip_authMethod: '',
      Ohip_enterpriseId: '',
      Ohip_user: '',
      Ohip_password: '',
      Mrz_baseURL: '',
    };
  }

  createEmptyConfig() {
    const emptyConfig = this.getDefaultConfig();
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(emptyConfig, null, 2));
      debugLog('✅', 'Empty config file created successfully');
      return emptyConfig;
    } catch (error) {
      debugLog('❌', 'Error creating empty config:', error);
      throw error;
    }
  }

  loadConfig() {
    debugLog('🔄', 'Loading config');
    try {
      if (fs.existsSync(this.configPath)) {
        debugLog('📄', 'Reading existing config file');
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        debugLog('✅', 'Config loaded successfully');
        return this.validateConfig(config);
      }
      debugLog('⚠️', 'Config file not found, creating new one');
      return this.createEmptyConfig();
    } catch (error) {
      debugLog('❌', 'Error loading config:', error);
      return this.createEmptyConfig();
    }
  }

  validateConfig(config) {
    const required = [
      'similarity',
      'hotelId',
      'baseURL',
      'appKey',
      'authMethod',
    ];

    // Only validate if all required fields have values
    const hasAllValues = required.every(
      (field) => field in config && config[field] !== ''
    );

    if (!hasAllValues) {
      debugLog(
        '⚠️',
        'Configuration is incomplete. Please fill in all required fields.'
      );
      return config;
    }

    return config;
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      debugLog('❌', 'Error saving config:', error);
      return false;
    }
  }
}

module.exports = new ConfigManager();
