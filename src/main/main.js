// Load environment variables
require('dotenv').config();

// Import required modules
const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu, dialog } = electron;
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

// Import AI services
const aiService = require('../services/aiService');
const QualityLogger = require('../services/qualityLogger');
const FilenameGenerator = require('../services/filenameGenerator');

// Enable full logging for debugging
process.env.ELECTRON_ENABLE_LOGGING = '1';
process.env.DEBUG = '*';

// Backend proxy configuration
process.env.BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
process.env.CLIENT_TOKEN = process.env.CLIENT_TOKEN || '785e4defad269cdc65f10c9ee9d418a2bc1bc97cfbbdb01b76d3ded5d2cca6b8';

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

// Analysis cache for performance
const analysisCache = new Map();

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

// Reusable analysis function that extracts steps 1-2 from processFile()
async function analyzeFileOnly(filePath) {
  await errorLogger.logInfo(`Starting analysis-only processing: ${path.basename(filePath)}`);
  
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

    // 3) Log AI suggestion for quality tracking
    try {
      const documentId = await QualityLogger.hashFile(filePath);
      const fileStats = await fsp.stat(filePath);
      
      await QualityLogger.logSuggestion({
        documentId: documentId,
        filePath: filePath,
        fileName: path.basename(filePath),
        fileSize: fileStats.size,
        fileType: path.extname(filePath).toLowerCase(),
        aiSuggestedName: analysis.clientName ? `${analysis.type}_${analysis.clientName}_${analysis.date || 'Unknown'}` : 'Unknown',
        analysisResult: {
          type: analysis.type,
          clientName: analysis.clientName,
          date: analysis.date,
          confidence: analysis.confidence,
          source: analysis.source || 'unknown',
          aiConfidence: analysis.aiConfidence || 0
        },
        modelVersion: process.env.AI_MODEL || 'gpt-3.5-turbo',
        promptVersion: '1.0', // TODO: Track prompt versions
        processingTimeMs: Date.now() - Date.now(), // TODO: Track actual processing time
        documentPreview: extractedText.substring(0, 200)
      });
      
      await errorLogger.logInfo(`Quality log entry created for: ${path.basename(filePath)}`);
    } catch (qualityLogError) {
      await errorLogger.logWarning('Failed to log quality data', qualityLogError);
      // Don't fail the main process for logging errors
    }

    await errorLogger.logInfo(`Analysis-only processing completed: ${path.basename(filePath)}`);
    return analysis;
    
  } catch (error) {
    await errorLogger.logError(`Analysis-only processing failed for ${path.basename(filePath)}`, error);
    throw error;
  }
}

