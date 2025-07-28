const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    console.log('📂 Initializing ConfigManager');
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
      console.log('📁 Creating config directory');
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Create empty config if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      console.log('📄 Creating initial config file');
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
      console.log('✅ Empty config file created successfully');
      return emptyConfig;
    } catch (error) {
      console.error('❌ Error creating empty config:', error);
      throw error;
    }
  }

  loadConfig() {
    console.log('🔄 Loading config');
    try {
      if (fs.existsSync(this.configPath)) {
        console.log('📄 Reading existing config file');
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        console.log('✅ Config loaded successfully');
        return this.validateConfig(config);
      }
      console.log('⚠️ Config file not found, creating new one');
      return this.createEmptyConfig();
    } catch (error) {
      console.error('❌ Error loading config:', error);
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
      console.warn(
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
      console.error('Error saving config:', error);
      return false;
    }
  }
}

module.exports = new ConfigManager();
