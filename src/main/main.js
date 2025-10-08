let electron, app, BrowserWindow, ipcMain, Menu, dialog, os, fs, path, logPath;

try {
  electron = require('electron');
  const electronModule = electron;
  app = electronModule.app;
  BrowserWindow = electronModule.BrowserWindow;
  ipcMain = electronModule.ipcMain;
  Menu = electronModule.Menu;
  dialog = electronModule.dialog;
} catch (err) {
  console.error('Failed to load electron:', err.stack);
  process.exit(1);
}

// Startup diagnostics logging
try {
  os = require('os');
} catch (err) {
  console.error('Failed to load os:', err.stack);
  process.exit(1);
}

try {
  fs = require('fs');
} catch (err) {
  console.error('Failed to load fs:', err.stack);
  process.exit(1);
}

try {
  path = require('path');
} catch (err) {
  console.error('Failed to load path:', err.stack);
  process.exit(1);
}

// Create startup diagnostics log
function writeStartupDiagnostics() {
  try {
    const appSupportDir = path.join(os.homedir(), 'Library', 'Application Support', 'Document Sorter');
    
    // Ensure directory exists
    if (!fs.existsSync(appSupportDir)) {
      fs.mkdirSync(appSupportDir, { recursive: true });
    }
    
    logPath = path.join(appSupportDir, 'startup-debug.log');
    const timestamp = new Date().toISOString();
    
    const diagnostics = {
      timestamp,
      processCwd: process.cwd(),
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      envPath: process.env.PATH,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      argv: process.argv,
      execPath: process.execPath
    };
    
    const logContent = `=== Document Sorter Startup Diagnostics ===
Timestamp: ${diagnostics.timestamp}
Process CWD: ${diagnostics.processCwd}
App Path: ${diagnostics.appPath}
Resources Path: ${diagnostics.resourcesPath}
Environment PATH: ${diagnostics.envPath}
NODE_ENV: ${diagnostics.nodeEnv}
Platform: ${diagnostics.platform}
Architecture: ${diagnostics.arch}
Electron Version: ${diagnostics.electronVersion}
Node Version: ${diagnostics.nodeVersion}
V8 Version: ${diagnostics.v8Version}
Exec Path: ${diagnostics.execPath}
Process Args: ${JSON.stringify(diagnostics.argv, null, 2)}
===============================================

`;
    
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log(`Startup diagnostics written to: ${logPath}`);
  } catch (error) {
    console.error('Failed to write startup diagnostics:', error);
  }
}

// Write diagnostics immediately
writeStartupDiagnostics();

// Enable hot reload in development
if (process.env.NODE_ENV === 'development') {
  try {
    const electronReload = require('electron-reload');
    electronReload(__dirname, {
      electron: electron,
      hardResetMethod: 'exit'
    });
  } catch (error) {
    fs.appendFileSync(logPath, `❌ Failed to load electron-reload: ${error.stack}\n`);
    console.log('Hot reload not available:', error.message);
  }
}

console.log('Document Sorter starting...');
console.log(`🔧 Sharp module status: ${sharpAvailable ? 'Available' : 'Not Available'}`);

// Test Sharp functionality if available
async function testSharpFunctionality() {
  if (sharpAvailable && sharp) {
    try {
      console.log('🧪 Testing Sharp functionality...');
      // Create a simple test to verify Sharp works
      const testBuffer = Buffer.from('test');
      await sharp(testBuffer).metadata();
      console.log('✅ Sharp functionality test passed');
      return true;
    } catch (error) {
      console.warn('⚠️ Sharp functionality test failed:', error.message);
      console.log('📝 Falling back to basic image processing');
      return false;
    }
  }
  return false;
}
let fsp, pdfParse, Tesseract, sharp, sharpAvailable, mammoth, mime, EnhancedParsingService;

try {
  fsp = require('fs').promises;
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load fs.promises: ${err.stack}\n`);
  process.exit(1);
}

try {
  pdfParse = require('pdf-parse');
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load pdf-parse: ${err.stack}\n`);
  process.exit(1);
}

try {
  Tesseract = require('tesseract.js');
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load tesseract.js: ${err.stack}\n`);
  process.exit(1);
}

// Optional Sharp module - wrapped in try-catch for diagnostics
sharp = null;
sharpAvailable = false;
try {
  sharp = require('sharp');
  sharpAvailable = true;
  console.log('✅ Sharp module loaded successfully');
} catch (error) {
  fs.appendFileSync(logPath, `❌ Failed to load sharp: ${error.stack}\n`);
  console.warn('⚠️ Sharp module failed to load:', error.message);
  console.log('📝 Image processing features will be limited or disabled');
}

try {
  mammoth = require('mammoth');
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load mammoth: ${err.stack}\n`);
  process.exit(1);
}

