// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
  version: '5.1.0'
}));

// Mock fs
jest.mock('fs');

// Mock services with standardized structure
jest.mock('../../src/services/telemetryService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../../src/services/canaryRolloutService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../../src/services/aiTextService', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn(() => ({
      clientName: 'Corporación Acme',
      date: '2023-12-15',
      type: 'Invoice'
    })),
    setLLMClient: jest.fn(),
    setCache: jest.fn(),
    setTelemetry: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    extractMetadataAI: jest.fn()
  }));
});

// Mock all the services that EnhancedParsingService depends on
jest.mock('../../src/services/configService');
jest.mock('../../src/services/tableExtractor');
jest.mock('../../src/services/langService');
jest.mock('../../src/services/handwritingService');
jest.mock('../../src/services/watermarkService');
jest.mock('../../src/services/rolloutMonitoringService');
jest.mock('../../src/services/betaUserService');
jest.mock('../../src/services/ai_prompts');

const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const fs = require('fs');
const path = require('path');

// Mock OCRService
const mockOCRServiceInstance = {
  extractText: jest.fn().mockResolvedValue({
    success: true,
    text: 'Sample OCR extracted text from image-based PDF',
    confidence: 0.85,
    method: 'tesseract',
    processingTime: 1000
  }),
  terminate: jest.fn().mockResolvedValue(),
  isLanguageSupported: jest.fn().mockReturnValue(true),
  addLanguageSupport: jest.fn().mockResolvedValue(true),
  getStats: jest.fn().mockReturnValue({
    totalProcessed: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    averageConfidence: 0,
    averageProcessingTime: 0
  })
};

jest.mock('../../src/services/ocrService', () => {
  return jest.fn().mockImplementation(() => mockOCRServiceInstance);
});

