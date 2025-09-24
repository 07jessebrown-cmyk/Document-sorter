// DOM elements
const dropZone = document.getElementById('dropZone');
const fileList = document.getElementById('fileList');
const fileListItems = document.getElementById('fileListItems');
const previewTable = document.getElementById('previewTable');
const previewTableBody = document.getElementById('previewTableBody');
const status = document.getElementById('status');
const browseBtn = document.getElementById('browseBtn');
const startSortingBtn = document.getElementById('startSortingBtn');
const settingsBtn = document.getElementById('settingsBtn');

// Settings modal elements
const settingsModal = document.getElementById('settingsModal');
const useAIToggle = document.getElementById('useAIToggle');
const aiConfidenceThreshold = document.getElementById('aiConfidenceThreshold');
const confidenceValue = document.getElementById('confidenceValue');
const aiModel = document.getElementById('aiModel');
const saveSettingsBtn = document.getElementById('saveSettings');
const cancelSettingsBtn = document.getElementById('cancelSettings');
const closeModal = document.querySelector('.close');

// Table modal elements
const tableModal = document.getElementById('tableModal');
const tableDetails = document.getElementById('tableDetails');
const closeTableModal = document.getElementById('closeTableModal');
const closeTableModalBtn = document.getElementById('closeTableModalBtn');

// Extraction configuration elements
const useOCRToggle = document.getElementById('useOCRToggle');
const useTableExtractionToggle = document.getElementById('useTableExtractionToggle');
const useLLMEnhancerToggle = document.getElementById('useLLMEnhancerToggle');

// Tab elements
const tabButtons = document.querySelectorAll('.tab-button');
const settingsTab = document.getElementById('settingsTab');
const diagnosticsTab = document.getElementById('diagnosticsTab');

// Diagnostics elements
const refreshDiagnosticsBtn = document.getElementById('refreshDiagnostics');
const clearTelemetryBtn = document.getElementById('clearTelemetry');
const exportTelemetryBtn = document.getElementById('exportTelemetry');

// Local state: collected file paths (full paths)
const pendingFilePaths = new Set();
const fileMetadata = new Map(); // Store metadata for each file

// Drag and drop event handlers
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
dropZone.addEventListener('click', handleDropZoneClick);
browseBtn.addEventListener('click', handleBrowseClick);
startSortingBtn.addEventListener('click', handleStartSorting);
settingsBtn.addEventListener('click', handleSettingsClick);

// Settings modal event listeners
closeModal.addEventListener('click', closeSettingsModal);
cancelSettingsBtn.addEventListener('click', closeSettingsModal);
saveSettingsBtn.addEventListener('click', handleSaveSettings);
aiConfidenceThreshold.addEventListener('input', updateConfidenceValue);

// Table modal event listeners
closeTableModal.addEventListener('click', closeTableModalHandler);
closeTableModalBtn.addEventListener('click', closeTableModalHandler);

// Tab event listeners
tabButtons.forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

// Diagnostics event listeners
refreshDiagnosticsBtn.addEventListener('click', refreshDiagnostics);
clearTelemetryBtn.addEventListener('click', clearTelemetry);
exportTelemetryBtn.addEventListener('click', exportTelemetry);

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

