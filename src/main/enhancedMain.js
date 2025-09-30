const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu, dialog } = electron;
const path = require('path');
const fs = require('fs').promises;

// Import enhanced parsing service
const EnhancedParsingService = require('../services/enhancedParsingService');
const SecureFileProcessor = require('../services/secureFileProcessor');

// Keep a global reference of the window object
let mainWindow;
let enhancedParsingService;
let secureFileProcessor;

/**
 * Enhanced Main Process with AI Integration
 * 
 * This module provides enhanced file processing capabilities with AI fallback:
 * - Uses regex + fuzzy matching first
 * - Falls back to AI when confidence is low
 * - Provides detailed confidence scoring
 * - Supports batch processing with concurrency control
 * - Sends real-time updates to renderer
 */

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    title: 'Document Sorter v1.1 (AI Enhanced)'
  });

  // Load the index.html file from the renderer directory
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize enhanced parsing service
  initializeEnhancedParsingService();
}

/**
 * Initialize the enhanced parsing service
 */
async function initializeEnhancedParsingService() {
  try {
    enhancedParsingService = new EnhancedParsingService({
      useAI: process.env.USE_AI === 'true',
      aiConfidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5,
      aiBatchSize: parseInt(process.env.AI_BATCH_SIZE) || 5
    });

    if (enhancedParsingService.useAI) {
      await enhancedParsingService.initializeAIServices();
      console.log('✅ Enhanced parsing service with AI initialized');
    } else {
      console.log('✅ Enhanced parsing service (regex only) initialized');
    }

    // Initialize secure file processor
    secureFileProcessor = new SecureFileProcessor();
    await secureFileProcessor.initialize();
    console.log('✅ Secure file processor initialized');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
  }
}

/**
 * Secure file processing with copy-based operations
 * @param {string} filePath - Path to the file to process
 * @returns {Promise<Object>} Processing result
 */
async function processFileSecurely(filePath) {
  console.log(`🔒 Starting secure processing: ${path.basename(filePath)}`);
  
  try {
    // Generate a client ID (in a real app, this would come from authentication)
    const clientId = 'default-client'; // TODO: Implement proper client authentication

    // Process file securely using working copies
    const secureResult = await secureFileProcessor.processFileSecurely(
      filePath,
      clientId,
      async (workingPath, options) => {
        // Extract text from working copy
        const extractedText = await enhancedParsingService.extractText(workingPath);
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text extracted from file');
        }

        console.log(`📄 Extracted ${extractedText.length} characters from ${path.basename(workingPath)}`);

        // Analyze document with AI fallback
        const analysis = await enhancedParsingService.analyzeDocumentEnhanced(
          extractedText, 
          workingPath,
          {
            forceAI: process.env.FORCE_AI === 'true',
            model: process.env.AI_MODEL || 'gpt-3.5-turbo',
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.1
          }
        );

        console.log('📊 Analysis result:', {
          type: analysis.type,
          clientName: analysis.clientName,
          confidence: analysis.confidence,
          source: analysis.source,
          date: analysis.date
        });

        // Generate filename and folder
        const ext = path.extname(workingPath).toLowerCase();
        const fileName = generateFileName(analysis, ext);
        const folder = mapTypeToFolder(analysis.type);
        
        console.log(`📁 Generated filename: ${fileName}`);
        console.log(`📂 Target folder: ${folder}`);

        return {
          analysis,
          fileName,
          folder,
          extractedText: extractedText.substring(0, 100) + '...' // Truncate for storage
        };
      },
      {
        metadata: {
          processingType: 'enhanced',
          timestamp: new Date().toISOString()
        }
      }
    );

    // Handle file operations (copy to final destination)
    const finalPath = await handleFileOperations(filePath, secureResult.processingResult.fileName, secureResult.processingResult.folder);
    
    // Send detailed result to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:processed', {
        originalPath: filePath,
        finalPath: finalPath,
        success: true,
        analysis: secureResult.processingResult.analysis,
        fileId: secureResult.fileId,
        integrityVerified: secureResult.integrityVerified,
        message: `Successfully processed securely: ${path.basename(filePath)}`
      });
    }

    return {
      success: true,
      originalPath: filePath,
      finalPath: finalPath,
      analysis: secureResult.processingResult.analysis,
      fileName: secureResult.processingResult.fileName,
      folder: secureResult.processingResult.folder,
      fileId: secureResult.fileId,
      integrityVerified: secureResult.integrityVerified
    };

  } catch (error) {
    console.error(`❌ Secure processing failed for ${path.basename(filePath)}:`, error);
    
    // Send error to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:processed', {
        originalPath: filePath,
        success: false,
        error: error.message,
        message: `Secure processing failed: ${error.message}`
      });
    }

    throw error;
  }
}

