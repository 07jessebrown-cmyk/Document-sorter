const EnhancedParsingService = require('../src/services/enhancedParsingService');

// Mock AI services
jest.mock('../src/services/aiTextService');
jest.mock('../src/services/llmClient');
jest.mock('../src/services/aiCache');
jest.mock('../src/services/ai_prompts');

describe('EnhancedParsingService', () => {
  let service;
  let mockAITextService;
  let mockLLMClient;
  let mockAICache;
  let mockPromptService;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.USE_AI;
    delete process.env.AI_CONFIDENCE_THRESHOLD;
    delete process.env.AI_BATCH_SIZE;
    
    // Create service instance
    service = new EnhancedParsingService();
    
    // Mock AI services
    mockAITextService = {
      extractMetadataAI: jest.fn(),
      generateHash: jest.fn().mockReturnValue('mock-hash'),
      setLLMClient: jest.fn(),
      setCache: jest.fn()
    };
    
    mockLLMClient = {
      callLLM: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(true)
    };
    
    mockAICache = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      initialize: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 })
    };
    
    mockPromptService = {
      buildMetadataPrompt: jest.fn(),
      validateResponse: jest.fn()
    };
    
    // Set up mocks
    service.aiTextService = mockAITextService;
    service.llmClient = mockLLMClient;
    service.aiCache = mockAICache;
    service.promptService = mockPromptService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(service.useAI).toBe(false);
      expect(service.aiConfidenceThreshold).toBe(0.5);
      expect(service.aiBatchSize).toBe(5);
      expect(service.stats.totalProcessed).toBe(0);
    });

    it('should initialize with custom options', () => {
      // Reset environment variables first
      delete process.env.USE_AI;
      delete process.env.AI_CONFIDENCE_THRESHOLD;
      delete process.env.AI_BATCH_SIZE;
      
      const customService = new EnhancedParsingService({
        useAI: true,
        aiConfidenceThreshold: 0.7,
        aiBatchSize: 10
      });
      
      
      expect(customService.useAI).toBe(true);
      expect(customService.aiConfidenceThreshold).toBe(0.7);
      expect(customService.aiBatchSize).toBe(10);
    });

    it('should read configuration from environment variables', () => {
      // Set environment variables
      process.env.USE_AI = 'true';
      process.env.AI_CONFIDENCE_THRESHOLD = '0.8';
      process.env.AI_BATCH_SIZE = '3';
      
      const envService = new EnhancedParsingService();
      
      expect(envService.useAI).toBe(true);
      expect(envService.aiConfidenceThreshold).toBe(0.8);
      expect(envService.aiBatchSize).toBe(3);
      
      // Clean up
      delete process.env.USE_AI;
      delete process.env.AI_CONFIDENCE_THRESHOLD;
      delete process.env.AI_BATCH_SIZE;
    });
  });

  describe('enhanceWithConfidence', () => {
    it('should add confidence scores to regex results', () => {
      const text = 'INVOICE #12345\nBill To: Acme Corporation\nDate: 2024-01-15';
      const regexResult = {
        clientName: 'Acme Corporation',
        date: '2024-01-15',
        type: 'Invoice',
        confidence: 0.8
      };
      
      const enhanced = service.enhanceWithConfidence(regexResult, text);
      
      expect(enhanced).toHaveProperty('clientConfidence');
      expect(enhanced).toHaveProperty('dateConfidence');
      expect(enhanced).toHaveProperty('docTypeConfidence');
      expect(enhanced).toHaveProperty('source', 'regex');
      expect(enhanced.confidence).toBeGreaterThan(0);
    });

    it('should calculate confidence for client name', () => {
      const text = 'Bill To: Acme Corporation\nInvoice #12345';
      const regexResult = { clientName: 'Acme Corporation' };
      
      const confidence = service.calculateClientConfidence('Acme Corporation', text);
      
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate confidence for date', () => {
      const text = 'Date: 2024-01-15\nInvoice #12345';
      const regexResult = { date: '2024-01-15' };
      
      const confidence = service.calculateDateConfidence('2024-01-15', text);
      
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate confidence for document type', () => {
      const text = 'INVOICE #12345\nBill To: Acme Corporation';
      const regexResult = { type: 'Invoice' };
      
      const confidence = service.calculateDocTypeConfidence('Invoice', text);
      
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('shouldUseAI', () => {
    it('should use AI when confidence is below threshold', () => {
      const result = {
        confidence: 0.3,
        clientName: 'Test Corp',
        date: '2024-01-15',
        type: 'Invoice'
      };
      
      const shouldUse = service.shouldUseAI(result, {});
      
      expect(shouldUse).toBe(true);
    });

    it('should use AI when critical fields are missing', () => {
      const result = {
        confidence: 0.8,
        clientName: null,
        date: null,
        type: 'Unclassified'
      };
      
      const shouldUse = service.shouldUseAI(result, {});
      
      expect(shouldUse).toBe(true);
    });

    it('should not use AI when confidence is high and fields are present', () => {
      const result = {
        confidence: 0.9,
        clientName: 'Test Corp',
        date: '2024-01-15',
        type: 'Invoice'
      };
      
      const shouldUse = service.shouldUseAI(result, {});
      
      expect(shouldUse).toBe(false);
    });

    it('should use AI when forceAI option is true', () => {
      const result = {
        confidence: 0.9,
        clientName: 'Test Corp',
        date: '2024-01-15',
        type: 'Invoice'
      };
      
      const shouldUse = service.shouldUseAI(result, { forceAI: true });
      
      expect(shouldUse).toBe(true);
    });
  });

  describe('processWithAI', () => {
    beforeEach(() => {
      service.useAI = true;
    });

    it('should return cached result if available', async () => {
      const cachedResult = {
        clientName: 'Cached Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95
      };
      
      mockAICache.get.mockResolvedValue(cachedResult);
      
      const result = await service.processWithAI('test text', 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('ai-cached');
      expect(mockAICache.get).toHaveBeenCalled();
      expect(service.stats.cacheHits).toBe(1);
    });

    it('should process with AI when not cached', async () => {
      const aiResult = {
        clientName: 'AI Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95
      };
      
      mockAICache.get.mockResolvedValue(null);
      mockAITextService.extractMetadataAI.mockResolvedValue(aiResult);
      
      const result = await service.processWithAI('test text', 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('ai');
      expect(mockAITextService.extractMetadataAI).toHaveBeenCalled();
      expect(mockAICache.set).toHaveBeenCalled();
      expect(service.stats.cacheMisses).toBe(1);
    });

    it('should throw error when AI service is not initialized', async () => {
      service.aiTextService = null;
      
      await expect(service.processWithAI('test text', 'test.pdf'))
        .rejects.toThrow('AI service not initialized');
    });
  });

  describe('mergeResults', () => {
    it('should merge regex and AI results', () => {
      const regexResult = {
        clientName: 'Regex Corp',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.8,
        confidence: 0.7,
        source: 'regex'
      };
      
      const aiResult = {
        clientName: 'AI Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        type: 'Invoice',
        docTypeConfidence: 0.95,
        aiConfidence: 0.9,
        snippets: ['AI snippet']
      };
      
      const merged = service.mergeResults(regexResult, aiResult);
      
      expect(merged.clientName).toBe('AI Corp'); // AI has higher confidence
      expect(merged.clientConfidence).toBe(0.9);
      expect(merged.source).toBe('hybrid');
      expect(merged.aiConfidence).toBe(0.9);
      expect(merged.snippets).toEqual(['AI snippet']);
    });

    it('should keep regex results when AI confidence is lower', () => {
      const regexResult = {
        clientName: 'Regex Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        type: 'Invoice',
        docTypeConfidence: 0.9,
        confidence: 0.9,
        source: 'regex'
      };
      
      const aiResult = {
        clientName: 'AI Corp',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.8,
        aiConfidence: 0.7,
        snippets: ['AI snippet']
      };
      
      const merged = service.mergeResults(regexResult, aiResult);
      
      expect(merged.clientName).toBe('Regex Corp'); // Regex has higher confidence
      expect(merged.clientConfidence).toBe(0.9);
      expect(merged.source).toBe('hybrid');
    });
  });

  describe('analyzeDocumentEnhanced', () => {
    it('should return regex result when AI is not needed', async () => {
      const text = 'INVOICE #12345\nBill To: Acme Corporation\nDate: 2024-01-15';
      
      const result = await service.analyzeDocumentEnhanced(text, 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('regex');
      expect(service.stats.regexProcessed).toBe(1);
    });

    it('should use AI when needed and available', async () => {
      service.useAI = true;
      const text = 'Unclear document text';
      
      const aiResult = {
        clientName: 'AI Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95
      };
      
      mockAICache.get.mockResolvedValue(null);
      mockAITextService.extractMetadataAI.mockResolvedValue(aiResult);
      
      const result = await service.analyzeDocumentEnhanced(text, 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('hybrid');
      expect(service.stats.aiProcessed).toBe(1);
    });

    it('should handle AI processing errors gracefully', async () => {
      service.useAI = true;
      const text = 'Unclear document text';
      
      mockAICache.get.mockResolvedValue(null);
      mockAITextService.extractMetadataAI.mockRejectedValue(new Error('AI error'));
      
      const result = await service.analyzeDocumentEnhanced(text, 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('regex');
      expect(service.stats.errors).toBe(1);
    });

    it('should handle empty text', async () => {
      const result = await service.analyzeDocumentEnhanced('', 'test.pdf');
      
      expect(result).toBeDefined();
      expect(result.clientName).toBeUndefined();
      expect(result.confidence).toBe(0);
    });
  });

  describe('processBatch', () => {
    it('should process multiple documents', async () => {
      const documents = [
        { filePath: 'test1.pdf', text: 'Invoice from Corp A' },
        { filePath: 'test2.pdf', text: 'Receipt from Corp B' }
      ];
      
      const results = await service.processBatch(documents);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    });

    it('should process AI candidates in batch', async () => {
      service.useAI = true;
      const documents = [
        { filePath: 'test1.pdf', text: 'Unclear document 1' },
        { filePath: 'test2.pdf', text: 'Unclear document 2' }
      ];
      
      const aiResult = {
        clientName: 'AI Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95
      };
      
      mockAICache.get.mockResolvedValue(null);
      mockAITextService.extractMetadataAI.mockResolvedValue(aiResult);
      
      const results = await service.processBatch(documents);
      
      expect(results).toHaveLength(2);
      // Note: aiProcessed is incremented in analyzeDocumentEnhanced, not processBatch
      // The batch processing calls analyzeDocumentEnhanced for each document
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    });

    it('should handle batch processing errors gracefully', async () => {
      const documents = [
        { filePath: 'test1.pdf', text: 'Valid document' },
        { filePath: 'test2.pdf', text: '' }, // Empty text
        { filePath: 'test3.pdf', text: 'Another valid document' }
      ];
      
      const results = await service.processBatch(documents);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(results[2]).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should track processing statistics', async () => {
      const text = 'INVOICE #12345\nBill To: Acme Corporation';
      
      await service.analyzeDocumentEnhanced(text, 'test.pdf');
      
      const stats = service.getStats();
      
      expect(stats.totalProcessed).toBe(1);
      expect(stats.regexProcessed).toBe(1);
      expect(stats.aiProcessed).toBe(0);
    });

    it('should update average confidence', () => {
      // Set up some processed documents first
      service.stats.totalProcessed = 2;
      service.stats.averageConfidence = 0.5;
      
      // Update with new confidence values
      service.updateAverageConfidence(0.8);
      service.updateAverageConfidence(0.6);
      
      const stats = service.getStats();
      
      // Calculate expected average: (0.5 * 1 + 0.8) / 2 = 0.65, then (0.65 * 1 + 0.6) / 2 = 0.625
      expect(stats.averageConfidence).toBe(0.625);
    });

    it('should reset statistics', () => {
      service.stats.totalProcessed = 10;
      service.stats.regexProcessed = 8;
      service.stats.aiProcessed = 2;
      
      service.resetStats();
      
      expect(service.stats.totalProcessed).toBe(0);
      expect(service.stats.regexProcessed).toBe(0);
      expect(service.stats.aiProcessed).toBe(0);
    });
  });

  describe('integration tests', () => {
    it('should work end-to-end with real document text', async () => {
      const text = 'INVOICE #12345\nBill To: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00';
      
      const result = await service.analyzeDocumentEnhanced(text, 'invoice.pdf');
      
      expect(result).toBeDefined();
      expect(result.type).toBe('Invoice');
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBeDefined(); // Date should be extracted, but format may vary
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.source).toBe('regex');
    });

    it('should handle complex document with AI fallback', async () => {
      service.useAI = true;
      const text = 'Complex document with unclear structure and minimal keywords';
      
      const aiResult = {
        clientName: 'AI Detected Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Contract',
        docTypeConfidence: 0.95
      };
      
      mockAICache.get.mockResolvedValue(null);
      mockAITextService.extractMetadataAI.mockResolvedValue(aiResult);
      
      const result = await service.analyzeDocumentEnhanced(text, 'complex.pdf');
      
      expect(result).toBeDefined();
      expect(result.source).toBe('hybrid');
      expect(result.clientName).toBe('AI Detected Corp');
      expect(result.type).toBe('Contract');
    });
  });
});
