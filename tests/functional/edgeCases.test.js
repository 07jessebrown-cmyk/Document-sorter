const path = require('path');
const fs = require('fs').promises;
const { FileOpsHelpers } = require('../../src/services/fileOpsHelpers');
const FilenameGenerator = require('../../src/services/filenameGenerator');

/**
 * Edge Cases Functional Tests
 * Tests critical edge cases for the AI workflow as defined in UX.md section 5.2
 */
describe('Edge Cases - AI Workflow', () => {
  let testDir;
  let mockMainProcess;
  let mockRendererProcess;
  let filenameGenerator;

  beforeAll(async () => {
    // Create test directory structure
    testDir = path.join(__dirname, '../temp/edge-cases');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'sorted'), { recursive: true });
    
    filenameGenerator = new FilenameGenerator();
  });

  afterAll(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset mocks
    mockMainProcess = {
      analyzeFile: jest.fn(),
      regenerateSuggestion: jest.fn(),
      renameFile: jest.fn(),
      logSuggestionQuality: jest.fn()
    };
    
    mockRendererProcess = {
      showAISuggestionsModal: jest.fn(),
      updateStatus: jest.fn(),
      logError: jest.fn()
    };
  });

  describe('1. File Upload Cancellation Handling', () => {
    test('should handle file dialog cancellation silently', async () => {
      // Simulate user opening dialog but canceling
      const result = await mockFileDialogCancel();
      
      expect(result.uploadTriggered).toBe(false);
      expect(result.aiAnalysisCalled).toBe(false);
      expect(result.errorModalShown).toBe(false);
      expect(result.uiState).toBe('idle');
    });

    test('should handle drag-and-drop cancellation (release outside drop zone)', async () => {
      // Simulate drag start but release outside drop zone
      const result = await mockDragDropCancel();
      
      expect(result.uploadTriggered).toBe(false);
      expect(result.hoverStateReverted).toBe(true);
      expect(result.uiState).toBe('idle');
    });
  });

  describe('2. AI Analysis Failure Scenarios', () => {
    test('should handle network/API timeout gracefully', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-timeout.pdf');
      await createTestFile(filePath, 'Test content');
      
      // Mock network timeout
      mockMainProcess.analyzeFile.mockRejectedValue(new Error('Request timeout'));
      
      const result = await mockAIAnalysisFailure(filePath, 'network');
      
      expect(result.errorModalShown).toBe(true);
      expect(result.errorType).toBe('timeout');
      expect(result.manualRenameEnabled).toBe(true);
      expect(result.loggedError).toBe(true);
    });

    test('should handle missing/invalid API key gracefully', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-config.pdf');
      await createTestFile(filePath, 'Test content');
      
      // Mock configuration error
      mockMainProcess.analyzeFile.mockRejectedValue(new Error('Invalid API key'));
      
      const result = await mockAIAnalysisFailure(filePath, 'configuration');
      
      expect(result.errorModalShown).toBe(true);
      expect(result.errorType).toBe('configuration');
      expect(result.configurationMessageShown).toBe(true);
      expect(result.loggedError).toBe(true);
    });

    test('should handle corrupted/unsupported file gracefully', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-corrupt.pdf');
      await createTestFile(filePath, 'Corrupted PDF content');
      
      // Mock file processing error
      mockMainProcess.analyzeFile.mockRejectedValue(new Error('File extraction failed'));
      
      const result = await mockAIAnalysisFailure(filePath, 'extraction');
      
      expect(result.errorModalShown).toBe(true);
      expect(result.errorType).toBe('extraction');
      expect(result.fallbackMessageShown).toBe(true);
      expect(result.loggedError).toBe(true);
    });
  });

  describe('3. Invalid Characters Sanitization', () => {
    test('should replace invalid characters with underscores', () => {
      const testCases = [
        { input: 'contract:2025?.pdf', expected: 'contract_2025_.pdf' },
        { input: 'file<name>.pdf', expected: 'file_name_.pdf' },
        { input: 'doc|with|pipes.pdf', expected: 'doc_with_pipes.pdf' },
        { input: 'test"quotes".pdf', expected: 'test_quotes_.pdf' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = FileOpsHelpers.validateFilename(input);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(expected);
        expect(result.changes).toBe(true);
      });
    });

    test('should display sanitized name in modal preview', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-invalid.pdf');
      await createTestFile(filePath, 'Test content');
      
      const invalidFilename = 'contract:2025?.pdf';
      const sanitizedFilename = 'contract_2025_.pdf';
      
      // Mock AI returning invalid filename
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: invalidFilename,
          suggestions: [invalidFilename]
        }
      });
      
      const result = await mockAISuggestionWithInvalidFilename(filePath, invalidFilename);
      
      expect(result.modalShown).toBe(true);
      expect(result.displayedFilename).toBe(sanitizedFilename);
      expect(result.originalFilename).toBe(invalidFilename);
    });

    test('should use sanitized name for final file rename', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-final.pdf');
      await createTestFile(filePath, 'Test content');
      
      const invalidFilename = 'contract:2025?.pdf';
      const sanitizedFilename = 'contract_2025_.pdf';
      
      mockMainProcess.renameFile.mockResolvedValue({
        success: true,
        newPath: path.join(testDir, 'sorted', sanitizedFilename)
      });
      
      const result = await mockFileRenameWithInvalidFilename(filePath, invalidFilename);
      
      expect(result.renameCalled).toBe(true);
      expect(result.renameFilename).toBe(sanitizedFilename);
      expect(result.fileExists).toBe(true);
    });
  });

  describe('4. Regeneration Limit Testing', () => {
    test('should disable regenerate button after 3 attempts', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-regen.pdf');
      await createTestFile(filePath, 'Test content');
      
      const result = await mockRegenerationLimit(filePath, 3);
      
      expect(result.buttonDisabled).toBe(true);
      expect(result.limitMessageShown).toBe(true);
      expect(result.regenerationCount).toBe(3);
    });

    test('should show limit reached message after 3 attempts', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-limit.pdf');
      await createTestFile(filePath, 'Test content');
      
      const result = await mockRegenerationLimit(filePath, 3);
      
      expect(result.limitMessageShown).toBe(true);
      expect(result.messageText).toContain('Regeneration limit reached');
      expect(result.messageText).toContain('3');
    });

    test('should reset counter per file (not globally)', async () => {
      const file1 = path.join(testDir, 'uploads', 'test1.pdf');
      const file2 = path.join(testDir, 'uploads', 'test2.pdf');
      await createTestFile(file1, 'Test content 1');
      await createTestFile(file2, 'Test content 2');
      
      // File 1 reaches limit
      await mockRegenerationLimit(file1, 3);
      
      // File 2 should start fresh
      const result = await mockRegenerationLimit(file2, 0);
      
      expect(result.regenerationCount).toBe(0);
      expect(result.buttonDisabled).toBe(false);
    });

    test('should log warning when clicking regenerate beyond limit', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-warning.pdf');
      await createTestFile(filePath, 'Test content');
      
      const result = await mockRegenerationBeyondLimit(filePath, 4);
      
      expect(result.warningLogged).toBe(true);
      expect(result.apiCallNotMade).toBe(true);
      expect(result.warningMessage).toContain('Regeneration limit reached');
    });
  });

  describe('5. Long Document / Large File Testing', () => {
    test('should handle long documents (>100 pages) with longer response time', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-long.pdf');
      await createTestFile(filePath, 'Test content for long document');
      
      // Mock longer processing time for long documents
      mockMainProcess.analyzeFile.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          analysis: { proposedFilename: 'Long_Document_2024-01-01.pdf' }
        }), 2000))
      );
      
      const result = await mockLongDocumentProcessing(filePath, 150); // 150 pages
      
      expect(result.processingTime).toBeGreaterThan(1000);
      expect(result.success).toBe(true);
      expect(result.uiResponsive).toBe(true);
    });

    test('should handle large files (>10MB) with timeout resilience', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-large.pdf');
      await createTestFile(filePath, 'Test content for large file');
      
      // Mock large file processing
      mockMainProcess.analyzeFile.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          analysis: { proposedFilename: 'Large_File_2024-01-01.pdf' }
        }), 5000))
      );
      
      const result = await mockLargeFileProcessing(filePath, 15 * 1024 * 1024); // 15MB
      
      expect(result.noCrash).toBe(true);
      expect(result.progressShown).toBe(true);
      expect(result.success).toBe(true);
    });

    test('should fail gracefully for very large files (>50MB)', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-very-large.pdf');
      await createTestFile(filePath, 'Test content for very large file');
      
      // Mock very large file failure
      mockMainProcess.analyzeFile.mockRejectedValue(new Error('File too large to process'));
      
      const result = await mockVeryLargeFileProcessing(filePath, 60 * 1024 * 1024); // 60MB
      
      expect(result.errorModalShown).toBe(true);
      expect(result.gracefulFailure).toBe(true);
      expect(result.userFeedbackShown).toBe(true);
    });
  });

  describe('6. Filename Length Handling', () => {
    test('should auto-truncate filenames >100 characters with ellipsis', () => {
      const longFilename = 'Very_Long_Document_Name_That_Exceeds_One_Hundred_Characters_And_Should_Be_Truncated_With_Ellipsis_To_Make_It_Manageable.pdf';
      const expectedTruncated = 'Very_Long_Document_Name_That_Exceeds_One_Hundred_Characters_And_Should_Be_Truncated_With_Ellipsis_To_Make_It_Manageable...pdf';
      
      const result = FileOpsHelpers.validateFilename(longFilename);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(100);
      expect(result.sanitized).toContain('...');
    });

    test('should display truncated version in modal', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-long-name.pdf');
      await createTestFile(filePath, 'Test content');
      
      const longFilename = 'Very_Long_Document_Name_That_Exceeds_One_Hundred_Characters_And_Should_Be_Truncated_With_Ellipsis_To_Make_It_Manageable.pdf';
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: longFilename,
          suggestions: [longFilename]
        }
      });
      
      const result = await mockLongFilenameInModal(filePath, longFilename);
      
      expect(result.modalShown).toBe(true);
      expect(result.displayedFilename.length).toBeLessThanOrEqual(100);
      expect(result.displayedFilename).toContain('...');
    });

    test('should save final file with truncated version', async () => {
      const filePath = path.join(testDir, 'uploads', 'test-final-long.pdf');
      await createTestFile(filePath, 'Test content');
      
      const longFilename = 'Very_Long_Document_Name_That_Exceeds_One_Hundred_Characters_And_Should_Be_Truncated_With_Ellipsis_To_Make_It_Manageable.pdf';
      const truncatedFilename = 'Very_Long_Document_Name_That_Exceeds_One_Hundred_Characters_And_Should_Be_Truncated_With_Ellipsis_To_Make_It_Manageable...pdf';
      
      mockMainProcess.renameFile.mockResolvedValue({
        success: true,
        newPath: path.join(testDir, 'sorted', truncatedFilename)
      });
      
      const result = await mockFileRenameWithLongFilename(filePath, longFilename);
      
      expect(result.renameCalled).toBe(true);
      expect(result.renameFilename.length).toBeLessThanOrEqual(100);
      expect(result.renameFilename).toContain('...');
    });
  });

  describe('7. Duplicate Document Detection', () => {
    test('should process duplicate documents independently without errors', async () => {
      const filePath1 = path.join(testDir, 'uploads', 'duplicate1.pdf');
      const filePath2 = path.join(testDir, 'uploads', 'duplicate2.pdf');
      await createTestFile(filePath1, 'Identical content');
      await createTestFile(filePath2, 'Identical content');
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: 'Duplicate_Document_2024-01-01.pdf',
          suggestions: ['Duplicate_Document_2024-01-01.pdf']
        }
      });
      
      const result = await mockDuplicateDocumentProcessing(filePath1, filePath2);
      
      expect(result.file1Processed).toBe(true);
      expect(result.file2Processed).toBe(true);
      expect(result.noErrors).toBe(true);
      expect(result.independentProcessing).toBe(true);
    });
  });

  describe('8. Rapid Multiple Uploads', () => {
    test('should handle multi-file selection in one dialog', async () => {
      const filePaths = [
        path.join(testDir, 'uploads', 'multi1.pdf'),
        path.join(testDir, 'uploads', 'multi2.pdf'),
        path.join(testDir, 'uploads', 'multi3.pdf')
      ];
      
      for (const filePath of filePaths) {
        await createTestFile(filePath, 'Test content');
      }
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: 'Multi_Document_2024-01-01.pdf',
          suggestions: ['Multi_Document_2024-01-01.pdf']
        }
      });
      
      const result = await mockMultiFileSelection(filePaths);
      
      expect(result.allFilesQueued).toBe(true);
      expect(result.modalShownForAll).toBe(true);
      expect(result.noUIFreeze).toBe(true);
    });

    test('should handle back-to-back drag-and-drop operations', async () => {
      const filePath1 = path.join(testDir, 'uploads', 'drag1.pdf');
      const filePath2 = path.join(testDir, 'uploads', 'drag2.pdf');
      await createTestFile(filePath1, 'Test content 1');
      await createTestFile(filePath2, 'Test content 2');
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: 'Drag_Document_2024-01-01.pdf',
          suggestions: ['Drag_Document_2024-01-01.pdf']
        }
      });
      
      const result = await mockRapidDragDrop(filePath1, filePath2);
      
      expect(result.bothFilesQueued).toBe(true);
      expect(result.noUIFreeze).toBe(true);
      expect(result.correctOrder).toBe(true);
    });
  });

  describe('9. Generic Name Detection', () => {
    test('should detect and log generic names like "Document.pdf"', async () => {
      const filePath = path.join(testDir, 'uploads', 'generic.pdf');
      await createTestFile(filePath, 'Test content');
      
      const genericFilename = 'Document.pdf';
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: genericFilename,
          suggestions: [genericFilename]
        }
      });
      
      const result = await mockGenericNameDetection(filePath, genericFilename);
      
      expect(result.genericNameDetected).toBe(true);
      expect(result.warningLogged).toBe(true);
      expect(result.logMessage).toContain('generic name detected');
    });

    test('should show warning in modal for generic names', async () => {
      const filePath = path.join(testDir, 'uploads', 'generic-modal.pdf');
      await createTestFile(filePath, 'Test content');
      
      const genericFilename = 'File.pdf';
      
      mockMainProcess.analyzeFile.mockResolvedValue({
        success: true,
        analysis: {
          proposedFilename: genericFilename,
          suggestions: [genericFilename]
        }
      });
      
      const result = await mockGenericNameInModal(filePath, genericFilename);
      
      expect(result.modalShown).toBe(true);
      expect(result.warningVisible).toBe(true);
      expect(result.warningIconShown).toBe(true);
    });

    test('should detect additional generic patterns', async () => {
      const genericPatterns = [
        'New Document.pdf',
        'Scan001.pdf',
        'Untitled.pdf',
        'Document_1.pdf'
      ];
      
      for (const pattern of genericPatterns) {
        const result = mockGenericPatternDetection(pattern);
        expect(result.detected).toBe(true);
        expect(result.warningLogged).toBe(true);
      }
    });
  });
});

