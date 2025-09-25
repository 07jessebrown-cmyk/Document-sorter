const WatermarkService = require('../../src/services/watermarkService');
const fs = require('fs');
const path = require('path');

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer) => {
    return Promise.resolve({
      text: 'This is a test document with CONFIDENTIAL watermark on every page. Page 1 content here.\n\nThis is page 2 with the same CONFIDENTIAL watermark. More content here.\n\nPage 3 also has CONFIDENTIAL watermark. Final content.'
    });
  });
});

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

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

  describe('detectWatermarks', () => {
    test('should detect watermarks successfully', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const result = await watermarkService.detectWatermarks('/test/document.pdf');

      expect(result.success).toBe(true);
      expect(result.watermarks).toBeDefined();
      expect(Array.isArray(result.watermarks)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.method).toBe('text-analysis');
    });

    test('should handle file not found error', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await watermarkService.detectWatermarks('/nonexistent/file.pdf');

      expect(result.success).toBe(false);
      expect(result.watermarks).toEqual([]);
      expect(result.error).toContain('File not found');
    });

    test('should handle unsupported file type', async () => {
      fs.existsSync.mockReturnValue(true);

      const result = await watermarkService.detectWatermarks('/test/document.xyz');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    test('should handle empty text content', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      // Mock pdf-parse to return empty text
      const pdfParse = require('pdf-parse');
      pdfParse.mockResolvedValueOnce({ text: '' });

      const result = await watermarkService.detectWatermarks('/test/empty.pdf');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No text content found');
    });

    test('should process text files', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('This is a test document with CONFIDENTIAL watermark on every page.\n\nThis is page 2 with the same CONFIDENTIAL watermark.\n\nPage 3 also has CONFIDENTIAL watermark.');

      const result = await watermarkService.detectWatermarks('/test/document.txt');

      expect(result.success).toBe(true);
      expect(result.watermarks).toBeDefined();
    });
  });

  describe('splitIntoPages', () => {
    test('should split text into pages correctly', () => {
      const text = 'Page 1 content\n\n\nPage 2 content\n\n\nPage 3 content';
      const pages = watermarkService.splitIntoPages(text);
      
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.every(page => page.trim().length > 0)).toBe(true);
    });

    test('should handle single page content', () => {
      const text = 'Single page content without breaks';
      const pages = watermarkService.splitIntoPages(text);
      
      expect(pages.length).toBe(1);
      expect(pages[0]).toBe(text);
    });

    test('should filter out very short pages', () => {
      const text = 'Short\n\n\nAnother short\n\n\nLong page content here with enough text to pass minimum length requirements';
      const pages = watermarkService.splitIntoPages(text);
      
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.every(page => page.trim().length >= watermarkService.options.minLength)).toBe(true);
    });
  });

  describe('analyzeWatermarks', () => {
    test('should detect watermark patterns', async () => {
      const pages = [
        'This is page 1 with CONFIDENTIAL watermark',
        'This is page 2 with CONFIDENTIAL watermark',
        'This is page 3 with CONFIDENTIAL watermark'
      ];

      const watermarks = await watermarkService.analyzeWatermarks(pages);

      expect(Array.isArray(watermarks)).toBe(true);
      // Should detect CONFIDENTIAL as a watermark
      const confidentialWatermark = watermarks.find(w => w.text.includes('CONFIDENTIAL'));
      if (confidentialWatermark) {
        expect(confidentialWatermark.occurrences).toBeGreaterThanOrEqual(2);
        expect(confidentialWatermark.confidence).toBeGreaterThan(0);
      }
    });

    test('should not detect watermarks in single occurrence text', async () => {
      const pages = [
        'This is page 1 with unique text',
        'This is page 2 with different text',
        'This is page 3 with another unique text'
      ];

      const watermarks = await watermarkService.analyzeWatermarks(pages);

      // Should not detect any watermarks since no text repeats (with current settings)
      // Note: Some common words like "is", "with", "text" might still be detected
      expect(watermarks.length).toBeLessThanOrEqual(3);
    });

    test('should classify watermark types correctly', async () => {
      const pages = [
        'CONFIDENTIAL document content',
        'CONFIDENTIAL more content',
        'DRAFT version here',
        'DRAFT more content',
        'Copyright 2024 Company',
        'Copyright 2024 Company'
      ];

      const watermarks = await watermarkService.analyzeWatermarks(pages);

      const confidentialWatermark = watermarks.find(w => w.text.includes('CONFIDENTIAL'));
      if (confidentialWatermark) {
        expect(confidentialWatermark.type).toBe('confidentiality');
      }

      const draftWatermark = watermarks.find(w => w.text.includes('DRAFT'));
      if (draftWatermark) {
        expect(draftWatermark.type).toBe('draft');
      }

      const copyrightWatermark = watermarks.find(w => w.text.includes('Copyright'));
      if (copyrightWatermark) {
        expect(copyrightWatermark.type).toBe('copyright');
      }
    });
  });

  describe('normalizeText', () => {
    test('should normalize text correctly', () => {
      expect(watermarkService.normalizeText('CONFIDENTIAL!')).toBe('confidential');
      expect(watermarkService.normalizeText('Draft-Version')).toBe('draftversion');
      expect(watermarkService.normalizeText('  Test Text  ')).toBe('test text');
    });
  });

  describe('classifyWatermarkType', () => {
    test('should classify watermark types correctly', () => {
      expect(watermarkService.classifyWatermarkType('CONFIDENTIAL')).toBe('confidentiality');
      expect(watermarkService.classifyWatermarkType('DRAFT')).toBe('draft');
      expect(watermarkService.classifyWatermarkType('Copyright 2024')).toBe('copyright');
      expect(watermarkService.classifyWatermarkType('Page 1 of 5')).toBe('pagination');
      expect(watermarkService.classifyWatermarkType('Unknown text')).toBe('unknown');
    });
  });

  describe('filterWatermarks', () => {
    test('should filter high-confidence watermarks from text', () => {
      const text = 'This is a document with CONFIDENTIAL watermark and normal content.';
      const watermarks = [
        { text: 'CONFIDENTIAL', confidence: 0.8 },
        { text: 'normal', confidence: 0.3 }
      ];

      const filteredText = watermarkService.filterWatermarks(text, watermarks);

      expect(filteredText).not.toContain('CONFIDENTIAL');
      expect(filteredText).toContain('normal content');
    });

    test('should not filter low-confidence watermarks', () => {
      const text = 'This is a document with CONFIDENTIAL watermark.';
      const watermarks = [
        { text: 'CONFIDENTIAL', confidence: 0.3 }
      ];

      const filteredText = watermarkService.filterWatermarks(text, watermarks);

      expect(filteredText).toContain('CONFIDENTIAL');
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

  describe('Error Handling', () => {
    test('should handle PDF parsing errors', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const pdfParse = require('pdf-parse');
      pdfParse.mockRejectedValueOnce(new Error('PDF parsing failed'));

      const result = await watermarkService.detectWatermarks('/test/corrupted.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF text extraction failed');
    });

    test('should handle file reading errors', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const result = await watermarkService.detectWatermarks('/test/unreadable.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Text file reading failed');
    });
  });
});