// Prevent default drag behaviors on the entire document
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Menu event handlers
if (window.electronAPI) {
  // Handle menu:open-files
  window.electronAPI.onMenuOpenFiles(() => {
    handleBrowseClick();
  });

  // Handle menu:start-sorting
  window.electronAPI.onMenuStartSorting(() => {
    handleStartSorting();
  });

  // Handle menu:show-about
  window.electronAPI.onMenuShowAbout(() => {
    showAboutDialog();
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
    
  // Add visual feedback
  dropZone.classList.add('drag-over');
  updateStatus('Drop files to sort them');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
    
  // Only remove drag-over class if we're actually leaving the drop zone
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
    updateStatus('');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
    
  // Remove visual feedback
  dropZone.classList.remove('drag-over');
    
  // Get the dropped files
  const files = Array.from(e.dataTransfer.files);
    
  if (files.length === 0) {
    updateStatus('No files detected. Please try again.', 'error');
    return;
  }
    
  // Create array of file paths and validate them
  const filePaths = files.map(f => f.path);
  const validFilePaths = filePaths.filter(path => {
    return typeof path === 'string' && path.trim().length > 0;
  });
    
  console.log('Dropped files - Original paths:', filePaths);
  console.log('Dropped files - Valid paths:', validFilePaths);
    
  if (validFilePaths.length === 0) {
    console.error('No valid file paths found in dropped files');
    updateStatus('No valid files detected. Please try again.', 'error');
    return;
  }
    
  if (validFilePaths.length !== filePaths.length) {
    console.warn(`Filtered out ${filePaths.length - validFilePaths.length} invalid file paths`);
    updateStatus(`Added ${validFilePaths.length} valid file(s) (${filePaths.length - validFilePaths.length} invalid files ignored)`, 'warning');
  } else {
    updateStatus(`Added ${validFilePaths.length} file(s)`, 'success');
  }
    
  addFilesToPending(validFilePaths, files);
}

function handleDropZoneClick() {
  // Open file dialog when drop zone is clicked
  handleBrowseClick();
}

async function handleBrowseClick() {
  try {
    console.log('Opening file dialog...');
    const filePaths = await window.electronAPI.openFileDialog();
        
    console.log('File dialog returned:', filePaths);
        
    if (filePaths && filePaths.length > 0) {
      // Validate file paths
      const validFilePaths = filePaths.filter(path => {
        return typeof path === 'string' && path.trim().length > 0;
      });
            
      console.log('Valid file paths from dialog:', validFilePaths);
            
      if (validFilePaths.length === 0) {
        console.error('No valid file paths found in dialog selection');
        updateStatus('No valid files selected. Please try again.', 'error');
        return;
      }
            
      if (validFilePaths.length !== filePaths.length) {
        console.warn(`Filtered out ${filePaths.length - validFilePaths.length} invalid file paths`);
        updateStatus(`Added ${validFilePaths.length} valid file(s) (${filePaths.length - validFilePaths.length} invalid files ignored)`, 'warning');
      } else {
        updateStatus(`Added ${validFilePaths.length} file(s)`, 'success');
      }
            
      addFilesToPending(validFilePaths);
    } else {
      console.log('No files selected or dialog was canceled');
      updateStatus('No files selected.', 'info');
    }
  } catch (error) {
    console.error('Error opening file dialog:', error);
    updateStatus('Error opening file dialog. Please try again.', 'error');
  }
}

function addFilesToPending(paths, fileListLike = []) {
  let addedCount = 0;
  paths.forEach((p) => {
    if (!pendingFilePaths.has(p)) {
      pendingFilePaths.add(p);
      addedCount += 1;
    }
  });
  displayFilesFromPaths(Array.from(pendingFilePaths), fileListLike);
  return addedCount;
}

function displayFilesFromPaths(paths, fileListLike = []) {
  // Clear previous file list
  fileListItems.innerHTML = '';
    
  // Create a quick lookup for sizes and names if provided
  const infoByPath = new Map();
  (fileListLike || []).forEach((f) => infoByPath.set(f.path, { name: f.name, size: f.size }));

  paths.forEach((fullPath) => {
    const info = infoByPath.get(fullPath) || { name: fullPath.split(/[\\/]/).pop() || fullPath, size: 0 };
    const listItem = document.createElement('li');
    listItem.className = 'file-item';
    listItem.dataset.path = fullPath;

    const fileIcon = getFileIcon(info.name);
    const fileSize = info.size ? formatFileSize(info.size) : '';
        
    listItem.innerHTML = `
            <span class="file-icon">${fileIcon}</span>
            <span class="file-name">${info.name}</span>
            <span class="file-size">${fileSize}</span>
            <span class="file-status" style="margin-left:8px;color:#888"></span>
        `;
    fileListItems.appendChild(listItem);
  });
    
  // Show the file list
  fileList.style.display = paths.length ? 'block' : 'none';
  
  // Update preview table
  updatePreviewTable();
  
  // Analyze metadata for new files
  paths.forEach(filePath => {
    if (!fileMetadata.has(filePath)) {
      analyzeFileMetadata(filePath);
    }
  });
}

function getFileIcon(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
    
  const iconMap = {
    'pdf': '📄',
    'doc': '📝',
    'docx': '��',
    'txt': '📄',
    'jpg': '��️',
    'jpeg': '🖼️',
    'png': '��️',
    'gif': '🖼️',
    'mp4': '��',
    'avi': '��',
    'mov': '��',
    'mp3': '��',
    'wav': '🎵',
    'zip': '📦',
    'rar': '📦',
    'folder': '📁'
  };
    
  return iconMap[extension] || '📄';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
    
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
    
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleStartSorting() {
  const paths = Array.from(pendingFilePaths);
    
  // Use .filter() to remove any values that are not valid strings
  const validPaths = paths.filter(path => {
    return typeof path === 'string' && path.trim().length > 0;
  });
    
  console.log('Start Sorting - Original paths:', paths);
  console.log('Start Sorting - Valid paths after filtering:', validPaths);
    
  if (validPaths.length === 0) {
    console.error('No valid files selected for processing');
    updateStatus('No valid files selected. Please add files first.', 'error');
    return;
  }
    
  updateStatus(`Starting to process ${validPaths.length} file(s)...`, 'info');
    
  // Mark all as pending in UI
  document.querySelectorAll('#fileListItems .file-item .file-status').forEach((el) => {
    el.textContent = '(pending)';
  });
    
  // Send the validated array to main process
  console.log('Sending validated file paths to main process:', validPaths);
  window.electronAPI.startSorting(validPaths);
}

function updateStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`;
    
  // Clear status after 3 seconds for success/info messages
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 3000);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  updateStatus('Ready to receive files');
    
  // Listen for individual file processed events
  const _unsubscribeFileProcessed = window.electronAPI.onFileProcessed((payload) => {
    const { originalPath, finalPath: _finalPath, success, error, message, analysis } = payload || {};
    const itemEl = document.querySelector(`#fileListItems .file-item[data-path="${CSS.escape(originalPath)}"] .file-status`);
    if (!itemEl) return;
        
    if (success) {
      itemEl.textContent = '✔ processed';
      itemEl.style.color = '#4CAF50';
      itemEl.title = message || 'Successfully processed';
      
      // Update metadata with enhanced analysis data
      if (analysis) {
        const metadata = fileMetadata.get(originalPath) || {};
        metadata.clientName = analysis.clientName || metadata.clientName;
        metadata.date = analysis.date || metadata.date;
        metadata.documentType = analysis.type || metadata.documentType;
        metadata.proposedFilename = generateProposedFilename(analysis);
        metadata.status = 'success';
        metadata.source = analysis.source || 'regex';
        metadata.confidence = analysis.confidence || 0;
        metadata.snippets = analysis.snippets || [];
        metadata.clientConfidence = analysis.clientConfidence;
        metadata.dateConfidence = analysis.dateConfidence;
        metadata.docTypeConfidence = analysis.docTypeConfidence;
        
        fileMetadata.set(originalPath, metadata);
        updatePreviewTable();
      }
    } else {
      itemEl.textContent = '✖ failed';
      itemEl.style.color = '#f44336';
      itemEl.title = message || error || 'Processing failed';
      
      // Update metadata with error status
      const metadata = fileMetadata.get(originalPath) || {};
      metadata.status = 'error';
      fileMetadata.set(originalPath, metadata);
      updatePreviewTable();
    }
  });
    
  // Listen for processing complete summary
  const _unsubscribeProcessingComplete = window.electronAPI.onProcessingComplete((summary) => {
    const { total, success, errors } = summary || {};
    if (total > 0) {
      let statusMessage = `Processing complete: ${success} successful`;
      if (errors > 0) {
        statusMessage += `, ${errors} failed`;
      }
      updateStatus(statusMessage, errors > 0 ? 'error' : 'success');
            
      // Log errors to console for debugging
      if (errors > 0) {
        console.error('Processing completed with errors');
      }
    }
  });
});