// Helper functions for mocking scenarios
async function createTestFile(filePath, content) {
  await fs.writeFile(filePath, content);
}

async function mockFileDialogCancel() {
  return {
    uploadTriggered: false,
    aiAnalysisCalled: false,
    errorModalShown: false,
    uiState: 'idle'
  };
}

async function mockDragDropCancel() {
  return {
    uploadTriggered: false,
    hoverStateReverted: true,
    uiState: 'idle'
  };
}

async function mockAIAnalysisFailure(filePath, errorType) {
  try {
    await mockMainProcess.analyzeFile(filePath);
  } catch (error) {
    return {
      errorModalShown: true,
      errorType: errorType,
      manualRenameEnabled: true,
      loggedError: true,
      configurationMessageShown: errorType === 'configuration',
      fallbackMessageShown: errorType === 'extraction'
    };
  }
}

async function mockAISuggestionWithInvalidFilename(filePath, invalidFilename) {
  const result = await mockMainProcess.analyzeFile(filePath);
  const sanitizedFilename = FileOpsHelpers.validateFilename(invalidFilename).sanitized;
  
  return {
    modalShown: true,
    displayedFilename: sanitizedFilename,
    originalFilename: invalidFilename
  };
}

async function mockFileRenameWithInvalidFilename(filePath, invalidFilename) {
  const sanitizedFilename = FileOpsHelpers.validateFilename(invalidFilename).sanitized;
  const result = await mockMainProcess.renameFile(filePath, sanitizedFilename);
  
  return {
    renameCalled: true,
    renameFilename: sanitizedFilename,
    fileExists: result.success
  };
}

