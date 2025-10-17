// Enable comprehensive debugging in renderer
console.log('🔧 Renderer script loaded with debugging enabled');
console.log('📊 DOM elements check:', {
  dropZone: !!document.getElementById('dropZone'),
  fileList: !!document.getElementById('fileList'),
  fileListItems: !!document.getElementById('fileListItems'),
  previewTable: !!document.getElementById('previewTable'),
  previewTableBody: !!document.getElementById('previewTableBody'),
  status: !!document.getElementById('status'),
  browseBtn: !!document.getElementById('browseBtn'),
  startSortingBtn: !!document.getElementById('startSortingBtn'),
  settingsBtn: !!document.getElementById('settingsBtn')
});

// Log CSS loading
console.log('🎨 CSS files loaded:', document.styleSheets.length);
for (let i = 0; i < document.styleSheets.length; i++) {
  try {
    console.log(`  CSS ${i + 1}: ${document.styleSheets[i].href || 'inline'}`);
  } catch (e) {
    console.log(`  CSS ${i + 1}: (cross-origin or error)`);
  }
}

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

// Legacy batch mode toggle
const legacyBatchModeToggle = document.getElementById('legacyBatchModeToggle');

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

// AI Settings event listeners
document.getElementById('testBackendConnectionBtn')?.addEventListener('click', testBackendConnection);
document.getElementById('aiSuggestBtn')?.addEventListener('click', handleAISuggest);
document.getElementById('closeSuggestionsBtn')?.addEventListener('click', () => {
  document.getElementById('suggestionsModal').style.display = 'none';
});

// Error Modal Event Listeners
document.getElementById('closeErrorBtn')?.addEventListener('click', hideErrorModal);
document.getElementById('errorCloseBtn')?.addEventListener('click', hideErrorModal);

// Close modals when clicking outside
document.addEventListener('click', (event) => {
  const errorModal = document.getElementById('errorModal');
  const loadingModal = document.getElementById('loadingModal');
  const suggestionsModal = document.getElementById('suggestionsModal');
  
  if (event.target === errorModal) {
    hideErrorModal();
  }
  if (event.target === loadingModal) {
    // Don't close loading modal when clicking outside
  }
  if (event.target === suggestionsModal) {
    suggestionsModal.style.display = 'none';
  }
});

// Close modals with Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const errorModal = document.getElementById('errorModal');
    const loadingModal = document.getElementById('loadingModal');
    const suggestionsModal = document.getElementById('suggestionsModal');
    
    if (errorModal.style.display === 'block') {
      hideErrorModal();
    } else if (suggestionsModal.style.display === 'block') {
      suggestionsModal.style.display = 'none';
    }
    // Don't close loading modal with Escape key
  }
});

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
  
  // Set the first file as current for AI suggestions
  if (paths.length > 0) {
    currentFilePath = paths[0];
  }
  
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
            <span class="file-status" style="margin-left:8px;color:#888">Analyzing...</span>
            <div class="file-actions" style="margin-left:8px;display:none;">
              <button class="btn-small retry-btn" onclick="retryAnalysis('${fullPath}')" title="Retry AI analysis">🔄</button>
              <button class="btn-small view-suggestions-btn" onclick="viewAISuggestions('${fullPath}')" title="View AI suggestions">✨</button>
            </div>
        `;
    fileListItems.appendChild(listItem);
  });
    
  // Show the file list
  fileList.style.display = paths.length ? 'block' : 'none';
  
  // Update preview table
  updatePreviewTable();
  
  // Trigger AI analysis for new files (sequential processing or legacy batch mode)
  paths.forEach(filePath => {
    if (!fileMetadata.has(filePath)) {
      // Check if legacy batch mode is enabled
      if (legacyBatchModeToggle && legacyBatchModeToggle.checked) {
        // Legacy mode: just add to pending, don't trigger AI analysis
        console.log(`📁 Added to pending (legacy batch mode): ${path.basename(filePath)}`);
      } else {
        // New mode: trigger immediate AI analysis
        triggerAIAnalysis(filePath);
      }
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
  
  // Check if we're in legacy batch mode
  const isLegacyMode = legacyBatchModeToggle && legacyBatchModeToggle.checked;
  
  if (isLegacyMode) {
    updateStatus(`Starting legacy batch processing of ${validPaths.length} file(s)...`, 'info');
  } else {
    updateStatus(`⚠️ Legacy batch mode is disabled. Files are processed automatically on upload.`, 'warning');
    return;
  }
    
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
  
  // Initialize AI functionality
  initializeAI();
    
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
    
    // Enhanced status display with loading states
    let statusContent = getStatusText(metadata.status);
    if (metadata.analyzing && metadata.loadingStep !== undefined) {
      const loadingSteps = [
        'Extracting text...',
        'Analyzing content...',
        'Generating suggestions...'
      ];
      const currentStep = loadingSteps[metadata.loadingStep] || 'Analyzing...';
      statusContent = `
        <div class="loading-status">
          <span class="loading-spinner"></span>
          <span>${currentStep}</span>
        </div>
      `;
    }
    
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
      <td><span class="file-status ${metadata.status}">${statusContent}</span></td>
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

// New AI analysis trigger function that combines metadata + AI suggestions
async function triggerAIAnalysis(filePath) {
  console.log(`🤖 Starting AI analysis for: ${path.basename(filePath)}`);
  
  // Update UI to show analyzing state with enhanced loading
  updateFileStatus(filePath, 'Analyzing...', 'processing');
  
  // Initialize metadata with loading state
  const metadata = fileMetadata.get(filePath) || {};
  metadata.status = 'processing';
  metadata.analyzing = true;
  metadata.loadingStep = 0;
  metadata.analysisStartTime = Date.now();
  fileMetadata.set(filePath, metadata);
  updatePreviewTable();
  
  // Start loading step animation
  const loadingSteps = [
    'Extracting text...',
    'Analyzing content...',
    'Generating suggestions...'
  ];
  
  const loadingInterval = setInterval(() => {
    const currentMetadata = fileMetadata.get(filePath);
    if (currentMetadata && currentMetadata.analyzing) {
      currentMetadata.loadingStep = (currentMetadata.loadingStep + 1) % loadingSteps.length;
      fileMetadata.set(filePath, currentMetadata);
      updatePreviewTable();
    } else {
      clearInterval(loadingInterval);
    }
  }, 1500);
  
  try {
    // Step 1: Get basic metadata (fast, synchronous)
    const basicMetadata = await getBasicFileMetadata(filePath);
    
    // Step 2: Get AI analysis and suggestions
    const aiResult = await window.electronAPI.analyzeFile(filePath);
    
    if (aiResult.success) {
      clearInterval(loadingInterval);
      
      // Merge basic metadata with AI results
      const updatedMetadata = {
        ...basicMetadata,
        ...aiResult.analysis,
        status: 'success',
        analyzing: false,
        loadingStep: 0,
        analysisTime: Date.now() - metadata.analysisStartTime,
        aiSuggestions: aiResult.analysis?.suggestions || [],
        confidence: aiResult.analysis?.confidence || 0,
        source: aiResult.analysis?.source || 'ai'
      };
      
      fileMetadata.set(filePath, updatedMetadata);
      updateFileStatus(filePath, 'Ready', 'success');
      updatePreviewTable();
      
      console.log(`✅ AI analysis completed for: ${path.basename(filePath)} (${updatedMetadata.analysisTime}ms)`);
      
      // Show AI suggestions modal
      showAISuggestionsModal(filePath, updatedMetadata);
    } else {
      throw new Error(aiResult.error || 'AI analysis failed');
    }
  } catch (error) {
    clearInterval(loadingInterval);
    console.error(`❌ AI analysis failed for ${path.basename(filePath)}:`, error);
    
    // Update with error state
    const errorMetadata = {
      clientName: 'Analysis Failed',
      date: 'Unknown',
      documentType: 'Unknown',
      proposedFilename: 'Manual_Rename_Required.pdf',
      status: 'error',
      analyzing: false,
      loadingStep: 0,
      error: error.message,
      analysisTime: Date.now() - metadata.analysisStartTime
    };
    
    fileMetadata.set(filePath, errorMetadata);
    updateFileStatus(filePath, 'Failed - Click to retry', 'error');
    updatePreviewTable();
    
    // Show error modal with manual input option
    showAISuggestionsModal(filePath, errorMetadata, true);
  }
}

// Helper function to get basic file metadata
async function getBasicFileMetadata(filePath) {
  try {
    const stats = await window.electronAPI.getFileStats(filePath);
    return {
      clientName: 'Analyzing...',
      date: 'Analyzing...',
      documentType: 'Analyzing...',
      proposedFilename: 'Analyzing...',
      fileSize: stats.size,
      created: stats.created,
      modified: stats.modified
    };
  } catch (error) {
    console.warn('Could not get file stats:', error);
    return {
      clientName: 'Unknown',
      date: 'Unknown',
      documentType: 'Unknown',
      proposedFilename: 'Unknown'
    };
  }
}

// Helper function to update file status in UI
function updateFileStatus(filePath, statusText, statusType) {
  const listItem = document.querySelector(`#fileListItems .file-item[data-path="${CSS.escape(filePath)}"]`);
  if (listItem) {
    const statusEl = listItem.querySelector('.file-status');
    const actionsEl = listItem.querySelector('.file-actions');
    
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = `file-status ${statusType}`;
    }
    
    if (actionsEl) {
      if (statusType === 'success') {
        actionsEl.style.display = 'inline-block';
      } else if (statusType === 'error') {
        actionsEl.style.display = 'inline-block';
        actionsEl.querySelector('.retry-btn').style.display = 'inline-block';
        actionsEl.querySelector('.view-suggestions-btn').style.display = 'none';
      } else {
        actionsEl.style.display = 'none';
      }
    }
  }
}