try {
  mime = require('mime-types');
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load mime-types: ${err.stack}\n`);
  process.exit(1);
}

// const natural = require('natural'); // Temporarily disabled due to installation issues

// Import enhanced parsing service
try {
  EnhancedParsingService = require('../services/enhancedParsingService');
} catch (err) {
  fs.appendFileSync(logPath, `❌ Failed to load EnhancedParsingService: ${err.stack}\n`);
  process.exit(1);
}

// Fallback image processing when Sharp is not available
function createImageProcessingFallback() {
  return {
    async preprocessImage(filePath) {
      console.log('📝 Using fallback image processing (no Sharp)');
      // Simply return the original file buffer
      return await fsp.readFile(filePath);
    },
    
    async getImageMetadata(filePath) {
      console.log('📝 Using fallback metadata extraction (no Sharp)');
      // Return basic metadata structure
      return {
        width: 1000, // Default width
        height: 1000, // Default height
        format: 'unknown'
      };
    }
  };
}

// Initialize image processing (Sharp or fallback)
const imageProcessor = sharpAvailable && sharp ? {
  async preprocessImage(filePath) {
    const meta = await sharp(filePath).metadata();
    let pipeline = sharp(filePath).grayscale().threshold(180);
    
    if (meta && meta.width && meta.width < 2000) {
      pipeline = pipeline.resize({ width: 2000, withoutEnlargement: false });
    }
    
    return await pipeline.png().toBuffer();
  },
  
  async getImageMetadata(filePath) {
    return await sharp(filePath).metadata();
  }
} : createImageProcessingFallback();

// Keep a global reference of the window object
let mainWindow;

// Initialize enhanced parsing service
let enhancedParsingService;

function createWindow() {
  fs.appendFileSync(logPath, '🧱 Creating BrowserWindow\n');
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development (optional)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Test Sharp functionality
  testSharpFunctionality().then((sharpWorking) => {
    if (sharpWorking) {
      console.log('🔧 Sharp is fully functional');
    } else {
      console.log('📝 Sharp is not functional, using fallback image processing');
    }
  });

  // Initialize enhanced parsing service
  try {
    enhancedParsingService = new EnhancedParsingService({
      useAI: process.env.USE_AI === 'true' || process.env.OPENAI_API_KEY,
      aiConfidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5,
      aiBatchSize: parseInt(process.env.AI_BATCH_SIZE) || 5
    });
    console.log('✅ Enhanced parsing service initialized');
  } catch (error) {
    console.warn('⚠️ Failed to initialize enhanced parsing service:', error.message);
    // Fallback to basic parsing if enhanced service fails
    enhancedParsingService = null;
  }

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-files');
            }
          }
        },
        {
          label: 'Start Sorting',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:start-sorting');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            if (mainWindow) {
              mainWindow.minimize();
            }
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) {
              mainWindow.close();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Document Sorter',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:show-about');
            }
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About Document Sorter',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:show-about');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services'
        },
        { type: 'separator' },
        {
          label: 'Hide Document Sorter',
          accelerator: 'Cmd+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Cmd+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Cmd+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished initialization
fs.appendFileSync(logPath, '✅ Reached before app.whenReady()\n');
app.whenReady().then(() => {
  fs.appendFileSync(logPath, '🚀 Entered app.whenReady()\n');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file dialog opening
ipcMain.handle('open-file-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Files to Sort',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return [];
    }
    
    console.log('File dialog selected files:', result.filePaths);
    return result.filePaths;
  } catch (error) {
    console.error('Error opening file dialog:', error);
    throw error;
  }
});

// Optional: still handle simple file drop acknowledgement (not used in new flow)
ipcMain.handle('file:dropped', (event, filePaths) => {
  console.log('Files dropped:', filePaths);
  filePaths.forEach((filePath, index) => {
    console.log(`File ${index + 1}: ${filePath}`);
  });
  return { success: true, message: `Successfully received ${filePaths.length} file(s)` };
});

// Listen for start:sorting to process files via OCR + rules
ipcMain.on('start:sorting', async (event, filePaths) => {
  // Check to ensure the received data is a non-empty array of strings
  console.log('Received file paths:', filePaths);
  console.log('Type of filePaths:', typeof filePaths);
  console.log('Is array:', Array.isArray(filePaths));
  
  // Validate that filePaths is an array
  if (!Array.isArray(filePaths)) {
    console.error('Invalid filePaths: Expected array, received', typeof filePaths);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: 0,
        success: 0,
        errors: 1,
        message: 'Invalid file paths format received'
      });
    }
    return;
  }
  
  // Validate that array is not empty
  if (filePaths.length === 0) {
    console.error('No file paths provided for processing');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: 0,
        success: 0,
        errors: 1,
        message: 'No files provided for processing'
      });
    }
    return;
  }
  
  // Additional validation: ensure all items are valid strings
  const validFilePaths = filePaths.filter(filePath => {
    return typeof filePath === 'string' && filePath.trim().length > 0;
  });
  
  if (validFilePaths.length === 0) {
    console.error('No valid file paths found after filtering');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: 0,
        success: 0,
        errors: 1,
        message: 'No valid file paths found'
      });
    }
    return;
  }
  
  if (validFilePaths.length !== filePaths.length) {
    console.warn(`Filtered out ${filePaths.length - validFilePaths.length} invalid file paths`);
  }

  // Only if the data is valid, proceed to loop through the file paths
  console.log(`Starting to process ${validFilePaths.length} valid file(s)...`);
  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  for (const filePath of validFilePaths) {
    // Additional safety check for each individual file path
    if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
      console.error('Skipping invalid file path:', filePath);
      failureCount++;
      errors.push(`Invalid file path: ${filePath}`);
      continue;
    }
    
    try {
      console.log(`Processing: ${path.basename(filePath)}`);
      const finalPath = await processFile(filePath);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file:processed', {
          originalPath: filePath,
          finalPath,
          success: true,
          message: `Successfully sorted to ${path.basename(finalPath)}`
        });
      }
      successCount++;
      
    } catch (error) {
      const errorMessage = error?.message || String(error);
      console.error(`Failed processing ${path.basename(filePath)}:`, errorMessage);
      failureCount++;
      errors.push(`${path.basename(filePath)}: ${errorMessage}`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file:processed', {
          originalPath: filePath,
          error: errorMessage,
          success: false,
          message: `Failed to process: ${errorMessage}`
        });
      }
    }
  }
  
  // Send completion message
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('processing:complete', {
      total: validFilePaths.length,
      success: successCount,
      errors: failureCount,
      message: `Processing complete: ${successCount} successful, ${failureCount} failed`
    });
  }
  
  console.log(`Processing complete: ${successCount} successful, ${failureCount} failed`);
  if (errors.length > 0) {
    console.error('Processing errors:', errors);
  }
});

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mime.lookup(filePath);
  
  console.log(`Extracting text from: ${path.basename(filePath)} (${ext}, ${mimeType})`);
  
  try {
    // Handle PDF files
    if (ext === '.pdf') {
      return await extractTextFromPDF(filePath);
    }
    
    // Handle DOCX files
    else if (ext === '.docx') {
      return await extractTextFromDOCX(filePath);
    }
    
    // Handle image files (PNG, JPG, JPEG, GIF, BMP, TIFF)
    else if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif'].includes(ext)) {
      return await extractTextFromImage(filePath);
    }
    
    // Handle other text-based files
    else if (['.txt', '.md', '.rtf'].includes(ext)) {
      return await extractTextFromPlainText(filePath);
    }
    
    // Unsupported file type
    else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    console.error(`Text extraction failed for ${path.basename(filePath)}:`, error);
    throw error;
  }
}

async function extractTextFromPDF(filePath) {
  console.log(`Processing PDF: ${path.basename(filePath)}`);
  
  try {
    // Try pdf-parse first (for text-based PDFs)
    const dataBuffer = await fsp.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    if (pdfData && pdfData.text && pdfData.text.trim().length > 50) {
      console.log(`PDF text extraction successful: ${pdfData.text.length} characters`);
      return pdfData.text;
    } else {
      console.log('PDF appears to be image-based, falling back to OCR');
      // For scanned PDFs, we would need to rasterize pages first
      // For now, return empty text and let the system handle it
      return '';
    }
  } catch (error) {
    console.warn(`PDF text extraction failed: ${error.message}`);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}

async function extractTextFromDOCX(filePath) {
  console.log(`Processing DOCX: ${path.basename(filePath)}`);
  
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    
    if (result.text && result.text.trim().length > 0) {
      console.log(`DOCX text extraction successful: ${result.text.length} characters`);
      return result.text;
    } else {
      throw new Error('No text content found in DOCX file');
    }
  } catch (error) {
    console.error(`DOCX text extraction failed: ${error.message}`);
    throw new Error(`DOCX processing failed: ${error.message}`);
  }
}

async function extractTextFromImage(filePath) {
  console.log(`Processing image: ${path.basename(filePath)}`);
  
  try {
    let preprocessedBuffer;
    
    // Use the appropriate image processor (Sharp or fallback)
    try {
      preprocessedBuffer = await imageProcessor.preprocessImage(filePath);
      console.log(`Image preprocessing completed: ${preprocessedBuffer.length} bytes`);
    } catch (preprocessError) {
      console.warn(`Image preprocessing failed: ${preprocessError.message}, using original file`);
      preprocessedBuffer = await fsp.readFile(filePath);
    }

    // Perform OCR with Tesseract.js
    const result = await Tesseract.recognize(preprocessedBuffer, 'eng', {
      logger: () => {}
    });
    
    const extractedText = result?.data?.text || '';
    console.log(`OCR completed: ${extractedText.length} characters`);
    
    if (extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from image');
    }
    
    return extractedText;
  } catch (error) {
    console.error(`Image OCR failed: ${error.message}`);
    throw new Error(`Image processing failed: ${error.message}`);
  }
}

async function extractTextFromPlainText(filePath) {
  console.log(`Processing plain text: ${path.basename(filePath)}`);
  
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    console.log(`Plain text extraction successful: ${content.length} characters`);
    return content;
  } catch (error) {
    console.error(`Plain text extraction failed: ${error.message}`);
    throw new Error(`Plain text processing failed: ${error.message}`);
  }
}

async function processFile(filePath) {
  console.log(`Starting processing: ${path.basename(filePath)}`);
  
  try {
    // 1) Extract text using unified file handling
    let extractedText = '';
    try {
      extractedText = await extractText(filePath);
      console.log(`Text extraction completed: ${extractedText.length} characters`);
    } catch (extractionError) {
      console.error(`Text extraction failed for ${path.basename(filePath)}:`, extractionError);
      throw new Error(`Text extraction failed: ${extractionError.message}`);
    }

    // 2) Analyze text with enhanced parsing service (AI + regex)
    console.log(`Analyzing document: ${path.basename(filePath)}`);
    let analysis;
    
    if (enhancedParsingService) {
      try {
        analysis = await enhancedParsingService.analyzeDocumentEnhanced(extractedText, filePath);
        console.log('Enhanced analysis result:', {
          type: analysis.type,
          clientName: analysis.clientName,
          confidence: analysis.confidence,
          date: analysis.date,
          source: analysis.source
        });
      } catch (enhancedError) {
        console.warn(`Enhanced parsing failed, falling back to basic analysis: ${enhancedError.message}`);
        analysis = analyzeDocument(extractedText, filePath);
      }
    } else {
      // Fallback to basic analysis if enhanced service is not available
      analysis = analyzeDocument(extractedText, filePath);
      console.log('Basic analysis result:', {
        type: analysis.type,
        clientName: analysis.clientName,
        confidence: analysis.confidence,
        date: analysis.date
      });
    }

    // 3) Generate robust filename using unified naming function
    const ext = path.extname(filePath).toLowerCase();
    const fileName = _generateFileName(analysis, ext);
    const folder = mapTypeToFolder(analysis.type);
    
    console.log(`Generated filename: ${fileName}`);
    console.log(`Target folder: ${folder}`);
    
    // 4) Handle file operations with robust error handling
    const finalPath = await _handleFileOperations(filePath, fileName, folder);
    
    // 5) Send success notification to renderer with enhanced data
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:processed', {
        originalPath: filePath,
        finalPath: finalPath,
        success: true,
        message: `Successfully sorted to ${path.basename(finalPath)}`,
        analysis: {
          type: analysis.type,
          clientName: analysis.clientName,
          confidence: analysis.confidence,
          date: analysis.date,
          source: analysis.source || 'regex',
          aiConfidence: analysis.aiConfidence || 0,
          snippets: analysis.snippets || []
        }
      });
    }
    
    console.log(`✅ Successfully processed: ${path.basename(filePath)} -> ${path.basename(finalPath)}`);
    return finalPath;
    
  } catch (error) {
    console.error(`❌ Processing failed for ${path.basename(filePath)}:`, error);
    
    // Send error notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:processed', {
        originalPath: filePath,
        error: error.message,
        success: false,
        message: `Failed to process: ${error.message}`
      });
    }
    
    throw error;
  }
}

function _generateFileName(documentData, extension) {
  console.log('Generating filename for document data:', {
    clientName: documentData.clientName,
    type: documentData.type,
    date: documentData.date,
    confidence: documentData.confidence
  });
  
  const parts = [];
  
  // 1. CLIENT NAME (most critical - goes first in filename)
  let clientName = 'Client_NA';
  
  if (documentData.clientName && documentData.clientName.trim()) {
    clientName = documentData.clientName.trim();
  } else if (documentData.name && documentData.name.trim()) {
    clientName = documentData.name.trim();
  } else if (documentData.title && documentData.title.trim()) {
    const title = documentData.title.trim();
    if (title.length > 2 && title.length < 50 && 
        !title.toLowerCase().includes('page') &&
        !title.toLowerCase().includes('confidential')) {
      clientName = title;
    }
  }
  
  parts.push(_sanitizeComponent(clientName));
  
  // 2. DOCUMENT TYPE (with fallback)
  let documentType = 'Unclassified';
  if (documentData.type && documentData.type.trim()) {
    documentType = documentData.type.trim();
    // Add confidence indicator for low confidence classifications
    if (documentData.confidence < 0.5) {
      documentType = `${documentType}_LowConfidence`;
    }
  }
  parts.push(_sanitizeComponent(documentType));
  
  // 3. DATE (with fallback to file modification date)
  let dateString = getTodayString();
  if (documentData.date && documentData.date.trim()) {
    dateString = documentData.date.trim();
  } else if (documentData.filePath) {
    // Try to get file modification date as fallback
    try {
      const stats = fs.statSync(documentData.filePath);
      dateString = stats.mtime.toISOString().split('T')[0];
      console.log(`Using file modification date: ${dateString}`);
    } catch (error) {
      console.warn(`Could not read file modification date: ${error.message}, using today's date`);
    }
  }
  parts.push(_sanitizeComponent(dateString));
  
  // 4. Join all parts and add extension
  const fileName = parts.filter(Boolean).join('_') + extension;
  
  // 5. Final validation and sanitization
  const finalFileName = _sanitizeFileName(fileName);
  console.log(`Generated final filename: ${finalFileName}`);
  
  return finalFileName;
}