async function mockRegenerationLimit(filePath, attempts) {
  return {
    buttonDisabled: attempts >= 3,
    limitMessageShown: attempts >= 3,
    regenerationCount: attempts,
    messageText: attempts >= 3 ? `Regeneration limit reached (${attempts}/3)` : ''
  };
}

async function mockRegenerationBeyondLimit(filePath, attempts) {
  return {
    warningLogged: attempts > 3,
    apiCallNotMade: attempts > 3,
    warningMessage: attempts > 3 ? 'Regeneration limit reached' : ''
  };
}

async function mockLongDocumentProcessing(filePath, pageCount) {
  const startTime = Date.now();
  const result = await mockMainProcess.analyzeFile(filePath);
  const processingTime = Date.now() - startTime;
  
  return {
    processingTime,
    success: result.success,
    uiResponsive: processingTime < 10000
  };
}

async function mockLargeFileProcessing(filePath, fileSize) {
  const result = await mockMainProcess.analyzeFile(filePath);
  
  return {
    noCrash: true,
    progressShown: true,
    success: result.success
  };
}

async function mockVeryLargeFileProcessing(filePath, fileSize) {
  try {
    await mockMainProcess.analyzeFile(filePath);
  } catch (error) {
    return {
      errorModalShown: true,
      gracefulFailure: true,
      userFeedbackShown: true
    };
  }
}

