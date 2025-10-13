// Import required modules
const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu, dialog } = electron;
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');

// Import AI and Settings services
const aiService = require('../services/aiService');
const settingsService = require('../services/settingsService');

// Enable full logging for debugging
process.env.ELECTRON_ENABLE_LOGGING = '1';
process.env.DEBUG = '*';

// Create comprehensive debug log file
const debugLogPath = path.join(os.homedir(), 'Desktop', 'electron-debug.log');
const debugLogStream = fs.createWriteStream(debugLogPath, { flags: 'a' });

function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  debugLogStream.write(logMessage);
}

debugLog('=== ELECTRON APP STARTING WITH FULL DEBUGGING ===');
debugLog(`Process args: ${process.argv.join(' ')}`);
debugLog(`App path: ${app.getAppPath()}`);
debugLog(`Resources path: ${process.resourcesPath}`);
debugLog(`Is packaged: ${app.isPackaged}`);
debugLog(`Node version: ${process.version}`);
debugLog(`Electron version: ${process.versions.electron}`);
debugLog(`Platform: ${process.platform}`);
debugLog(`Arch: ${process.arch}`);

// Add comprehensive error handling at the very top
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

console.log('✅ Electron main file loaded successfully');

// Enhanced error logging system
class ErrorLogger {
  constructor() {
    this.logPath = path.join(os.homedir(), 'Desktop', 'app-error.log');
    this.initialized = false;
  }