function _sanitizeComponent(component) {
  if (!component || typeof component !== 'string') {
    return 'Unknown';
  }
  
  return component
    .replace(/[<>:"/\\|?*]/g, '_')  // Windows invalid chars
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')  // Control characters
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/_+/g, '_')  // Replace multiple underscores with single
    .replace(/^_|_$/g, '')  // Remove leading/trailing underscores
    .slice(0, 50) || 'Unknown';  // Limit length and ensure non-empty
}

function _sanitizeFileName(fileName) {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')  // Windows invalid chars
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')  // Control characters
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/_+/g, '_')  // Replace multiple underscores with single
    .replace(/^_|_$/g, '')  // Remove leading/trailing underscores
    .slice(0, 200) || 'Unnamed_Document';  // Limit length and ensure non-empty
}

async function _handleFileOperations(originalPath, fileName, folder) {
  try {
    // Construct destination path
    const destRoot = path.join(require('os').homedir(), 'Desktop', 'sorted_files', folder);
    console.log(`Destination root: ${destRoot}`);
    
    // Ensure destination directory exists
    try {
      fs.mkdirSync(destRoot, { recursive: true });
      console.log(`Created/verified directory: ${destRoot}`);
    } catch (mkdirError) {
      console.error(`Failed to create directory ${destRoot}:`, mkdirError);
      throw new Error(`Directory creation failed: ${mkdirError.message}`);
    }
    
    // Construct final path
    let finalPath = path.join(destRoot, fileName);
    
    // Ensure unique filename if file already exists
    finalPath = await _ensureUniquePath(finalPath);
    console.log(`Final destination: ${finalPath}`);
    
    // Move and rename the file
    try {
      fs.renameSync(originalPath, finalPath);
      console.log(`File moved successfully: ${path.basename(originalPath)} -> ${path.basename(finalPath)}`);
    } catch (renameError) {
      console.error('Failed to move file:', renameError);
      throw new Error(`File move failed: ${renameError.message}`);
    }
    
    return finalPath;
    
  } catch (error) {
    console.error(`File operations failed for ${path.basename(originalPath)}:`, error);
    throw error;
  }
}

