const TableExtractorService = require('../../src/services/tableExtractor');
const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs');
jest.mock('child_process');
jest.mock('pdf-parse', () => jest.fn());

describe('TableExtractorService', () => {
  let tableExtractor;
  let mockSpawn;
  let mockPdfParse;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fs.existsSync
    fs.existsSync.mockReturnValue(true);
    
    // Mock spawn
    const { spawn } = require('child_process');
    mockSpawn = jest.fn();
    spawn.mockImplementation(mockSpawn);
    
    // Mock pdf-parse
    mockPdfParse = require('pdf-parse');
    mockPdfParse.mockResolvedValue({
      text: 'Sample PDF text content',
      numpages: 1
    });
    
    // Create new instance
    tableExtractor = new TableExtractorService({
      debug: true,
      timeout: 5000
    });
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const extractor = new TableExtractorService();
      expect(extractor.options.primaryMethod).toBe('pdfplumber');
      expect(extractor.options.fallbackMethods).toEqual(['pdf2table', 'regex']);
      expect(extractor.options.minConfidence).toBe(0.7);
      expect(extractor.options.timeout).toBe(30000);
      expect(extractor.options.debug).toBe(false);
    });

    test('should initialize with custom options', () => {
      const customOptions = {
        primaryMethod: 'pdf2table',
        fallbackMethods: ['regex'],
        minConfidence: 0.8,
        timeout: 10000,
        debug: true
      };
      const extractor = new TableExtractorService(customOptions);
      expect(extractor.options).toEqual(expect.objectContaining(customOptions));
    });

    test('should initialize stats correctly', () => {
      expect(tableExtractor.stats).toEqual({
        totalExtractions: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        methodUsage: {},
        averageConfidence: 0
      });
    });
  });

  describe('extractTables', () => {
    test('should return error when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      
      const result = await tableExtractor.extractTables('/nonexistent/file.pdf');
      
      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.errors).toContain('File not found: /nonexistent/file.pdf');
      expect(result.metadata.method).toBe('none');
    });

    test('should handle successful pdfplumber extraction', async () => {
      const mockPythonOutput = JSON.stringify({
        success: true,
        tables: [
          {
            page: 1,
            table: 1,
            data: [
              ['Name', 'Age', 'City'],
              ['John', '25', 'New York'],
              ['Jane', '30', 'Los Angeles']
            ],
            rows: 3,
            columns: 3,
            method: 'pdfplumber'
          }
        ],
        confidence: 0.9,
        method: 'pdfplumber',
        pageCount: 1
      });

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockPythonOutput), 10);
        }
      });

      mockSpawn.mockReturnValue(mockProcess);

      const result = await tableExtractor.extractTables('/test/file.pdf');

      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]).toEqual({
        page: 1,
        table: 1,
        data: [
          ['Name', 'Age', 'City'],
          ['John', '25', 'New York'],
          ['Jane', '30', 'Los Angeles']
        ],
        rows: 3,
        columns: 3,
        method: 'pdfplumber'
      });
      expect(result.metadata.confidence).toBe(0.9);
      expect(result.metadata.method).toBe('pdfplumber');
    });

    test('should handle pdfplumber extraction failure', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
        })
      };

      mockProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('Python error'), 10);
        }
      });

      mockSpawn.mockReturnValue(mockProcess);

      const result = await tableExtractor.extractTables('/test/file.pdf');

      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.errors).toContain('Python process failed with code 1: Python error');
    });

    test('should handle JSON parsing error', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('invalid json'), 10);
        }
      });

      mockSpawn.mockReturnValue(mockProcess);

      const result = await tableExtractor.extractTables('/test/file.pdf');

      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.errors.some(error => error.includes('Failed to parse output:'))).toBe(true);
    });

    test('should try fallback methods when primary fails', async () => {
      // Mock primary method failure
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
        })
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await tableExtractor.extractTables('/test/file.pdf');

      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      // Should have tried primary method and fallbacks
      expect(mockSpawn).toHaveBeenCalled();
    });

    test('should update statistics correctly', async () => {
      const mockPythonOutput = JSON.stringify({
        success: true,
        tables: [],
        confidence: 0.8,
        method: 'pdfplumber',
        pageCount: 1
      });

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };

      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(mockPythonOutput), 10);
        }
      });

      mockSpawn.mockReturnValue(mockProcess);

      await tableExtractor.extractTables('/test/file.pdf');

      expect(tableExtractor.stats.totalExtractions).toBe(1);
      expect(tableExtractor.stats.successfulExtractions).toBe(1);
      expect(tableExtractor.stats.failedExtractions).toBe(0);
      expect(tableExtractor.stats.methodUsage.pdfplumber).toBe(1);
      expect(tableExtractor.stats.averageConfidence).toBe(0.8);
    });
  });

  describe('extractWithMethod', () => {
    test('should call correct method for pdfplumber', async () => {
      const extractWithPdfplumberSpy = jest.spyOn(tableExtractor, 'extractWithPdfplumber');
      extractWithPdfplumberSpy.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0.8,
        method: 'pdfplumber'
      });

      await tableExtractor.extractWithMethod('/test/file.pdf', 'pdfplumber');

      expect(extractWithPdfplumberSpy).toHaveBeenCalledWith('/test/file.pdf', {});
    });

    test('should call correct method for pdf2table', async () => {
      const extractWithPdf2tableSpy = jest.spyOn(tableExtractor, 'extractWithPdf2table');
      extractWithPdf2tableSpy.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0.8,
        method: 'pdf2table'
      });

      await tableExtractor.extractWithMethod('/test/file.pdf', 'pdf2table');

      expect(extractWithPdf2tableSpy).toHaveBeenCalledWith('/test/file.pdf', {});
    });

    test('should call correct method for regex', async () => {
      const extractWithRegexSpy = jest.spyOn(tableExtractor, 'extractWithRegex');
      extractWithRegexSpy.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0.8,
        method: 'regex'
      });

      await tableExtractor.extractWithMethod('/test/file.pdf', 'regex');

      expect(extractWithRegexSpy).toHaveBeenCalledWith('/test/file.pdf', {});
    });

    test('should throw error for unknown method', async () => {
      await expect(
        tableExtractor.extractWithMethod('/test/file.pdf', 'unknown')
      ).rejects.toThrow('Unknown extraction method: unknown');
    });
  });

  describe('extractWithPdf2table', () => {
    test('should handle file not found error', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory, open \'/nonexistent/file.pdf\'');
      });
      
      const result = await tableExtractor.extractWithPdf2table('/nonexistent/file.pdf');
      
      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('pdf2table');
      expect(result.errors[0]).toContain('ENOENT: no such file or directory');
    });

    test('should extract tables from valid PDF', async () => {
      // Mock fs.readFileSync to return a mock PDF buffer
      const mockPdfBuffer = Buffer.from('mock pdf content');
      fs.readFileSync.mockReturnValue(mockPdfBuffer);
      
      // Mock pdf-parse to return structured data
      mockPdfParse.mockResolvedValue({
        text: 'Name    Age    City\nJohn    25     New York\nJane    30     Los Angeles',
        numpages: 1
      });
      
      const result = await tableExtractor.extractWithPdf2table('/test/file.pdf');
      
      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].method).toBe('pdf2table');
      expect(result.tables[0].data).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'New York'],
        ['Jane', '30', 'Los Angeles']
      ]);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('extractWithRegex', () => {
    test('should handle file not found error', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory, open \'/nonexistent/file.pdf\'');
      });
      
      const result = await tableExtractor.extractWithRegex('/nonexistent/file.pdf');
      
      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('regex');
      expect(result.errors[0]).toContain('ENOENT: no such file or directory');
    });

    test('should extract tables using regex patterns', async () => {
      // Mock fs.readFileSync to return a mock PDF buffer
      const mockPdfBuffer = Buffer.from('mock pdf content');
      fs.readFileSync.mockReturnValue(mockPdfBuffer);
      
      // Mock pdf-parse to return structured data with table-like content
      mockPdfParse.mockResolvedValue({
        text: 'Name    Age    City\nJohn    25     New York\nJane    30     Los Angeles',
        numpages: 1
      });
      
      const result = await tableExtractor.extractWithRegex('/test/file.pdf');
      
      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].method).toBe('regex');
      expect(result.tables[0].data).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'New York'],
        ['Jane', '30', 'Los Angeles']
      ]);
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should handle empty PDF content', async () => {
      // Mock fs.readFileSync to return a mock PDF buffer
      const mockPdfBuffer = Buffer.from('mock pdf content');
      fs.readFileSync.mockReturnValue(mockPdfBuffer);
      
      // Mock pdf-parse to return empty content
      mockPdfParse.mockResolvedValue({
        text: '',
        numpages: 1
      });
      
      const result = await tableExtractor.extractWithRegex('/test/file.pdf');
      
      expect(result.success).toBe(false);
      expect(result.tables).toEqual([]);
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('regex');
      expect(result.errors).toContain('No text content found in PDF');
    });
  });

  describe('updateStats', () => {
    test('should update stats for successful extraction', () => {
      tableExtractor.updateStats(true, 'pdfplumber', 0.8, 1000);
      
      expect(tableExtractor.stats.successfulExtractions).toBe(1);
      expect(tableExtractor.stats.failedExtractions).toBe(0);
      expect(tableExtractor.stats.methodUsage.pdfplumber).toBe(1);
      expect(tableExtractor.stats.averageConfidence).toBe(0.8);
    });

    test('should update stats for failed extraction', () => {
      tableExtractor.updateStats(false, 'pdf2table', 0.0, 500);
      
      expect(tableExtractor.stats.successfulExtractions).toBe(0);
      expect(tableExtractor.stats.failedExtractions).toBe(1);
      expect(tableExtractor.stats.methodUsage.pdf2table).toBe(1);
      expect(tableExtractor.stats.averageConfidence).toBe(0);
    });

    test('should calculate average confidence correctly', () => {
      tableExtractor.updateStats(true, 'pdfplumber', 0.6, 1000);
      tableExtractor.updateStats(true, 'pdfplumber', 0.8, 1000);
      
      expect(tableExtractor.stats.averageConfidence).toBe(0.7);
    });
  });

  describe('getStats', () => {
    test('should return current statistics', () => {
      tableExtractor.stats.totalExtractions = 10;
      tableExtractor.stats.successfulExtractions = 8;
      tableExtractor.stats.failedExtractions = 2;
      tableExtractor.stats.methodUsage = { pdfplumber: 5, pdf2table: 3 };
      tableExtractor.stats.averageConfidence = 0.75;

      const stats = tableExtractor.getStats();
      
      expect(stats.totalExtractions).toBe(10);
      expect(stats.successfulExtractions).toBe(8);
      expect(stats.failedExtractions).toBe(2);
      expect(stats.methodUsage).toEqual({ pdfplumber: 5, pdf2table: 3 });
      expect(stats.averageConfidence).toBe(0.75);
      expect(stats.successRate).toBe(0.8);
    });

    test('should calculate success rate correctly', () => {
      tableExtractor.stats.totalExtractions = 0;
      const stats = tableExtractor.getStats();
      expect(stats.successRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    test('should reset all statistics', () => {
      tableExtractor.stats.totalExtractions = 10;
      tableExtractor.stats.successfulExtractions = 8;
      tableExtractor.stats.failedExtractions = 2;
      tableExtractor.stats.methodUsage = { pdfplumber: 5 };
      tableExtractor.stats.averageConfidence = 0.75;

      tableExtractor.resetStats();
      
      expect(tableExtractor.stats).toEqual({
        totalExtractions: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        methodUsage: {},
        averageConfidence: 0
      });
    });
  });

  describe('log', () => {
    test('should log when debug is enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      tableExtractor.log('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('[TableExtractor] Test message');
      
      consoleSpy.mockRestore();
    });

    test('should not log when debug is disabled', () => {
      const extractor = new TableExtractorService({ debug: false });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      extractor.log('Test message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});
