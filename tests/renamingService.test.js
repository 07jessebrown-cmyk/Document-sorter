const RenamingService = require('../src/services/renamingService');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('RenamingService', () => {
  let renamingService;
  let testDir;

  beforeEach(() => {
    renamingService = new RenamingService();
    testDir = path.join(os.tmpdir(), `renaming_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  });

  describe('buildBaseName', () => {
    test('should build correct filename with all metadata', () => {
      const metadata = {
        clientName: 'Acme Corporation',
        date: '2023-12-15',
        type: 'Invoice'
      };
      const ext = '.pdf';
      
      const result = renamingService.buildBaseName(metadata, ext);
      expect(result).toBe('acme_corporation_2023-12-15_invoice.pdf');
    });

    test('should handle missing client name', () => {
      const metadata = {
        date: '2023-12-15',
        type: 'Invoice'
      };
      const ext = '.pdf';
      
      const result = renamingService.buildBaseName(metadata, ext);
      expect(result).toBe('unknown_2023-12-15_invoice.pdf');
    });

    test('should handle missing date', () => {
      const metadata = {
        clientName: 'Acme Corporation',
        type: 'Invoice'
      };
      const ext = '.pdf';
      
      const result = renamingService.buildBaseName(metadata, ext);
      expect(result).toBe('acme_corporation_unknown-date_invoice.pdf');
    });

    test('should handle missing document type', () => {
      const metadata = {
        clientName: 'Acme Corporation',
        date: '2023-12-15'
      };
      const ext = '.pdf';
      
      const result = renamingService.buildBaseName(metadata, ext);
      expect(result).toBe('acme_corporation_2023-12-15_document.pdf');
    });

    test('should handle empty metadata', () => {
      const metadata = {};
      const ext = '.pdf';
      
      const result = renamingService.buildBaseName(metadata, ext);
      expect(result).toBe('unknown_unknown-date_document.pdf');
    });
  });

  describe('sanitizeName', () => {
    test('should sanitize special characters', () => {
      expect(renamingService.sanitizeName('Acme Corp. & Co.')).toBe('acme_corp._co.');
    });

    test('should handle multiple underscores', () => {
      expect(renamingService.sanitizeName('Test___Name')).toBe('test_name');
    });

    test('should remove leading/trailing underscores', () => {
      expect(renamingService.sanitizeName('_Test_Name_')).toBe('test_name');
    });

    test('should handle empty string', () => {
      expect(renamingService.sanitizeName('')).toBe('unknown');
    });

    test('should handle null/undefined', () => {
      expect(renamingService.sanitizeName(null)).toBe('unknown');
      expect(renamingService.sanitizeName(undefined)).toBe('unknown');
    });
  });

  describe('generateFallbackName', () => {
    test('should generate fallback name with timestamp', () => {
      const originalPath = '/path/to/document.pdf';
      const result = renamingService.generateFallbackName(originalPath);
      
      expect(result).toMatch(/^document_\d{4}-\d{2}-\d{2}_document\.pdf$/);
    });

    test('should preserve original filename in fallback', () => {
      const originalPath = '/path/to/invoice_2023.pdf';
      const result = renamingService.generateFallbackName(originalPath);
      
      expect(result).toMatch(/^document_\d{4}-\d{2}-\d{2}_invoice_2023\.pdf$/);
    });
  });

  describe('generateNewFilename', () => {
    test('should generate filename in preview mode', async () => {
      const metadata = {
        clientName: 'Test Client',
        date: '2023-12-15',
        type: 'Invoice'
      };
      const originalPath = '/test/document.pdf';
      
      const result = await renamingService.generateNewFilename(metadata, originalPath, true);
      
      expect(result.success).toBe(true);
      expect(result.preview).toBe(true);
      expect(result.newName).toBe('test_client_2023-12-15_invoice.pdf');
      expect(result.originalPath).toBe(originalPath);
    });

    test('should handle error in preview mode', async () => {
      const metadata = null; // Invalid metadata
      const originalPath = '/test/document.pdf';
      
      const result = await renamingService.generateNewFilename(metadata, originalPath, true);
      
      expect(result.success).toBe(false);
      expect(result.fallbackName).toBeDefined();
    });
  });

  describe('fileExists', () => {
    test('should return false for non-existent file', async () => {
      const result = await renamingService.fileExists('/non/existent/file.pdf');
      expect(result).toBe(false);
    });

    test('should return true for existing file', async () => {
      // Create a temporary file
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      const result = await renamingService.fileExists(testFile);
      expect(result).toBe(true);
    });
  });

  describe('ensureUniqueFilename', () => {
    test('should return original name if no conflict', async () => {
      const originalPath = '/test/document.pdf';
      const baseName = 'test_client_2023-12-15_invoice.pdf';
      
      const result = await renamingService.ensureUniqueFilename(originalPath, baseName);
      expect(result).toBe(baseName);
    });

    test('should add suffix for duplicate names', async () => {
      // Create a temporary file
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'test.pdf');
      await fs.writeFile(testFile, 'test content');
      
      // Test with a different original path to force duplicate detection
      const originalPath = path.join(testDir, 'different.pdf');
      const baseName = 'test.pdf';
      
      const result = await renamingService.ensureUniqueFilename(originalPath, baseName);
      expect(result).toBe('test-1.pdf');
    });
  });

  describe('renameFile', () => {
    test('should rename file successfully', async () => {
      // Create a temporary file
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'original.pdf');
      await fs.writeFile(testFile, 'test content');
      
      const metadata = {
        clientName: 'Test Client',
        date: '2023-12-15',
        type: 'Invoice'
      };
      
      const result = await renamingService.renameFile(testFile, metadata, false);
      
      expect(result.success).toBe(true);
      expect(result.newName).toBe('test_client_2023-12-15_invoice.pdf');
      expect(result.message).toContain('Successfully renamed');
      
      // Verify file was actually renamed
      const newPath = path.join(testDir, result.newName);
      const exists = await renamingService.fileExists(newPath);
      expect(exists).toBe(true);
    });

    test('should handle preview mode', async () => {
      const metadata = {
        clientName: 'Test Client',
        date: '2023-12-15',
        type: 'Invoice'
      };
      const originalPath = '/test/document.pdf';
      
      const result = await renamingService.renameFile(originalPath, metadata, true);
      
      expect(result.success).toBe(true);
      expect(result.preview).toBe(true);
      expect(result.message).toContain('Preview mode');
    });

    test('should handle rename errors', async () => {
      const metadata = {
        clientName: 'Test Client',
        date: '2023-12-15',
        type: 'Invoice'
      };
      const originalPath = '/non/existent/file.pdf';
      
      const result = await renamingService.renameFile(originalPath, metadata, false);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.fallbackName).toBeDefined();
    });
  });

  describe('renameFiles', () => {
    test('should rename multiple files', async () => {
      // Create temporary files
      await fs.mkdir(testDir, { recursive: true });
      const file1 = path.join(testDir, 'file1.pdf');
      const file2 = path.join(testDir, 'file2.pdf');
      await fs.writeFile(file1, 'content1');
      await fs.writeFile(file2, 'content2');
      
      const files = [
        {
          path: file1,
          metadata: { clientName: 'Client1', date: '2023-12-15', type: 'Invoice' }
        },
        {
          path: file2,
          metadata: { clientName: 'Client2', date: '2023-12-16', type: 'Contract' }
        }
      ];
      
      const results = await renamingService.renameFiles(files, false);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].newName).toBe('client1_2023-12-15_invoice.pdf');
      expect(results[1].newName).toBe('client2_2023-12-16_contract.pdf');
    });

    test('should handle mixed success and failure', async () => {
      const files = [
        {
          path: '/non/existent/file1.pdf',
          metadata: { clientName: 'Client1', date: '2023-12-15', type: 'Invoice' }
        },
        {
          path: '/non/existent/file2.pdf',
          metadata: { clientName: 'Client2', date: '2023-12-16', type: 'Contract' }
        }
      ];
      
      const results = await renamingService.renameFiles(files, false);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(false);
    });
  });

  describe('batchRename', () => {
    test('should process batch with progress callback', async () => {
      // Create temporary files
      await fs.mkdir(testDir, { recursive: true });
      const file1 = path.join(testDir, 'file1.pdf');
      const file2 = path.join(testDir, 'file2.pdf');
      await fs.writeFile(file1, 'content1');
      await fs.writeFile(file2, 'content2');
      
      const files = [
        {
          path: file1,
          metadata: { clientName: 'Client1', date: '2023-12-15', type: 'Invoice' }
        },
        {
          path: file2,
          metadata: { clientName: 'Client2', date: '2023-12-16', type: 'Contract' }
        }
      ];
      
      const progressUpdates = [];
      const progressCallback = (progress) => {
        progressUpdates.push(progress);
      };
      
      const result = await renamingService.batchRename(files, progressCallback, false);
      
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(progressUpdates).toHaveLength(2);
      expect(progressUpdates[0].current).toBe(1);
      expect(progressUpdates[1].current).toBe(2);
    });

    test('should handle empty file list', async () => {
      const result = await renamingService.batchRename([], null, false);
      
      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complex filename scenarios', async () => {
      // Create temporary file
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'complex file name (2023).pdf');
      await fs.writeFile(testFile, 'test content');
      
      const metadata = {
        clientName: 'Acme Corp. & Associates',
        date: '2023-12-15',
        type: 'Legal Document'
      };
      
      const result = await renamingService.renameFile(testFile, metadata, false);
      
      expect(result.success).toBe(true);
      expect(result.newName).toBe('acme_corp._associates_2023-12-15_legal_document.pdf');
    });

    test('should handle duplicate prevention', async () => {
      // Create temporary files
      await fs.mkdir(testDir, { recursive: true });
      const file1 = path.join(testDir, 'test.pdf');
      const file2 = path.join(testDir, 'test_client_2023-12-15_invoice.pdf');
      await fs.writeFile(file1, 'content1');
      await fs.writeFile(file2, 'content2');
      
      const metadata = {
        clientName: 'Test Client',
        date: '2023-12-15',
        type: 'Invoice'
      };
      
      const result = await renamingService.renameFile(file1, metadata, false);
      
      expect(result.success).toBe(true);
      expect(result.newName).toBe('test_client_2023-12-15_invoice-1.pdf');
    });
  });
});