// Retry analysis function
async function retryAnalysis(filePath) {
  console.log(`🔄 Retrying analysis for: ${path.basename(filePath)}`);
  await triggerAIAnalysis(filePath);
}

// View AI suggestions function
async function viewAISuggestions(filePath) {
  const metadata = fileMetadata.get(filePath);
  if (metadata && metadata.aiSuggestions && metadata.aiSuggestions.length > 0) {
    showSuggestionsModal(metadata.aiSuggestions, filePath);
  } else {
    // If no suggestions available, trigger new analysis
    updateStatus('No suggestions available. Running new analysis...', 'info');
    await triggerAIAnalysis(filePath);
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

// AI Settings handlers (from OpenAi.md Day 3 Morning)
let currentFilePath = null;
let apiKeyConfigured = false;

async function initializeAI() {
  const aiStatus = await window.electronAPI.getAIStatus();
  apiKeyConfigured = aiStatus.backendConfigured;
  const aiBtn = document.getElementById('aiSuggestBtn');
  if (aiBtn) {
    if (apiKeyConfigured) {
      aiBtn.disabled = false;
      aiBtn.title = 'Get AI-powered rename suggestions';
    } else {
      aiBtn.disabled = true;
      aiBtn.title = 'Backend server not configured';
    }
  }
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
      if (legacyBatchModeToggle) {
        legacyBatchModeToggle.checked = extractionConfig.legacyBatchMode || false;
      }
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
    
    // Test backend connection on load
    await testBackendConnection();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
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
      useLLMEnhancer: useLLMEnhancerToggle.checked,
      legacyBatchMode: legacyBatchModeToggle ? legacyBatchModeToggle.checked : false
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

async function testBackendConnection() {
  const msgDiv = document.getElementById('settingsMessage');
  
  msgDiv.textContent = 'Testing backend connection...';
  msgDiv.style.color = 'blue';
  
  try {
    const result = await window.electronAPI.testBackendConnection();
    if (result.success) {
      msgDiv.textContent = '✅ Backend connection successful! AI services are ready.';
      msgDiv.style.color = 'green';
      apiKeyConfigured = true;
      const aiBtn = document.getElementById('aiSuggestBtn');
      if (aiBtn) {
        aiBtn.disabled = false;
        aiBtn.title = 'Get AI-powered rename suggestions';
      }
    } else {
      msgDiv.textContent = `❌ Backend connection failed: ${result.error}`;
      msgDiv.style.color = 'red';
      apiKeyConfigured = false;
      const aiBtn = document.getElementById('aiSuggestBtn');
      if (aiBtn) {
        aiBtn.disabled = true;
        aiBtn.title = 'Backend server not available';
      }
    }
  } catch (error) {
    msgDiv.textContent = `❌ Backend connection error: ${error.message}`;
    msgDiv.style.color = 'red';
    apiKeyConfigured = false;
    const aiBtn = document.getElementById('aiSuggestBtn');
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.title = 'Backend server not available';
    }
  }
}

// Removed showApiKeyPrompt function - no longer needed with backend-managed API keys

// AI Suggestion functionality
async function handleAISuggest() {
  if (!currentFilePath) {
    showErrorModal('No File Selected', 'Please select a file first before getting AI suggestions.', 'warning');
    return;
  }
  
  if (!apiKeyConfigured) {
    showErrorModal('Backend Not Available', 'Backend server not available. Please check Settings.', 'error', {
      actionText: 'Open Settings',
      actionCallback: () => document.getElementById('settingsBtn').click()
    });
    return;
  }
  
  const btn = document.getElementById('aiSuggestBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  
  // Show loading modal with progress simulation
  showLoadingModal('Analyzing Document', 'Please wait while we analyze your document...', 0);
  
  // Update status with AI-specific message
  updateStatus('Analyzing document content...', 'info');
  
  // Simulate progress updates
  const progressInterval = setInterval(() => {
    const currentProgress = Math.min(90, Math.random() * 30 + 20); // Random progress between 20-90%
    updateLoadingProgress(currentProgress, 'Processing document content...');
  }, 500);
  
  try {
    const result = await window.electronAPI.suggestRename(currentFilePath);
    
    // Complete progress and hide loading modal
    clearInterval(progressInterval);
    updateLoadingProgress(100, 'Analysis complete!');
    setTimeout(() => {
      hideLoadingModal();
    }, 500);
    
    if (result.success) {
      if (result.suggestions && result.suggestions.length > 0) {
        updateStatus('AI suggestions ready for review', 'success');
        showSuggestionsModal(result.suggestions, currentFilePath);
      } else {
        updateStatus('No suggestions generated', 'warning');
        showErrorModal('No Suggestions', 'No suggestions generated. Please try again.', 'warning', {
          canRetry: true,
          retryCallback: () => handleAISuggest()
        });
      }
    } else {
      // Handle specific error cases with enhanced error modal
      updateStatus('AI analysis failed', 'error');
      handleAIError(result);
    }
  } catch (error) {
    console.error('Error getting AI suggestions:', error);
    clearInterval(progressInterval);
    hideLoadingModal();
    showErrorModal('Unexpected Error', `An unexpected error occurred: ${error.message}`, 'error', {
      canRetry: true,
      retryCallback: () => handleAISuggest()
    });
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Get AI Suggestions';
  }
}

// Enhanced error handling for AI suggestions
function handleAIError(result) {
  const { error, errorType, canRetry } = result;
  
  let title = 'AI Suggestion Error';
  let message = error;
  let type = 'error';
  let actionOptions = {};
  
  switch (errorType) {
    case 'configuration':
      title = 'Configuration Error';
      type = 'error';
      actionOptions = {
        actionText: 'Open Settings',
        actionCallback: () => document.getElementById('settingsBtn').click()
      };
      break;
      
    case 'authentication':
      title = 'Authentication Error';
      type = 'error';
      actionOptions = {
        actionText: 'Check Settings',
        actionCallback: () => document.getElementById('settingsBtn').click()
      };
      break;
      
    case 'rate_limit':
      title = 'Rate Limit Exceeded';
      type = 'warning';
      actionOptions = {
        canRetry: true,
        retryCallback: () => handleAISuggest(),
        retryDelay: 5000 // 5 second delay
      };
      break;
      
    case 'timeout':
      title = 'Request Timeout';
      type = 'warning';
      actionOptions = {
        canRetry: true,
        retryCallback: () => handleAISuggest()
      };
      break;
      
    case 'network':
      title = 'Network Error';
      type = 'error';
      actionOptions = {
        canRetry: true,
        retryCallback: () => handleAISuggest()
      };
      break;
      
    case 'extraction':
      title = 'File Processing Error';
      type = 'error';
      actionOptions = {
        canRetry: true,
        retryCallback: () => handleAISuggest()
      };
      break;
      
    case 'content':
      title = 'No Content Found';
      type = 'warning';
      actionOptions = {
        canRetry: false
      };
      break;
      
    case 'server':
      title = 'Server Error';
      type = 'error';
      actionOptions = {
        canRetry: true,
        retryCallback: () => handleAISuggest()
      };
      break;
      
    default:
      if (canRetry) {
        actionOptions = {
          canRetry: true,
          retryCallback: () => handleAISuggest()
        };
      }
  }
  
  showErrorModal(title, message, type, actionOptions);
}

// Error Modal Functions
function showErrorModal(title, message, type = 'error', options = {}) {
  const modal = document.getElementById('errorModal');
  const titleEl = document.getElementById('errorTitle');
  const messageEl = document.getElementById('errorMessage');
  const iconEl = document.getElementById('errorIcon');
  const detailsEl = document.getElementById('errorDetails');
  const technicalDetailsEl = document.getElementById('errorTechnicalDetails');
  const actionBtn = document.getElementById('errorActionBtn');
  const retryBtn = document.getElementById('errorRetryBtn');
  const closeBtn = document.getElementById('errorCloseBtn');
  
  // Set content
  titleEl.textContent = title;
  messageEl.textContent = message;
  
  // Set icon based on type
  const icons = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✅'
  };
  iconEl.textContent = icons[type] || icons.error;
  
  // Set modal class for styling
  modal.className = `modal error-modal error-type-${type}`;
  
  // Show/hide technical details
  if (options.technicalDetails) {
    detailsEl.style.display = 'block';
    technicalDetailsEl.textContent = options.technicalDetails;
  } else {
    detailsEl.style.display = 'none';
  }
  
  // Configure action button
  if (options.actionText && options.actionCallback) {
    actionBtn.textContent = options.actionText;
    actionBtn.style.display = 'inline-block';
    actionBtn.onclick = () => {
      options.actionCallback();
      hideErrorModal();
    };
  } else {
    actionBtn.style.display = 'none';
  }
  
  // Configure retry button
  if (options.canRetry && options.retryCallback) {
    retryBtn.style.display = 'inline-block';
    retryBtn.onclick = () => {
      if (options.retryDelay) {
        retryBtn.disabled = true;
        retryBtn.textContent = `Retrying in ${options.retryDelay / 1000}s...`;
        setTimeout(() => {
          retryBtn.disabled = false;
          retryBtn.textContent = 'Retry';
          options.retryCallback();
          hideErrorModal();
        }, options.retryDelay);
      } else {
        options.retryCallback();
        hideErrorModal();
      }
    };
  } else {
    retryBtn.style.display = 'none';
  }
  
  // Configure close button
  closeBtn.onclick = hideErrorModal;
  
  // Show modal
  modal.style.display = 'block';
  
  // Auto-hide if specified
  if (options.autoHide) {
    setTimeout(() => {
      hideErrorModal();
    }, options.autoHide);
  }
}

function hideErrorModal() {
  const modal = document.getElementById('errorModal');
  modal.style.display = 'none';
}

// Loading Modal Functions
function showLoadingModal(title = 'Processing...', message = 'Please wait while we process your request', progress = 0) {
  const modal = document.getElementById('loadingModal');
  const titleEl = document.getElementById('loadingTitle');
  const messageEl = document.getElementById('loadingMessage');
  const progressEl = document.getElementById('loadingProgress');
  const progressFillEl = document.querySelector('.progress-fill');
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  progressEl.textContent = `${Math.round(progress)}%`;
  progressFillEl.style.width = `${progress}%`;
  
  modal.style.display = 'block';
}

function updateLoadingProgress(progress, message = null) {
  const progressEl = document.getElementById('loadingProgress');
  const progressFillEl = document.querySelector('.progress-fill');
  const messageEl = document.getElementById('loadingMessage');
  
  progressEl.textContent = `${Math.round(progress)}%`;
  progressFillEl.style.width = `${progress}%`;
  
  if (message) {
    messageEl.textContent = message;
  }
}

function hideLoadingModal() {
  const modal = document.getElementById('loadingModal');
  modal.style.display = 'none';
}

// Enhanced status update function
function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }
    }, 3000);
  }
}

