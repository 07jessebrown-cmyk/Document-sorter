const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsService {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return {};
  }

  save() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  saveApiKey(apiKey) {
    const encoded = Buffer.from(apiKey).toString('base64');
    this.settings.openaiApiKey = encoded;
    this.save();
  }

  getApiKey() {
    if (this.settings.openaiApiKey) {
      return Buffer.from(this.settings.openaiApiKey, 'base64').toString('utf8');
    }
    return null;
  }

  hasApiKey() {
    return !!this.settings.openaiApiKey;
  }
}

module.exports = new SettingsService();
