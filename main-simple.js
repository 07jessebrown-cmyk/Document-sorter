// DEPRECATED: This file has been consolidated into src/main/main.js
// All functionality has been merged into the unified main file.
// This file is kept for reference but should not be used.

/*
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Keep a global reference of the window object
let mainWindow;

// Hardcoded array of known clients for fuzzy matching
const KNOWN_CLIENTS = [
  "John Doe", "Acme Corp", "Jane Smith", "Microsoft", "Google", 
  "Apple Inc", "Amazon", "Tesla", "Meta", "Netflix", "Spotify",
  "IBM", "Oracle", "Salesforce", "Adobe", "Intel", "Cisco",
  "Dell", "HP", "Lenovo", "Samsung", "Sony", "Nintendo"
];

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Document Sorter'
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development (optional)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file dialog
ipcMain.handle('open-file-dialog', async () => {
  try {
    console.log('Opening file dialog...');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }
      ]
    });
    
    if (result.canceled) {
      console.log('File dialog was canceled');
      return [];
    }
    
    console.log('File dialog returned:', result.filePaths);
    return result.filePaths;
  } catch (error) {
    console.error('Error opening file dialog:', error);
    return [];
  }
});

// Smart file renaming functions
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.warn(`Failed to extract text from PDF ${path.basename(filePath)}:`, error.message);
    return '';
  }
}

function detectClientName(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  
  const normalizedText = text.toLowerCase();
  
  for (const client of KNOWN_CLIENTS) {
    const normalizedClient = client.toLowerCase();
    
    // Check for exact match
    if (normalizedText.includes(normalizedClient)) {
      return client;
    }
    
    // Check for partial match (at least 3 characters)
    if (normalizedClient.length >= 3) {
      const words = normalizedClient.split(' ');
      let matchCount = 0;
      
      for (const word of words) {
        if (word.length >= 3 && normalizedText.includes(word)) {
          matchCount++;
        }
      }
      
      // If at least half the words match, consider it a match
      if (matchCount >= Math.ceil(words.length / 2)) {
        return client;
      }
    }
  }
  
  return 'unknown';
}

function detectDate(text) {
  if (!text || typeof text !== 'string') return null;
  
  // Date patterns to look for
  const datePatterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/g,  // YYYY-MM-DD
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,  // MM/DD/YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})/g,  // MM-DD-YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{2})/g,  // MM/DD/YY
  ];
  
  for (const pattern of datePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Return the first valid date found
      const dateStr = matches[0];
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return null;
}

function detectDocumentType(text) {
  if (!text || typeof text !== 'string') return 'document';
  
  const normalizedText = text.toLowerCase();
  
  const documentTypes = {
    'invoice': ['invoice', 'bill', 'billing', 'payment due', 'amount due'],
    'contract': ['contract', 'agreement', 'terms and conditions', 'service agreement'],
    'resume': ['resume', 'cv', 'curriculum vitae', 'work experience', 'education'],
    'receipt': ['receipt', 'payment received', 'thank you for your payment'],
    'statement': ['statement', 'account statement', 'bank statement', 'balance'],
    'proposal': ['proposal', 'quote', 'quotation', 'estimate', 'bid'],
    'report': ['report', 'analysis', 'summary report', 'findings'],
    'memo': ['memo', 'memorandum', 'internal memo'],
    'letter': ['letter', 'correspondence', 'business letter']
  };
  
  for (const [docType, keywords] of Object.entries(documentTypes)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return docType;
      }
    }
  }
  
  return 'document';
}

function getFileDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  } catch (error) {
    console.warn(`Failed to get file date for ${path.basename(filePath)}:`, error.message);
    return new Date().toISOString().split('T')[0]; // Fallback to today's date
  }
}

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function generateSmartFileName(filePath) {
  const originalName = path.basename(filePath);
  const extension = path.extname(filePath);
  
  try {
    let text = '';
    
    // Extract text from PDF files
    if (extension.toLowerCase() === '.pdf') {
      text = await extractTextFromPDF(filePath);
    }
    
    // Detect components
    const clientName = detectClientName(text);
    const detectedDate = detectDate(text);
    const docType = detectDocumentType(text);
    
    // Use detected date or fallback to file date
    const date = detectedDate || getFileDate(filePath);
    
    // Construct new filename
    const sanitizedClient = sanitizeFileName(clientName);
    const sanitizedDocType = sanitizeFileName(docType);
    
    const newFileName = `${sanitizedClient}_${date}_${sanitizedDocType}${extension}`;
    
    console.log(`Smart renaming: ${originalName} -> ${newFileName}`);
    console.log(`  Client: ${clientName} -> ${sanitizedClient}`);
    console.log(`  Date: ${detectedDate || 'file date'} -> ${date}`);
    console.log(`  Type: ${docType} -> ${sanitizedDocType}`);
    
    return newFileName;
    
  } catch (error) {
    console.warn(`Smart renaming failed for ${originalName}, using original name:`, error.message);
    return originalName;
  }
}

// Handle file processing with smart renaming
ipcMain.on('start:sorting', async (event, filePaths) => {
  // Robust validation at the very beginning
  console.log('Received file paths:', filePaths);
  console.log('Type of filePaths:', typeof filePaths);
  console.log('Is array:', Array.isArray(filePaths));
  
  // Safety check: verify filePaths is an array and not empty
  if (!Array.isArray(filePaths)) {
    console.error('Invalid filePaths: Expected array, received', typeof filePaths);
    event.reply('processing:complete', {
      total: 0,
      success: 0,
      errors: 1,
      message: 'Invalid file paths format received'
    });
    return;
  }
  
  if (filePaths.length === 0) {
    console.error('No file paths provided for processing');
    event.reply('processing:complete', {
      total: 0,
      success: 0,
      errors: 1,
      message: 'No files provided for processing'
    });
    return;
  }
  
  // Additional validation: filter out invalid file paths
  const validFilePaths = filePaths.filter(filePath => {
    if (typeof filePath !== 'string') {
      console.warn('Invalid file path type:', typeof filePath, filePath);
      return false;
    }
    if (filePath.trim().length === 0) {
      console.warn('Empty file path received');
      return false;
    }
    return true;
  });
  
  if (validFilePaths.length === 0) {
    console.error('No valid file paths after filtering');
    event.reply('processing:complete', {
      total: 0,
      success: 0,
      errors: 1,
      message: 'No valid file paths found'
    });
    return;
  }
  
  if (validFilePaths.length !== filePaths.length) {
    console.warn(`Filtered out ${filePaths.length - validFilePaths.length} invalid file paths`);
  }

  console.log(`Starting to process ${validFilePaths.length} valid file(s)...`);
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const filePath of validFilePaths) {
    // Additional safety check for each individual file path
    if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
      console.error('Skipping invalid file path:', filePath);
      errorCount++;
      continue;
    }
    
    try {
      console.log(`Processing: ${path.basename(filePath)}`);
      
      // Generate smart filename
      const smartFileName = await generateSmartFileName(filePath);
      const destDir = path.join(require('os').homedir(), 'Desktop', 'sorted_files');
      
      // Ensure destination directory exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      const destPath = path.join(destDir, smartFileName);
      
      // Move file with smart name
      fs.renameSync(filePath, destPath);
      
      // Send success message
      event.reply('file:processed', {
        originalPath: filePath,
        finalPath: destPath,
        success: true,
        message: `Successfully renamed and sorted to ${path.basename(destPath)}`
      });
      
      successCount++;
      console.log(`✅ Successfully processed: ${path.basename(filePath)} -> ${path.basename(destPath)}`);
      
    } catch (error) {
      // Safe error logging with fallback for undefined filePath
      console.error(`❌ Failed to process ${filePath ? path.basename(filePath) : "Unknown file"}:`, error);
      
      // Send error message
      event.reply('file:processed', {
        originalPath: filePath,
        error: error.message,
        success: false,
        message: `Failed to process: ${error.message}`
      });
      
      errorCount++;
    }
    
    processedCount++;
  }
  
  // Send completion message
  event.reply('processing:complete', {
    total: processedCount,
    success: successCount,
    errors: errorCount,
    message: `Processing complete: ${successCount} successful, ${errorCount} errors`
  });
  
  console.log(`Processing complete: ${successCount} successful, ${errorCount} errors`);
});