function showSuggestionsModal(suggestions, filePath) {
  const modal = document.getElementById('suggestionsModal');
  const originalName = document.getElementById('originalFilename');
  const list = document.getElementById('suggestionsList');
  
  originalName.textContent = filePath.split('/').pop();
  list.innerHTML = '';
  
  suggestions.forEach((suggestion, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn suggestion-btn';
    btn.textContent = `${i + 1}. ${suggestion}`;
    btn.onclick = () => applyRename(filePath, suggestion);
    list.appendChild(btn);
  });
  
  modal.style.display = 'block';
}

async function applyRename(oldPath, newName) {
  try {
    // Call the main process to rename the file
    const result = await window.electronAPI.renameFile(oldPath, newName);
    
    if (result.success) {
      // Update the UI to reflect the new filename
      updateFileListAfterRename(oldPath, result.newPath);
      
      // Close the suggestions modal
      document.getElementById('suggestionsModal').style.display = 'none';
      
      // Show success message
      updateStatus(`✅ File renamed to: ${newName}`, 'success');
      
      // Update the current file path if this was the current file
      if (currentFilePath === oldPath) {
        currentFilePath = result.newPath;
      }
    } else {
      alert(`Error renaming file: ${result.error}`);
    }
  } catch (error) {
    console.error('Error applying rename:', error);
    alert(`Error: ${error.message}`);
  }
}