  async initialize() {
    try {
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
    let logEntry = `[${timestamp}] [${level}] ${message}`;
    
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
    debugLog('🔧 Creating main window with comprehensive debugging...');
    await errorLogger.logInfo('Creating main window...');

    // Get the correct path for the HTML file
    const htmlPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'src', 'renderer', 'index.html')
      : path.join(__dirname, '../renderer', 'index.html');
    
    debugLog(`📍 Resolved HTML path: ${htmlPath}`);
    
    // Check if the HTML file actually exists
    if (fs.existsSync(htmlPath)) {
      debugLog(`✅ HTML file EXISTS at: ${htmlPath}`);
      const stats = fs.statSync(htmlPath);
      debugLog(`📊 HTML file size: ${stats.size} bytes, modified: ${stats.mtime}`);
    } else {
      debugLog(`❌ HTML file NOT FOUND at: ${htmlPath}`);
      
      // Try to find the file in different locations
      const possiblePaths = [
        path.join(process.resourcesPath, 'app', 'renderer', 'index.html'),
        path.join(process.resourcesPath, 'app', 'src', 'renderer', 'index.html'),
        path.join(process.resourcesPath, 'renderer', 'index.html'),
        path.join(__dirname, '../renderer', 'index.html'),
        getResourcePath('/renderer/index.html'),
        getResourcePath('renderer/index.html'),
        getResourcePath('src/renderer/index.html')
      ];
      
      debugLog('🔍 Searching for HTML file in possible locations:');
      possiblePaths.forEach((testPath, index) => {
        const exists = fs.existsSync(testPath);
        debugLog(`  ${index + 1}. ${testPath} - ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
      });
    }

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      webPreferences: { 
        preload: path.join(__dirname, 'preload.js'), 
        contextIsolation: true, 
        nodeIntegration: false 
      },
      icon: getResourcePath('../../build/icon.png'),
      title: 'Document Sorter v1.0',
      show: false // Don't show until ready
    });

    debugLog('✅ Browser window created successfully');

    // Enable DevTools automatically for debugging
    // mainWindow.webContents.openDevTools()  // open console window
    debugLog('🛠️ DevTools opened automatically for debugging');
    
    // Log all webContents events
    mainWindow.webContents.on('did-start-loading', () => {
      debugLog('🔄 WebContents: did-start-loading');
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      debugLog('✅ WebContents: did-finish-load');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      debugLog(`❌ WebContents: did-fail-load - Code: ${errorCode}, Description: ${errorDescription}, URL: ${validatedURL}`);
    });
    
    mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
      debugLog(`✅ WebContents: did-frame-finish-load - Main frame: ${isMainFrame}`);
    });
    
    mainWindow.webContents.on('dom-ready', () => {
      debugLog('✅ WebContents: dom-ready');
    });
    
    mainWindow.webContents.on('page-title-updated', (event, title) => {
      debugLog(`📄 WebContents: page-title-updated - Title: ${title}`);
    });
    
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      debugLog(`🖥️ Console [${level}]: ${message} (${sourceId}:${line})`);
    });
    
    mainWindow.webContents.on('crashed', (event, killed) => {
      debugLog(`💥 WebContents: crashed - Killed: ${killed}`);
    });
    
    mainWindow.webContents.on('unresponsive', () => {
      debugLog('⚠️ WebContents: unresponsive');
    });
    
    mainWindow.webContents.on('responsive', () => {
      debugLog('✅ WebContents: responsive');
    });

    // Load the HTML file using loadFile (not loadURL)
    debugLog(`📂 Loading HTML file: ${htmlPath}`);
    
    try {
      if (app.isPackaged) {
        // For packaged apps, use loadURL with file:// protocol to load from asar
        const fileUrl = `file://${htmlPath}`;
        debugLog(`📂 Using loadURL with file:// protocol: ${fileUrl}`);
        mainWindow.loadURL(fileUrl);
      } else {
        // For development, use loadFile
        mainWindow.loadFile(htmlPath);
      }
      debugLog('✅ HTML loading method called successfully');
    } catch (error) {
      debugLog(`❌ HTML loading failed: ${error.message}`);
      debugLog(`Error stack: ${error.stack}`);
      throw error;
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      debugLog('✅ Window ready-to-show');
      mainWindow.show();
    });

    await errorLogger.logInfo(`Loading HTML from: ${htmlPath}`);

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
    
    // Register all IPC handlers first, before creating windows
    console.log('📡 Registering IPC handlers...');
    
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
      
      // Additional validation: ensure all items are valid strings
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

      // Process files with enhanced error handling
      await errorLogger.logInfo(`Processing ${validFilePaths.length} valid file(s)...`);
      let successCount = 0;
      let failureCount = 0;
      const errors = [];

      for (const filePath of validFilePaths) {
        if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
          await errorLogger.logError('Skipping invalid file path', new Error(filePath));
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
          await errorLogger.logError(`Failed processing ${path.basename(filePath)}`, error);
          failureCount++;
          errors.push(`${path.basename(filePath)}: ${error.message}`);
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('file:processed', {
              originalPath: filePath,
              error: error.message,
              success: false,
              message: `Failed to process: ${error.message}`
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
        await errorLogger.logError('Processing errors occurred', new Error(errors.join('; ')));
      }
    });

    // AI and Settings IPC Handlers
    ipcMain.handle('get-ai-status', async () => {
      try {
        await errorLogger.logInfo('Getting AI status...');
        return {
          enabled: process.env.USE_AI === 'true' || !!process.env.OPENAI_API_KEY,
          apiKey: !!process.env.OPENAI_API_KEY,
          model: process.env.AI_MODEL || 'gpt-3.5-turbo',
          confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5
        };
      } catch (error) {
        await errorLogger.logError('Error getting AI status', error);
        return { enabled: false, apiKey: false, model: 'gpt-3.5-turbo', confidenceThreshold: 0.5 };
      }
    });

    ipcMain.handle('get-stats', async () => {
      try {
        await errorLogger.logInfo('Getting processing statistics...');
        // Return mock stats for now - these would be tracked in a real implementation
        return {
          totalProcessed: 0,
          regexProcessed: 0,
          aiProcessed: 0,
          cacheHits: 0,
          averageConfidence: 0.0
        };
      } catch (error) {
        await errorLogger.logError('Error getting stats', error);
        return { totalProcessed: 0, regexProcessed: 0, aiProcessed: 0, cacheHits: 0, averageConfidence: 0.0 };
      }
    });

    ipcMain.handle('save-settings', async (event, settings) => {
      try {
        await errorLogger.logInfo('Saving settings...');
        // In a real implementation, this would save to a config file
        if (settings.useAI !== undefined) {
          process.env.USE_AI = settings.useAI ? 'true' : 'false';
        }
        if (settings.confidenceThreshold !== undefined) {
          process.env.AI_CONFIDENCE_THRESHOLD = settings.confidenceThreshold.toString();
        }
        if (settings.model !== undefined) {
          process.env.AI_MODEL = settings.model;
        }
        await errorLogger.logInfo('Settings saved successfully');
        return { success: true };
      } catch (error) {
        await errorLogger.logError('Error saving settings', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('toggle-ai', async (event, enabled) => {
      try {
        await errorLogger.logInfo(`Toggling AI: ${enabled}`);
        process.env.USE_AI = enabled ? 'true' : 'false';
        return { success: true, enabled };
      } catch (error) {
        await errorLogger.logError('Error toggling AI', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-diagnostics', async () => {
      try {
        await errorLogger.logInfo('Getting diagnostics...');
        // Return mock diagnostics for now
        return {
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
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
          },
          session: {
            duration: 0,
            lastActivity: new Date().toISOString()
          },
          errors: {
            recent: []
          }
        };
      } catch (error) {
        await errorLogger.logError('Error getting diagnostics', error);
        return { error: error.message };
      }
    });

    ipcMain.handle('clear-telemetry', async () => {
      try {
        await errorLogger.logInfo('Clearing telemetry data...');
        // In a real implementation, this would clear stored telemetry data
        await errorLogger.logInfo('Telemetry data cleared');
        return { success: true };
      } catch (error) {
        await errorLogger.logError('Error clearing telemetry', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('export-telemetry', async () => {
      try {
        await errorLogger.logInfo('Exporting telemetry data...');
        // In a real implementation, this would export stored telemetry data
        const mockData = {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          platform: process.platform,
          data: {}
        };
        await errorLogger.logInfo('Telemetry data exported');
        return mockData;
      } catch (error) {
        await errorLogger.logError('Error exporting telemetry', error);
        return { error: error.message };
      }
    });

    ipcMain.handle('get-extraction-config', async () => {
      try {
        await errorLogger.logInfo('Getting extraction configuration...');
        return {
          useOCR: process.env.USE_OCR !== 'false',
          useTableExtraction: process.env.USE_TABLE_EXTRACTION !== 'false',
          useLLMEnhancer: process.env.USE_LLM_ENHANCER !== 'false'
        };
      } catch (error) {
        await errorLogger.logError('Error getting extraction config', error);
        return { useOCR: true, useTableExtraction: true, useLLMEnhancer: true };
      }
    });

    ipcMain.handle('update-extraction-config', async (event, config) => {
      try {
        await errorLogger.logInfo('Updating extraction configuration...');
        if (config.useOCR !== undefined) {
          process.env.USE_OCR = config.useOCR ? 'true' : 'false';
        }
        if (config.useTableExtraction !== undefined) {
          process.env.USE_TABLE_EXTRACTION = config.useTableExtraction ? 'true' : 'false';
        }
        if (config.useLLMEnhancer !== undefined) {
          process.env.USE_LLM_ENHANCER = config.useLLMEnhancer ? 'true' : 'false';
        }
        await errorLogger.logInfo('Extraction configuration updated');
        return { success: true };
      } catch (error) {
        await errorLogger.logError('Error updating extraction config', error);
        return { success: false, error: error.message };
      }
    });

    // AI and Settings IPC Handlers
    ipcMain.handle('ai:suggest-rename', async (event, filePath) => {
      try {
        await errorLogger.logInfo(`AI suggest rename requested for: ${path.basename(filePath)}`);
        const apiKey = settingsService.getApiKey();
        if (!apiKey) {
          await errorLogger.logWarning('No API key configured for AI suggestions');
          return { success: false, error: 'Please configure your OpenAI API key in Settings' };
        }
        const result = await aiService.suggestRename(filePath, apiKey);
        await errorLogger.logInfo(`AI suggest rename completed: ${result.success ? 'success' : 'failed'}`);
        return result;
      } catch (error) {
        await errorLogger.logError('Error in AI suggest rename', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('settings:save-api-key', async (event, apiKey) => {
      try {
        await errorLogger.logInfo('Saving API key...');
        settingsService.saveApiKey(apiKey);
        await errorLogger.logInfo('API key saved successfully');
        return { success: true };
      } catch (error) {
        await errorLogger.logError('Error saving API key', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('settings:get-api-key', async () => {
      try {
        await errorLogger.logInfo('Getting API key...');
        const apiKey = settingsService.getApiKey();
        return apiKey;
      } catch (error) {
        await errorLogger.logError('Error getting API key', error);
        return null;
      }
    });

    ipcMain.handle('settings:has-api-key', async () => {
      try {
        await errorLogger.logInfo('Checking if API key exists...');
        const hasKey = settingsService.hasApiKey();
        return hasKey;
      } catch (error) {
        await errorLogger.logError('Error checking API key', error);
        return false;
      }
    });

    ipcMain.handle('settings:test-api-key', async (event, apiKey) => {
      try {
        await errorLogger.logInfo('Testing API key...');
        const result = await aiService.testApiKey(apiKey);
        await errorLogger.logInfo(`API key test completed: ${result.success ? 'success' : 'failed'}`);
        return result;
      } catch (error) {
        await errorLogger.logError('Error testing API key', error);
        return { success: false, error: error.message };
      }
    });

    console.log('✅ All IPC handlers registered successfully');
    
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