// Helper function to generate file hash for caching
async function getFileHash(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const data = `${filePath}:${stats.mtime.getTime()}:${stats.size}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch (error) {
    // Fallback to path-based hash if stats fail
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }
}

// Helper function to generate alternative filename suggestions
function generateAlternativeSuggestions(primarySuggestion, analysis, fileExtension) {
  if (!primarySuggestion) return [];
  
  const alternatives = [];
  const baseName = primarySuggestion.replace(fileExtension, '');
  
  try {
    // Format variation: replace underscores with hyphens
    const hyphenVersion = baseName.replace(/_/g, '-') + fileExtension;
    if (hyphenVersion !== primarySuggestion) {
      alternatives.push(hyphenVersion);
    }
    
    // Abbreviation version: shorten document type
    const abbrevVersion = baseName
      .replace(/Invoice/g, 'Inv')
      .replace(/Contract/g, 'Cont')
      .replace(/Statement/g, 'Stmt')
      .replace(/Receipt/g, 'Rcpt')
      .replace(/Report/g, 'Rpt') + fileExtension;
    if (abbrevVersion !== primarySuggestion && abbrevVersion !== hyphenVersion) {
      alternatives.push(abbrevVersion);
    }
    
    // Compact version: shorter format
    if (analysis.date) {
      const compactDate = analysis.date.replace(/-/g, '').substring(2); // YYMMDD
      const compactVersion = `${analysis.type.substring(0, 3)}_${analysis.clientName?.substring(0, 8) || 'Unknown'}_${compactDate}${fileExtension}`;
      if (compactVersion !== primarySuggestion && alternatives.length < 3) {
        alternatives.push(compactVersion);
      }
    }
    
    // Limit to 3 alternatives
    return alternatives.slice(0, 3);
  } catch (error) {
    console.warn('Error generating alternative suggestions:', error);
    return [];
  }
}

// Helper function to generate fallback filename
function generateFallbackFilename(analysis, fileExtension) {
  try {
    const type = analysis.type || 'Document';
    const client = analysis.clientName || 'Unknown';
    const date = analysis.date || 'UnknownDate';
    return `${type}_${client}_${date}${fileExtension}`;
  } catch (error) {
    console.warn('Error generating fallback filename:', error);
    return `Document_Unknown_UnknownDate${fileExtension}`;
  }
}

// Helper function to create document preview
function getDocumentPreview(text) {
  if (!text) return '';
  
  try {
    // Clean the text: remove excessive whitespace, line breaks, control characters
    const cleaned = text
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();
    
    // Return first 200 characters
    return cleaned.substring(0, 200);
  } catch (error) {
    console.warn('Error creating document preview:', error);
    return text.substring(0, 200);
  }
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
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const clientToken = process.env.CLIENT_TOKEN;
        
        // Check if backend is configured
        const backendConfigured = !!(backendUrl && clientToken);
        
        return {
          enabled: process.env.USE_AI === 'true' || backendConfigured,
          backendConfigured: backendConfigured,
          model: process.env.AI_MODEL || 'gpt-3.5-turbo',
          confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5
        };
      } catch (error) {
        await errorLogger.logError('Error getting AI status', error);
        return { enabled: false, backendConfigured: false, model: 'gpt-3.5-turbo', confidenceThreshold: 0.5 };
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
      const startTime = Date.now();
      const timeout = 30000; // 30 second timeout
      
      try {
        await errorLogger.logInfo(`AI suggest rename requested for: ${path.basename(filePath)}`);
        
        // Check if backend is available
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const clientToken = process.env.CLIENT_TOKEN;
        
        if (!clientToken) {
          return { 
            success: false, 
            error: 'Backend not configured. Please check your settings.',
            errorType: 'configuration'
          };
        }
        
        // Extract text from file first
        let text = '';
        try {
          text = await extractText(filePath);
        } catch (extractError) {
          await errorLogger.logError('Failed to extract text for AI analysis', extractError);
          return { 
            success: false, 
            error: 'Failed to extract text from file. The file may be corrupted or in an unsupported format.',
            errorType: 'extraction',
            canRetry: true
          };
        }
        
        if (!text || text.trim().length === 0) {
          return { 
            success: false, 
            error: 'No text content found in file. Please try with a different document.',
            errorType: 'content',
            canRetry: false
          };
        }
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Request timeout - please try again'));
          }, timeout);
        });
        
        // Call backend AI service with timeout
        const fetchPromise = fetch(`${backendUrl}/api/process-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Token': clientToken
          },
          body: JSON.stringify({
            text: text,
            instructions: 'Analyze this document and suggest a descriptive filename. Return only the suggested filename without any explanation or additional text.'
          })
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
          let errorMessage = 'Backend AI service error';
          let errorType = 'api';
          let canRetry = true;
          
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            
            // Handle specific HTTP status codes
            if (response.status === 401) {
              errorMessage = 'Invalid API key. Please check your settings.';
              errorType = 'authentication';
              canRetry = false;
            } else if (response.status === 429) {
              errorMessage = 'Rate limit exceeded. Please try again in a moment.';
              errorType = 'rate_limit';
              canRetry = true;
            } else if (response.status >= 500) {
              errorMessage = 'Server error. Please try again later.';
              errorType = 'server';
              canRetry = true;
            }
          } catch (parseError) {
            errorMessage = `Backend service error (${response.status})`;
          }
          
          await errorLogger.logError('Backend AI service failed', new Error(errorMessage));
          return { 
            success: false, 
            error: errorMessage,
            errorType: errorType,
            canRetry: canRetry
          };
        }
        
        const data = await response.json();
        const suggestedName = data.choices?.[0]?.message?.content?.trim();
        
        if (!suggestedName) {
          return { 
            success: false, 
            error: 'No suggestion received from AI service. Please try again.',
            errorType: 'api',
            canRetry: true
          };
        }
        
        // Clean up the suggested name and create multiple variations
        const cleanName = suggestedName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
        const ext = path.extname(filePath);
        const baseName = cleanName.endsWith(ext) ? cleanName.replace(ext, '') : cleanName;
        
        // Generate 3 variations of the suggested name
        const suggestions = [
          baseName + ext,
          baseName + '_v1' + ext,
          baseName + '_' + new Date().toISOString().split('T')[0] + ext
        ];
        
        const processingTime = Date.now() - startTime;
        await errorLogger.logInfo(`AI suggest rename completed: ${suggestions[0]} (${processingTime}ms)`);
        return { 
          success: true, 
          suggestions: suggestions,
          processingTime: processingTime
        };
      } catch (error) {
        const processingTime = Date.now() - startTime;
        await errorLogger.logError('Error in AI suggest rename', error);
        
        // Handle specific error types
        let errorMessage = error.message;
        let errorType = 'unknown';
        let canRetry = true;
        
        if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = 'Request timed out. Please check your internet connection and try again.';
          errorType = 'timeout';
          canRetry = true;
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          errorMessage = 'Network error. Please check your internet connection.';
          errorType = 'network';
          canRetry = true;
        } else if (error.message.includes('fetch')) {
          errorMessage = 'Failed to connect to AI service. Please check your internet connection.';
          errorType = 'network';
          canRetry = true;
        }
        
        return { 
          success: false, 
          error: errorMessage,
          errorType: errorType,
          canRetry: canRetry,
          processingTime: processingTime
        };
      }
    });

    ipcMain.handle('test-backend-connection', async () => {
      try {
        await errorLogger.logInfo('Testing backend connection...');
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const clientToken = process.env.CLIENT_TOKEN;
        
        if (!clientToken) {
          return { success: false, error: 'Client token not configured' };
        }
        
        // Test backend health endpoint
        const response = await fetch(`${backendUrl}/health`, {
          method: 'GET',
          headers: {
            'X-Client-Token': clientToken
          },
          timeout: 5000
        });
        
        if (response.ok) {
          await errorLogger.logInfo('Backend connection test successful');
          return { success: true };
        } else {
          await errorLogger.logWarning(`Backend connection test failed: ${response.status}`);
          return { success: false, error: `Backend returned status ${response.status}` };
        }
      } catch (error) {
        await errorLogger.logError('Backend connection test failed', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('file:rename', async (event, oldPath, newName, options = {}) => {
      const startTime = Date.now();
      
      try {
        // Import required services
        const FileOpsLogger = require('../services/fileOpsLogger');
        const FileOpsHelpers = require('../services/fileOpsHelpers');
        
        const fileOpsLogger = new FileOpsLogger({ errorLogger: errorLogger });
        
        // Extract options with defaults
        const {
          source = 'manual',
          metadata = {},
          confidence = null,
          moveToDir = null,
          documentType = null,
          documentHash = null
        } = options;
        
        await errorLogger.logInfo(`Renaming file: ${path.basename(oldPath)} -> ${newName} (source: ${source})`);
        
        // Validate inputs
        if (!oldPath || !newName) {
          throw new Error('Invalid file path or new name provided');
        }
        
        // Ensure the old file exists
        if (!fs.existsSync(oldPath)) {
          throw new Error('Source file does not exist');
        }
        
        // Validate filename
        const validation = FileOpsHelpers.validateFilename(newName);
        if (!validation.valid) {
          throw new Error(`Invalid filename: ${validation.error}`);
        }
        
        const sanitizedName = validation.sanitized;
        
        // Determine target directory
        let targetDir;
        if (moveToDir) {
          // Use specified directory
          targetDir = moveToDir;
        } else if (documentType && source === 'ai') {
          // Auto-sort by document type for AI suggestions
          const baseDir = path.join(path.dirname(oldPath), '..', 'sorted');
          targetDir = FileOpsHelpers.getSortingDirectory(baseDir, documentType);
        } else {
          // Use same directory as original file
          targetDir = path.dirname(oldPath);
        }
        
        // Ensure target directory exists
        await FileOpsHelpers.ensureDirectoryExists(targetDir);
        
        // Get unique filename to avoid conflicts
        const uniqueName = await FileOpsHelpers.getUniqueFilename(targetDir, sanitizedName);
        const newPath = path.join(targetDir, uniqueName);
        
        // Check file permissions
        const hasPermissions = await FileOpsHelpers.checkFilePermissions(oldPath, 'r');
        if (!hasPermissions) {
          throw new Error('No read permission for source file');
        }
        
        // Get file metadata for logging
        const fileMetadata = await FileOpsHelpers.getFileMetadata(oldPath);
        
        // Rename/move the file
        await fsp.rename(oldPath, newPath);
        
        const duration = Date.now() - startTime;
        
        // Log successful operation
        await fileOpsLogger.logFileOperation({
          oldPath: oldPath,
          newPath: newPath,
          status: 'success',
          source: source,
          confidence: confidence,
          documentHash: documentHash,
          documentType: documentType,
          durationMs: duration,
          metadata: {
            ...metadata,
            fileSize: fileMetadata.sizeFormatted,
            operation: 'rename'
          }
        });
        
        await errorLogger.logInfo(`File renamed successfully: ${path.basename(oldPath)} -> ${path.basename(newPath)} (${duration}ms)`);
        
        return { 
          success: true, 
          newPath: newPath,
          originalName: path.basename(oldPath),
          newName: path.basename(newPath),
          targetDir: targetDir,
          durationMs: duration,
          sanitized: validation.changes
        };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Log failed operation
        try {
          const FileOpsLogger = require('../services/fileOpsLogger');
          const fileOpsLogger = new FileOpsLogger({ errorLogger: errorLogger });
          
          await fileOpsLogger.logFileOperation({
            oldPath: oldPath,
            newPath: null,
            status: 'failed',
            source: options.source || 'manual',
            confidence: options.confidence,
            documentHash: options.documentHash,
            documentType: options.documentType,
            durationMs: duration,
            error: error.message,
            metadata: options.metadata || {}
          });
        } catch (logError) {
          console.warn('Failed to log file operation error:', logError.message);
        }
        
        await errorLogger.logError('Error renaming file', error);
        return { 
          success: false, 
          error: error.message,
          durationMs: duration
        };
      }
    });

    // Batch file operations handler
    ipcMain.handle('file:batch-rename', async (event, operations) => {
      const startTime = Date.now();
      
      try {
        // Import required services
        const FileOpsLogger = require('../services/fileOpsLogger');
        const fileOpsLogger = new FileOpsLogger({ errorLogger: errorLogger });
        
        if (!Array.isArray(operations) || operations.length === 0) {
          throw new Error('Invalid operations array provided');
        }
        
        await errorLogger.logInfo(`Starting batch file operations: ${operations.length} files`);
        
        const results = [];
        const logEntries = [];
        
        // Process operations sequentially
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          const operationStart = Date.now();
          
          try {
            // Validate operation parameters
            const FileOpsHelpers = require('../services/fileOpsHelpers');
            const validation = FileOpsHelpers.validateOperationParams(operation);
            
            if (!validation.valid) {
              throw new Error(validation.error);
            }
            
            // Process single file operation
            const result = await new Promise((resolve) => {
              // Simulate the file:rename handler logic
              const { oldPath, newName, ...options } = operation;
              
              // Call the enhanced file:rename handler
              ipcMain.emit('file:rename', null, oldPath, newName, options)
                .then(resolve)
                .catch(resolve);
            });
            
            const operationDuration = Date.now() - operationStart;
            
            // Prepare log entry
            const logEntry = {
              oldPath: operation.oldPath,
              newPath: result.success ? result.newPath : null,
              status: result.success ? 'success' : 'failed',
              source: operation.source || 'batch',
              confidence: operation.confidence,
              documentHash: operation.documentHash,
              documentType: operation.documentType,
              durationMs: operationDuration,
              error: result.error || null,
              metadata: operation.metadata || {}
            };
            
            logEntries.push(logEntry);
            results.push({
              ...result,
              originalName: path.basename(operation.oldPath),
              durationMs: operationDuration
            });
            
            // Emit progress event
            event.sender.send('file:batch-progress', {
              current: i + 1,
              total: operations.length,
              completed: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              currentFile: path.basename(operation.oldPath)
            });
            
          } catch (error) {
            const operationDuration = Date.now() - operationStart;
            
            const logEntry = {
              oldPath: operation.oldPath,
              newPath: null,
              status: 'failed',
              source: operation.source || 'batch',
              confidence: operation.confidence,
              documentHash: operation.documentHash,
              documentType: operation.documentType,
              durationMs: operationDuration,
              error: error.message,
              metadata: operation.metadata || {}
            };
            
            logEntries.push(logEntry);
            results.push({
              success: false,
              error: error.message,
              originalName: path.basename(operation.oldPath),
              durationMs: operationDuration
            });
          }
        }
        
        // Log all operations
        await fileOpsLogger.logBatchFileOperations(logEntries);
        
        const totalDuration = Date.now() - startTime;
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        await errorLogger.logInfo(`Batch operations completed: ${successful} successful, ${failed} failed (${totalDuration}ms)`);
        
        return {
          success: true,
          results: results,
          summary: {
            total: operations.length,
            successful: successful,
            failed: failed,
            durationMs: totalDuration
          }
        };
        
      } catch (error) {
        const totalDuration = Date.now() - startTime;
        
        await errorLogger.logError('Batch file operations failed', error);
        return {
          success: false,
          error: error.message,
          durationMs: totalDuration
        };
      }
    });

    // Enhanced IPC handler for 'analyze-file' - provides enriched analysis data for UI
    ipcMain.handle('analyze-file', async (event, filePath) => {
      const startTime = Date.now();
      
      try {
        await errorLogger.logInfo(`Analyze file requested: ${path.basename(filePath)}`);
        
        // Validate input
        if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
          throw new Error('Invalid file path provided');
        }
        
        // Ensure the file exists
        if (!fs.existsSync(filePath)) {
          throw new Error('File does not exist');
        }
        
        // Check cache first
        const fileHash = await getFileHash(filePath);
        const cached = analysisCache.get(fileHash);
        if (cached) {
          await errorLogger.logInfo(`Serving cached analysis for: ${path.basename(filePath)}`);
          return cached;
        }
        
        // Get file statistics
        const fileStats = await fsp.stat(filePath);
        const fileExtension = path.extname(filePath).toLowerCase();
        
        // Perform analysis-only processing (no file operations)
        const analysis = await analyzeFileOnly(filePath);
        
        // Generate AI suggestions using FilenameGenerator
        let aiSuggestions = { primary: null, alternatives: [] };
        try {
          const filenameGenerator = new FilenameGenerator();
          const primarySuggestion = await filenameGenerator.generateFilenameFromMetadata(analysis, fileExtension);
          aiSuggestions.primary = primarySuggestion;
          aiSuggestions.alternatives = generateAlternativeSuggestions(primarySuggestion, analysis, fileExtension);
        } catch (aiError) {
          await errorLogger.logWarning('AI filename generation failed, using fallback', aiError);
          aiSuggestions.primary = generateFallbackFilename(analysis, fileExtension);
          aiSuggestions.alternatives = [];
        }
        
        // Create document preview (first 200 chars of cleaned text)
        const previewText = getDocumentPreview(analysis.rawText || analysis.textCleaned || '');
        
        // Build enriched response
        const enrichedData = {
          // File information
          filePath: filePath,
          fileName: path.basename(filePath),
          fileType: fileExtension,
          fileSizeBytes: fileStats.size,
          createdAt: fileStats.birthtime,
          modifiedAt: fileStats.mtime,
          
          // Document analysis
          documentType: analysis.type,
          typeConfidence: analysis.confidence,
          detectedEntities: {
            clientName: analysis.clientName,
            date: analysis.date,
            amount: analysis.amount,
            referenceId: analysis.title,
            title: analysis.title
          },
          
          // AI suggestions
          aiSuggestions: aiSuggestions,
          
          // UI data
          previewText: previewText,
          processingMethod: analysis.source || 'enhanced-parsing',
          analysisTimestamp: new Date().toISOString(),
          
          // Additional metadata
          rawAnalysis: analysis,
          processingTimeMs: Date.now() - startTime
        };
        
        const response = { 
          success: true, 
          partial: false,
          data: enrichedData,
          message: `Analysis completed: ${analysis.type} (${Math.round(analysis.confidence * 100)}% confidence)`
        };
        
        // Cache the response
        analysisCache.set(fileHash, response);
        
        await errorLogger.logInfo(`File analysis completed: ${path.basename(filePath)} - Type: ${analysis.type}, Confidence: ${analysis.confidence}`);
        return response;
        
      } catch (error) {
        await errorLogger.logError(`Error analyzing file: ${path.basename(filePath)}`, error);
        
        // Return partial data if possible
        try {
          const fileStats = await fsp.stat(filePath);
          const fileExtension = path.extname(filePath).toLowerCase();
          
          return { 
            success: false, 
            partial: true,
            error: error.message,
            data: {
              filePath: filePath,
              fileName: path.basename(filePath),
              fileType: fileExtension,
              fileSizeBytes: fileStats.size,
              createdAt: fileStats.birthtime,
              modifiedAt: fileStats.mtime,
              documentType: 'Unknown',
              typeConfidence: 0,
              detectedEntities: {},
              aiSuggestions: { primary: null, alternatives: [] },
              previewText: '',
              processingMethod: 'error',
              analysisTimestamp: new Date().toISOString(),
              processingTimeMs: Date.now() - startTime
            },
            message: `Analysis failed: ${error.message}`
          };
        } catch (fallbackError) {
          return { 
            success: false, 
            partial: false,
            error: error.message,
            data: null,
            message: `Analysis failed: ${error.message}`
          };
        }
      }
    });

    // Quality logging IPC handler
    ipcMain.handle('log-suggestion-quality', async (event, data) => {
      try {
        await errorLogger.logInfo(`Quality feedback received for document: ${data.documentId || 'unknown'}`);
        
        // Validate input
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid quality data provided');
        }
        
        // Update the quality log entry with user action data
        await QualityLogger.updateUserAction(data.documentId, {
          userAction: data.userAction,
          finalName: data.finalName,
          timeToDecisionMs: data.timeToDecisionMs,
          qualityRating: data.qualityRating,
          regenerationCount: data.regenerationCount || 0,
          feedbackTimestamp: new Date().toISOString()
        });
        
        return { 
          success: true, 
          message: 'Quality feedback logged successfully' 
        };
      } catch (error) {
        await errorLogger.logError('Error logging quality feedback', error);
        return { 
          success: false, 
          error: error.message,
          message: `Failed to log quality feedback: ${error.message}`
        };
      }
    });

    // File stats IPC handler
    ipcMain.handle('get-file-stats', async (event, filePath) => {
      try {
        await errorLogger.logInfo(`Getting file stats for: ${path.basename(filePath)}`);
        
        if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
          throw new Error('Invalid file path provided');
        }
        
        if (!fs.existsSync(filePath)) {
          throw new Error('File does not exist');
        }
        
        const stats = await fsp.stat(filePath);
        
        return {
          success: true,
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory()
        };
      } catch (error) {
        await errorLogger.logError(`Error getting file stats: ${path.basename(filePath)}`, error);
        return { 
          success: false, 
          error: error.message 
        };
      }
    });

    // Quality logging IPC handler
    ipcMain.handle('log-suggestion-quality', async (event, qualityData) => {
      try {
        // Import QualityLogger
        const QualityLogger = require('../services/qualityLogger');
        const qualityLogger = new QualityLogger({ errorLogger: errorLogger });
        
        // Log the quality data
        const result = await qualityLogger.logQuality(qualityData);
        
        return {
          success: result.success,
          status: result.status,
          timestamp: result.timestamp
        };
        
      } catch (error) {
        // Log error internally but don't throw
        await errorLogger.logError(`Quality logging failed: ${error.message}`, {
          context: qualityData,
          source: 'quality-logging-handler'
        });
        
        return {
          success: false,
          status: 'failed',
          error: error.message
        };
      }
    });

    // Batch quality logging IPC handler
    ipcMain.handle('log-batch-quality', async (event, qualityDataArray) => {
      try {
        // Import QualityLogger
        const QualityLogger = require('../services/qualityLogger');
        const qualityLogger = new QualityLogger({ errorLogger: errorLogger });
        
        // Log the batch quality data
        const result = await qualityLogger.logBatchQuality(qualityDataArray);
        
        return {
          success: result.success,
          status: result.status,
          processed: result.processed,
          successful: result.successful,
          failed: result.failed
        };
        
      } catch (error) {
        // Log error internally but don't throw
        await errorLogger.logError(`Batch quality logging failed: ${error.message}`, {
          context: { batchSize: qualityDataArray?.length },
          source: 'batch-quality-logging-handler'
        });
        
        return {
          success: false,
          status: 'batch_failed',
          error: error.message
        };
      }
    });

    // Get quality statistics IPC handler
    ipcMain.handle('get-quality-stats', async (event) => {
      try {
        // Import QualityLogger
        const QualityLogger = require('../services/qualityLogger');
        const qualityLogger = new QualityLogger({ errorLogger: errorLogger });
        
        // Get quality statistics
        const stats = await qualityLogger.getQualityStats();
        
        return {
          success: true,
          stats: stats
        };
        
      } catch (error) {
        await errorLogger.logError(`Failed to get quality stats: ${error.message}`, {
          source: 'quality-stats-handler'
        });
        
        return {
          success: false,
          error: error.message
        };
      }
    });

    // Regenerate suggestion IPC handler
    ipcMain.handle('regenerate-suggestion', async (event, filePath, previousSuggestion, regenCount = 0) => {
      const startTime = Date.now();
      const fileId = path.basename(filePath);
      
      try {
        await errorLogger.logInfo(`Regenerating suggestion for: ${fileId} (attempt ${regenCount + 1})`);
        
        // Validate input
        if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
          throw new Error('Invalid file path provided');
        }
        
        if (!fs.existsSync(filePath)) {
          throw new Error('File does not exist');
        }
        
        // Enforce 3-attempt limit using frontend regenCount
        if (regenCount >= 3) {
          await errorLogger.logWarning(`Regeneration limit reached for ${fileId} (attempt ${regenCount + 1})`);
          return {
            success: false,
            error: 'Regeneration limit reached',
            limitReached: true,
            message: 'You have reached the maximum of 3 regeneration attempts for this file.'
          };
        }
        
        // Calculate temperature progression: 0.7 + (0.1 × attemptCount) up to max 0.9
        const temperature = Math.min(0.9, 0.7 + (0.1 * regenCount));
        
        // Get file metadata for context
        const fileStats = await fsp.stat(filePath);
        const fileExtension = path.extname(filePath);
        
        // Use FilenameGenerator for regeneration with enhanced context
        const filenameGenerator = new FilenameGenerator({
          temperature: temperature,
          model: 'gpt-4-turbo' // Use more capable model for regeneration
        });
        
        // First, get the document analysis for context
        const enhancedParsingService = new EnhancedParsingService();
        const analysisResult = await enhancedParsingService.analyzeDocumentEnhanced(
          await fsp.readFile(filePath, 'utf8'),
          filePath
        );
        
        if (!analysisResult.success) {
          throw new Error('Failed to analyze document for regeneration');
        }
        
        // Generate new filename with previous suggestion context
        const newFilename = await filenameGenerator.generateFilenameFromMetadata(
          analysisResult.analysis,
          fileExtension,
          {
            previousSuggestion: previousSuggestion,
            regenerationAttempt: regenCount + 1,
            temperature: temperature
          }
        );
        
        if (!newFilename) {
          throw new Error('Failed to generate new filename');
        }
        
        // Generate alternatives using rule-based approach
        const alternatives = generateAlternativeSuggestions(
          newFilename,
          analysisResult.analysis,
          fileExtension
        );
        
        // Log successful regeneration
        const processingTime = Date.now() - startTime;
        await errorLogger.logInfo(`Regeneration successful for ${fileId}: "${previousSuggestion}" → "${newFilename}" (${processingTime}ms)`);
        
        // Log detailed regeneration context for quality analysis
        if (window.electronAPI && window.electronAPI.logSuggestionQuality) {
          try {
            await window.electronAPI.logSuggestionQuality({
              filePath: filePath,
              action: 'regenerated',
              previousSuggestion: previousSuggestion,
              newSuggestion: newFilename,
              regenerationAttempt: regenCount + 1,
              temperature: temperature,
              processingTimeMs: processingTime,
              timestamp: new Date().toISOString(),
              reason: 'User clicked regenerate button',
              status: 'success'
            });
          } catch (logError) {
            console.warn('Failed to log regeneration quality:', logError.message);
          }
        }
        
        return {
          success: true,
          suggestion: newFilename,
          alternatives: alternatives,
          confidence: analysisResult.analysis.confidence || 0.7,
          regenerationAttempt: regenCount + 1,
          temperature: temperature,
          processingTimeMs: processingTime
        };
        
      } catch (error) {
        const processingTime = Date.now() - startTime;
        await errorLogger.logError(`Error regenerating suggestion for ${fileId} (attempt ${regenCount + 1}): ${error.message}`);
        
        // Log failed regeneration attempt
        if (window.electronAPI && window.electronAPI.logSuggestionQuality) {
          try {
            await window.electronAPI.logSuggestionQuality({
              filePath: filePath,
              action: 'regenerated',
              previousSuggestion: previousSuggestion,
              newSuggestion: null,
              regenerationAttempt: regenCount + 1,
              temperature: Math.min(0.9, 0.7 + (0.1 * regenCount)),
              processingTimeMs: processingTime,
              timestamp: new Date().toISOString(),
              reason: 'User clicked regenerate button',
              status: 'failed',
              error: error.message
            });
          } catch (logError) {
            console.warn('Failed to log regeneration failure:', logError.message);
          }
        }
        
        return {
          success: false,
          error: error.message,
          regenerationAttempt: regenCount + 1,
          processingTimeMs: processingTime,
          message: `Regeneration failed: ${error.message}`
        };
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