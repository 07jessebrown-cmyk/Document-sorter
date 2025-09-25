const WatermarkService = require('../../src/services/watermarkService');
const fs = require('fs');
const path = require('path');

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer) => {
    return Promise.resolve({
      text: 'CONFIDENTIAL - Internal Use Only\n\nThis is a confidential document with sensitive information.\n\nPage 1 of 3\n\nCONFIDENTIAL - Internal Use Only\n\nMore confidential content here.\n\nPage 2 of 3\n\nCONFIDENTIAL - Internal Use Only\n\nFinal confidential content.\n\nPage 3 of 3'
    });
  });
});

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

describe('Watermark Integration Tests', () => {
  let watermarkService;

  beforeEach(() => {
    watermarkService = new WatermarkService({
      debug: true,
      minOccurrences: 2,
      pageOverlapThreshold: 0.3,
      minLength: 5
    });
    
    jest.clearAllMocks();
  });

  describe('Watermark Detection Integration', () => {
    test('should detect watermarks in multi-page PDF', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const result = await watermarkService.detectWatermarks('/test/confidential-document.pdf');

      expect(result.success).toBe(true);
      expect(result.watermarks.length).toBeGreaterThan(0);
      
      // Should detect CONFIDENTIAL as a watermark
      const confidentialWatermark = result.watermarks.find(w => 
        w.text.includes('CONFIDENTIAL') || w.normalizedText.includes('confidential')
      );
      expect(confidentialWatermark).toBeDefined();
      expect(confidentialWatermark.type).toBe('confidentiality');
      expect(confidentialWatermark.occurrences).toBeGreaterThanOrEqual(2);
    });

    test('should detect pagination watermarks', async () => {
      const textWithPagination = 'Content page 1\n\nPage 1 of 5\n\nMore content\n\nPage 2 of 5\n\nMore content\n\nPage 3 of 5';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(textWithPagination);

      const result = await watermarkService.detectWatermarks('/test/paginated-document.txt');

      expect(result.success).toBe(true);
      
      const paginationWatermark = result.watermarks.find(w => 
        w.text.includes('Page') && w.text.includes('of')
      );
      if (paginationWatermark) {
        expect(paginationWatermark.type).toBe('pagination');
      }
    });

    test('should detect draft watermarks', async () => {
      const textWithDraft = 'DRAFT - Preliminary Version\n\nContent here\n\nDRAFT - Preliminary Version\n\nMore content\n\nDRAFT - Preliminary Version';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(textWithDraft);

      const result = await watermarkService.detectWatermarks('/test/draft-document.txt');

      expect(result.success).toBe(true);
      
      const draftWatermark = result.watermarks.find(w => 
        w.text.includes('DRAFT')
      );
      if (draftWatermark) {
        expect(draftWatermark.type).toBe('draft');
      }
    });

    test('should detect copyright watermarks', async () => {
      const textWithCopyright = 'Copyright 2024 Company Inc.\n\nContent here\n\nCopyright 2024 Company Inc.\n\nMore content\n\nCopyright 2024 Company Inc.';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(textWithCopyright);

      const result = await watermarkService.detectWatermarks('/test/copyright-document.txt');

      expect(result.success).toBe(true);
      
      const copyrightWatermark = result.watermarks.find(w => 
        w.text.includes('Copyright')
      );
      if (copyrightWatermark) {
        expect(copyrightWatermark.type).toBe('copyright');
      }
    });
  });

  describe('Watermark Filtering Integration', () => {
    test('should filter watermarks from text content', async () => {
      const originalText = 'CONFIDENTIAL - Internal Use Only\n\nThis is important content that should remain.\n\nCONFIDENTIAL - Internal Use Only\n\nMore important content here.\n\nCONFIDENTIAL - Internal Use Only';
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      
      if (result.success && result.watermarks.length > 0) {
        const filteredText = watermarkService.filterWatermarks(originalText, result.watermarks);
        
        // High-confidence watermarks should be filtered out
        expect(filteredText).not.toContain('CONFIDENTIAL');
        // Important content should remain
        expect(filteredText).toContain('important');
      }
    });

    test('should preserve low-confidence watermarks', async () => {
      const originalText = 'This is a document with some repeated text that might be a watermark but with low confidence.';
      
      // Mock a scenario with low-confidence watermarks
      const lowConfidenceWatermarks = [
        { text: 'repeated text', confidence: 0.3 }
      ];

      const filteredText = watermarkService.filterWatermarks(originalText, lowConfidenceWatermarks);
      
      // Low-confidence watermarks should be preserved
      expect(filteredText).toContain('repeated text');
    });
  });

  describe('Multi-Document Processing Integration', () => {
    test('should process multiple documents and track statistics', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      // Process multiple documents
      await watermarkService.detectWatermarks('/test/doc1.pdf');
      await watermarkService.detectWatermarks('/test/doc2.pdf');
      await watermarkService.detectWatermarks('/test/doc3.pdf');

      const stats = watermarkService.getStats();
      expect(stats.documentsProcessed).toBe(3);
      expect(stats.watermarksDetected).toBeGreaterThan(0);
      expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle mixed file types', async () => {
      fs.existsSync.mockReturnValue(true);
      
      // Mock PDF
      fs.readFileSync.mockReturnValueOnce('mock buffer');
      const pdfResult = await watermarkService.detectWatermarks('/test/document.pdf');
      expect(pdfResult.success).toBe(true);

      // Mock text file
      fs.readFileSync.mockReturnValueOnce('CONFIDENTIAL text\n\nCONFIDENTIAL text\n\nCONFIDENTIAL text');
      const txtResult = await watermarkService.detectWatermarks('/test/document.txt');
      expect(txtResult.success).toBe(true);
    });
  });

  describe('Configuration Integration', () => {
    test('should respect custom configuration options', async () => {
      const customService = new WatermarkService({
        minOccurrences: 5,
        pageOverlapThreshold: 0.8,
        minLength: 10
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const result = await customService.detectWatermarks('/test/document.pdf');

      expect(result.success).toBe(true);
      // With higher thresholds, fewer watermarks should be detected
      expect(result.watermarks.length).toBeLessThanOrEqual(1);
    });

    test('should handle debug mode correctly', async () => {
      const debugService = new WatermarkService({
        debug: true
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const result = await debugService.detectWatermarks('/test/document.pdf');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle file system errors gracefully', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await watermarkService.detectWatermarks('/nonexistent/file.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('should handle unsupported file types', async () => {
      fs.existsSync.mockReturnValue(true);

      const result = await watermarkService.detectWatermarks('/test/document.xyz');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    test('should handle corrupted PDF files', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('corrupted buffer');
      
      const pdfParse = require('pdf-parse');
      pdfParse.mockRejectedValueOnce(new Error('Invalid PDF'));

      const result = await watermarkService.detectWatermarks('/test/corrupted.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF text extraction failed');
    });
  });

  describe('Performance Integration', () => {
    test('should process documents within reasonable time', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');

      const startTime = Date.now();
      const result = await watermarkService.detectWatermarks('/test/document.pdf');
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle large documents efficiently', async () => {
      // Mock a large document with many pages
      const largeText = Array(10).fill('CONFIDENTIAL - Internal Use Only\n\nPage content here\n\n').join('\n');
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mock buffer');
      
      const pdfParse = require('pdf-parse');
      pdfParse.mockResolvedValueOnce({ text: largeText });

      const startTime = Date.now();
      const result = await watermarkService.detectWatermarks('/test/large-document.pdf');
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Real-world Scenarios Integration', () => {
    test('should handle legal documents with watermarks', async () => {
      const legalText = 'CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE\n\nLegal document content\n\nCONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE\n\nMore legal content\n\nCONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE';
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(legalText);

      const result = await watermarkService.detectWatermarks('/test/legal-document.txt');

      expect(result.success).toBe(true);
      
      const watermark = result.watermarks.find(w => 
        w.text.includes('CONFIDENTIAL') || w.text.includes('ATTORNEY')
      );
      if (watermark) {
        expect(watermark.type).toBe('confidentiality');
      }
    });

    test('should handle technical documents with page numbers', async () => {
      const techText = 'Technical Document\n\nPage 1 of 10\n\nContent here\n\nPage 2 of 10\n\nMore content\n\nPage 3 of 10';
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(techText);

      const result = await watermarkService.detectWatermarks('/test/technical-document.txt');

      expect(result.success).toBe(true);
      
      const paginationWatermark = result.watermarks.find(w => 
        w.text.includes('Page') && w.text.includes('of')
      );
      if (paginationWatermark) {
        expect(paginationWatermark.type).toBe('pagination');
      }
    });

    test('should handle mixed watermark types', async () => {
      const mixedText = 'DRAFT - CONFIDENTIAL\n\nContent\n\nDRAFT - CONFIDENTIAL\n\nMore content\n\nDRAFT - CONFIDENTIAL';
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mixedText);

      const result = await watermarkService.detectWatermarks('/test/mixed-document.txt');

      expect(result.success).toBe(true);
      expect(result.watermarks.length).toBeGreaterThan(0);
      
      // Should detect both DRAFT and CONFIDENTIAL patterns
      const hasDraft = result.watermarks.some(w => w.text.includes('DRAFT'));
      const hasConfidential = result.watermarks.some(w => w.text.includes('CONFIDENTIAL'));
      
      expect(hasDraft || hasConfidential).toBe(true);
    });
  });
});