function updateFileListAfterRename(oldPath, newPath) {
  // Update the pending file paths set
  if (pendingFilePaths.has(oldPath)) {
    pendingFilePaths.delete(oldPath);
    pendingFilePaths.add(newPath);
  }
  
  // Update the file metadata map
  if (fileMetadata.has(oldPath)) {
    const metadata = fileMetadata.get(oldPath);
    fileMetadata.delete(oldPath);
    fileMetadata.set(newPath, metadata);
  }
  
  // Update the file list display
  const listItem = document.querySelector(`#fileListItems .file-item[data-path="${CSS.escape(oldPath)}"]`);
  if (listItem) {
    listItem.dataset.path = newPath;
    const fileNameSpan = listItem.querySelector('.file-name');
    if (fileNameSpan) {
      fileNameSpan.textContent = newPath.split(/[\\/]/).pop();
    }
  }
  
  // Update the preview table
  updatePreviewTable();
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
      if (legacyBatchModeToggle) {
        legacyBatchModeToggle.checked = extractionConfig.legacyBatchMode || false;
      }
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
      useLLMEnhancer: useLLMEnhancerToggle.checked,
      legacyBatchMode: legacyBatchModeToggle ? legacyBatchModeToggle.checked : false
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

// AI Suggestions Modal Functions
function showAISuggestionsModal(filePath, metadata, isError = false) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('aiSuggestionsModal');
  if (!modal) {
    modal = createAISuggestionsModal();
    document.body.appendChild(modal);
  }
  
  // Populate modal with data
  populateAISuggestionsModal(modal, filePath, metadata, isError);
  
  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Focus on primary input
  const primaryInput = modal.querySelector('.suggestion-input');
  if (primaryInput) {
    primaryInput.focus();
    primaryInput.select();
  }
}

