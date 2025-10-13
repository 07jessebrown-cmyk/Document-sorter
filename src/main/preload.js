const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  startSorting: (filePaths) => ipcRenderer.send('start:sorting', filePaths),
  analyzeFile: (filePath) => ipcRenderer.invoke('analyze-file', filePath),
  
  // Event listeners
  onMenuOpenFiles: (callback) => ipcRenderer.on('menu-open-files', callback),
  onMenuStartSorting: (callback) => ipcRenderer.on('menu-start-sorting', callback),
  onMenuShowAbout: (callback) => ipcRenderer.on('menu-show-about', callback),
  onFileProcessed: (callback) => ipcRenderer.on('file:processed', (_event, payload) => callback(payload)),
  onProcessingComplete: (callback) => ipcRenderer.on('processing:complete', (_event, summary) => callback(summary)),
  
  // AI and status
  getAIStatus: () => ipcRenderer.invoke('get-ai-status'),
  toggleAI: (enabled) => ipcRenderer.invoke('toggle-ai', enabled),
  
  // Configuration
  getExtractionConfig: () => ipcRenderer.invoke('get-extraction-config'),
  updateExtractionConfig: (config) => ipcRenderer.invoke('update-extraction-config', config),
  
  // Stats and settings
  getStats: () => ipcRenderer.invoke('get-stats'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  
  // Telemetry
  clearTelemetry: () => ipcRenderer.invoke('clear-telemetry'),
  exportTelemetry: () => ipcRenderer.invoke('export-telemetry'),
  
  // AI and Settings
  suggestRename: (filePath) => ipcRenderer.invoke('ai:suggest-rename', filePath),
  saveApiKey: (key) => ipcRenderer.invoke('settings:save-api-key', key),
  getApiKey: () => ipcRenderer.invoke('settings:get-api-key'),
  hasApiKey: () => ipcRenderer.invoke('settings:has-api-key'),
  testApiKey: (key) => ipcRenderer.invoke('settings:test-api-key', key)
});