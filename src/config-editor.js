const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get config path
const configDir = path.join(os.homedir(), 'Library', 'Application Support', 'my-electron-app');
const configPath = path.join(configDir, 'config.json');

// Read current config
const currentConfig = fs.existsSync(configPath) 
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {};

// Update with new values from command line arguments
const args = process.argv.slice(2);
let updated = false;

for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    if (value) {
        // Convert string "true"/"false" to boolean
        currentConfig[key] = value === 'true' ? true : 
                           value === 'false' ? false : 
                           value;
        updated = true;
    }
}

if (updated) {
    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Save updated config
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
    console.log('Configuration updated successfully');
    console.log(JSON.stringify(currentConfig, null, 2));
} else {
    // Display current config
    console.log('Current configuration:');
    console.log(JSON.stringify(currentConfig, null, 2));
}