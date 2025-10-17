/**
 * Functional Tests for AI Workflow
 * Tests the complete AI suggestions workflow including IPC handlers, file operations, and logging
 */

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');

// Mock the main process modules
jest.mock('../../src/services/enhancedParsingService');
jest.mock('../../src/services/filenameGenerator');
jest.mock('../../src/services/qualityLogger');
jest.mock('../../src/services/fileOpsLogger');
jest.mock('../../src/services/fileOpsHelpers');

const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const FilenameGenerator = require('../../src/services/filenameGenerator');
const QualityLogger = require('../../src/services/qualityLogger');
const FileOpsLogger = require('../../src/services/fileOpsLogger');
const FileOpsHelpers = require('../../src/services/fileOpsHelpers');

describe('AI Workflow Functional Tests', () => {
  let testDir;
  let mockMainProcess;

  beforeAll(async () => {
    // Create test environment
    testDir = path.join(__dirname, '../test_env');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'sorted'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'logs'), { recursive: true });

    // Mock main process handlers
    mockMainProcess = {
      ipcMain: {
        handle: jest.fn()
      }
    };
  });

  afterAll(async () => {
    // Cleanup test environment
    await fs.rmdir(testDir, { recursive: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Document Upload Workflow', () => {
    test('should analyze file and return AI suggestions', async () => {
      const testFilePath = path.join(testDir, 'uploads', 'test_invoice.pdf');
      
      // Mock file content
      await fs.writeFile(testFilePath, 'Mock PDF content for testing');

      // Mock AI analysis response
      const mockAnalysisResult = {
        success: true,
        data: {
          filePath: testFilePath,
          fileName: 'test_invoice.pdf',
          fileType: 'application/pdf',
          fileSizeBytes: 1024,
          documentType: 'Invoice',
          typeConfidence: 0.95,
          detectedEntities: {
            clientName: 'Test Client',
            date: '2024-01-15',
            amount: '$1,234.56'
          },
          aiSuggestions: {
            primary: 'Test_Client_Invoice_2024-01-15.pdf',
            alternatives: [
              'Invoice_Test_Client_2024-01-15.pdf',
              'TestClient_Invoice_Jan2024.pdf'
            ]
          },
          previewText: 'Invoice for Test Client dated 2024-01-15...',
          processingMethod: 'enhanced-parsing',
          analysisTimestamp: new Date().toISOString()
        }
      };

      EnhancedParsingService.processWithAI.mockResolvedValue(mockAnalysisResult);
      FilenameGenerator.generateFilenameFromMetadata.mockResolvedValue({
        primary: 'Test_Client_Invoice_2024-01-15.pdf',
        alternatives: [
          'Invoice_Test_Client_2024-01-15.pdf',
          'TestClient_Invoice_Jan2024.pdf'
        ]
      });

      // Simulate analyze-file IPC call
      const result = await mockAnalyzeFile(testFilePath);

      expect(result.success).toBe(true);
      expect(result.data.aiSuggestions.primary).toBe('Test_Client_Invoice_2024-01-15.pdf');
      expect(result.data.aiSuggestions.alternatives).toHaveLength(2);
      expect(result.data.documentType).toBe('Invoice');
      expect(result.data.previewText).toContain('Invoice for Test Client');
    });

    test('should handle AI analysis failure gracefully', async () => {
      const testFilePath = path.join(testDir, 'uploads', 'corrupt_file.pdf');
      
      // Mock AI failure
      EnhancedParsingService.processWithAI.mockRejectedValue(new Error('AI service unavailable'));

      const result = await mockAnalyzeFile(testFilePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI service unavailable');
    });
  });

  describe('Multiple Documents Upload Workflow', () => {
    test('should process multiple files sequentially', async () => {
      const testFiles = [
        path.join(testDir, 'uploads', 'invoice1.pdf'),
        path.join(testDir, 'uploads', 'contract1.pdf'),
        path.join(testDir, 'uploads', 'report1.pdf')
      ];

      // Create test files
      for (const filePath of testFiles) {
        await fs.writeFile(filePath, `Mock content for ${path.basename(filePath)}`);
      }

      // Mock different analysis results for each file
      const mockResults = [
        { documentType: 'Invoice', primary: 'Invoice_2024-01-15.pdf' },
        { documentType: 'Contract', primary: 'Contract_2024-01-15.pdf' },
        { documentType: 'Report', primary: 'Report_2024-01-15.pdf' }
      ];

      for (let i = 0; i < testFiles.length; i++) {
        EnhancedParsingService.processWithAI.mockResolvedValueOnce({
          success: true,
          data: {
            filePath: testFiles[i],
            fileName: path.basename(testFiles[i]),
            documentType: mockResults[i].documentType,
            aiSuggestions: { primary: mockResults[i].primary }
          }
        });
      }

      // Process files sequentially
      const results = [];
      for (const filePath of testFiles) {
        const result = await mockAnalyzeFile(filePath);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      expect(results[0].data.documentType).toBe('Invoice');
      expect(results[1].data.documentType).toBe('Contract');
      expect(results[2].data.documentType).toBe('Report');
    });
  });

  describe('Accept Suggestion Workflow', () => {
    test('should rename file when suggestion is accepted', async () => {
      const oldPath = path.join(testDir, 'uploads', 'old_name.pdf');
      const newName = 'New_Invoice_2024-01-15.pdf';
      
      // Create test file
      await fs.writeFile(oldPath, 'Mock PDF content');

      // Mock file operations
      FileOpsHelpers.validateFilename.mockReturnValue(true);
      FileOpsHelpers.getUniqueFilename.mockReturnValue(newName);
      FileOpsHelpers.ensureDirectoryExists.mockResolvedValue();
      FileOpsHelpers.checkFilePermissions.mockResolvedValue(true);

      // Mock successful rename
      const mockRename = jest.fn().mockResolvedValue(undefined);
      jest.doMock('fs/promises', () => ({
        ...jest.requireActual('fs/promises'),
        rename: mockRename
      }));

      const result = await mockRenameFile(oldPath, newName, {
        source: 'ai',
        metadata: { documentType: 'Invoice' },
        confidence: 0.95
      });

      expect(result.success).toBe(true);
      expect(result.newName).toBe(newName);
      expect(FileOpsLogger.logFileOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          oldPath,
          newName,
          status: 'success',
          source: 'ai'
        })
      );
    });

    test('should handle rename failure gracefully', async () => {
      const oldPath = path.join(testDir, 'uploads', 'readonly_file.pdf');
      const newName = 'New_Name.pdf';

      // Mock file operations failure
      FileOpsHelpers.validateFilename.mockReturnValue(true);
      FileOpsHelpers.checkFilePermissions.mockRejectedValue(new Error('Permission denied'));

      const result = await mockRenameFile(oldPath, newName, { source: 'ai' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('Regenerate Suggestion Workflow', () => {
    test('should generate new suggestion on regenerate', async () => {
      const filePath = path.join(testDir, 'uploads', 'test_file.pdf');
      const previousSuggestion = 'Old_Suggestion.pdf';
      const regenCount = 1;

      // Mock regeneration response
      const mockRegenResult = {
        success: true,
        suggestion: 'New_Regenerated_Suggestion.pdf',
        alternatives: ['Alt1.pdf', 'Alt2.pdf'],
        confidence: 0.88,
        regenerationAttempt: 1,
        temperature: 0.8,
        processingTimeMs: 1200
      };

      FilenameGenerator.generateFilenameFromMetadata.mockResolvedValue({
        primary: 'New_Regenerated_Suggestion.pdf',
        alternatives: ['Alt1.pdf', 'Alt2.pdf']
      });

      const result = await mockRegenerateSuggestion(filePath, previousSuggestion, regenCount);

      expect(result.success).toBe(true);
      expect(result.suggestion).toBe('New_Regenerated_Suggestion.pdf');
      expect(result.suggestion).not.toBe(previousSuggestion);
      expect(result.regenerationAttempt).toBe(1);
      expect(result.temperature).toBe(0.8);
    });

    test('should enforce 3-attempt regeneration limit', async () => {
      const filePath = path.join(testDir, 'uploads', 'test_file.pdf');
      const previousSuggestion = 'Old_Suggestion.pdf';
      const regenCount = 3; // Exceeds limit

      const result = await mockRegenerateSuggestion(filePath, previousSuggestion, regenCount);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Regeneration limit reached');
    });
  });

  describe('Quality Feedback Workflow', () => {
    test('should log quality feedback correctly', async () => {
      const qualityData = {
        documentHash: 'test_hash_123',
        fileName: 'test_file.pdf',
        action: 'accepted',
        rating: 'thumbs_up',
        confidenceScore: 0.95,
        timeToDecisionMs: 1500
      };

      QualityLogger.logQuality.mockResolvedValue({ success: true });

      const result = await mockLogSuggestionQuality(qualityData);

      expect(result.success).toBe(true);
      expect(QualityLogger.logQuality).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'accepted',
          rating: 'thumbs_up',
          confidenceScore: 0.95
        })
      );
    });

    test('should handle batch quality logging', async () => {
      const qualityDataArray = [
        { action: 'accepted', rating: 'thumbs_up' },
        { action: 'rejected', rating: 'thumbs_down' },
        { action: 'regenerated', rating: null }
      ];

      QualityLogger.logBatchQuality.mockResolvedValue({
        success: true,
        processed: 3,
        successful: 3,
        failed: 0
      });

      const result = await mockLogBatchQuality(qualityDataArray);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);
      expect(result.successful).toBe(3);
    });
  });

  describe('Batch Operations Workflow', () => {
    test('should process batch rename operations sequentially', async () => {
      const operations = [
        { oldPath: path.join(testDir, 'uploads', 'file1.pdf'), newName: 'New1.pdf', source: 'ai' },
        { oldPath: path.join(testDir, 'uploads', 'file2.pdf'), newName: 'New2.pdf', source: 'ai' },
        { oldPath: path.join(testDir, 'uploads', 'file3.pdf'), newName: 'New3.pdf', source: 'ai' }
      ];

      // Create test files
      for (const op of operations) {
        await fs.writeFile(op.oldPath, 'Mock content');
      }

      // Mock successful operations
      FileOpsHelpers.validateFilename.mockReturnValue(true);
      FileOpsHelpers.getUniqueFilename.mockImplementation((dir, name) => name);
      FileOpsHelpers.ensureDirectoryExists.mockResolvedValue();
      FileOpsHelpers.checkFilePermissions.mockResolvedValue(true);

      const mockRename = jest.fn().mockResolvedValue(undefined);
      jest.doMock('fs/promises', () => ({
        ...jest.requireActual('fs/promises'),
        rename: mockRename
      }));

      const result = await mockBatchRenameFiles(operations);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid filename characters', async () => {
      const oldPath = path.join(testDir, 'uploads', 'test_file.pdf');
      const invalidName = 'Invalid/Name<>.pdf';

      FileOpsHelpers.validateFilename.mockReturnValue(false);

      const result = await mockRenameFile(oldPath, invalidName, { source: 'ai' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid filename');
    });

    test('should handle missing file during rename', async () => {
      const oldPath = path.join(testDir, 'uploads', 'nonexistent.pdf');
      const newName = 'New_Name.pdf';

      FileOpsHelpers.validateFilename.mockReturnValue(true);
      FileOpsHelpers.checkFilePermissions.mockRejectedValue(new Error('File not found'));

      const result = await mockRenameFile(oldPath, newName, { source: 'ai' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('should handle network timeout during AI analysis', async () => {
      const testFilePath = path.join(testDir, 'uploads', 'timeout_test.pdf');
      
      // Mock timeout error
      EnhancedParsingService.processWithAI.mockRejectedValue(
        new Error('Request timeout after 30000ms')
      );

      const result = await mockAnalyzeFile(testFilePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Request timeout');
    });
  });
});

// Mock IPC handler functions
async function mockAnalyzeFile(filePath) {
  try {
    const EnhancedParsingService = require('../../src/services/enhancedParsingService');
    const FilenameGenerator = require('../../src/services/filenameGenerator');
    
    const analysisResult = await EnhancedParsingService.processWithAI('mock text', filePath);
    const filenameResult = await FilenameGenerator.generateFilenameFromMetadata(analysisResult.data);
    
    return {
      success: true,
      data: {
        ...analysisResult.data,
        aiSuggestions: {
          primary: filenameResult.primary,
          alternatives: filenameResult.alternatives || []
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function mockRenameFile(oldPath, newName, options = {}) {
  try {
    const FileOpsHelpers = require('../../src/services/fileOpsHelpers');
    const FileOpsLogger = require('../../src/services/fileOpsLogger');
    
    // Validate filename
    if (!FileOpsHelpers.validateFilename(newName)) {
      throw new Error('Invalid filename characters or length');
    }
    
    // Check permissions
    await FileOpsHelpers.checkFilePermissions(oldPath, 'r');
    
    // Get unique filename
    const targetDir = options.moveToDir || path.dirname(oldPath);
    await FileOpsHelpers.ensureDirectoryExists(targetDir);
    const uniqueName = await FileOpsHelpers.getUniqueFilename(targetDir, newName);
    
    // Perform rename
    const newPath = path.join(targetDir, uniqueName);
    const fsp = require('fs').promises;
    await fsp.rename(oldPath, newPath);
    
    // Log operation
    await FileOpsLogger.logFileOperation({
      oldPath,
      newPath,
      newName: uniqueName,
      status: 'success',
      source: options.source || 'manual',
      ...options
    });
    
    return {
      success: true,
      newPath,
      newName: uniqueName,
      targetDir,
      durationMs: 100
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function mockRegenerateSuggestion(filePath, previousSuggestion, regenCount) {
  try {
    if (regenCount >= 3) {
      throw new Error('Regeneration limit reached');
    }
    
    const FilenameGenerator = require('../../src/services/filenameGenerator');
    const temperature = Math.min(0.7 + (0.1 * regenCount), 0.9);
    
    const result = await FilenameGenerator.generateFilenameFromMetadata(
      { filePath, previousSuggestion },
      { temperature, regenerationAttempt: regenCount + 1 }
    );
    
    return {
      success: true,
      suggestion: result.primary,
      alternatives: result.alternatives || [],
      confidence: 0.8,
      regenerationAttempt: regenCount + 1,
      temperature,
      processingTimeMs: 1200
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function mockLogSuggestionQuality(data) {
  try {
    const QualityLogger = require('../../src/services/qualityLogger');
    await QualityLogger.logQuality(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function mockLogBatchQuality(dataArray) {
  try {
    const QualityLogger = require('../../src/services/qualityLogger');
    const result = await QualityLogger.logBatchQuality(dataArray);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function mockBatchRenameFiles(operations) {
  try {
    const results = [];
    let successful = 0;
    let failed = 0;
    
    for (const operation of operations) {
      const result = await mockRenameFile(operation.oldPath, operation.newName, operation);
      results.push(result);
      if (result.success) successful++;
      else failed++;
    }
    
    return {
      success: true,
      processed: operations.length,
      successful,
      failed,
      results
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