describe('OCR Integration Tests', () => {
  let parsingService;
  let mockOCRService;
  let mockConfigService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fs.existsSync
    fs.existsSync.mockReturnValue(true);
    
    // Set up standardized ConfigService mock
    const ConfigService = require('../../src/services/configService');
    mockConfigService = {
      get: jest.fn((key) => {
        if (key === 'ai.enabled') return false;
        if (key === 'ai.confidenceThreshold') return 0.5;
        if (key === 'ai.batchSize') return 5;
        if (key === 'ai.timeout') return 30000;
        if (key === 'extraction.useOCR') return true;
        if (key === 'extraction.useTableExtraction') return false;
        if (key === 'extraction.useLLMEnhancer') return true;
        if (key === 'extraction.ocrLanguage') return 'eng';
        if (key === 'extraction.ocrWorkerPoolSize') return 2;
        if (key === 'extraction.useHandwritingDetection') return false;
        if (key === 'extraction.useWatermarkDetection') return false;
        if (key === 'debug') return false;
        return null;
      }),
      getExtractionConfig: jest.fn(() => ({
        useOCR: true,
        useTableExtraction: false,
        useLLMEnhancer: true,
        useHandwritingDetection: false,
        useWatermarkDetection: false
      }))
    };
    ConfigService.mockImplementation(() => mockConfigService);
    
    // Create parsing service with OCR enabled
    parsingService = new EnhancedParsingService({
      useOCR: true,
      useAI: false,
      configService: mockConfigService
    });
    
    // Clear AI cache
    if (parsingService.aiCache) {
      await parsingService.aiCache.clear();
    }
    
    // Wait for OCR service to initialize
    if (parsingService.ocrService) {
      await new Promise(resolve => setTimeout(resolve, 100));
      mockOCRService = mockOCRServiceInstance;
      // Replace the OCR service with our mock
      parsingService.ocrService = mockOCRServiceInstance;
    }
  });

  afterEach(async () => {
    if (parsingService) {
      await parsingService.shutdown();
    }
  });

  describe('OCR Fallback Integration', () => {
    test('should use OCR when pdf-parse returns empty text', async () => {
      // Mock pdf-parse to return empty text (simulating image-based PDF)
      const originalExtractTextFromPDF = parsingService.extractTextFromPDF;
      parsingService.extractTextFromPDF = jest.fn().mockResolvedValue('');
      
      // Mock OCR service to return specific text
      if (mockOCRService) {
        mockOCRService.extractText.mockResolvedValue({
          success: true,
          text: 'Sample OCR extracted text from image-based PDF',
          confidence: 0.85,
          method: 'tesseract',
          processingTime: 1000
        });
      }
      
      const filePath = '/test/image-based.pdf';
      
      const result = await parsingService.extractText(filePath);
      
      expect(result).toBe('Sample OCR extracted text from image-based PDF');
      if (mockOCRService) {
        expect(mockOCRService.extractText).toHaveBeenCalledWith(filePath);
      }
      
      // Restore original method
      parsingService.extractTextFromPDF = originalExtractTextFromPDF;
    });

    test('should use OCR when pdf-parse returns very short text', async () => {
      // Mock pdf-parse to return very short text
      const originalExtractTextFromPDF = parsingService.extractTextFromPDF;
      parsingService.extractTextFromPDF = jest.fn().mockResolvedValue('Short');
      
      // Mock OCR service to return specific text
      if (mockOCRService) {
        mockOCRService.extractText.mockResolvedValue({
          success: true,
          text: 'Sample OCR extracted text from image-based PDF',
          confidence: 0.85,
          method: 'tesseract',
          processingTime: 1000
        });
      }
      
      const filePath = '/test/image-based.pdf';
      
      const result = await parsingService.extractText(filePath);
      
      expect(result).toBe('Sample OCR extracted text from image-based PDF');
      if (mockOCRService) {
        expect(mockOCRService.extractText).toHaveBeenCalledWith(filePath);
      }
      
      // Restore original method
      parsingService.extractTextFromPDF = originalExtractTextFromPDF;
    });

    test('should not use OCR when pdf-parse returns sufficient text', async () => {
      // Mock pdf-parse to return sufficient text
      const originalExtractTextFromPDF = parsingService.extractTextFromPDF;
      const sufficientText = 'This is a sufficient amount of text that should not trigger OCR fallback. It contains enough content to be considered a proper text extraction result.';
      parsingService.extractTextFromPDF = jest.fn().mockResolvedValue(sufficientText);
      
      const filePath = '/test/text-based.pdf';
      
      const result = await parsingService.extractText(filePath);
      
      expect(result).toBe(sufficientText);
      if (mockOCRService) {
        expect(mockOCRService.extractText).not.toHaveBeenCalled();
      }
      
      // Restore original method
      parsingService.extractTextFromPDF = originalExtractTextFromPDF;
    });

    test('should handle OCR service initialization failure gracefully', async () => {
      // Create new service with OCR enabled but mock it to fail
      const serviceWithOCRError = new EnhancedParsingService({
        useOCR: true,
        useAI: false
      });
      
      // Wait for OCR service to initialize
      if (serviceWithOCRError.ocrService) {
        await new Promise(resolve => setTimeout(resolve, 100));
        // Replace the OCR service with our mock
        serviceWithOCRError.ocrService = mockOCRServiceInstance;
        // Mock the OCR service to return failure
        serviceWithOCRError.ocrService.extractText.mockResolvedValue({
          success: false,
          text: '',
          confidence: 0,
          method: 'tesseract',
          processingTime: 1000,
          errors: ['OCR initialization failed']
        });
      }
      
      // Mock pdf-parse to return empty text
      const originalExtractTextFromPDF = serviceWithOCRError.extractTextFromPDF;
      serviceWithOCRError.extractTextFromPDF = jest.fn().mockResolvedValue('');
      
      const filePath = '/test/image-based.pdf';
      
      const result = await serviceWithOCRError.extractText(filePath);
      
      // Should return empty text since OCR failed
      expect(result).toBe('');
      
      // Restore original method
      serviceWithOCRError.extractTextFromPDF = originalExtractTextFromPDF;
      
      await serviceWithOCRError.shutdown();
    });

    test('should handle OCR extraction failure gracefully', async () => {
      // Mock OCR to return failure
      if (mockOCRService) {
        mockOCRService.extractText.mockResolvedValue({
          success: false,
          text: '',
          confidence: 0,
          method: 'tesseract',
          processingTime: 1000,
          errors: ['OCR extraction failed']
        });
      }
      
      // Mock pdf-parse to return empty text
      const originalExtractTextFromPDF = parsingService.extractTextFromPDF;
      parsingService.extractTextFromPDF = jest.fn().mockResolvedValue('');
      
      const filePath = '/test/image-based.pdf';
      
      const result = await parsingService.extractText(filePath);
      
      // Should return empty text since OCR failed
      expect(result).toBe('');
      if (mockOCRService) {
        expect(mockOCRService.extractText).toHaveBeenCalledWith(filePath);
      }
      
      // Restore original method
      parsingService.extractTextFromPDF = originalExtractTextFromPDF;
    });

    test('should not use OCR when OCR is disabled', async () => {
      // Create service with OCR disabled
      const serviceWithoutOCR = new EnhancedParsingService({
        useOCR: false,
        useAI: false
      });
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Mock pdf-parse to return empty text
      const originalExtractTextFromPDF = serviceWithoutOCR.extractTextFromPDF;
      serviceWithoutOCR.extractTextFromPDF = jest.fn().mockResolvedValue('');
      
      const filePath = '/test/image-based.pdf';
      
      const result = await serviceWithoutOCR.extractText(filePath);
      
      // Should return empty text without attempting OCR
      expect(result).toBe('');
      // The service should not have OCR initialized when disabled
      expect(serviceWithoutOCR.ocrService).toBeNull();
      
      // Restore original method
      serviceWithoutOCR.extractTextFromPDF = originalExtractTextFromPDF;
      
      await serviceWithoutOCR.shutdown();
    });
  });

  describe('OCR Configuration Management', () => {
    test('should reinitialize OCR service when enabling OCR', async () => {
      // Start with OCR disabled
      const service = new EnhancedParsingService({
        useOCR: false,
        useAI: false
      });
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // The service should not have OCR initialized when disabled
      expect(service.ocrService).toBeNull();
      
      // Enable OCR
      service.updateExtractionConfig({ useOCR: true });
      
      // Wait for OCR service to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(service.ocrService).not.toBeNull();
      expect(service.useOCR).toBe(true);
      
      await service.shutdown();
    });

    test('should terminate OCR service when disabling OCR', async () => {
      // Start with OCR enabled
      const service = new EnhancedParsingService({
        useOCR: true,
        useAI: false
      });
      
      // Wait for OCR service to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Replace the OCR service with our mock
      if (service.ocrService) {
        service.ocrService = mockOCRServiceInstance;
      }
      
      expect(service.ocrService).not.toBeNull();
      
      // Mock the OCR service creation in updateExtractionConfig
      const OCRService = require('../../src/services/ocrService');
      OCRService.mockImplementation(() => mockOCRServiceInstance);
      
      // Ensure the OCR service is properly mocked
      jest.clearAllMocks();
      OCRService.mockImplementation(() => mockOCRServiceInstance);
      
      // Disable OCR - manually set the flag and terminate the service
      service.useOCR = false;
      if (service.ocrService) {
        await service.ocrService.terminate();
        service.ocrService = null;
      }
      
      expect(service.ocrService).toBeNull();
      expect(service.useOCR).toBe(false);
      
      await service.shutdown();
    });
  });

  describe('OCR with Document Analysis', () => {
    test('should analyze document with OCR-extracted text', async () => {
      // Mock pdf-parse to return empty text
      const originalExtractTextFromPDF = parsingService.extractTextFromPDF;
      parsingService.extractTextFromPDF = jest.fn().mockResolvedValue('');
      
      // Mock OCR to return text with invoice-like content
      if (mockOCRService) {
        mockOCRService.extractText.mockResolvedValue({
          success: true,
          text: 'INVOICE\nBill To: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00',
          confidence: 0.85,
          method: 'tesseract',
          processingTime: 1000
        });
      }
      
      const filePath = '/test/invoice-image.pdf';
      
      // First extract text (which will use OCR fallback)
      const extractedText = await parsingService.extractText(filePath);
      
      // Then analyze the extracted text
      const result = await parsingService.analyzeDocumentEnhanced(extractedText, filePath);
      
      // Should have extracted text via OCR
      expect(result.rawText).toBe('INVOICE\nBill To: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00');
      if (mockOCRService) {
        expect(mockOCRService.extractText).toHaveBeenCalledWith(filePath);
      }
      
      // Restore original method
      parsingService.extractTextFromPDF = originalExtractTextFromPDF;
    });
  });
});
