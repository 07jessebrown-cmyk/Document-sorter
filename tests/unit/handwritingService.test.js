const HandwritingService = require('../../src/services/handwritingService');
const fs = require('fs');
const path = require('path');

// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
  version: '5.1.0'
}));

// Mock fs
jest.mock('fs');

describe('HandwritingService', () => {
  let handwritingService;
  let mockWorker;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fs.existsSync
    fs.existsSync.mockReturnValue(true);
    
    // Mock Tesseract worker
    mockWorker = {
      loadLanguage: jest.fn().mockResolvedValue(),
      initialize: jest.fn().mockResolvedValue(),
      setParameters: jest.fn().mockResolvedValue(),
      recognize: jest.fn().mockResolvedValue({
        data: {
          text: 'Sample handwritten text',
          confidence: 0.45, // Low confidence typical of handwriting
          words: [
            { text: 'Sample', confidence: 0.4, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
            { text: 'handwritten', confidence: 0.3, bbox: { x0: 60, y0: 0, x1: 150, y1: 20 } },
            { text: 'text', confidence: 0.6, bbox: { x0: 160, y0: 0, x1: 200, y1: 20 } }
          ],
          lines: [
            { text: 'Sample handwritten text', confidence: 0.45 }
          ],
          blocks: [
            { text: 'Sample handwritten text', confidence: 0.45 }
          ],
          paragraphs: [
            { text: 'Sample handwritten text', confidence: 0.45 }
          ]
        }
      }),
      terminate: jest.fn().mockResolvedValue()
    };

    // Mock Tesseract.createWorker
    const Tesseract = require('tesseract.js');
    Tesseract.createWorker.mockResolvedValue(mockWorker);

    // Create handwriting service instance
    handwritingService = new HandwritingService({
      debug: true,
      workerPoolSize: 1,
      minConfidence: 0.2
    });
  });

  afterEach(async () => {
    if (handwritingService) {
      await handwritingService.terminate();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const service = new HandwritingService();
      expect(service.options.language).toBe('eng');
      expect(service.options.supportedLanguages).toContain('eng');
      expect(service.options.minConfidence).toBe(0.2);
      expect(service.options.timeout).toBe(90000);
      expect(service.options.debug).toBe(false);
      expect(service.options.workerPoolSize).toBe(1);
    });

    test('should initialize with custom options', () => {
      const customOptions = {
        language: 'spa',
        minConfidence: 0.3,
        timeout: 60000,
        debug: true,
        workerPoolSize: 2
      };
      const service = new HandwritingService(customOptions);
      expect(service.options.language).toBe('spa');
      expect(service.options.minConfidence).toBe(0.3);
      expect(service.options.timeout).toBe(60000);
      expect(service.options.debug).toBe(true);
      expect(service.options.workerPoolSize).toBe(2);
    });

    test('should initialize handwriting-specific options', () => {
      expect(handwritingService.options.handwritingPatterns).toContain('signature');
      expect(handwritingService.options.handwritingPatterns).toContain('manuscript');
      expect(handwritingService.options.confidenceThresholds.signature).toBe(0.15);
      expect(handwritingService.options.confidenceThresholds.handwritten).toBe(0.25);
      expect(handwritingService.options.preprocessing.sharpen).toBe(true);
      expect(handwritingService.options.preprocessing.autoRotate).toBe(true);
    });

    test('should initialize stats correctly', () => {
      expect(handwritingService.stats).toEqual({
        totalProcessed: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        handwritingDetected: 0,
        signaturesDetected: 0,
        manualReviewRequired: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        languageUsage: {},
        totalProcessingTime: 0,
        handwritingTypes: {
          signature: 0,
          handwritten: 0,
          printed: 0,
          mixed: 0
        }
      });
    });
  });

  describe('detectHandwriting', () => {
    test('should detect handwriting successfully', async () => {
      const result = await handwritingService.detectHandwriting('/test/image.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('handwritten');
      expect(result.text).toBe('Sample handwritten text');
      expect(result.confidence).toBe(0.45);
      expect(result.language).toBe('eng');
      expect(result.metadata.method).toBe('tesseract-handwriting');
      expect(result.errors).toEqual([]);
    });

    test('should detect signature handwriting', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Signature here',
          confidence: 0.2,
          words: [
            { text: 'Signature', confidence: 0.15, bbox: { x0: 0, y0: 0, x1: 60, y1: 20 } },
            { text: 'here', confidence: 0.25, bbox: { x0: 70, y0: 0, x1: 100, y1: 20 } }
          ],
          lines: [],
          blocks: [],
          paragraphs: []
        }
      });

      const result = await handwritingService.detectHandwriting('/test/signature.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('signature');
      expect(result.signatureDetected).toBe(true);
    });

    test('should flag manual review for low confidence', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Very unclear handwriting',
          confidence: 0.1,
          words: [
            { text: 'Very', confidence: 0.1, bbox: { x0: 0, y0: 0, x1: 30, y1: 20 } },
            { text: 'unclear', confidence: 0.05, bbox: { x0: 40, y0: 0, x1: 90, y1: 20 } },
            { text: 'handwriting', confidence: 0.15, bbox: { x0: 100, y0: 0, x1: 200, y1: 20 } }
          ],
          lines: [],
          blocks: [],
          paragraphs: []
        }
      });

      const result = await handwritingService.detectHandwriting('/test/unclear.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.manualReviewRequired).toBe(true);
    });

    test('should detect printed text', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'CLEAR PRINTED TEXT',
          confidence: 0.9,
          words: [
            { text: 'CLEAR', confidence: 0.95, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
            { text: 'PRINTED', confidence: 0.9, bbox: { x0: 50, y0: 0, x1: 110, y1: 20 } },
            { text: 'TEXT', confidence: 0.85, bbox: { x0: 120, y0: 0, x1: 160, y1: 20 } }
          ],
          lines: [],
          blocks: [],
          paragraphs: []
        }
      });

      const result = await handwritingService.detectHandwriting('/test/printed.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(false);
      expect(result.handwritingType).toBe('printed');
    });

    test('should handle file not found error', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await handwritingService.detectHandwriting('/nonexistent/image.png');

      expect(result.success).toBe(false);
      expect(result.hasHandwriting).toBe(false);
      expect(result.errors).toContain('Image file not found: /nonexistent/image.png');
    });

    test('should handle unsupported file format', async () => {
      const result = await handwritingService.detectHandwriting('/test/image.xyz');

      expect(result.success).toBe(false);
      expect(result.hasHandwriting).toBe(false);
      expect(result.errors).toContain('Unsupported image format: .xyz. Supported formats: .png, .jpg, .jpeg, .gif, .bmp, .tiff, .webp');
    });

    test('should handle OCR processing error', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR processing failed'));

      const result = await handwritingService.detectHandwriting('/test/image.png');

      expect(result.success).toBe(false);
      expect(result.hasHandwriting).toBe(false);
      expect(result.errors).toContain('OCR processing failed');
    });

    test('should use custom language', async () => {
      const result = await handwritingService.detectHandwriting('/test/image.png', { language: 'spa' });

      expect(result.language).toBe('spa');
      expect(mockWorker.loadLanguage).toHaveBeenCalledWith('spa');
      expect(mockWorker.initialize).toHaveBeenCalledWith('spa');
    });

    test('should configure worker for handwriting detection', async () => {
      await handwritingService.detectHandwriting('/test/image.png');

      expect(mockWorker.setParameters).toHaveBeenCalledWith({
        tessedit_pageseg_mode: '6',
        tessedit_ocr_engine_mode: '3',
        tessedit_char_whitelist: '',
        preserve_interword_spaces: '1'
      });
    });

    test('should include metadata in result', async () => {
      const result = await handwritingService.detectHandwriting('/test/image.png');

      expect(result.metadata.words).toBeDefined();
      expect(result.metadata.lines).toBeDefined();
      expect(result.metadata.blocks).toBeDefined();
      expect(result.metadata.paragraphs).toBeDefined();
      expect(result.metadata.timestamp).toBeDefined();
    });

    test('should update statistics', async () => {
      await handwritingService.detectHandwriting('/test/image.png');

      expect(handwritingService.stats.totalProcessed).toBe(1);
      expect(handwritingService.stats.successfulExtractions).toBe(1);
      expect(handwritingService.stats.failedExtractions).toBe(0);
      expect(handwritingService.stats.handwritingDetected).toBe(1);
      expect(handwritingService.stats.languageUsage.eng).toBe(1);
      expect(handwritingService.stats.averageConfidence).toBe(0.45);
    });
  });

  describe('extractHandwrittenText', () => {
    test('should extract handwritten text successfully', async () => {
      const result = await handwritingService.extractHandwrittenText('/test/image.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.extractedText).toBe('Sample handwritten text');
      expect(result.handwritingType).toBe('handwritten');
    });

    test('should return warning when no handwriting detected', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'CLEAR PRINTED TEXT',
          confidence: 0.9,
          words: [
            { text: 'CLEAR', confidence: 0.95, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
            { text: 'PRINTED', confidence: 0.9, bbox: { x0: 50, y0: 0, x1: 110, y1: 20 } },
            { text: 'TEXT', confidence: 0.85, bbox: { x0: 120, y0: 0, x1: 160, y1: 20 } }
          ],
          lines: [],
          blocks: [],
          paragraphs: []
        }
      });

      const result = await handwritingService.extractHandwrittenText('/test/printed.png');

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(false);
      expect(result.warnings).toContain('No handwriting detected in image');
    });
  });

  describe('extractHandwrittenTextBatch', () => {
    test('should process multiple images', async () => {
      const imagePaths = ['/test/image1.png', '/test/image2.png', '/test/image3.png'];
      
      const results = await handwritingService.extractHandwrittenTextBatch(imagePaths);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.hasHandwriting).toBe(true);
      });
    });

    test('should respect batch size', async () => {
      const imagePaths = ['/test/image1.png', '/test/image2.png'];
      
      const results = await handwritingService.extractHandwrittenTextBatch(imagePaths, { batchSize: 1 });

      expect(results).toHaveLength(2);
    });
  });

  describe('analyzeTextForHandwriting', () => {
    test('should detect handwriting patterns in text', () => {
      const text = 'This is a signature document';
      const result = handwritingService.analyzeTextForHandwriting(text);

      expect(result.hasHandwriting).toBe(true);
      expect(result.patterns).toContain('signature');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should detect signature patterns', () => {
      const text = 'Please sign here and return';
      const result = handwritingService.analyzeTextForHandwriting(text);

      expect(result.hasHandwriting).toBe(true);
      expect(result.patterns).toContain('signature_pattern');
    });

    test('should return false for plain text', () => {
      const text = 'This is just regular text';
      const result = handwritingService.analyzeTextForHandwriting(text);

      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    test('should handle empty text', () => {
      const result = handwritingService.analyzeTextForHandwriting('');

      expect(result.hasHandwriting).toBe(false);
      expect(result.patterns).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe('analyzeHandwritingCharacteristics', () => {
    test('should detect signature characteristics', () => {
      const text = 'Signature here';
      const words = [
        { text: 'Signature', confidence: 0.15, bbox: { x0: 0, y0: 0, x1: 60, y1: 20 } },
        { text: 'here', confidence: 0.25, bbox: { x0: 70, y0: 0, x1: 100, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('signature');
      expect(result.isSignature).toBe(true);
    });

    test('should detect handwritten characteristics', () => {
      const text = 'handwritten text';
      const words = [
        { text: 'handwritten', confidence: 0.3, bbox: { x0: 0, y0: 0, x1: 80, y1: 20 } },
        { text: 'text', confidence: 0.4, bbox: { x0: 90, y0: 0, x1: 120, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.type).toBe('handwritten');
    });

    test('should detect printed characteristics', () => {
      const text = 'CLEAR PRINTED TEXT';
      const words = [
        { text: 'CLEAR', confidence: 0.95, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } },
        { text: 'PRINTED', confidence: 0.9, bbox: { x0: 50, y0: 0, x1: 110, y1: 20 } },
        { text: 'TEXT', confidence: 0.85, bbox: { x0: 120, y0: 0, x1: 160, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(false);
      expect(result.type).toBe('printed');
    });

    test('should flag manual review for low confidence', () => {
      const text = 'unclear text';
      const words = [
        { text: 'unclear', confidence: 0.1, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
        { text: 'text', confidence: 0.15, bbox: { x0: 60, y0: 0, x1: 90, y1: 20 } }
      ];

      const result = handwritingService.analyzeHandwritingCharacteristics(text, words);

      expect(result.hasHandwriting).toBe(true);
      expect(result.requiresManualReview).toBe(true);
    });
  });

  describe('updateStats', () => {
    test('should update stats for successful extraction', () => {
      const handwritingAnalysis = {
        hasHandwriting: true,
        type: 'handwritten',
        isSignature: false,
        requiresManualReview: false
      };

      handwritingService.updateStats(true, 'eng', 0.8, 1000, handwritingAnalysis);

      expect(handwritingService.stats.successfulExtractions).toBe(1);
      expect(handwritingService.stats.failedExtractions).toBe(0);
      expect(handwritingService.stats.handwritingDetected).toBe(1);
      expect(handwritingService.stats.handwritingTypes.handwritten).toBe(1);
      expect(handwritingService.stats.languageUsage.eng).toBe(1);
      expect(handwritingService.stats.averageConfidence).toBe(0.8);
    });

    test('should update stats for signature detection', () => {
      const handwritingAnalysis = {
        hasHandwriting: true,
        type: 'signature',
        isSignature: true,
        requiresManualReview: true
      };

      handwritingService.updateStats(true, 'eng', 0.3, 1000, handwritingAnalysis);

      expect(handwritingService.stats.signaturesDetected).toBe(1);
      expect(handwritingService.stats.manualReviewRequired).toBe(1);
      expect(handwritingService.stats.handwritingTypes.signature).toBe(1);
    });

    test('should update stats for failed extraction', () => {
      handwritingService.updateStats(false, 'spa', 0.0, 500);

      expect(handwritingService.stats.successfulExtractions).toBe(0);
      expect(handwritingService.stats.failedExtractions).toBe(1);
      expect(handwritingService.stats.languageUsage.spa).toBe(1);
      expect(handwritingService.stats.averageConfidence).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return current statistics', () => {
      handwritingService.stats.totalProcessed = 10;
      handwritingService.stats.successfulExtractions = 8;
      handwritingService.stats.failedExtractions = 2;
      handwritingService.stats.handwritingDetected = 6;
      handwritingService.stats.signaturesDetected = 2;
      handwritingService.stats.manualReviewRequired = 3;
      handwritingService.stats.languageUsage = { eng: 5, spa: 3 };
      handwritingService.stats.averageConfidence = 0.75;

      const stats = handwritingService.getStats();

      expect(stats.totalProcessed).toBe(10);
      expect(stats.successfulExtractions).toBe(8);
      expect(stats.failedExtractions).toBe(2);
      expect(stats.handwritingDetected).toBe(6);
      expect(stats.signaturesDetected).toBe(2);
      expect(stats.manualReviewRequired).toBe(3);
      expect(stats.languageUsage).toEqual({ eng: 5, spa: 3 });
      expect(stats.averageConfidence).toBe(0.75);
      expect(stats.successRate).toBe(0.8);
      expect(stats.handwritingDetectionRate).toBe(0.6);
      expect(stats.signatureDetectionRate).toBe(0.2);
      expect(stats.manualReviewRate).toBe(0.3);
    });

    test('should calculate rates correctly when no processing', () => {
      const stats = handwritingService.getStats();
      expect(stats.successRate).toBe(0);
      expect(stats.handwritingDetectionRate).toBe(0);
      expect(stats.signatureDetectionRate).toBe(0);
      expect(stats.manualReviewRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    test('should reset all statistics', () => {
      handwritingService.stats.totalProcessed = 10;
      handwritingService.stats.successfulExtractions = 8;
      handwritingService.stats.failedExtractions = 2;
      handwritingService.stats.handwritingDetected = 6;
      handwritingService.stats.signaturesDetected = 2;
      handwritingService.stats.manualReviewRequired = 3;
      handwritingService.stats.languageUsage = { eng: 5 };
      handwritingService.stats.averageConfidence = 0.75;

      handwritingService.resetStats();

      expect(handwritingService.stats).toEqual({
        totalProcessed: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        handwritingDetected: 0,
        signaturesDetected: 0,
        manualReviewRequired: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        languageUsage: {},
        totalProcessingTime: 0,
        handwritingTypes: {
          signature: 0,
          handwritten: 0,
          printed: 0,
          mixed: 0
        }
      });
    });
  });

  describe('isLanguageSupported', () => {
    test('should return true for supported language', () => {
      expect(handwritingService.isLanguageSupported('eng')).toBe(true);
      expect(handwritingService.isLanguageSupported('spa')).toBe(true);
    });

    test('should return false for unsupported language', () => {
      expect(handwritingService.isLanguageSupported('xyz')).toBe(false);
    });
  });

  describe('addLanguageSupport', () => {
    test('should add new language support', async () => {
      const result = await handwritingService.addLanguageSupport('fra');

      expect(result).toBe(true);
      expect(handwritingService.isLanguageSupported('fra')).toBe(true);
    });

    test('should return true for already supported language', async () => {
      const result = await handwritingService.addLanguageSupport('eng');

      expect(result).toBe(true);
    });

    test('should handle language addition failure', async () => {
      mockWorker.loadLanguage.mockRejectedValue(new Error('Language not found'));

      const result = await handwritingService.addLanguageSupport('xyz');

      expect(result).toBe(false);
    });
  });

  describe('terminate', () => {
    test('should terminate all workers', async () => {
      await handwritingService.terminate();

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(handwritingService.workers.size).toBe(0);
    });
  });

  describe('log', () => {
    test('should log when debug is enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      handwritingService.log('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Handwriting] Test message');
      
      consoleSpy.mockRestore();
    });

    test('should not log when debug is disabled', () => {
      const service = new HandwritingService({ debug: false });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      service.log('Test message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Worker Pool Management', () => {
    test('should handle worker pool initialization failure', async () => {
      const Tesseract = require('tesseract.js');
      Tesseract.createWorker.mockRejectedValue(new Error('Worker creation failed'));

      const service = new HandwritingService({ workerPoolSize: 1 });
      
      // Should not throw error, just log warning
      expect(service.workers.size).toBe(0);
    });

    test('should queue requests when no workers available', async () => {
      // Make multiple concurrent requests
      const promises = [
        handwritingService.detectHandwriting('/test/image1.png'),
        handwritingService.detectHandwriting('/test/image2.png')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle worker recognition timeout', async () => {
      mockWorker.recognize.mockImplementation(() => 
        new Promise((resolve, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const result = await handwritingService.detectHandwriting('/test/image.png');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Timeout');
    });

    test('should handle worker initialization failure', async () => {
      mockWorker.initialize.mockRejectedValue(new Error('Initialization failed'));

      const result = await handwritingService.detectHandwriting('/test/image.png', { language: 'spa' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Initialization failed');
    });
  });

  describe('Configuration Options', () => {
    test('should apply custom tesseract options', async () => {
      const customOptions = {
        tesseractOptions: {
          tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyz',
          preserve_interword_spaces: '1'
        }
      };

      await handwritingService.detectHandwriting('/test/image.png', customOptions);

      expect(mockWorker.recognize).toHaveBeenCalledWith(
        '/test/image.png',
        expect.objectContaining({
          tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyz',
          preserve_interword_spaces: '1'
        })
      );
    });

    test('should apply handwriting-specific preprocessing options', () => {
      const service = new HandwritingService({
        preprocessing: {
          grayscale: true,
          denoise: true,
          enhanceContrast: true,
          sharpen: true,
          autoRotate: true
        }
      });

      expect(service.options.preprocessing.grayscale).toBe(true);
      expect(service.options.preprocessing.denoise).toBe(true);
      expect(service.options.preprocessing.enhanceContrast).toBe(true);
      expect(service.options.preprocessing.sharpen).toBe(true);
      expect(service.options.preprocessing.autoRotate).toBe(true);
    });
  });
});
