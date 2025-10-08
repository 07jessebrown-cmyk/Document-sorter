const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu, dialog } = electron;
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');

// Enhanced error logging system
class ErrorLogger {
  constructor() {
    this.logPath = path.join(os.homedir(), 'Desktop', 'app-error.log');
    this.initialized = false;
  }

  async initialize() {
    try {
      // Create log file with initial entry
      const initialLog = `\n=== Document Sorter Error Log - ${new Date().toISOString()} ===\n`;
      await fsp.appendFile(this.logPath, initialLog);
      this.initialized = true;
      console.log(`📝 Error logging initialized: ${this.logPath}`);
    } catch (error) {
      console.error('Failed to initialize error logging:', error);
    }
  }

  async log(level, message, error = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    
    if (error) {
      logEntry += `\nError: ${error.message}\nStack: ${error.stack}`;
    }
    
    logEntry += '\n';

    try {
      await fsp.appendFile(this.logPath, logEntry);
    } catch (writeError) {
      console.error('Failed to write to error log:', writeError);
    }
  }

  async logError(message, error) {
    await this.log('ERROR', message, error);
  }

  async logInfo(message) {
    await this.log('INFO', message);
  }

  async logWarning(message, error = null) {
    await this.log('WARN', message, error);
  }
}

// Initialize error logger
const errorLogger = new ErrorLogger();

// Enhanced path resolution for packaged apps
function getAppPath() {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return __dirname;
}

function getResourcePath(relativePath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', relativePath);
  }
  return path.join(__dirname, relativePath);
}

function getConfigPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'config');
  }
  return path.join(__dirname, '../../config');
}

// Safe module loading with error handling
async function safeRequire(moduleName, fallback = null) {
  try {
    const module = require(moduleName);
    await errorLogger.logInfo(`Successfully loaded module: ${moduleName}`);
    return module;
  } catch (error) {
    await errorLogger.logWarning(`Failed to load module: ${moduleName}`, error);
    return fallback;
  }
}

// Initialize modules with error handling
let pdfParse = null;
let Tesseract = null;
let sharp = null;
let sharpAvailable = false;
let mammoth = null;
let mime = null;
let EnhancedParsingService = null;

async function initializeModules() {
  await errorLogger.logInfo('Starting module initialization...');

  try {
    // Load core modules
    pdfParse = await safeRequire('pdf-parse');
    Tesseract = await safeRequire('tesseract.js');
    mammoth = await safeRequire('mammoth');
    mime = await safeRequire('mime-types');

    // Load Sharp with fallback
    try {
      sharp = require('sharp');
      sharpAvailable = true;
      await errorLogger.logInfo('Sharp module loaded successfully');
    } catch (error) {
      await errorLogger.logWarning('Sharp module failed to load, using fallback', error);
      sharpAvailable = false;
    }

    // Load enhanced parsing service
    try {
      const servicePath = getResourcePath('../services/enhancedParsingService');
      EnhancedParsingService = require(servicePath);
      await errorLogger.logInfo('Enhanced parsing service loaded successfully');
    } catch (error) {
      await errorLogger.logError('Failed to load enhanced parsing service', error);
      EnhancedParsingService = null;
    }

    await errorLogger.logInfo('Module initialization completed');
  } catch (error) {
    await errorLogger.logError('Critical error during module initialization', error);
    throw error;
  }
}

// Test Sharp functionality if available
async function testSharpFunctionality() {
  if (sharpAvailable && sharp) {
    try {
      await errorLogger.logInfo('Testing Sharp functionality...');
      const testBuffer = Buffer.from('test');
      await sharp(testBuffer).metadata();
      await errorLogger.logInfo('Sharp functionality test passed');
      return true;
    } catch (error) {
      await errorLogger.logWarning('Sharp functionality test failed', error);
      return false;
    }
  }
  return false;
}

// Fallback image processing when Sharp is not available
function createImageProcessingFallback() {
  return {
    async preprocessImage(filePath) {
      await errorLogger.logInfo('Using fallback image processing (no Sharp)');
      return await fsp.readFile(filePath);
    },
    
    async getImageMetadata(filePath) {
      await errorLogger.logInfo('Using fallback metadata extraction (no Sharp)');
      return {
        width: 1000,
        height: 1000,
        format: 'unknown'
      };
    }
  };
}