// About dialog function
// Preview table functions
function updatePreviewTable() {
  previewTableBody.innerHTML = '';
  
  if (pendingFilePaths.size === 0) {
    previewTable.style.display = 'none';
    return;
  }
  
  previewTable.style.display = 'block';
  
  Array.from(pendingFilePaths).forEach(filePath => {
    const metadata = fileMetadata.get(filePath) || {
      clientName: 'Analyzing...',
      date: 'Analyzing...',
      documentType: 'Analyzing...',
      proposedFilename: 'Analyzing...',
      status: 'pending',
      source: 'regex',
      confidence: 0,
      snippets: []
    };
    
    const row = document.createElement('tr');
    row.dataset.path = filePath;
    
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    
    // Generate confidence badge
    const confidenceBadge = generateConfidenceBadge(metadata.confidence);
    
    // Generate source indicator
    const sourceIndicator = generateSourceIndicator(metadata.source);
    
    // Generate snippets display
    const snippetsDisplay = generateSnippetsDisplay(metadata.snippets);
    
    // Generate tables display
    const tablesDisplay = generateTablesDisplay(metadata.tables);
    
    row.innerHTML = `
      <td title="${filePath}">${fileName}</td>
      <td>${metadata.clientName}</td>
      <td>${metadata.date}</td>
      <td>${metadata.documentType}</td>
      <td>${sourceIndicator}</td>
      <td>${confidenceBadge}</td>
      <td>${tablesDisplay}</td>
      <td>${snippetsDisplay}</td>
      <td>${metadata.proposedFilename}</td>
      <td><span class="file-status ${metadata.status}">${getStatusText(metadata.status)}</span></td>
    `;
    
    previewTableBody.appendChild(row);
  });
}

