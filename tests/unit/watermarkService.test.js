// Mock fs first
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

// Mock pdf-parse
const mockPdfParse = jest.fn().mockResolvedValue({
  text: `This is a test document with CONFIDENTIAL watermark on every page. Page 1 content here.\n\nPage 2 content.\n\nPage 3 content.`
});

jest.mock('pdf-parse', () => mockPdfParse);

const fs = require('fs');
const path = require('path');
const WatermarkService = require('../../src/services/watermarkService');

describe('WatermarkService', () => {
  let watermarkService;

  beforeEach(() => {
    watermarkService = new WatermarkService({
      debug: true,
      minOccurrences: 2,
      pageOverlapThreshold: 0.3
    });
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up default mock behavior
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('mock buffer');
  });


  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const service = new WatermarkService();
      expect(service.options.minOccurrences).toBe(3);
      expect(service.options.minLength).toBe(5);
      expect(service.options.maxLength).toBe(100);
      expect(service.options.similarityThreshold).toBe(0.8);
      expect(service.options.pageOverlapThreshold).toBe(0.5);
    });

    test('should initialize with custom options', () => {
      const service = new WatermarkService({
        minOccurrences: 5,
        minLength: 10,
        debug: true
      });
      expect(service.options.minOccurrences).toBe(5);
      expect(service.options.minLength).toBe(10);
      expect(service.options.debug).toBe(true);
    });
  });

  describe('File Detection', () => {
    test('should detect PDF files', () => {
      const result = watermarkService.detectWatermarks('/test/document.pdf');
      expect(result).toBeDefined();
    });

    test('should detect text files', () => {
      const result = watermarkService.detectWatermarks('/test/document.txt');
      expect(result).toBeDefined();
    });

    test('should handle unsupported file types', async () => {
      const result = await watermarkService.detectWatermarks('/test/document.xyz');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    test('should handle non-existent files', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await watermarkService.detectWatermarks('/nonexistent/file.pdf');
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  describe('Text Extraction', () => {
    test('should extract text from PDF', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      // Debug: Check if pdf-parse is mocked
      const pdfParse = require('pdf-parse');
      console.log('pdf-parse type:', typeof pdfParse);
      console.log('pdf-parse is function:', typeof pdfParse === 'function');
      
      // Try calling the mock directly
      try {
        const mockResult = await pdfParse('test buffer');
        console.log('Mock result:', mockResult);
      } catch (error) {
        console.log('Mock error:', error);
      }
      
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(result.success).toBe(true);
      expect(result.watermarks).toBeDefined();
    });

    test('should extract text from text files', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('This is a test document with CONFIDENTIAL watermark');
      
      const result = await watermarkService.detectWatermarks('/test/document.txt');
      expect(result.success).toBe(true);
      expect(result.watermarks).toBeDefined();
    });

    test('should handle PDF extraction errors', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const result = await watermarkService.detectWatermarks('/test/corrupted.pdf');
      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF text extraction failed');
    });

    test('should handle text file reading errors', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      const result = await watermarkService.detectWatermarks('/test/unreadable.txt');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Text file reading failed');
    });
  });

  describe('Watermark Detection', () => {
    test('should detect watermarks in text', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(result.success).toBe(true);
      expect(result.watermarks.length).toBeGreaterThan(0);
      
      const watermark = result.watermarks[0];
      expect(watermark.text).toContain('CONFIDENTIAL');
      expect(watermark.confidence).toBeGreaterThan(0);
    });

    test('should classify watermark types correctly', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(result.success).toBe(true);
      
      const watermark = result.watermarks[0];
      expect(watermark.type).toBe('confidentiality');
    });

    test('should calculate confidence scores', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('should detect watermark positions', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(result.success).toBe(true);
      
      const watermark = result.watermarks[0];
      expect(watermark.position).toBeDefined();
      expect(Array.isArray(watermark.position)).toBe(true);
    });
  });

  describe('Text Processing', () => {
    test('should split text into pages correctly', () => {
      const text = 'Page 1 content\n\nPage 2 content\n\nPage 3 content';
      const pages = watermarkService.splitIntoPages(text);
      expect(pages.length).toBeGreaterThan(1);
    });

    test('should extract words from text', () => {
      const text = 'This is a test document with watermarks';
      const words = watermarkService.extractWords(text);
      expect(words).toContain('watermarks');
      expect(words.length).toBeGreaterThan(0);
    });

    test('should normalize text correctly', () => {
      const text = 'CONFIDENTIAL & PROPRIETARY';
      const normalized = watermarkService.normalizeText(text);
      expect(normalized).toBe('confidential  proprietary');
    });
  });

  describe('Watermark Filtering', () => {
    test('should filter watermarks from text', () => {
      const text = 'This document contains CONFIDENTIAL information';
      const watermarks = [{
        text: 'CONFIDENTIAL',
        confidence: 0.8
      }];
      
      const filteredText = watermarkService.filterWatermarks(text, watermarks);
      expect(filteredText).not.toContain('CONFIDENTIAL');
      expect(filteredText).toContain('This document contains information');
    });
  });

  describe('Statistics', () => {
    test('should track statistics correctly', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const initialStats = watermarkService.getStats();
      expect(initialStats.documentsProcessed).toBe(0);

      await watermarkService.detectWatermarks('/test/document.pdf');

      const updatedStats = watermarkService.getStats();
      expect(updatedStats.documentsProcessed).toBe(1);
      expect(updatedStats.processingTime).toBeGreaterThanOrEqual(0);
    });

    test('should reset statistics', () => {
      watermarkService.stats.documentsProcessed = 5;
      watermarkService.resetStats();
      
      const stats = watermarkService.getStats();
      expect(stats.documentsProcessed).toBe(0);
      expect(stats.watermarksDetected).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty text content', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('');
      
      const result = await watermarkService.detectWatermarks('/test/empty.txt');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No text content found');
    });

    test('should handle very short text', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('Hi');
      
      const result = await watermarkService.detectWatermarks('/test/short.txt');
      expect(result.success).toBe(true);
      expect(result.watermarks.length).toBe(0);
    });

    test('should handle text with no watermarks', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('This is just regular text without any watermarks');
      
      const result = await watermarkService.detectWatermarks('/test/regular.txt');
      expect(result.success).toBe(true);
      expect(result.watermarks.length).toBe(0);
    });
  });
});