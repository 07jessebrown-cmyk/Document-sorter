const OCRService = require('../../src/services/ocrService');
const fs = require('fs');
const path = require('path');

// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
  version: '5.1.0'
}));

// Mock fs
jest.mock('fs');

describe('OCRService', () => {
  let ocrService;
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
      recognize: jest.fn().mockResolvedValue({
        data: {
          text: 'Sample extracted text',
          confidence: 0.85,
          words: [
            { text: 'Sample', confidence: 0.9 },
            { text: 'extracted', confidence: 0.8 },
            { text: 'text', confidence: 0.85 }
          ],
          lines: [
            { text: 'Sample extracted text', confidence: 0.85 }
          ],
          blocks: [
            { text: 'Sample extracted text', confidence: 0.85 }
          ],
          paragraphs: [
            { text: 'Sample extracted text', confidence: 0.85 }
          ]
        }
      }),
      terminate: jest.fn().mockResolvedValue()
    };

    // Mock Tesseract.createWorker
    const Tesseract = require('tesseract.js');
    Tesseract.createWorker.mockResolvedValue(mockWorker);

    // Create OCR service instance
    ocrService = new OCRService({
      debug: true,
      workerPoolSize: 1,
      minConfidence: 0.3
    });
  });

  afterEach(async () => {
    if (ocrService) {
      await ocrService.terminate();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const service = new OCRService();
      expect(service.options.language).toBe('eng');
      expect(service.options.supportedLanguages).toContain('eng');
      expect(service.options.minConfidence).toBe(0.3);
      expect(service.options.timeout).toBe(60000);
      expect(service.options.debug).toBe(false);
      expect(service.options.workerPoolSize).toBe(2);
    });

    test('should initialize with custom options', () => {
      const customOptions = {
        language: 'spa',
        minConfidence: 0.5,
        timeout: 30000,
        debug: true,
        workerPoolSize: 3
      };
      const service = new OCRService(customOptions);
      expect(service.options.language).toBe('spa');
      expect(service.options.minConfidence).toBe(0.5);
      expect(service.options.timeout).toBe(30000);
      expect(service.options.debug).toBe(true);
      expect(service.options.workerPoolSize).toBe(3);
    });

    test('should initialize stats correctly', () => {
      expect(ocrService.stats).toEqual({
        totalProcessed: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        languageUsage: {},
        totalProcessingTime: 0
      });
    });
  });

  describe('extractText', () => {
    test('should extract text successfully', async () => {
      const result = await ocrService.extractText('/test/image.png');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Sample extracted text');
      expect(result.confidence).toBe(0.85);
      expect(result.language).toBe('eng');
      expect(result.metadata.method).toBe('tesseract');
      expect(result.metadata.imagePath).toBe('/test/image.png');
      expect(result.errors).toEqual([]);
    });

    test('should handle file not found error', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await ocrService.extractText('/nonexistent/image.png');

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.errors).toContain('Image file not found: /nonexistent/image.png');
    });

    test('should handle unsupported file format', async () => {
      const result = await ocrService.extractText('/test/image.xyz');

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.errors).toContain('Unsupported image format: .xyz. Supported formats: .png, .jpg, .jpeg, .gif, .bmp, .tiff, .webp');
    });

    test('should handle OCR processing error', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR processing failed'));

      const result = await ocrService.extractText('/test/image.png');

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.errors).toContain('OCR processing failed');
    });

    test('should use custom language', async () => {
      const result = await ocrService.extractText('/test/image.png', { language: 'spa' });

      expect(result.language).toBe('spa');
      expect(mockWorker.loadLanguage).toHaveBeenCalledWith('spa');
      expect(mockWorker.initialize).toHaveBeenCalledWith('spa');
    });

    test('should apply confidence threshold', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Low confidence text',
          confidence: 0.2, // Below threshold
          words: [],
          lines: [],
          blocks: [],
          paragraphs: []
        }
      });

      const result = await ocrService.extractText('/test/image.png');

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Low confidence: 0.2 < 0.3');
    });

    test('should include metadata in result', async () => {
      const result = await ocrService.extractText('/test/image.png');

      expect(result.metadata.words).toBeDefined();
      expect(result.metadata.lines).toBeDefined();
      expect(result.metadata.blocks).toBeDefined();
      expect(result.metadata.paragraphs).toBeDefined();
      expect(result.metadata.timestamp).toBeDefined();
    });

    test('should update statistics', async () => {
      await ocrService.extractText('/test/image.png');

      expect(ocrService.stats.totalProcessed).toBe(1);
      expect(ocrService.stats.successfulExtractions).toBe(1);
      expect(ocrService.stats.failedExtractions).toBe(0);
      expect(ocrService.stats.languageUsage.eng).toBe(1);
      expect(ocrService.stats.averageConfidence).toBe(0.85);
    });
  });

  describe('extractTextBatch', () => {
    test('should process multiple images', async () => {
      const imagePaths = ['/test/image1.png', '/test/image2.png', '/test/image3.png'];
      
      const results = await ocrService.extractTextBatch(imagePaths);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.text).toBe('Sample extracted text');
      });
    });

    test('should respect batch size', async () => {
      const imagePaths = ['/test/image1.png', '/test/image2.png'];
      
      const results = await ocrService.extractTextBatch(imagePaths, { batchSize: 1 });

      expect(results).toHaveLength(2);
    });
  });

  describe('extractTextFromPDF', () => {
    test('should return not implemented error', async () => {
      const result = await ocrService.extractTextFromPDF('/test/document.pdf');

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.errors).toContain('PDF OCR not implemented - requires pdf2pic library for PDF to image conversion');
    });
  });

  describe('detectLanguage', () => {
    test('should detect language successfully', async () => {
      const result = await ocrService.detectLanguage('/test/image.png', ['eng', 'spa']);

      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('eng');
      expect(result.confidence).toBe(0.85);
      expect(result.candidates).toHaveLength(2);
    });

    test('should handle detection failure', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('Detection failed'));

      const result = await ocrService.detectLanguage('/test/image.png', ['eng']);

      expect(result.success).toBe(false);
      expect(result.detectedLanguage).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('updateStats', () => {
    test('should update stats for successful extraction', () => {
      ocrService.updateStats(true, 'eng', 0.8, 1000);

      expect(ocrService.stats.successfulExtractions).toBe(1);
      expect(ocrService.stats.failedExtractions).toBe(0);
      expect(ocrService.stats.languageUsage.eng).toBe(1);
      expect(ocrService.stats.averageConfidence).toBe(0.8);
    });

    test('should update stats for failed extraction', () => {
      ocrService.updateStats(false, 'spa', 0.0, 500);

      expect(ocrService.stats.successfulExtractions).toBe(0);
      expect(ocrService.stats.failedExtractions).toBe(1);
      expect(ocrService.stats.languageUsage.spa).toBe(1);
      expect(ocrService.stats.averageConfidence).toBe(0);
    });

    test('should calculate average confidence correctly', () => {
      ocrService.updateStats(true, 'eng', 0.6, 1000);
      ocrService.updateStats(true, 'eng', 0.8, 1000);

      expect(ocrService.stats.averageConfidence).toBe(0.7);
    });
  });

  describe('getStats', () => {
    test('should return current statistics', () => {
      ocrService.stats.totalProcessed = 10;
      ocrService.stats.successfulExtractions = 8;
      ocrService.stats.failedExtractions = 2;
      ocrService.stats.languageUsage = { eng: 5, spa: 3 };
      ocrService.stats.averageConfidence = 0.75;

      const stats = ocrService.getStats();

      expect(stats.totalProcessed).toBe(10);
      expect(stats.successfulExtractions).toBe(8);
      expect(stats.failedExtractions).toBe(2);
      expect(stats.languageUsage).toEqual({ eng: 5, spa: 3 });
      expect(stats.averageConfidence).toBe(0.75);
      expect(stats.successRate).toBe(0.8);
    });

    test('should calculate success rate correctly', () => {
      ocrService.stats.totalProcessed = 0;
      const stats = ocrService.getStats();
      expect(stats.successRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    test('should reset all statistics', () => {
      ocrService.stats.totalProcessed = 10;
      ocrService.stats.successfulExtractions = 8;
      ocrService.stats.failedExtractions = 2;
      ocrService.stats.languageUsage = { eng: 5 };
      ocrService.stats.averageConfidence = 0.75;

      ocrService.resetStats();

      expect(ocrService.stats).toEqual({
        totalProcessed: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        languageUsage: {},
        totalProcessingTime: 0
      });
    });
  });

  describe('isLanguageSupported', () => {
    test('should return true for supported language', () => {
      expect(ocrService.isLanguageSupported('eng')).toBe(true);
      expect(ocrService.isLanguageSupported('spa')).toBe(true);
    });

    test('should return false for unsupported language', () => {
      expect(ocrService.isLanguageSupported('xyz')).toBe(false);
    });
  });

  describe('addLanguageSupport', () => {
    test('should add new language support', async () => {
      const result = await ocrService.addLanguageSupport('fra');

      expect(result).toBe(true);
      expect(ocrService.isLanguageSupported('fra')).toBe(true);
    });

    test('should return true for already supported language', async () => {
      const result = await ocrService.addLanguageSupport('eng');

      expect(result).toBe(true);
    });

    test('should handle language addition failure', async () => {
      mockWorker.loadLanguage.mockRejectedValue(new Error('Language not found'));

      const result = await ocrService.addLanguageSupport('xyz');

      expect(result).toBe(false);
    });
  });

  describe('terminate', () => {
    test('should terminate all workers', async () => {
      await ocrService.terminate();

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(ocrService.workers.size).toBe(0);
    });
  });

  describe('log', () => {
    test('should log when debug is enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      ocrService.log('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('[OCR] Test message');
      
      consoleSpy.mockRestore();
    });

    test('should not log when debug is disabled', () => {
      const service = new OCRService({ debug: false });
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

      const service = new OCRService({ workerPoolSize: 1 });
      
      // Should not throw error, just log warning
      expect(service.workers.size).toBe(0);
    });

    test('should queue requests when no workers available', async () => {
      // Make multiple concurrent requests
      const promises = [
        ocrService.extractText('/test/image1.png'),
        ocrService.extractText('/test/image2.png')
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

      const result = await ocrService.extractText('/test/image.png');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Timeout');
    });

    test('should handle worker initialization failure', async () => {
      mockWorker.initialize.mockRejectedValue(new Error('Initialization failed'));

      const result = await ocrService.extractText('/test/image.png', { language: 'spa' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Initialization failed');
    });
  });

  describe('Configuration Options', () => {
    test('should apply custom tesseract options', async () => {
      const customOptions = {
        tesseractOptions: {
          tessedit_char_whitelist: '0123456789',
          preserve_interword_spaces: '1'
        }
      };

      await ocrService.extractText('/test/image.png', customOptions);

      expect(mockWorker.recognize).toHaveBeenCalledWith(
        '/test/image.png',
        expect.objectContaining({
          tessedit_char_whitelist: '0123456789',
          preserve_interword_spaces: '1'
        })
      );
    });

    test('should apply preprocessing options', () => {
      const service = new OCRService({
        preprocessing: {
          grayscale: true,
          denoise: true,
          enhanceContrast: true
        }
      });

      expect(service.options.preprocessing.grayscale).toBe(true);
      expect(service.options.preprocessing.denoise).toBe(true);
      expect(service.options.preprocessing.enhanceContrast).toBe(true);
    });
  });
});