/**
 * Enhanced file processing with AI integration (legacy - now uses secure processing)
 * @param {string} filePath - Path to the file to process
 * @returns {Promise<Object>} Processing result
 */
async function processFileEnhanced(filePath) {
  // Use secure processing instead of direct file access
  return await processFileSecurely(filePath);
}

/**
 * Process multiple files in batch with AI integration
 * @param {Array<string>} filePaths - Array of file paths to process
 * @returns {Promise<Object>} Batch processing result
 */
async function processBatchEnhanced(filePaths) {
  console.log(`🚀 Starting enhanced batch processing: ${filePaths.length} files`);
  
  const results = {
    total: filePaths.length,
    success: 0,
    errors: 0,
    details: [],
    stats: null
  };

  try {
    // Prepare documents for batch processing
    const documents = [];
    for (const filePath of filePaths) {
      try {
        const text = await enhancedParsingService.extractText(filePath);
        documents.push({
          filePath: filePath,
          text: text,
          fileName: path.basename(filePath)
        });
      } catch (error) {
        console.warn(`Failed to extract text from ${filePath}:`, error.message);
        results.errors++;
        results.details.push({
          filePath: filePath,
          success: false,
          error: error.message
        });
      }
    }

    // Process documents in batch
    if (documents.length > 0) {
      const analysisResults = await enhancedParsingService.processBatch(documents, {
        forceAI: process.env.FORCE_AI === 'true',
        model: process.env.AI_MODEL || 'gpt-3.5-turbo'
      });

      // Process each document with its analysis result
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const analysis = analysisResults[i];
        
        try {
          if (analysis) {
            // Generate filename and folder
            const ext = path.extname(doc.filePath).toLowerCase();
            const fileName = generateFileName(analysis, ext);
            const folder = mapTypeToFolder(analysis.type);
            
            // Handle file operations
            const finalPath = await handleFileOperations(doc.filePath, fileName, folder);
            
            results.success++;
            results.details.push({
              filePath: doc.filePath,
              finalPath: finalPath,
              success: true,
              analysis: analysis
            });
            
            // Send individual file result to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('file:processed', {
                originalPath: doc.filePath,
                finalPath: finalPath,
                success: true,
                message: `Successfully sorted to ${path.basename(finalPath)}`,
                analysis: analysis
              });
            }
          } else {
            throw new Error('Analysis failed');
          }
        } catch (error) {
          console.error(`Failed to process ${doc.filePath}:`, error);
          results.errors++;
          results.details.push({
            filePath: doc.filePath,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Get processing statistics
    results.stats = enhancedParsingService.getStats();
    
    console.log(`✅ Enhanced batch processing completed: ${results.success} success, ${results.errors} errors`);
    
    // Send final batch result to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: results.total,
        success: results.success,
        errors: results.errors,
        message: `Batch processing completed: ${results.success} success, ${results.errors} errors`,
        stats: results.stats
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Enhanced batch processing failed:', error);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: results.total,
        success: results.success,
        errors: results.errors,
        message: `Batch processing failed: ${error.message}`,
        stats: results.stats
      });
    }
    
    throw error;
  }
}

/**
 * Generate filename from analysis result
 * @param {Object} analysis - Analysis result
 * @param {string} extension - File extension
 * @returns {string} Generated filename
 */
function generateFileName(analysis, extension) {
  const parts = [];
  
  // Client name
  let clientName = 'Client_NA';
  if (analysis.clientName && analysis.clientName.trim()) {
    clientName = analysis.clientName.trim();
  }
  parts.push(sanitizeComponent(clientName));
  
  // Document type
  let documentType = 'Unclassified';
  if (analysis.type && analysis.type.trim()) {
    documentType = analysis.type.trim();
    // Add confidence indicator for low confidence
    if (analysis.confidence < 0.5) {
      documentType = `${documentType}_LowConfidence`;
    }
  }
  parts.push(sanitizeComponent(documentType));
  
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
  
  return parts.join('_') + extension;
}

/**
 * Map document type to folder name
 * @param {string} docType - Document type
 * @returns {string} Folder name
 */