// Initialize image processing (Sharp or fallback)
let imageProcessor = null;

async function initializeImageProcessor() {
  if (sharpAvailable && sharp) {
    imageProcessor = {
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
    };
  } else {
    imageProcessor = createImageProcessingFallback();
  }
}

// Keep a global reference of the window object
let mainWindow;
let enhancedParsingService;

async function createWindow() {
  try {
    await errorLogger.logInfo('Creating main window...');

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      webPreferences: {
        preload: getResourcePath('preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      },
      icon: getResourcePath('../../build/icon.png'),
      title: 'Document Sorter v1.0'
    });

    await errorLogger.logInfo('Browser window created successfully');

    // Load the HTML file
    const htmlPath = getResourcePath('../renderer/index.html');
    await errorLogger.logInfo(`Loading HTML from: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Test Sharp functionality
    const sharpWorking = await testSharpFunctionality();
    if (sharpWorking) {
      await errorLogger.logInfo('Sharp is fully functional');
    } else {
      await errorLogger.logInfo('Sharp is not functional, using fallback image processing');
    }

    // Initialize enhanced parsing service
    try {
      if (EnhancedParsingService) {
        enhancedParsingService = new EnhancedParsingService({
          useAI: process.env.USE_AI === 'true' || process.env.OPENAI_API_KEY,
          aiConfidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5,
          aiBatchSize: parseInt(process.env.AI_BATCH_SIZE) || 5
        });
        await errorLogger.logInfo('Enhanced parsing service initialized');
      } else {
        await errorLogger.logWarning('Enhanced parsing service not available, using basic parsing');
      }
    } catch (error) {
      await errorLogger.logError('Failed to initialize enhanced parsing service', error);
      enhancedParsingService = null;
    }

    // Create application menu
    createMenu();
    await errorLogger.logInfo('Main window creation completed successfully');

  } catch (error) {
    await errorLogger.logError('Failed to create main window', error);
    throw error;
  }
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

// Enhanced file processing with proper error handling
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mime ? mime.lookup(filePath) : 'unknown';
  
  await errorLogger.logInfo(`Extracting text from: ${path.basename(filePath)} (${ext}, ${mimeType})`);
  
  try {
    // Handle PDF files
    if (ext === '.pdf' && pdfParse) {
      return await extractTextFromPDF(filePath);
    }
    
    // Handle DOCX files
    else if (ext === '.docx' && mammoth) {
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
    await errorLogger.logError(`Text extraction failed for ${path.basename(filePath)}`, error);
    throw error;
  }
}

async function extractTextFromPDF(filePath) {
  await errorLogger.logInfo(`Processing PDF: ${path.basename(filePath)}`);
  
  try {
    if (!pdfParse) {
      throw new Error('PDF parsing module not available');
    }

    const dataBuffer = await fsp.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    if (pdfData && pdfData.text && pdfData.text.trim().length > 50) {
      await errorLogger.logInfo(`PDF text extraction successful: ${pdfData.text.length} characters`);
      return pdfData.text;
    } else {
      await errorLogger.logInfo('PDF appears to be image-based, falling back to OCR');
      return '';
    }
  } catch (error) {
    await errorLogger.logError('PDF text extraction failed', error);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}

async function extractTextFromDOCX(filePath) {
  await errorLogger.logInfo(`Processing DOCX: ${path.basename(filePath)}`);
  
  try {
    if (!mammoth) {
      throw new Error('DOCX parsing module not available');
    }

    const result = await mammoth.extractRawText({ path: filePath });
    
    if (result.text && result.text.trim().length > 0) {
      await errorLogger.logInfo(`DOCX text extraction successful: ${result.text.length} characters`);
      return result.text;
    } else {
      throw new Error('No text content found in DOCX file');
    }
  } catch (error) {
    await errorLogger.logError('DOCX text extraction failed', error);
    throw new Error(`DOCX processing failed: ${error.message}`);
  }
}

async function extractTextFromImage(filePath) {
  await errorLogger.logInfo(`Processing image: ${path.basename(filePath)}`);
  
  try {
    if (!Tesseract) {
      throw new Error('OCR module not available');
    }

    let preprocessedBuffer;
    
    // Use the appropriate image processor (Sharp or fallback)
    try {
      if (imageProcessor) {
        preprocessedBuffer = await imageProcessor.preprocessImage(filePath);
        await errorLogger.logInfo(`Image preprocessing completed: ${preprocessedBuffer.length} bytes`);
      } else {
        preprocessedBuffer = await fsp.readFile(filePath);
      }
    } catch (preprocessError) {
      await errorLogger.logWarning('Image preprocessing failed, using original file', preprocessError);
      preprocessedBuffer = await fsp.readFile(filePath);
    }

    // Perform OCR with Tesseract.js
    const result = await Tesseract.recognize(preprocessedBuffer, 'eng', {
      logger: () => {}
    });
    
    const extractedText = result?.data?.text || '';
    await errorLogger.logInfo(`OCR completed: ${extractedText.length} characters`);
    
    if (extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from image');
    }
    
    return extractedText;
  } catch (error) {
    await errorLogger.logError('Image OCR failed', error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
}

async function extractTextFromPlainText(filePath) {
  await errorLogger.logInfo(`Processing plain text: ${path.basename(filePath)}`);
  
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    await errorLogger.logInfo(`Plain text extraction successful: ${content.length} characters`);
    return content;
  } catch (error) {
    await errorLogger.logError('Plain text extraction failed', error);
    throw new Error(`Plain text processing failed: ${error.message}`);
  }
}

// Basic document analysis (fallback when enhanced service is not available)
function analyzeDocument(text, filePath) {
  const result = { 
    date: undefined, 
    type: 'Unclassified',
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

  // Simple keyword-based classification
  const content = text.toLowerCase();
  
  if (content.includes('invoice') || content.includes('bill')) {
    result.type = 'Invoice';
    result.confidence = 0.7;
  } else if (content.includes('receipt')) {
    result.type = 'Receipt';
    result.confidence = 0.7;
  } else if (content.includes('contract') || content.includes('agreement')) {
    result.type = 'Contract';
    result.confidence = 0.7;
  } else if (content.includes('resume') || content.includes('cv')) {
    result.type = 'Resume';
    result.confidence = 0.7;
  }

  // Simple date detection
  const dateMatch = content.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) {
    result.date = dateMatch[1];
  }

  return result;
}

async function processFile(filePath) {
  await errorLogger.logInfo(`Starting processing: ${path.basename(filePath)}`);
  
  try {
    // 1) Extract text using unified file handling
    let extractedText = '';
    try {
      extractedText = await extractText(filePath);
      await errorLogger.logInfo(`Text extraction completed: ${extractedText.length} characters`);
    } catch (extractionError) {
      await errorLogger.logError(`Text extraction failed for ${path.basename(filePath)}`, extractionError);
      throw new Error(`Text extraction failed: ${extractionError.message}`);
    }

    // 2) Analyze text with enhanced parsing service or fallback
    await errorLogger.logInfo(`Analyzing document: ${path.basename(filePath)}`);
    let analysis;
    
    if (enhancedParsingService) {
      try {
        analysis = await enhancedParsingService.analyzeDocumentEnhanced(extractedText, filePath);
        await errorLogger.logInfo('Enhanced analysis completed');
      } catch (enhancedError) {
        await errorLogger.logWarning('Enhanced parsing failed, falling back to basic analysis', enhancedError);
        analysis = analyzeDocument(extractedText, filePath);
      }
    } else {
      analysis = analyzeDocument(extractedText, filePath);
      await errorLogger.logInfo('Basic analysis completed');
    }

    // 3) Generate filename using proper path resolution
    const ext = path.extname(filePath).toLowerCase();
    const fileName = generateFileName(analysis, ext);
    const folder = mapTypeToFolder(analysis.type);
    
    await errorLogger.logInfo(`Generated filename: ${fileName}`);
    await errorLogger.logInfo(`Target folder: ${folder}`);
    
    // 4) Handle file operations with proper path resolution
    const finalPath = await handleFileOperations(filePath, fileName, folder);
    
    // 5) Send success notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:processed', {
        originalPath: filePath,
        finalPath: finalPath,
        success: true,
        message: `Successfully sorted to ${path.basename(finalPath)}`,
        analysis: analysis
      });
    }
    
    await errorLogger.logInfo(`Successfully processed: ${path.basename(filePath)} -> ${path.basename(finalPath)}`);
    return finalPath;
    
  } catch (error) {
    await errorLogger.logError(`Processing failed for ${path.basename(filePath)}`, error);
    
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

function generateFileName(documentData, extension) {
  const parts = [];
  
  // Client name
  let clientName = 'Client_NA';
  if (documentData.clientName && documentData.clientName.trim()) {
    clientName = documentData.clientName.trim();
  }
  parts.push(sanitizeComponent(clientName));
  
  // Document type
  let documentType = 'Unclassified';
  if (documentData.type && documentData.type.trim()) {
    documentType = documentData.type.trim();
    if (documentData.confidence < 0.5) {
      documentType = `${documentType}_LowConfidence`;
    }
  }
  parts.push(sanitizeComponent(documentType));
  
  // Date
  if (documentData.date) {
    parts.push(documentData.date);
  }
  
  return parts.join('_') + extension;
}

function sanitizeComponent(component) {
  if (!component || typeof component !== 'string') {
    return 'Unknown';
  }
  
  return component
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'Unknown';
}

async function handleFileOperations(originalPath, fileName, folder) {
  try {
    // Use proper path resolution for destination
    const destRoot = path.join(os.homedir(), 'Desktop', 'sorted_files', folder);
    await errorLogger.logInfo(`Destination root: ${destRoot}`);
    
    // Ensure destination directory exists
    try {
      await fsp.mkdir(destRoot, { recursive: true });
      await errorLogger.logInfo(`Created/verified directory: ${destRoot}`);
    } catch (mkdirError) {
      await errorLogger.logError(`Failed to create directory ${destRoot}`, mkdirError);
      throw new Error(`Directory creation failed: ${mkdirError.message}`);
    }
    
    // Construct final path
    let finalPath = path.join(destRoot, fileName);
    
    // Ensure unique filename if file already exists
    finalPath = await ensureUniquePath(finalPath);
    await errorLogger.logInfo(`Final destination: ${finalPath}`);
    
    // Copy file to target location (safer than move for packaged apps)
    try {
      await fsp.copyFile(originalPath, finalPath);
      await errorLogger.logInfo(`File copied successfully: ${path.basename(originalPath)} -> ${path.basename(finalPath)}`);
    } catch (copyError) {
      await errorLogger.logError('Failed to copy file', copyError);
      throw new Error(`File copy failed: ${copyError.message}`);
    }
    
    return finalPath;
    
  } catch (error) {
    await errorLogger.logError(`File operations failed for ${path.basename(originalPath)}`, error);
    throw error;
  }
}

async function ensureUniquePath(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const ext = path.extname(base);
  const name = base.slice(0, base.length - ext.length);
  let candidate = targetPath;
  let i = 1;
  
  while (true) {
    try {
      await fsp.access(candidate, fs.constants.F_OK);
      candidate = path.join(dir, `${name}_${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
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

// IPC Handlers with enhanced error handling
ipcMain.handle('open-file-dialog', async (event) => {
  try {
    await errorLogger.logInfo('Opening file dialog...');
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
      await errorLogger.logInfo('File dialog canceled by user');
      return [];
    }
    
    await errorLogger.logInfo(`File dialog selected ${result.filePaths.length} files`);
    return result.filePaths;
  } catch (error) {
    await errorLogger.logError('Error opening file dialog', error);
    throw error;
  }
});

ipcMain.handle('file:dropped', (event, filePaths) => {
  errorLogger.logInfo(`Files dropped: ${filePaths.length} files`);
  filePaths.forEach((filePath, index) => {
    errorLogger.logInfo(`File ${index + 1}: ${filePath}`);
  });
  return { success: true, message: `Successfully received ${filePaths.length} file(s)` };
});

ipcMain.on('start:sorting', async (event, filePaths) => {
  await errorLogger.logInfo(`Starting sorting process for ${filePaths.length} files`);
  
  // Validate file paths
  if (!Array.isArray(filePaths)) {
    await errorLogger.logError('Invalid filePaths: Expected array', new Error(`Received ${typeof filePaths}`));
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
  
  if (filePaths.length === 0) {
    await errorLogger.logError('No file paths provided for processing');
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
  
  // Filter valid file paths
  const validFilePaths = filePaths.filter(filePath => {
    return typeof filePath === 'string' && filePath.trim().length > 0;
  });
  
  if (validFilePaths.length === 0) {
    await errorLogger.logError('No valid file paths found after filtering');
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
    await errorLogger.logWarning(`Filtered out ${filePaths.length - validFilePaths.length} invalid file paths`);
  }

  await errorLogger.logInfo(`Processing ${validFilePaths.length} valid file(s)...`);
  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  for (const filePath of validFilePaths) {
    if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
      await errorLogger.logError(`Skipping invalid file path: ${filePath}`);
      failureCount++;
      errors.push(`Invalid file path: ${filePath}`);
      continue;
    }
    
    try {
      await errorLogger.logInfo(`Processing: ${path.basename(filePath)}`);
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
      await errorLogger.logError(`Failed processing ${path.basename(filePath)}`, error);
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
  
  await errorLogger.logInfo(`Processing complete: ${successCount} successful, ${failureCount} failed`);
  if (errors.length > 0) {
    await errorLogger.logError('Processing errors', new Error(errors.join('; ')));
  }
});

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
    await errorLogger.logError('Error getting AI status', error);
    return { enabled: false, threshold: 0.5, batchSize: 5, stats: null };
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
    await errorLogger.logError('Error getting stats', error);
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
    
    // Save settings to config file using proper path resolution
    const configPath = path.join(getConfigPath(), 'default.json');
    const config = {
      ai: {
        enabled: settings.useAI,
        confidenceThreshold: settings.confidenceThreshold,
        model: settings.model || 'gpt-3.5-turbo',
        batchSize: settings.batchSize || 5
      }
    };
    
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2));
    await errorLogger.logInfo('Settings saved successfully');
    return { success: true };
  } catch (error) {
    await errorLogger.logError('Error saving settings', error);
    throw error;
  }
});

ipcMain.handle('toggle-ai', async (event, enabled) => {
  try {
    if (enhancedParsingService) {
      enhancedParsingService.useAI = enabled;
      await errorLogger.logInfo(`AI processing ${enabled ? 'enabled' : 'disabled'}`);
    }
    return { success: true, enabled };
  } catch (error) {
    await errorLogger.logError('Error toggling AI', error);
    throw error;
  }
});

ipcMain.handle('get-diagnostics', async () => {
  try {
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
        averageProcessingTime: 0
      };
    }
    
    return diagnostics;
  } catch (error) {
    await errorLogger.logError('Error getting diagnostics', error);
    throw error;
  }
});

// Handle app security
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault();
  });
});

// Enhanced app initialization with comprehensive error handling
async function initializeApp() {
  try {
    await errorLogger.logInfo('=== Document Sorter Starting ===');
    await errorLogger.logInfo(`App is packaged: ${app.isPackaged}`);
    await errorLogger.logInfo(`Node version: ${process.version}`);
    await errorLogger.logInfo(`Platform: ${process.platform}`);
    await errorLogger.logInfo(`Architecture: ${process.arch}`);
    
    // Initialize modules
    await initializeModules();
    
    // Initialize image processor
    await initializeImageProcessor();
    
    await errorLogger.logInfo('App initialization completed successfully');
  } catch (error) {
    await errorLogger.logError('Critical error during app initialization', error);
    throw error;
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    await initializeApp();
    await createWindow();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    await errorLogger.logError('Failed to start application', error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  await errorLogger.logError('Uncaught Exception', error);
  app.quit();
});

process.on('unhandledRejection', async (reason, promise) => {
  await errorLogger.logError('Unhandled Rejection', new Error(`Reason: ${reason}, Promise: ${promise}`));
});