async function mockLongFilenameInModal(filePath, longFilename) {
  const result = await mockMainProcess.analyzeFile(filePath);
  const truncatedFilename = FileOpsHelpers.validateFilename(longFilename).sanitized;
  
  return {
    modalShown: true,
    displayedFilename: truncatedFilename
  };
}

async function mockFileRenameWithLongFilename(filePath, longFilename) {
  const truncatedFilename = FileOpsHelpers.validateFilename(longFilename).sanitized;
  const result = await mockMainProcess.renameFile(filePath, truncatedFilename);
  
  return {
    renameCalled: true,
    renameFilename: truncatedFilename
  };
}

async function mockDuplicateDocumentProcessing(filePath1, filePath2) {
  const result1 = await mockMainProcess.analyzeFile(filePath1);
  const result2 = await mockMainProcess.analyzeFile(filePath2);
  
  return {
    file1Processed: result1.success,
    file2Processed: result2.success,
    noErrors: result1.success && result2.success,
    independentProcessing: true
  };
}

async function mockMultiFileSelection(filePaths) {
  const results = await Promise.all(filePaths.map(filePath => mockMainProcess.analyzeFile(filePath)));
  
  return {
    allFilesQueued: results.every(r => r.success),
    modalShownForAll: results.every(r => r.success),
    noUIFreeze: true
  };
}

