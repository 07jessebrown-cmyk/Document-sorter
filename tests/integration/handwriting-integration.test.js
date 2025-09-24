const HandwritingService = require('../../src/services/handwritingService');
const fs = require('fs');
const path = require('path');

describe('Handwriting Integration Tests', () => {
  let handwritingService;

  beforeAll(async () => {
    // Initialize handwriting service for integration tests
    handwritingService = new HandwritingService({
      debug: true,
      workerPoolSize: 1,
      minConfidence: 0.2,
      timeout: 30000 // Shorter timeout for tests
    });
  });

  afterAll(async () => {
    if (handwritingService) {
      await handwritingService.terminate();
    }
  });

  describe('Handwriting Detection Integration', () => {
    test('should detect handwriting in sample text', async () => {
      // Test with text that contains handwriting patterns
      const testTexts = [
        'This is a handwritten signature document',
        'Please sign here and return',
        'Handwritten notes from meeting',
        'Personal handwritten memo',
        'Cursive script writing sample'
      ];

      for (const text of testTexts) {
        const result = handwritingService.analyzeTextForHandwriting(text);
        
        expect(result.hasHandwriting).toBe(true);
        expect(result.patterns.length).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    test('should not detect handwriting in printed text', async () => {
      const testTexts = [
        'This is clearly printed text',
        'INVOICE #12345',
        'REGULAR DOCUMENT',
        'Standard business letter'
      ];

      for (const text of testTexts) {
        const result = handwritingService.analyzeTextForHandwriting(text);
        
        expect(result.hasHandwriting).toBe(false);
        expect(result.patterns).toEqual([]);
        expect(result.confidence).toBe(0);
      }
    });

    test('should detect signature patterns specifically', async () => {
      const signatureTexts = [
        'Signature: John Doe',
        'Signed by: Jane Smith',
        'Authorized signature here',
        'Please sign and date'
      ];

      for (const text of signatureTexts) {
        const result = handwritingService.analyzeTextForHandwriting(text);
        
        expect(result.hasHandwriting).toBe(true);
        expect(result.patterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Handwriting Characteristics Analysis', () => {
    test('should analyze signature characteristics correctly', () => {
      const text = 'Signature here';
      const words = [
        { text: 'Signature', confidence: 0.15, bbox: { x0: 0, y0: 0, x1: 60, y1: 20 } },
        { text: 'here', confidence: 0.25, bbox: { x0: 70, y0: 0, x1: 100, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('signature');
      expect(result.isSignature).toBe(true);
      expect(result.confidence).toBe(0.8);
    });

    test('should analyze handwritten characteristics correctly', () => {
      const text = 'handwritten notes';
      const words = [
        { text: 'handwritten', confidence: 0.3, bbox: { x0: 0, y0: 0, x1: 80, y1: 20 } },
        { text: 'notes', confidence: 0.4, bbox: { x0: 90, y0: 0, x1: 130, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('handwritten');
      expect(result.isSignature).toBe(false);
      expect(result.confidence).toBe(0.6);
    });

    test('should analyze printed characteristics correctly', () => {
      const text = 'CLEAR PRINTED TEXT';
      const words = [
        { text: 'CLEAR', confidence: 0.95, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
        { text: 'PRINTED', confidence: 0.9, bbox: { x0: 50, y0: 0, x1: 110, y1: 20 } },
        { text: 'TEXT', confidence: 0.85, bbox: { x0: 120, y0: 0, x1: 160, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(false);
      expect(result.type).toBe('printed');
      expect(result.isSignature).toBe(false);
      expect(result.confidence).toBe(0.8);
    });

    test('should flag manual review for low confidence handwriting', () => {
      const text = 'unclear handwriting';
      const words = [
        { text: 'unclear', confidence: 0.1, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
        { text: 'handwriting', confidence: 0.15, bbox: { x0: 60, y0: 0, x1: 150, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.requiresManualReview).toBe(true);
      expect(result.type).toBe('handwritten');
    });

    test('should detect mixed content correctly', () => {
      const text = 'Printed header with notes';
      const words = [
        { text: 'Printed', confidence: 0.8, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
        { text: 'header', confidence: 0.85, bbox: { x0: 60, y0: 0, x1: 110, y1: 20 } },
        { text: 'with', confidence: 0.3, bbox: { x0: 120, y0: 0, x1: 150, y1: 20 } },
        { text: 'notes', confidence: 0.35, bbox: { x0: 160, y0: 0, x1: 200, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('handwritten');
      expect(result.isSignature).toBe(false);
    });
  });

  describe('Service Configuration Integration', () => {
    test('should initialize with correct handwriting-specific options', () => {
      expect(handwritingService.options.handwritingPatterns).toContain('signature');
      expect(handwritingService.options.handwritingPatterns).toContain('manuscript');
      expect(handwritingService.options.handwritingPatterns).toContain('cursive');
      expect(handwritingService.options.handwritingPatterns).toContain('script');
    });

    test('should have correct confidence thresholds', () => {
      expect(handwritingService.options.confidenceThresholds.signature).toBe(0.15);
      expect(handwritingService.options.confidenceThresholds.handwritten).toBe(0.25);
      expect(handwritingService.options.confidenceThresholds.printed).toBe(0.7);
      expect(handwritingService.options.confidenceThresholds.mixed).toBe(0.4);
    });

    test('should have handwriting-optimized preprocessing options', () => {
      expect(handwritingService.options.preprocessing.sharpen).toBe(true);
      expect(handwritingService.options.preprocessing.autoRotate).toBe(true);
      expect(handwritingService.options.preprocessing.minWidth).toBe(200);
      expect(handwritingService.options.preprocessing.minHeight).toBe(200);
    });

    test('should have longer timeout for handwriting processing', () => {
      expect(handwritingService.options.timeout).toBe(30000);
    });

    test('should have smaller worker pool for handwriting', () => {
      expect(handwritingService.options.workerPoolSize).toBe(1);
    });
  });

  describe('Statistics Integration', () => {
    beforeEach(() => {
      handwritingService.resetStats();
    });

    test('should track handwriting-specific statistics', () => {
      const stats = handwritingService.getStats();
      
      expect(stats).toHaveProperty('handwritingDetected');
      expect(stats).toHaveProperty('signaturesDetected');
      expect(stats).toHaveProperty('manualReviewRequired');
      expect(stats).toHaveProperty('handwritingDetectionRate');
      expect(stats).toHaveProperty('signatureDetectionRate');
      expect(stats).toHaveProperty('manualReviewRate');
      expect(stats).toHaveProperty('handwritingTypes');
      
      expect(stats.handwritingTypes).toHaveProperty('signature');
      expect(stats.handwritingTypes).toHaveProperty('handwritten');
      expect(stats.handwritingTypes).toHaveProperty('printed');
      expect(stats.handwritingTypes).toHaveProperty('mixed');
    });

    test('should calculate rates correctly', () => {
      // Simulate some processing
      handwritingService.stats.totalProcessed = 10;
      handwritingService.stats.handwritingDetected = 6;
      handwritingService.stats.signaturesDetected = 2;
      handwritingService.stats.manualReviewRequired = 3;

      const stats = handwritingService.getStats();
      
      expect(stats.handwritingDetectionRate).toBe(0.6);
      expect(stats.signatureDetectionRate).toBe(0.2);
      expect(stats.manualReviewRate).toBe(0.3);
    });
  });

  describe('Language Support Integration', () => {
    test('should support multiple languages for handwriting', () => {
      const supportedLanguages = handwritingService.options.supportedLanguages;
      
      expect(supportedLanguages).toContain('eng');
      expect(supportedLanguages).toContain('spa');
      expect(supportedLanguages).toContain('fra');
      expect(supportedLanguages).toContain('deu');
      expect(supportedLanguages).toContain('ita');
      expect(supportedLanguages).toContain('por');
      expect(supportedLanguages).toContain('rus');
    });

    test('should check language support correctly', () => {
      expect(handwritingService.isLanguageSupported('eng')).toBe(true);
      expect(handwritingService.isLanguageSupported('spa')).toBe(true);
      expect(handwritingService.isLanguageSupported('fra')).toBe(true);
      expect(handwritingService.isLanguageSupported('xyz')).toBe(false);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle empty text gracefully', () => {
      const result = handwritingService.analyzeTextForHandwriting('');
      
      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    test('should handle null text gracefully', () => {
      const result = handwritingService.analyzeTextForHandwriting(null);
      
      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    test('should handle undefined text gracefully', () => {
      const result = handwritingService.analyzeTextForHandwriting(undefined);
      
      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    test('should handle empty words array gracefully', () => {
      const result = handwritingService.analyzeHandwritingCharacteristics('test', []);
      
      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('mixed');
      expect(result.requiresManualReview).toBe(false);
    });
  });

  describe('Performance Integration', () => {
    test('should process multiple texts efficiently', async () => {
      const testTexts = Array(10).fill().map((_, i) => `Test handwritten text ${i}`);
      
      const startTime = Date.now();
      
      for (const text of testTexts) {
        handwritingService.analyzeTextForHandwriting(text);
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should process 10 texts in less than 100ms
      expect(processingTime).toBeLessThan(100);
    });

    test('should handle concurrent analysis efficiently', async () => {
      const testTexts = Array(5).fill().map((_, i) => `Concurrent test ${i}`);
      
      const startTime = Date.now();
      
      const promises = testTexts.map(text => 
        Promise.resolve(handwritingService.analyzeTextForHandwriting(text))
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('Real-world Scenarios Integration', () => {
    test('should handle invoice with signature block', () => {
      const invoiceText = `
        INVOICE #12345
        Date: 2024-01-15
        Amount: $1,234.56
        
        Please sign and return:
        Signature: ________________
        Date: ________________
      `;

      const result = handwritingService.analyzeTextForHandwriting(invoiceText);
      
      expect(result.hasHandwriting).toBe(true);
      expect(result.patterns).toContain('signature_pattern');
    });

    test('should handle handwritten notes document', () => {
      const notesText = `
        Meeting Notes - handwritten
        - Discussed project timeline
        - Need to follow up with client
        - Personal memo
      `;

      const result = handwritingService.analyzeTextForHandwriting(notesText);
      
      expect(result.hasHandwriting).toBe(true);
      expect(result.patterns).toContain('memo');
    });

    test('should handle mixed document content', () => {
      const mixedText = `
        OFFICIAL DOCUMENT
        This is printed text.
        
        Annotation: Please review this section.
        Signature: John Doe
      `;

      const result = handwritingService.analyzeTextForHandwriting(mixedText);
      
      expect(result.hasHandwriting).toBe(true);
      expect(result.patterns).toContain('annotation');
      expect(result.patterns).toContain('signature_pattern');
    });

    test('should handle purely printed document', () => {
      const printedText = `
        BUSINESS INVOICE
        Invoice Number: INV-2024-001
        Date: January 15, 2024
        Amount Due: $1,234.56
        
        Payment Terms: Net 30
        Thank you for your business.
      `;

      const result = handwritingService.analyzeTextForHandwriting(printedText);
      
      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
    });
  });
});