function getStatusText(status) {
  switch (status) {
    case 'pending': return 'Pending';
    case 'processing': return 'Processing...';
    case 'success': return 'Ready';
    case 'error': return 'Error';
    default: return 'Unknown';
  }
}

function generateConfidenceBadge(confidence) {
  if (confidence === undefined || confidence === null) {
    return '<span class="confidence-badge low">N/A</span>';
  }
  
  const percentage = Math.round(confidence * 100);
  let className = 'low';
  
  if (confidence >= 0.8) {
    className = 'high';
  } else if (confidence >= 0.5) {
    className = 'medium';
  }
  
  return `<span class="confidence-badge ${className}" title="Confidence: ${percentage}%">${percentage}%</span>`;
}

function generateSourceIndicator(source) {
  if (!source) {
    return '<span class="source-indicator regex">REGEX</span>';
  }
  
  const sourceMap = {
    'regex': 'REGEX',
    'fuzzy': 'FUZZY',
    'ai': 'AI',
    'hybrid': 'HYBRID',
    'ai-cached': 'AI-CACHED'
  };
  
  const displayText = sourceMap[source] || source.toUpperCase();
  return `<span class="source-indicator ${source}">${displayText}</span>`;
}

function generateSnippetsDisplay(snippets) {
  if (!snippets || !Array.isArray(snippets) || snippets.length === 0) {
    return '<span class="snippets-container">No snippets</span>';
  }
  
  const snippetItems = snippets.slice(0, 3).map(snippet => 
    `<div class="snippet-item" title="${snippet}">${snippet.length > 50 ? snippet.substring(0, 50) + '...' : snippet}</div>`
  ).join('');
  
  const moreCount = snippets.length > 3 ? snippets.length - 3 : 0;
  const moreText = moreCount > 0 ? `<div class="snippet-item">+${moreCount} more...</div>` : '';
  
  return `<div class="snippets-container">${snippetItems}${moreText}</div>`;
}

function generateTablesDisplay(tables) {
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    return '<span class="tables-container">No tables</span>';
  }
  
  const tableCount = tables.length;
  const tableInfo = tables.map((table, index) => {
    const rows = table.rows || 0;
    const cols = table.columns || 0;
    const page = table.page || 'N/A';
    return `${rows}×${cols} (p${page})`;
  }).join(', ');
  
  return `<div class="tables-container">
    <span class="table-count">${tableCount} table${tableCount > 1 ? 's' : ''}</span>
    <button class="btn-small" onclick="showTableDetails('${JSON.stringify(tables).replace(/'/g, '&#39;')}')">View</button>
  </div>`;
}