async function _ensureUniquePath(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const ext = path.extname(base);
  const name = base.slice(0, base.length - ext.length);
  let candidate = targetPath;
  let i = 1;
  
  while (true) {
    try {
      fs.accessSync(candidate, fs.constants.F_OK);
      candidate = path.join(dir, `${name}_${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}

function analyzeDocument(text, filePath) {
  const result = { 
    date: undefined, 
    type: 'Unclassified', // Always provide a default type
    name: undefined, 
    clientName: undefined,
    amount: undefined, 
    title: undefined, 
    confidence: 0,
    rawText: text,
    filePath: filePath
  };
  
  if (!text || text.trim().length === 0) {
    return result;
  }

  // Split text into lines and words for analysis
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const content = text.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. STRICT KEYWORD MATCHING WITH BUSINESS DOCUMENT TYPES
  const businessDocumentTypes = new Set([
    'Resume', 'CV', 'Invoice', 'Receipt', 'Purchase Order', 'Contract', 
    'Service Agreement', 'Partnership Agreement', 'Non-Disclosure Agreement (NDA)', 
    'Lease Agreement', 'Statement', 'Proposal', 'Report', 'Memorandum', 
    'Business Plan', 'Bylaws', 'Articles of Incorporation', 
    'SOP (Standard Operating Procedure)', 'Tax Return', 'Balance Sheet', 
    'Income Statement', 'Cash Flow Statement', 'Audit Report', 'Employee Handbook', 
    'Offer Letter', 'Employment Agreement', 'Performance Review', 'Job Description', 
    'Project Plan', 'Scope Statement', 'Meeting Minutes', 
    'Request for Proposal (RFP)', 'Work Order', 'Purchase Requisition'
  ]);

  // Document type keywords with variations and synonyms
  const documentTypeKeywords = {
    'Resume': ['resume', 'cv', 'curriculum vitae', 'professional summary', 'work experience', 'education', 'skills', 'qualifications'],
    'Invoice': ['invoice', 'bill', 'billing', 'amount due', 'payment due', 'total amount', 'subtotal', 'tax', 'invoice number'],
    'Receipt': ['receipt', 'payment received', 'thank you for your payment', 'transaction', 'purchase', 'receipt number'],
    'Purchase Order': ['purchase order', 'po number', 'po#', 'purchase requisition', 'order number'],
    'Contract': ['contract', 'agreement', 'terms and conditions', 'service agreement', 'license agreement', 'employment contract'],
    'Service Agreement': ['service agreement', 'service contract', 'terms of service', 'service level agreement'],
    'Partnership Agreement': ['partnership agreement', 'partnership contract', 'partnership terms'],
    'Non-Disclosure Agreement (NDA)': ['non-disclosure agreement', 'nda', 'confidentiality agreement', 'confidentiality'],
    'Lease Agreement': ['lease agreement', 'rental agreement', 'lease contract', 'rental contract'],
    'Statement': ['statement', 'account statement', 'bank statement', 'monthly statement', 'balance', 'account balance'],
    'Proposal': ['proposal', 'quote', 'quotation', 'estimate', 'bid', 'project proposal', 'cost estimate'],
    'Report': ['report', 'analysis', 'summary report', 'financial report', 'annual report', 'quarterly report'],
    'Memorandum': ['memorandum', 'memo', 'internal memo', 'office memo'],
    'Business Plan': ['business plan', 'business proposal', 'strategic plan', 'business strategy'],
    'Bylaws': ['bylaws', 'corporate bylaws', 'company bylaws', 'organizational bylaws'],
    'Articles of Incorporation': ['articles of incorporation', 'incorporation', 'corporate charter'],
    'SOP (Standard Operating Procedure)': ['standard operating procedure', 'sop', 'operating procedure', 'procedure manual'],
    'Tax Return': ['tax return', 'tax filing', 'income tax return', 'tax form'],
    'Balance Sheet': ['balance sheet', 'financial position', 'assets and liabilities'],
    'Income Statement': ['income statement', 'profit and loss', 'p&l statement', 'revenue statement'],
    'Cash Flow Statement': ['cash flow statement', 'cash flow', 'cash position'],
    'Audit Report': ['audit report', 'audit findings', 'auditor report', 'audit opinion'],
    'Employee Handbook': ['employee handbook', 'employee manual', 'staff handbook', 'company handbook'],
    'Offer Letter': ['offer letter', 'job offer', 'employment offer', 'offer of employment'],
    'Employment Agreement': ['employment agreement', 'employment contract', 'work agreement'],
    'Performance Review': ['performance review', 'employee review', 'annual review', 'performance evaluation'],
    'Job Description': ['job description', 'position description', 'role description', 'job posting'],
    'Project Plan': ['project plan', 'project proposal', 'project scope', 'project charter'],
    'Scope Statement': ['scope statement', 'project scope', 'scope of work', 'statement of work'],
    'Meeting Minutes': ['meeting minutes', 'minutes', 'meeting notes', 'conference minutes'],
    'Request for Proposal (RFP)': ['request for proposal', 'rfp', 'proposal request', 'bid request'],
    'Work Order': ['work order', 'service order', 'job order', 'work request'],
    'Purchase Requisition': ['purchase requisition', 'requisition', 'purchase request', 'procurement request']
  };

  // 2. CONTEXTUAL KEYWORD PRIORITIZATION WITH WEIGHTED SCORING
  const typeScores = {};
  
  for (const [docType, keywords] of Object.entries(documentTypeKeywords)) {
    let score = 0;
    
    // High priority: Keywords in first 20 lines (headers, titles)
    const first20Lines = lines.slice(0, 20).join(' ').toLowerCase();
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = (first20Lines.match(regex) || []).length;
      score += matches * 20; // High confidence for header/title matches
    }
    
    // Medium priority: Keywords in first 100 words
    const first100Words = words.slice(0, 100).join(' ').toLowerCase();
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = (first100Words.match(regex) || []).length;
      score += matches * 15; // Medium confidence for early content
    }
    
    // Lower priority: Keywords anywhere in document
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = (content.match(regex) || []).length;
      score += matches * 5; // Lower confidence for body text
    }
    
    // Bonus for exact document type matches
    if (businessDocumentTypes.has(docType)) {
      const exactMatch = new RegExp(`\\b${docType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (exactMatch.test(content)) {
        score += 50; // High bonus for exact type matches
      }
    }
    
    typeScores[docType] = score;
  }

  // Select document type with highest confidence score
  const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
  if (sortedTypes.length > 0 && sortedTypes[0][1] > 10) {
    result.type = sortedTypes[0][0];
    result.confidence = Math.min(sortedTypes[0][1] / 100, 1); // Normalize to 0-1
  }

  // 3. NLP FALLBACK USING SIMPLE WORD ANALYSIS
  if (!result.type || result.confidence < 0.3) {
    console.log('Using NLP fallback for document classification');
    
    try {
      // Simple tokenization without external library
      const tokens = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 0);
      
      // Remove stop words and short words
      const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'man', 'oil', 'sit', 'try', 'use', 'will', 'with', 'this', 'that', 'they', 'them', 'their', 'there', 'then', 'than', 'been', 'have', 'from', 'each', 'which', 'your', 'what', 'when', 'where', 'why', 'how']);
      
      const meaningfulWords = tokens.filter(word => 
        word.length > 3 && 
        !/^\d+$/.test(word) && 
        !stopWords.has(word)
      );
      
      // Count word frequencies
      const wordFreq = {};
      meaningfulWords.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
      
      // Sort by frequency
      const sortedWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
      
      // NLP-based classification using word patterns
      const nlpClassification = _classifyByNLP(sortedWords, content);
      if (nlpClassification) {
        result.type = nlpClassification.type;
        result.confidence = nlpClassification.confidence;
        console.log(`NLP classification: ${nlpClassification.type} (confidence: ${nlpClassification.confidence})`);
      }
      
    } catch (nlpError) {
      console.warn('NLP analysis failed:', nlpError.message);
    }
  }

  // 4. SMART TITLE DETECTION
  const genericPhrases = [
    'page 1 of', 'confidential', 'draft', 'copy', 'original', '©', 'copyright',
    'all rights reserved', 'proprietary', 'internal use', 'do not copy',
    'date:', 'time:', 'subject:', 're:', 'fwd:', 'fw:'
  ];

  let bestTitle = null;
  let bestTitleScore = 0;

  // Check first 10 lines for potential titles
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    if (!line || line.length < 3) continue;

    // Skip generic phrases
    const isGeneric = genericPhrases.some(phrase => 
      line.toLowerCase().includes(phrase.toLowerCase())
    );
    if (isGeneric) continue;

    let score = 0;
    
    // Short phrases (1-5 words) get higher scores
    const wordCount = line.split(/\s+/).length;
    if (wordCount >= 1 && wordCount <= 5) {
      score += 10;
    } else if (wordCount <= 10) {
      score += 5;
    }

    // ALL CAPS titles get bonus points
    if (line === line.toUpperCase() && line.length > 3 && line.length < 100) {
      score += 15;
    }

    // Title case (First Letter Of Each Word) gets points
    const isTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line);
    if (isTitleCase && wordCount >= 2) {
      score += 8;
    }

    // Early lines get higher priority
    score += Math.max(0, 10 - i);

    // Avoid lines that look like addresses, phone numbers, or dates
    if (/^\d+[\/\-]\d+[\/\-]\d+/.test(line) || // Date patterns
        /^\d{3}[-.]?\d{3}[-.]?\d{4}/.test(line) || // Phone patterns
        /^\d+\s+\w+\s+st|ave|rd|dr|blvd/i.test(line)) { // Address patterns
      score -= 20;
    }

    if (score > bestTitleScore) {
      bestTitleScore = score;
      bestTitle = line;
    }
  }

  if (bestTitle && bestTitleScore > 5) {
    result.title = bestTitle;
  }

  // 5. DATE DETECTION
  const datePatterns = [
    /(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-]((?:19|20)?\d\d)/i,
    /([0-2]?[0-9]|3[01])[\-\.](0?[1-9]|1[0-2])[\-\.]((?:19|20)?\d\d)/i,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+([0-2]?[0-9]|3[01]),?\s+((?:19|20)?\d\d)/i
  ];
  
  for (const rx of datePatterns) {
    const m = content.match(rx);
    if (m) { 
      result.date = normalizeDateMatch(m); 
      break; 
    }
  }

  // 6. CLIENT NAME DETECTION (enhanced for business documents)
  const clientPatterns = [
    // Bill to / Invoice to patterns
    /(bill\s*to|billed\s*to|invoice\s*to|to)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})/i,
    // From / Vendor patterns
    /(from|vendor|supplier|company)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})/i,
    // Attention patterns
    /(attention|attn)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})/i,
    // Re: patterns
    /(re|regarding)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})/i,
    // Standalone name patterns
    /^([A-Z][a-z]+ [A-Z][a-z]+)$/m,
    /^([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)$/m,
    // Company name patterns (Inc, Corp, LLC, Ltd)
    /^([A-Z][A-Za-z0-9&.,'\- ]{2,50}\s+(?:Inc|Corp|Corporation|LLC|Ltd|Limited|Company|Co)\.?)$/m
  ];
  
  let bestClientName = null;
  let bestClientScore = 0;
  
  for (const rx of clientPatterns) {
    const m = content.match(rx);
    if (m) { 
      const extractedName = m[2] ? m[2].trim() : m[1].trim();
      const cleanName = extractedName.replace(/[^\w\s\-&.,']/g, '').trim();
      
      if (cleanName.length > 2 && cleanName.length < 100) {
        // Score based on pattern type and position
        let score = 10; // Base score
        
        // Higher score for "Bill to" patterns (most important for invoices)
        if (rx.source.includes('bill') || rx.source.includes('invoice')) {
          score += 20;
        }
        
        // Higher score for company patterns
        if (rx.source.includes('Inc|Corp|LLC|Ltd')) {
          score += 15;
        }
        
        // Higher score for names in first few lines
        const lineIndex = lines.findIndex(line => line.includes(cleanName));
        if (lineIndex >= 0 && lineIndex < 5) {
          score += 10;
        }
        
        if (score > bestClientScore) {
          bestClientScore = score;
          bestClientName = cleanName;
        }
      }
    }
  }
  
  if (bestClientName) {
    result.clientName = bestClientName;
    result.name = bestClientName; // Keep backward compatibility
  }

  // 7. AMOUNT DETECTION
  const amountPatterns = [
    /\btotal\s*[:\-]?\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/
  ];
  
  for (const rx of amountPatterns) {
    const m = content.match(rx);
    if (m) { 
      result.amount = m[1]; 
      break; 
    }
  }

  // Ensure type is never null or undefined
  if (!result.type) {
    result.type = 'Unclassified';
    result.confidence = 0.1;
  }

  console.log(`Document classification result: ${result.type} (confidence: ${result.confidence})`);
  return result;
}

function _classifyByNLP(sortedWords, content) {
  // Define word patterns for different document types
  const nlpPatterns = {
    'Resume': {
      keywords: ['experience', 'education', 'skills', 'employment', 'career', 'professional', 'qualifications', 'work', 'job', 'position', 'hiring', 'candidate'],
      weight: 1.0
    },
    'Invoice': {
      keywords: ['invoice', 'bill', 'payment', 'total', 'amount', 'due', 'billing', 'account', 'charge', 'fee', 'cost', 'price'],
      weight: 1.0
    },
    'Contract': {
      keywords: ['agreement', 'contract', 'terms', 'conditions', 'parties', 'obligations', 'liability', 'indemnity', 'warranty', 'clause'],
      weight: 1.0
    },
    'Report': {
      keywords: ['report', 'analysis', 'data', 'findings', 'conclusion', 'methodology', 'results', 'summary', 'recommendations'],
      weight: 1.0
    },
    'Statement': {
      keywords: ['statement', 'balance', 'account', 'transaction', 'deposit', 'withdrawal', 'monthly', 'quarterly'],
      weight: 1.0
    },
    'Proposal': {
      keywords: ['proposal', 'quote', 'estimate', 'bid', 'project', 'scope', 'deliverables', 'timeline', 'budget'],
      weight: 1.0
    }
  };

  let bestMatch = null;
  let bestScore = 0;

  for (const [docType, pattern] of Object.entries(nlpPatterns)) {
    let score = 0;
    
    // Check word frequency
    for (const [word, freq] of sortedWords.slice(0, 20)) { // Top 20 most frequent words
      if (pattern.keywords.includes(word)) {
        score += freq * pattern.weight;
      }
    }
    
    // Check for keyword phrases in content
    for (const keyword of pattern.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = (content.match(regex) || []).length;
      score += matches * pattern.weight;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        type: docType,
        confidence: Math.min(score / 20, 0.8) // Cap at 0.8 for NLP fallback
      };
    }
  }

  return bestMatch;
}


function normalizeDateMatch(m) {
  // Returns YYYY-MM-DD
  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };
  if (m.length === 4 && isNaN(Number(m[1]))) {
    // Month name
    const month = months[m[1].toLowerCase()];
    const day = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Other numeric forms
  // Try to infer whether it's MM/DD/YYYY or DD-MM-YY by separators
  const a = Number(m[1]);
  const b = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  // Heuristic: if first <=12, treat as month-first
  let month = a, day = b;
  if (a > 12 && b <= 12) { month = b; day = a; }
  return `${y.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mapTypeToFolder(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('resume') || t.includes('cv')) return 'Resumes';
  if (t.includes('invoice') || t.includes('bill')) return 'Invoices';
  if (t.includes('receipt')) return 'Receipts';
  if (t.includes('statement')) return 'Statements';
  if (t.includes('contract') || t.includes('agreement')) return 'Contracts';
  if (t.includes('proposal') || t.includes('quote') || t.includes('estimate')) return 'Proposals';
  if (t.includes('report')) return 'Reports';
  if (t.includes('application')) return 'Applications';
  if (t.includes('memo')) return 'Memos';
  if (t.includes('letter')) return 'Letters';
  return 'Unsorted';
}


function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
}

// Settings and diagnostics IPC handlers
ipcMain.handle('get-ai-status', async () => {
  try {
    if (enhancedParsingService) {
      const stats = enhancedParsingService.getStats();
      return {
        enabled: enhancedParsingService.useAI,
        threshold: enhancedParsingService.aiConfidenceThreshold,
        batchSize: enhancedParsingService.aiBatchSize,
        stats: stats
      };
    }
    return { enabled: false, threshold: 0.5, batchSize: 5, stats: null };
  } catch (error) {
    console.error('Error getting AI status:', error);
    return { enabled: false, threshold: 0.5, batchSize: 5, stats: null };
  }
});

// Extraction configuration IPC handlers
ipcMain.handle('get-extraction-config', async () => {
  try {
    if (enhancedParsingService) {
      return enhancedParsingService.getExtractionConfig();
    }
    return { useOCR: false, useTableExtraction: false, useLLMEnhancer: true };
  } catch (error) {
    console.error('Error getting extraction config:', error);
    return { useOCR: false, useTableExtraction: false, useLLMEnhancer: true };
  }
});

ipcMain.handle('update-extraction-config', async (event, config) => {
  try {
    if (enhancedParsingService) {
      enhancedParsingService.updateExtractionConfig(config);
      await enhancedParsingService.saveConfig();
      console.log('Extraction configuration updated:', config);
      return { success: true };
    }
    return { success: false, error: 'Enhanced parsing service not available' };
  } catch (error) {
    console.error('Error updating extraction config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-stats', async () => {
  try {
    if (enhancedParsingService) {
      return enhancedParsingService.getStats();
    }
    return {
      totalProcessed: 0,
      regexProcessed: 0,
      aiProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      averageConfidence: 0
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return null;
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    // Update enhanced parsing service configuration
    if (enhancedParsingService) {
      enhancedParsingService.useAI = settings.useAI;
      enhancedParsingService.aiConfidenceThreshold = settings.confidenceThreshold;
      enhancedParsingService.aiBatchSize = settings.batchSize || 5;
    }
    
    // Save settings to config file
    const configPath = path.join(__dirname, '../../config/default.json');
    const config = {
      ai: {
        enabled: settings.useAI,
        confidenceThreshold: settings.confidenceThreshold,
        model: settings.model || 'gpt-3.5-turbo',
        batchSize: settings.batchSize || 5
      }
    };
    
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('Settings saved successfully');
    return { success: true };
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
});

ipcMain.handle('toggle-ai', async (event, enabled) => {
  try {
    if (enhancedParsingService) {
      enhancedParsingService.useAI = enabled;
      console.log(`AI processing ${enabled ? 'enabled' : 'disabled'}`);
    }
    return { success: true, enabled };
  } catch (error) {
    console.error('Error toggling AI:', error);
    throw error;
  }
});

ipcMain.handle('get-diagnostics', async () => {
  try {
    if (enhancedParsingService && enhancedParsingService.telemetry) {
      // Use telemetry service for comprehensive diagnostics
      return enhancedParsingService.getTelemetryDiagnostics();
    }
    
    // Fallback to basic diagnostics if telemetry is not available
    const diagnostics = {
      ai: {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        cachedCalls: 0,
        averageLatency: 0,
        successRate: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        evictions: 0
      },
      processing: {
        totalFiles: 0,
        regexProcessed: 0,
        aiProcessed: 0,
        averageConfidence: 0,
        averageProcessingTime: 0
      },
      performance: {
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuUsage: process.cpuUsage()
      },
      session: {
        duration: Math.round((Date.now() - process.uptime() * 1000) / 1000),
        lastActivity: new Date().toISOString()
      },
      errors: {
        recent: []
      }
    };
    
    if (enhancedParsingService) {
      const stats = enhancedParsingService.getStats();
      diagnostics.processing = {
        totalFiles: stats.totalProcessed,
        regexProcessed: stats.regexProcessed,
        aiProcessed: stats.aiProcessed,
        averageConfidence: stats.averageConfidence,
        averageProcessingTime: 0 // This would need to be tracked
      };
      
      if (enhancedParsingService.aiCache) {
        const cacheStats = enhancedParsingService.aiCache.getStats();
        diagnostics.cache = {
          hits: cacheStats.hits || 0,
          misses: cacheStats.misses || 0,
          hitRate: cacheStats.hitRate || 0,
          size: cacheStats.size || 0,
          evictions: cacheStats.evictions || 0
        };
      }
    }
    
    return diagnostics;
  } catch (error) {
    console.error('Error getting diagnostics:', error);
    throw error;
  }
});

ipcMain.handle('clear-telemetry', async () => {
  try {
    if (enhancedParsingService) {
      enhancedParsingService.resetStats();
      if (enhancedParsingService.aiCache) {
        await enhancedParsingService.aiCache.clear();
      }
      if (enhancedParsingService.telemetry) {
        await enhancedParsingService.telemetry.clearData();
      }
    }
    console.log('Telemetry data cleared');
    return { success: true };
  } catch (error) {
    console.error('Error clearing telemetry:', error);
    throw error;
  }
});

ipcMain.handle('export-telemetry', async () => {
  try {
    if (enhancedParsingService && enhancedParsingService.telemetry) {
      return enhancedParsingService.telemetry.exportData();
    }
    
    // Fallback to diagnostics if telemetry service not available
    const diagnostics = await ipcMain.invoke('get-diagnostics');
    return diagnostics;
  } catch (error) {
    console.error('Error exporting telemetry:', error);
    throw error;
  }
});

// Handle app security
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault();
  });
});