function createAISuggestionsModal() {
  const modal = document.createElement('div');
  modal.id = 'aiSuggestionsModal';
  modal.className = 'ai-suggestions-modal hidden';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">
          <span class="ai-icon">🤖</span>
          AI Suggestions
        </div>
        <button class="modal-close" onclick="closeAISuggestionsModal()">&times;</button>
      </div>
      
      <div class="file-info">
        <div class="file-icon-large">📄</div>
        <div class="file-details">
          <h4 id="modalFileName">Loading...</h4>
          <p id="modalFileSize">Loading...</p>
        </div>
      </div>
      
      <div class="suggestions-section">
        <div class="section-title">Suggested Filename</div>
        <div class="primary-suggestion">
          <input type="text" class="suggestion-input" id="primarySuggestion" placeholder="Enter filename...">
        </div>
        
        <div class="alternative-suggestions" id="alternativeSuggestions">
          <!-- Alternatives will be populated here -->
        </div>
      </div>
      
      <div class="document-preview" id="documentPreview">
        <!-- Document preview will be populated here -->
      </div>
      
      <div class="metadata-display" id="metadataDisplay">
        <!-- Metadata will be populated here -->
      </div>
      
      <div class="modal-actions">
        <div class="action-buttons">
          <button class="btn-primary" id="acceptBtn" onclick="acceptSuggestion()">Accept</button>
          <button class="btn-secondary" id="regenerateBtn" onclick="regenerateSuggestion()">Regenerate</button>
          <button class="btn-outline" onclick="skipFile()">Skip</button>
        </div>
        
        <div class="batch-actions" id="batchActions" style="display: none;">
          <div class="batch-divider"></div>
          <button class="btn-batch" id="batchAcceptBtn" onclick="batchAcceptAll()" title="Accept all ready suggestions and finalize filenames">
            Batch Accept All
          </button>
        </div>
        
        <div class="batch-progress" id="batchProgress" style="display: none;">
          <div class="progress-text" id="batchProgressText">Processing file 1 of 3...</div>
          <div class="progress-bar">
            <div class="progress-fill" id="batchProgressFill"></div>
          </div>
        </div>
        
        <div class="quality-feedback" id="qualityFeedback" style="display: none;">
          <span class="feedback-label">How was this suggestion?</span>
          <div class="feedback-buttons">
            <button class="feedback-btn thumbs-up" onclick="giveFeedback('good')">👍</button>
            <button class="feedback-btn thumbs-down" onclick="giveFeedback('bad')">👎</button>
          </div>
        </div>
      </div>
      
      <div class="error-state" id="errorState" style="display: none;">
        <div class="error-icon">⚠️</div>
        <p>AI analysis failed. Please enter a filename manually.</p>
        <div class="manual-input">
          <input type="text" id="manualInput" placeholder="Enter filename manually...">
          <button class="btn-primary" onclick="acceptManualInput()">Save</button>
        </div>
      </div>
    </div>
  `;
  
  // Add keyboard event listeners
  modal.addEventListener('keydown', handleModalKeyboard);
  
  return modal;
}

function populateAISuggestionsModal(modal, filePath, metadata, isError) {
  const fileName = path.basename(filePath);
  const fileSize = metadata.fileSize ? formatFileSize(metadata.fileSize) : 'Unknown size';
  
  // Update file info
  modal.querySelector('#modalFileName').textContent = fileName;
  modal.querySelector('#modalFileSize').textContent = fileSize;
  
  // Initialize regeneration counter for new file analysis
  if (!metadata.regenCount) {
    metadata.regenCount = 0;
    fileMetadata.set(filePath, metadata);
  }
  
  if (isError) {
    // Show error state
    modal.querySelector('#errorState').style.display = 'block';
    modal.querySelector('.suggestions-section').style.display = 'none';
    modal.querySelector('.document-preview').style.display = 'none';
    modal.querySelector('.metadata-display').style.display = 'none';
    modal.querySelector('.action-buttons').style.display = 'none';
    
    // Focus on manual input
    const manualInput = modal.querySelector('#manualInput');
    if (manualInput) {
      manualInput.focus();
    }
  } else {
    // Show normal state
    modal.querySelector('#errorState').style.display = 'none';
    modal.querySelector('.suggestions-section').style.display = 'block';
    modal.querySelector('.document-preview').style.display = 'block';
    modal.querySelector('.metadata-display').style.display = 'block';
    modal.querySelector('.action-buttons').style.display = 'flex';
    
    // Set primary suggestion
    const primaryInput = modal.querySelector('#primarySuggestion');
    primaryInput.value = metadata.proposedFilename || 'Untitled.pdf';
    
    // Populate alternatives
    populateAlternatives(modal, metadata.alternatives || []);
    
    // Populate document preview
    populateDocumentPreview(modal, metadata.documentPreview || '');
    
    // Populate metadata
    populateMetadata(modal, metadata);
    
    // Update regenerate button UI with current count
    updateRegenerateButtonUI(modal, metadata.regenCount);
    
    // Check if batch accept should be shown
    updateBatchAcceptVisibility(modal);
  }
  
  // Store current file path for actions
  modal.dataset.filePath = filePath;
}

function populateAlternatives(modal, alternatives) {
  const container = modal.querySelector('#alternativeSuggestions');
  container.innerHTML = '';
  
  if (alternatives.length === 0) {
    // Generate some basic alternatives
    const primary = modal.querySelector('#primarySuggestion').value;
    const baseName = primary.replace(/\.[^/.]+$/, '');
    const ext = path.extname(primary);
    
    alternatives = [
      `${baseName}_v1${ext}`,
      `${baseName}_final${ext}`,
      `${baseName}_draft${ext}`
    ];
  }
  
  alternatives.slice(0, 4).forEach((alt, index) => {
    const div = document.createElement('div');
    div.className = 'alternative-suggestion';
    div.textContent = alt;
    div.onclick = () => selectAlternative(alt);
    container.appendChild(div);
  });
}

function populateDocumentPreview(modal, preview) {
  const container = modal.querySelector('#documentPreview');
  if (preview && preview.trim()) {
    container.textContent = preview.substring(0, 200) + (preview.length > 200 ? '...' : '');
  } else {
    container.textContent = 'No preview available';
  }
}

function populateMetadata(modal, metadata) {
  const container = modal.querySelector('#metadataDisplay');
  container.innerHTML = '';
  
  const metadataItems = [
    { label: 'Document Type', value: metadata.documentType || 'Unknown' },
    { label: 'Client', value: metadata.clientName || 'Unknown' },
    { label: 'Date', value: metadata.date || 'Unknown' },
    { label: 'Confidence', value: getConfidenceLabel(metadata.confidence) }
  ];
  
  metadataItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'metadata-item';
    div.innerHTML = `
      <div class="metadata-label">${item.label}</div>
      <div class="metadata-value">${item.value}</div>
    `;
    container.appendChild(div);
  });
}

function getConfidenceLabel(confidence) {
  if (typeof confidence === 'number') {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  }
  return confidence || 'Medium';
}

function selectAlternative(filename) {
  const modal = document.getElementById('aiSuggestionsModal');
  const primaryInput = modal.querySelector('#primarySuggestion');
  primaryInput.value = filename;
  
  // Update visual selection
  modal.querySelectorAll('.alternative-suggestion').forEach(el => {
    el.classList.remove('selected');
  });
  event.target.classList.add('selected');
}

function closeAISuggestionsModal() {
  const modal = document.getElementById('aiSuggestionsModal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Clear any intervals
    if (window.modalLoadingInterval) {
      clearInterval(window.modalLoadingInterval);
    }
  }
}

async function acceptSuggestion() {
  const modal = document.getElementById('aiSuggestionsModal');
  const filePath = modal.dataset.filePath;
  const filename = modal.querySelector('#primarySuggestion').value;
  
  if (!filename.trim()) {
    alert('Please enter a filename');
    return;
  }
  
  // Track time to decision
  const startTime = Date.now();
  
  // Disable buttons during processing
  const acceptBtn = modal.querySelector('#acceptBtn');
  const regenerateBtn = modal.querySelector('#regenerateBtn');
  const skipBtn = modal.querySelector('.btn-outline');
  
  acceptBtn.disabled = true;
  acceptBtn.textContent = 'Processing...';
  regenerateBtn.disabled = true;
  skipBtn.disabled = true;
  
  try {
    // Get file metadata for enhanced logging
    const metadata = fileMetadata.get(filePath);
    const documentType = metadata?.analysis?.documentType || null;
    const confidence = metadata?.analysis?.confidence || null;
    const documentHash = metadata?.analysis?.documentHash || null;
    
    // Prepare options for enhanced file operations
    const options = {
      source: 'ai',
      metadata: metadata?.analysis || {},
      confidence: confidence,
      documentType: documentType,
      documentHash: documentHash
    };
    
    // Call the enhanced file:rename handler
    const result = await window.electronAPI.renameFile(filePath, filename, options);
    
    if (result.success) {
      // Calculate time to decision
      const timeToDecision = Date.now() - startTime;
      
      // Update the UI to reflect the new filename
      updateFileListAfterRename(filePath, result.newPath);
      
      // Log acceptance with quality feedback and timing
      logSuggestionAction(filePath, 'accepted', filename, {
        timeToDecisionMs: timeToDecision,
        confidence: confidence,
        documentType: documentType,
        targetDir: result.targetDir,
        sanitized: result.sanitized,
        durationMs: result.durationMs
      });
      
      // Update file metadata
      if (metadata) {
        metadata.proposedFilename = filename;
        metadata.status = 'accepted';
        metadata.finalPath = result.newPath;
        metadata.targetDir = result.targetDir;
        fileMetadata.set(filePath, metadata);
        updatePreviewTable();
      }
      
      // Show success message
      updateStatus(`✅ File renamed to: ${filename}`, 'success');
      
      // Show quality feedback
      modal.querySelector('#qualityFeedback').style.display = 'flex';
      modal.querySelector('.action-buttons').style.display = 'none';
      
      // Close modal after a short delay
      setTimeout(() => {
        closeAISuggestionsModal();
      }, 1000);
      
    } else {
      // Handle rename failure
      throw new Error(result.error || 'Failed to rename file');
    }
  } catch (error) {
    console.error('Error applying rename:', error);
    
    // Re-enable buttons
    acceptBtn.disabled = false;
    acceptBtn.textContent = 'Accept';
    regenerateBtn.disabled = false;
    skipBtn.disabled = false;
    
    // Show error message with fallback options
    const errorMessage = `Error renaming file: ${error.message}`;
    updateStatus(errorMessage, 'error');
    
    // Show error in modal with manual input option
    modal.querySelector('#errorState').style.display = 'block';
    modal.querySelector('.suggestions-section').style.display = 'none';
    modal.querySelector('.action-buttons').style.display = 'none';
    
    // Pre-fill manual input with the suggested name
    const manualInput = modal.querySelector('#manualInput');
    if (manualInput) {
      manualInput.value = filename;
      manualInput.focus();
    }
  }
}

function regenerateSuggestion() {
  const modal = document.getElementById('aiSuggestionsModal');
  const filePath = modal.dataset.filePath;
  
  // Get current regeneration count
  const metadata = fileMetadata.get(filePath);
  if (!metadata) {
    console.error('No metadata found for file:', filePath);
    return;
  }
  
  const regenCount = metadata.regenCount || 0;
  
  // Check if limit reached
  if (regenCount >= 3) {
    console.warn('Maximum regeneration attempts reached for file:', filePath);
    return;
  }
  
  // Increment regeneration count immediately (count all attempts)
  metadata.regenCount = regenCount + 1;
  fileMetadata.set(filePath, metadata);
  
  // Update button UI
  updateRegenerateButtonUI(modal, metadata.regenCount);
  
  // Show loading state
  const regenerateBtn = modal.querySelector('#regenerateBtn');
  const originalText = regenerateBtn.textContent;
  regenerateBtn.textContent = 'Regenerating...';
  regenerateBtn.disabled = true;
  
  // Call regeneration API
  if (window.electronAPI && window.electronAPI.regenerateSuggestion) {
    window.electronAPI.regenerateSuggestion(filePath, modal.querySelector('#primarySuggestion').value)
      .then(result => {
        if (result.success) {
          // Update with new suggestion
          modal.querySelector('#primarySuggestion').value = result.suggestion;
          populateAlternatives(modal, result.alternatives || []);
          
          // Log regeneration with count
          logSuggestionAction(filePath, 'regenerated', result.suggestion, {
            regenerationCount: metadata.regenCount
          });
          
          // Show success feedback
          updateStatus(`✅ New suggestion generated (attempt ${metadata.regenCount}/3)`, 'success');
        } else {
          // Show error but don't reset counter (already incremented)
          const errorMessage = `Regeneration failed: ${result.error || 'Unknown error'}. You can try again (attempt ${metadata.regenCount}/3).`;
          updateStatus(errorMessage, 'warning');
        }
      })
      .catch(error => {
        console.error('Regeneration error:', error);
        const errorMessage = `Regeneration failed: ${error.message}. You can try again (attempt ${metadata.regenCount}/3).`;
        updateStatus(errorMessage, 'warning');
      })
      .finally(() => {
        // Update button UI with current count
        updateRegenerateButtonUI(modal, metadata.regenCount);
      });
  } else {
    alert('Regeneration not available');
    updateRegenerateButtonUI(modal, metadata.regenCount);
  }
}

function updateRegenerateButtonUI(modal, regenCount) {
  const regenerateBtn = modal.querySelector('#regenerateBtn');
  if (!regenerateBtn) return;
  
  const remaining = 3 - regenCount;
  const disabled = regenCount >= 3;
  
  if (disabled) {
    regenerateBtn.textContent = 'Max attempts reached';
    regenerateBtn.disabled = true;
    regenerateBtn.title = 'You\'ve reached the maximum of 3 regenerations for this file.';
    regenerateBtn.style.opacity = '0.7';
    
    // Add warning icon if not already present
    if (!regenerateBtn.querySelector('.warning-icon')) {
      const warningIcon = document.createElement('span');
      warningIcon.className = 'warning-icon';
      warningIcon.textContent = ' ⚠️';
      regenerateBtn.appendChild(warningIcon);
    }
  } else {
    regenerateBtn.textContent = `Regenerate (${regenCount}/3)`;
    regenerateBtn.disabled = false;
    regenerateBtn.title = `${remaining} attempts remaining`;
    regenerateBtn.style.opacity = '1';
    
    // Remove warning icon if present
    const warningIcon = regenerateBtn.querySelector('.warning-icon');
    if (warningIcon) {
      warningIcon.remove();
    }
    
    // Add subtle pulse animation on increment
    regenerateBtn.style.animation = 'pulse 0.5s ease-in-out';
    setTimeout(() => {
      regenerateBtn.style.animation = '';
    }, 500);
  }
}

function updateBatchAcceptVisibility(modal) {
  const batchActions = modal.querySelector('#batchActions');
  if (!batchActions) return;
  
  // Count files that are analyzed and ready for user action
  const readyFiles = Array.from(fileMetadata.entries()).filter(([filePath, metadata]) => {
    return metadata.status === 'analyzed' || metadata.status === 'ready' || 
           (metadata.proposedFilename && !metadata.status);
  });
  
  // Show batch actions if there are 2 or more ready files
  if (readyFiles.length >= 2) {
    batchActions.style.display = 'flex';
    const batchBtn = modal.querySelector('#batchAcceptBtn');
    if (batchBtn) {
      batchBtn.textContent = `Batch Accept All (${readyFiles.length})`;
    }
  } else {
    batchActions.style.display = 'none';
  }
}

async function batchAcceptAll() {
  const modal = document.getElementById('aiSuggestionsModal');
  if (!modal) return;
  
  // Get all files that are ready for acceptance
  const readyFiles = Array.from(fileMetadata.entries()).filter(([filePath, metadata]) => {
    return metadata.status === 'analyzed' || metadata.status === 'ready' || 
           (metadata.proposedFilename && !metadata.status);
  });
  
  if (readyFiles.length === 0) {
    updateStatus('No files ready for batch acceptance', 'warning');
    return;
  }
  
  // Show progress UI
  const batchProgress = modal.querySelector('#batchProgress');
  const batchActions = modal.querySelector('#batchActions');
  const actionButtons = modal.querySelector('.action-buttons');
  
  batchProgress.style.display = 'block';
  batchActions.style.display = 'none';
  actionButtons.style.display = 'none';
  
  // Disable modal interactions during batch processing
  modal.style.pointerEvents = 'none';
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  // Prepare batch operations
  const operations = readyFiles.map(([filePath, metadata]) => {
    const documentType = metadata?.analysis?.documentType || null;
    const confidence = metadata?.analysis?.confidence || null;
    const documentHash = metadata?.analysis?.documentHash || null;
    
    return {
      oldPath: filePath,
      newName: metadata.proposedFilename,
      source: 'ai',
      metadata: metadata?.analysis || {},
      confidence: confidence,
      documentType: documentType,
      documentHash: documentHash
    };
  });
  
  // Set up progress listener
  window.electronAPI.onFileBatchProgress((event, progress) => {
    const progressText = modal.querySelector('#batchProgressText');
    const progressFill = modal.querySelector('#batchProgressFill');
    
    progressText.textContent = `Processing file ${progress.current} of ${progress.total}...`;
    progressFill.style.width = `${(progress.current / progress.total) * 100}%`;
    
    updateStatus(`Processing file ${progress.current} of ${progress.total}...`, 'info');
  });
  
  try {
    // Call the enhanced batch file operations handler
    const result = await window.electronAPI.batchRenameFiles(operations);
    
    if (result.success) {
      // Process results
      result.results.forEach((fileResult, index) => {
        const [filePath, metadata] = readyFiles[index];
        
        if (fileResult.success) {
          // Update the UI to reflect the new filename
          updateFileListAfterRename(filePath, fileResult.newPath);
          
          // Log acceptance
          logSuggestionAction(filePath, 'batch-accepted', metadata.proposedFilename, {
            confidence: fileResult.confidence,
            documentType: fileResult.documentType,
            targetDir: fileResult.targetDir,
            durationMs: fileResult.durationMs
          });
          
          // Update file metadata
          metadata.status = 'accepted';
          metadata.finalPath = fileResult.newPath;
          metadata.targetDir = fileResult.targetDir;
          fileMetadata.set(filePath, metadata);
          
          successCount++;
        } else {
          console.error(`Error processing file ${filePath}:`, fileResult.error);
          errors.push({ filePath, error: fileResult.error });
          errorCount++;
        }
      });
    } else {
      throw new Error(result.error || 'Batch operations failed');
    }
    
    // Show completion message
    if (errorCount === 0) {
      updateStatus(`✅ ${successCount} files successfully accepted`, 'success');
      showSuccessToast(`✅ ${successCount} files successfully accepted`);
    } else {
      updateStatus(`⚠️ ${successCount} accepted, ${errorCount} failed`, 'warning');
      showSuccessToast(`⚠️ ${successCount} accepted, ${errorCount} failed`);
    }
    
    // Update preview table
    updatePreviewTable();
    
    // Close modal after a short delay
    setTimeout(() => {
      closeAISuggestionsModal();
    }, 1500);
    
  } catch (error) {
    console.error('Batch processing error:', error);
    updateStatus('Batch processing failed', 'error');
  } finally {
    // Re-enable modal interactions
    modal.style.pointerEvents = 'auto';
    batchProgress.style.display = 'none';
    batchActions.style.display = 'flex';
    actionButtons.style.display = 'flex';
  }
}

function showSuccessToast(message) {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function skipFile() {
  const modal = document.getElementById('aiSuggestionsModal');
  const filePath = modal.dataset.filePath;
  
  // Log skip
  logSuggestionAction(filePath, 'skipped', null);
  
  // Update file metadata
  const metadata = fileMetadata.get(filePath);
  if (metadata) {
    metadata.status = 'skipped';
    fileMetadata.set(filePath, metadata);
    updatePreviewTable();
  }
  
  closeAISuggestionsModal();
}

async function acceptManualInput() {
  const modal = document.getElementById('aiSuggestionsModal');
  const filePath = modal.dataset.filePath;
  const filename = modal.querySelector('#manualInput').value;
  
  if (!filename.trim()) {
    alert('Please enter a filename');
    return;
  }
  
  // Disable buttons during processing
  const saveBtn = modal.querySelector('#manualInput').nextElementSibling;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Processing...';
  
  try {
    // Call the main process to rename the file
    const result = await window.electronAPI.renameFile(filePath, filename);
    
    if (result.success) {
      // Update the UI to reflect the new filename
      updateFileListAfterRename(filePath, result.newPath);
      
      // Log manual input
      logSuggestionAction(filePath, 'manual', filename);
      
      // Update file metadata
      const metadata = fileMetadata.get(filePath);
      if (metadata) {
        metadata.proposedFilename = filename;
        metadata.status = 'manual';
        fileMetadata.set(filePath, metadata);
        updatePreviewTable();
      }
      
      // Show success message
      updateStatus(`✅ File renamed to: ${filename}`, 'success');
      
      // Close modal
      closeAISuggestionsModal();
      
    } else {
      // Handle rename failure
      throw new Error(result.error || 'Failed to rename file');
    }
  } catch (error) {
    console.error('Error applying manual rename:', error);
    
    // Re-enable button
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
    
    // Show error message
    const errorMessage = `Error renaming file: ${error.message}`;
    updateStatus(errorMessage, 'error');
    alert(errorMessage);
  }
}

function giveFeedback(type) {
  const modal = document.getElementById('aiSuggestionsModal');
  const filePath = modal.dataset.filePath;
  const filename = modal.querySelector('#primarySuggestion').value;
  
  // Log feedback
  logSuggestionAction(filePath, 'feedback', filename, { feedback: type });
  
  // Update button states
  modal.querySelectorAll('.feedback-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  event.target.classList.add('selected');
  
  // Close modal after feedback
  setTimeout(() => {
    closeAISuggestionsModal();
  }, 500);
}

function logSuggestionAction(filePath, action, filename, extra = {}) {
  const logData = {
    filePath,
    action,
    filename,
    timestamp: new Date().toISOString(),
    timeToDecisionMs: extra.timeToDecisionMs || 0,
    qualityRating: extra.feedback || null,
    regenerationCount: extra.regenerationCount || 0,
    ...extra
  };
  
  console.log('📊 Suggestion action logged:', logData);
  
  // Send to main process for logging
  if (window.electronAPI && window.electronAPI.logSuggestionQuality) {
    window.electronAPI.logSuggestionQuality(logData).catch(console.error);
  }
}

function handleModalKeyboard(event) {
  switch (event.key) {
    case 'Enter':
      if (event.target.classList.contains('suggestion-input') || event.target.classList.contains('manual-input')) {
        event.preventDefault();
        acceptSuggestion();
      }
      break;
    case 'Escape':
      event.preventDefault();
      closeAISuggestionsModal();
      break;
    case 'Tab':
      // Allow default tab behavior for accessibility
      break;
    case '1':
      event.preventDefault();
      acceptSuggestion();
      break;
    case '2':
      event.preventDefault();
      regenerateSuggestion();
      break;
    case '3':
      event.preventDefault();
      skipFile();
      break;
    case '4':
      event.preventDefault();
      const batchBtn = document.querySelector('#batchAcceptBtn');
      if (batchBtn && batchBtn.style.display !== 'none') {
        batchAcceptAll();
      }
      break;
    default:
      // Handle arrow keys for alternative navigation
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          navigateAlternatives(event.key);
        }
      }
  }
}

function navigateAlternatives(direction) {
  const modal = document.getElementById('aiSuggestionsModal');
  const alternatives = modal.querySelectorAll('.alternative-suggestion');
  const current = modal.querySelector('.alternative-suggestion.selected');
  
  if (alternatives.length === 0) return;
  
  let index = 0;
  if (current) {
    index = Array.from(alternatives).indexOf(current);
  }
  
  if (direction === 'ArrowRight' || direction === 'ArrowDown') {
    index = (index + 1) % alternatives.length;
  } else if (direction === 'ArrowLeft' || direction === 'ArrowUp') {
    index = (index - 1 + alternatives.length) % alternatives.length;
  }
  
  alternatives[index].click();
}