function generateProposedFilename(analysis) {
  const parts = [];
  
  // Client name
  let clientName = 'Client_NA';
  if (analysis.clientName && analysis.clientName.trim()) {
    clientName = analysis.clientName.trim().replace(/[<>:"/\\|?*]/g, '_');
  }
  parts.push(clientName);
  
  // Document type
  let documentType = 'Unclassified';
  if (analysis.type && analysis.type.trim()) {
    documentType = analysis.type.trim().replace(/[<>:"/\\|?*]/g, '_');
    // Add confidence indicator for low confidence
    if (analysis.confidence < 0.5) {
      documentType = `${documentType}_LowConfidence`;
    }
  }
  parts.push(documentType);
  
  // Date
  if (analysis.date) {
    parts.push(analysis.date);
  }
  
  // Source indicator
  if (analysis.source && analysis.source !== 'regex') {
    parts.push(`[${analysis.source.toUpperCase()}]`);
  }
  
  // Confidence indicator
  if (analysis.confidence < 0.7) {
    parts.push(`[${Math.round(analysis.confidence * 100)}%]`);
  }
  
  return parts.join('_') + '.pdf';
}

function analyzeFileMetadata(filePath) {
  // Update status to processing
  const metadata = fileMetadata.get(filePath) || {};
  metadata.status = 'processing';
  fileMetadata.set(filePath, metadata);
  updatePreviewTable();
  
  // Send to main process for analysis
  if (window.electronAPI && window.electronAPI.analyzeFile) {
    window.electronAPI.analyzeFile(filePath)
      .then(result => {
        const updatedMetadata = {
          clientName: result.clientName || 'Unknown',
          date: result.date || 'Unknown',
          documentType: result.documentType || 'Unknown',
          proposedFilename: result.proposedFilename || 'Unknown',
          status: 'success'
        };
        fileMetadata.set(filePath, updatedMetadata);
        updatePreviewTable();
      })
      .catch(error => {
        console.error('Error analyzing file:', error);
        const errorMetadata = {
          clientName: 'Error',
          date: 'Error',
          documentType: 'Error',
          proposedFilename: 'Error',
          status: 'error'
        };
        fileMetadata.set(filePath, errorMetadata);
        updatePreviewTable();
      });
  } else {
    // Fallback: simulate analysis
    setTimeout(() => {
      const simulatedMetadata = {
        clientName: 'Sample Client',
        date: new Date().toISOString().split('T')[0],
        documentType: 'Document',
        proposedFilename: `Sample_Client_${new Date().toISOString().split('T')[0]}_Document.pdf`,
        status: 'success'
      };
      fileMetadata.set(filePath, simulatedMetadata);
      updatePreviewTable();
    }, 1000);
  }
}

function showAboutDialog() {
  const aboutMessage = `Document Sorter v1.1 (AI Enhanced)

A desktop application for automatically sorting and organizing documents using AI-powered text analysis.

Features:
• Drag and drop file support
• PDF, DOCX, and image file processing
• Automatic document classification with AI fallback
• Smart file renaming and organization
• Confidence scoring and source attribution
• AI-powered snippet extraction
• Cross-platform support (Windows & macOS)

Built with Electron and Node.js`;
    
  alert(aboutMessage);
}

// Settings modal functions
function handleSettingsClick() {
  loadSettings();
  settingsModal.style.display = 'block';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

// Table modal functions
function closeTableModalHandler() {
  tableModal.style.display = 'none';
}

function showTableDetails(tablesJson) {
  try {
    const tables = JSON.parse(tablesJson);
    displayTableDetails(tables);
    tableModal.style.display = 'block';
  } catch (error) {
    console.error('Error parsing table data:', error);
    tableDetails.innerHTML = '<p>Error displaying table data</p>';
    tableModal.style.display = 'block';
  }
}

function displayTableDetails(tables) {
  if (!tables || tables.length === 0) {
    tableDetails.innerHTML = '<p>No table data available</p>';
    return;
  }
  
  let html = '<div class="table-details-container">';
  
  tables.forEach((table, index) => {
    html += `<div class="table-detail-item">
      <h4>Table ${index + 1}</h4>
      <div class="table-metadata">
        <p><strong>Page:</strong> ${table.page || 'N/A'}</p>
        <p><strong>Dimensions:</strong> ${table.rows || 0} rows × ${table.columns || 0} columns</p>
        <p><strong>Confidence:</strong> ${Math.round((table.confidence || 0) * 100)}%</p>
        <p><strong>Method:</strong> ${table.method || 'N/A'}</p>
      </div>`;
    
    if (table.data && table.data.length > 0) {
      html += '<div class="table-data-preview">';
      html += '<h5>Data Preview (first 5 rows):</h5>';
      html += '<table class="table-preview">';
      
      // Add header if available
      if (table.data[0]) {
        html += '<thead><tr>';
        table.data[0].forEach(cell => {
          html += `<th>${cell || ''}</th>`;
        });
        html += '</tr></thead>';
      }
      
      // Add data rows (limit to 5)
      html += '<tbody>';
      table.data.slice(0, 5).forEach((row, rowIndex) => {
        if (rowIndex > 0 || !table.data[0]) { // Skip header row if we already added it
          html += '<tr>';
          row.forEach(cell => {
            html += `<td>${cell || ''}</td>`;
          });
          html += '</tr>';
        }
      });
      html += '</tbody></table>';
      
      if (table.data.length > 5) {
        html += `<p class="table-more">... and ${table.data.length - 5} more rows</p>`;
      }
      
      html += '</div>';
    }
    
    html += '</div>';
  });
  
  html += '</div>';
  tableDetails.innerHTML = html;
}

function updateConfidenceValue() {
  const value = aiConfidenceThreshold.value;
  const percentage = Math.round(value * 100);
  confidenceValue.textContent = `${percentage}%`;
}

async function loadSettings() {
  try {
    // Load AI status
    const aiStatus = await window.electronAPI.getAIStatus();
    if (aiStatus) {
      useAIToggle.checked = aiStatus.enabled;
    }
    
    // Load extraction configuration
    const extractionConfig = await window.electronAPI.getExtractionConfig();
    if (extractionConfig) {
      useOCRToggle.checked = extractionConfig.useOCR || false;
      useTableExtractionToggle.checked = extractionConfig.useTableExtraction || false;
      useLLMEnhancerToggle.checked = extractionConfig.useLLMEnhancer !== false; // Default to true
    }
    
    // Load processing statistics
    const stats = await window.electronAPI.getStats();
    if (stats) {
      document.getElementById('totalProcessed').textContent = stats.totalProcessed || 0;
      document.getElementById('regexProcessed').textContent = stats.regexProcessed || 0;
      document.getElementById('aiProcessed').textContent = stats.aiProcessed || 0;
      document.getElementById('cacheHits').textContent = stats.cacheHits || 0;
      document.getElementById('averageConfidence').textContent = 
        stats.averageConfidence ? `${Math.round(stats.averageConfidence * 100)}%` : '0%';
    }
    
    // Set confidence threshold
    updateConfidenceValue();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function handleSaveSettings() {
  try {
    const settings = {
      useAI: useAIToggle.checked,
      confidenceThreshold: parseFloat(aiConfidenceThreshold.value),
      model: aiModel.value
    };
    
    // Save settings via IPC
    await window.electronAPI.saveSettings(settings);
    
    // Update AI status
    await window.electronAPI.toggleAI(settings.useAI);
    
    // Save extraction configuration
    const extractionConfig = {
      useOCR: useOCRToggle.checked,
      useTableExtraction: useTableExtractionToggle.checked,
      useLLMEnhancer: useLLMEnhancerToggle.checked
    };
    
    const extractionResult = await window.electronAPI.updateExtractionConfig(extractionConfig);
    if (!extractionResult.success) {
      console.warn('Failed to save extraction configuration:', extractionResult.error);
    }
    
    updateStatus('Settings saved successfully', 'success');
    closeSettingsModal();
  } catch (error) {
    console.error('Error saving settings:', error);
    updateStatus('Error saving settings', 'error');
  }
}

// Tab switching functions
function switchTab(tabName) {
  // Update tab buttons
  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  
  // Update tab content
  settingsTab.classList.toggle('active', tabName === 'settings');
  diagnosticsTab.classList.toggle('active', tabName === 'diagnostics');
  
  // Load diagnostics data when switching to diagnostics tab
  if (tabName === 'diagnostics') {
    refreshDiagnostics();
  }
}

// Diagnostics functions
async function refreshDiagnostics() {
  try {
    const diagnostics = await window.electronAPI.getDiagnostics();
    if (diagnostics) {
      updateDiagnosticsDisplay(diagnostics);
    }
  } catch (error) {
    console.error('Error refreshing diagnostics:', error);
    updateStatus('Error loading diagnostics', 'error');
  }
}

function updateDiagnosticsDisplay(diagnostics) {
  // AI Performance
  document.getElementById('totalAICalls').textContent = diagnostics.ai?.totalCalls || 0;
  document.getElementById('successfulAICalls').textContent = diagnostics.ai?.successfulCalls || 0;
  document.getElementById('failedAICalls').textContent = diagnostics.ai?.failedCalls || 0;
  document.getElementById('cachedAICalls').textContent = diagnostics.ai?.cachedCalls || 0;
  document.getElementById('averageLatency').textContent = `${diagnostics.ai?.averageLatency || 0}ms`;
  document.getElementById('aiSuccessRate').textContent = `${diagnostics.ai?.successRate || 0}%`;
  
  // Cache Performance
  document.getElementById('cacheHits').textContent = diagnostics.cache?.hits || 0;
  document.getElementById('cacheMisses').textContent = diagnostics.cache?.misses || 0;
  document.getElementById('cacheHitRate').textContent = `${diagnostics.cache?.hitRate || 0}%`;
  document.getElementById('cacheSize').textContent = diagnostics.cache?.size || 0;
  document.getElementById('cacheEvictions').textContent = diagnostics.cache?.evictions || 0;
  
  // Processing Statistics
  document.getElementById('totalFiles').textContent = diagnostics.processing?.totalFiles || 0;
  document.getElementById('regexProcessed').textContent = diagnostics.processing?.regexProcessed || 0;
  document.getElementById('aiProcessed').textContent = diagnostics.processing?.aiProcessed || 0;
  document.getElementById('averageConfidence').textContent = `${Math.round((diagnostics.processing?.averageConfidence || 0) * 100)}%`;
  document.getElementById('avgProcessingTime').textContent = `${diagnostics.processing?.averageProcessingTime || 0}ms`;
  
  // System Performance
  document.getElementById('memoryUsage').textContent = `${diagnostics.performance?.memoryUsage || 0} MB`;
  document.getElementById('sessionDuration').textContent = `${diagnostics.session?.duration || 0}s`;
  document.getElementById('lastActivity').textContent = diagnostics.session?.lastActivity || 'Never';
  
  // Error Log
  updateErrorLog(diagnostics.errors?.recent || []);
}

function updateErrorLog(errors) {
  const errorLog = document.getElementById('errorLog');
  
  if (errors.length === 0) {
    errorLog.innerHTML = '<div class="error-log-item">No errors recorded</div>';
    return;
  }
  
  errorLog.innerHTML = errors.map(error => `
    <div class="error-log-item">
      <strong>${error.type}</strong>: ${error.message}
      <br><small>${new Date(error.timestamp).toLocaleString()}</small>
    </div>
  `).join('');
}

async function clearTelemetry() {
  if (confirm('Are you sure you want to clear all telemetry data? This action cannot be undone.')) {
    try {
      await window.electronAPI.clearTelemetry();
      updateStatus('Telemetry data cleared', 'success');
      refreshDiagnostics();
    } catch (error) {
      console.error('Error clearing telemetry:', error);
      updateStatus('Error clearing telemetry data', 'error');
    }
  }
}

async function exportTelemetry() {
  try {
    const data = await window.electronAPI.exportTelemetry();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateStatus('Telemetry data exported', 'success');
  } catch (error) {
    console.error('Error exporting telemetry:', error);
    updateStatus('Error exporting telemetry data', 'error');
  }
}