const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer to communicate via IPC safely
contextBridge.exposeInMainWorld('electronAPI', {
  handleFileDrop: (filePaths) => ipcRenderer.invoke('file:dropped', filePaths),
  startSorting: (filePaths) => ipcRenderer.send('start:sorting', filePaths),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  onFileProcessed: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('file:processed', listener);
    return () => ipcRenderer.removeListener('file:processed', listener);
  },
  onProcessingComplete: (callback) => {
    const listener = (_event, summary) => callback(summary);
    ipcRenderer.on('processing:complete', listener);
    return () => ipcRenderer.removeListener('processing:complete', listener);
  },
  // Menu event handlers
  onMenuOpenFiles: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('menu:open-files', listener);
    return () => ipcRenderer.removeListener('menu:open-files', listener);
  },
  onMenuStartSorting: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('menu:start-sorting', listener);
    return () => ipcRenderer.removeListener('menu:start-sorting', listener);
  },
  onMenuShowAbout: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('menu:show-about', listener);
    return () => ipcRenderer.removeListener('menu:show-about', listener);
  },
  // AI and settings related methods
  getAIStatus: () => ipcRenderer.invoke('get-ai-status'),
  toggleAI: (enabled) => ipcRenderer.invoke('toggle-ai', enabled),
  getStats: () => ipcRenderer.invoke('get-stats'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  clearTelemetry: () => ipcRenderer.invoke('clear-telemetry'),
  exportTelemetry: () => ipcRenderer.invoke('export-telemetry'),
  // Extraction configuration methods
  getExtractionConfig: () => ipcRenderer.invoke('get-extraction-config'),
  updateExtractionConfig: (config) => ipcRenderer.invoke('update-extraction-config', config)
});