function mapTypeToFolder(docType) {
  const folderMap = {
    'Invoice': 'Invoices',
    'Receipt': 'Receipts',
    'Contract': 'Contracts',
    'Statement': 'Statements',
    'Resume': 'Resumes',
    'Proposal': 'Proposals',
    'Report': 'Reports',
    'Letter': 'Letters',
    'Tax Document': 'Tax Documents',
    'Legal Document': 'Legal Documents',
    'Unclassified': 'Unclassified'
  };
  
  return folderMap[docType] || 'Unclassified';
}

/**
 * Sanitize filename component
 * @param {string} component - Component to sanitize
 * @returns {string} Sanitized component
 */
function sanitizeComponent(component) {
  return component
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

/**
 * Handle file operations (move/copy)
 * @param {string} sourcePath - Source file path
 * @param {string} fileName - New filename
 * @param {string} folder - Target folder
 * @returns {Promise<string>} Final file path
 */
async function handleFileOperations(sourcePath, fileName, folder) {
  const targetDir = path.join(path.dirname(sourcePath), 'sorted', folder);
  const finalPath = path.join(targetDir, fileName);
  
  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true });
  
  // Copy file to target location
  await fs.copyFile(sourcePath, finalPath);
  
  return finalPath;
}

// IPC Handlers

/**
 * Handle file dialog opening
 */
ipcMain.handle('open-file-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled) {
      return { success: true, filePaths: result.filePaths };
    } else {
      return { success: false, message: 'No files selected' };
    }
  } catch (error) {
    console.error('Error opening file dialog:', error);
    throw error;
  }
});

/**
 * Handle file drop
 */
ipcMain.handle('file:dropped', (event, filePaths) => {
  console.log('Files dropped:', filePaths);
  return { success: true, message: `Successfully received ${filePaths.length} file(s)` };
});

/**
 * Handle enhanced file processing
 */
ipcMain.on('start:sorting', async (event, filePaths) => {
  console.log('🚀 Starting enhanced sorting process...');
  
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    console.error('Invalid file paths provided');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: 0,
        success: 0,
        errors: 1,
        message: 'Invalid file paths provided'
      });
    }
    return;
  }
  
  try {
    await processBatchEnhanced(filePaths);
  } catch (error) {
    console.error('Enhanced sorting failed:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('processing:complete', {
        total: filePaths.length,
        success: 0,
        errors: filePaths.length,
        message: `Enhanced sorting failed: ${error.message}`
      });
    }
  }
});

/**
 * Handle single file processing
 */
ipcMain.handle('process:single', async (event, filePath) => {
  try {
    const result = await processFileEnhanced(filePath);
    return result;
  } catch (error) {
    console.error('Single file processing failed:', error);
    throw error;
  }
});

/**
 * Handle statistics request
 */
ipcMain.handle('get:stats', async (event) => {
  if (enhancedParsingService) {
    return enhancedParsingService.getStats();
  }
  return null;
});

/**
 * Handle AI service status request
 */
ipcMain.handle('get:ai-status', async (event) => {
  if (enhancedParsingService) {
    return {
      enabled: enhancedParsingService.useAI,
      initialized: enhancedParsingService.aiTextService !== null,
      threshold: enhancedParsingService.aiConfidenceThreshold,
      batchSize: enhancedParsingService.aiBatchSize
    };
  }
  return { enabled: false, initialized: false };
});

/**
 * Handle AI service toggle
 */
ipcMain.handle('toggle:ai', async (event, enabled) => {
  if (enhancedParsingService) {
    enhancedParsingService.useAI = enabled;
    if (enabled && !enhancedParsingService.aiTextService) {
      await enhancedParsingService.initializeAIServices();
    }
    return { success: true, enabled: enhancedParsingService.useAI };
  }
  return { success: false, enabled: false };
});

/**
 * Handle settings save
 */
ipcMain.handle('save:settings', async (event, settings) => {
  try {
    // Update enhanced parsing service settings
    if (enhancedParsingService) {
      enhancedParsingService.useAI = settings.useAI;
      enhancedParsingService.aiConfidenceThreshold = settings.confidenceThreshold;
      
      // Update environment variables for persistence
      process.env.USE_AI = settings.useAI.toString();
      process.env.AI_CONFIDENCE_THRESHOLD = settings.confidenceThreshold.toString();
      process.env.AI_MODEL = settings.model;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  if (enhancedParsingService) {
    await enhancedParsingService.close();
  }
});

module.exports = {
  createWindow,
  processFileEnhanced,
  processBatchEnhanced,
  enhancedParsingService
};