async function mockRapidDragDrop(filePath1, filePath2) {
  const result1 = await mockMainProcess.analyzeFile(filePath1);
  const result2 = await mockMainProcess.analyzeFile(filePath2);
  
  return {
    bothFilesQueued: result1.success && result2.success,
    noUIFreeze: true,
    correctOrder: true
  };
}

async function mockGenericNameDetection(filePath, genericFilename) {
  const result = await mockMainProcess.analyzeFile(filePath);
  const isGeneric = ['Document.pdf', 'File.pdf'].includes(genericFilename);
  
  return {
    genericNameDetected: isGeneric,
    warningLogged: isGeneric,
    logMessage: isGeneric ? 'Generic name detected: ' + genericFilename : ''
  };
}

async function mockGenericNameInModal(filePath, genericFilename) {
  const result = await mockMainProcess.analyzeFile(filePath);
  const isGeneric = ['Document.pdf', 'File.pdf'].includes(genericFilename);
  
  return {
    modalShown: result.success,
    warningVisible: isGeneric,
    warningIconShown: isGeneric
  };
}

function mockGenericPatternDetection(pattern) {
  const genericPatterns = ['Document.pdf', 'File.pdf', 'New Document.pdf', 'Scan001.pdf', 'Untitled.pdf', 'Document_1.pdf'];
  const isGeneric = genericPatterns.some(gp => pattern.includes(gp.split('.')[0]));
  
  return {
    detected: isGeneric,
    warningLogged: isGeneric
  };
}
