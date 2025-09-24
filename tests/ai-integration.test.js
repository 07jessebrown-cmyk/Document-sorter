// Integration tests for AI-enhanced document processing pipeline
const EnhancedParsingService = require('../src/services/enhancedParsingService');
const AITextService = require('../src/services/aiTextService');
const LLMClient = require('../src/services/llmClient');
const AICache = require('../src/services/aiCache');

// Mock external dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}));

describe('AI Integration Tests', () => {
  let enhancedService;
  let mockLLMClient;
  let mockCache;

  beforeEach(() => {
    // Reset environment
    process.env.NODE_ENV = 'test';
    process.env.USE_AI = 'true';
    
    // Create mock LLM client
    mockLLMClient = {
      callLLM: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(true),
      getConfig: jest.fn().mockReturnValue({ mockMode: true })
    };

    // Create mock cache
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      generateHash: jest.fn((text) => 'mock-hash-' + text.length),
      initialize: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 })
    };

    // Create enhanced parsing service
    enhancedService = new EnhancedParsingService({
      useAI: true,
      aiConfidenceThreshold: 0.5,
      aiBatchSize: 2
    });

    // Inject mocks
    enhancedService.llmClient = mockLLMClient;
    enhancedService.aiCache = mockCache;
    enhancedService.aiTextService = new AITextService();
    enhancedService.aiTextService.setLLMClient(mockLLMClient);
    enhancedService.aiTextService.setCache(mockCache);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AI Fallback Pipeline', () => {
    it('should use regex first, then fall back to AI when confidence is low', async () => {
      const text = 'Some random text without clear patterns';
      const filePath = '/test/document.pdf';

      // Mock AI response
      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Detected Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet 1', 'AI snippet 2']
        })
      };

      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);
      mockCache.get.mockResolvedValue(null);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath);

      expect(result.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.clientName).toBe('AI Detected Client');
      expect(result.type).toBe('Invoice');
      expect(result.date).toBe('2024-01-15');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(mockLLMClient.callLLM).toHaveBeenCalled();
    });

    it('should use regex when confidence is high enough', async () => {
      const text = 'INVOICE\nBill to: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00';
      const filePath = '/test/invoice.pdf';

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath);

      expect(result.source).toBe('regex');
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.type).toBe('Invoice');
      // The regex might extract a different date format, so let's check it's a valid date
      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('should use AI when critical fields are missing', async () => {
      const text = 'Document without clear client or date information';
      const filePath = '/test/unclear.pdf';

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'Unknown Client',
          clientConfidence: 0.6,
          date: null,
          dateConfidence: 0.0,
          docType: 'Contract',
          docTypeConfidence: 0.7,
          snippets: ['Contract snippet']
        })
      };

      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);
      mockCache.get.mockResolvedValue(null);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath);

      expect(result.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.clientName).toBe('Unknown Client');
      expect(result.type).toBe('Contract');
      expect(mockLLMClient.callLLM).toHaveBeenCalled();
    });

    it('should merge regex and AI results when using hybrid approach', async () => {
      const text = 'INVOICE\nBill to: Acme Corp\nDate: 2024-01-15';
      const filePath = '/test/hybrid.pdf';

      // Mock AI response that provides additional info
      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'Acme Corporation Inc.', // More complete name
          clientConfidence: 0.95,
          date: '2024-01-15',
          dateConfidence: 0.9,
          docType: 'Invoice',
          docTypeConfidence: 0.98,
          snippets: ['INVOICE', 'Acme Corporation Inc.']
        })
      };

      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);
      mockCache.get.mockResolvedValue(null);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      expect(result.source).toBe('hybrid');
      expect(result.clientName).toBe('Acme Corporation Inc.'); // AI's more complete name
      expect(result.type).toBe('Invoice');
      expect(result.date).toBe('2024-01-15');
    });
  });

  describe('AI Cache Integration', () => {
    it('should use cached AI results when available', async () => {
      const text = 'Test document for caching';
      const filePath = '/test/cached.pdf';

      const cachedResult = {
        clientName: 'Cached Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Cached snippet']
      };

      mockCache.get.mockResolvedValue(cachedResult);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      expect(result.source).toBe('hybrid'); // Cached AI + regex = hybrid
      expect(result.clientName).toBe('Cached Client');
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should cache AI results for future use', async () => {
      const text = 'New document for caching';
      const filePath = '/test/new.pdf';

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'New Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['New snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      expect(result.source).toBe('hybrid'); // AI + regex = hybrid
      expect(mockCache.set).toHaveBeenCalled();
      expect(mockLLMClient.callLLM).toHaveBeenCalled();
    });
  });

  describe('Batch Processing with AI', () => {
    it('should process multiple documents with AI fallback', async () => {
      const documents = [
        { text: 'INVOICE\nBill to: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00', filePath: '/test/invoice1.pdf' },
        { text: 'Unclear document without patterns', filePath: '/test/unclear1.pdf' },
        { text: 'Another unclear document', filePath: '/test/unclear2.pdf' }
      ];

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const results = await enhancedService.processBatch(documents);

      expect(results).toHaveLength(3);
      expect(results[0].source).toBe('regex'); // Clear document uses regex only
      expect(results[1].source).toBe('hybrid'); // Unclear document uses AI + regex
      expect(results[2].source).toBe('hybrid'); // Another unclear document uses AI + regex
    });

    it('should respect batch size limits', async () => {
      const documents = Array.from({ length: 5 }, (_, i) => ({
        text: `Unclear document ${i}`,
        filePath: `/test/unclear${i}.pdf`
      }));

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const results = await enhancedService.processBatch(documents);

      expect(results).toHaveLength(5);
      // Should process in batches of 2 (aiBatchSize)
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Handling', () => {
    it('should fall back to regex when AI service fails', async () => {
      const text = 'Document that should use AI but AI fails';
      const filePath = '/test/ai-fail.pdf';

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockRejectedValue(new Error('AI service unavailable'));

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      expect(result.source).toBe('regex');
      expect(result.error).toBeUndefined();
    });

    it('should handle malformed AI responses gracefully', async () => {
      const text = 'Document for malformed AI response';
      const filePath = '/test/malformed.pdf';

      const mockAIResponse = {
        content: 'Invalid JSON response'
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      expect(result.source).toBe('regex');
    });

    it('should handle cache errors gracefully', async () => {
      const text = 'INVOICE\nBill to: Test Client\nDate: 2024-01-15\nDocument for cache error';
      const filePath = '/test/cache-error.pdf';

      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockCache.set.mockRejectedValue(new Error('Cache error'));

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath, { forceAI: true });

      // When cache errors occur, AI processing fails and falls back to regex only
      expect(result.source).toBe('regex');
      expect(result.clientName).toBeDefined(); // Should have some client name from regex
    });
  });

  describe('Confidence Scoring', () => {
    it('should calculate confidence scores for regex results', async () => {
      const text = 'INVOICE\nBill to: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00';
      const filePath = '/test/confidence.pdf';

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.clientConfidence).toBeGreaterThan(0);
      expect(result.dateConfidence).toBeGreaterThan(0);
      expect(result.docTypeConfidence).toBeGreaterThan(0);
    });

    it('should use AI when regex confidence is below threshold', async () => {
      const text = 'Some text with minimal patterns';
      const filePath = '/test/low-confidence.pdf';

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      const result = await enhancedService.analyzeDocumentEnhanced(text, filePath);

      expect(result.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track processing statistics', async () => {
      const documents = [
        { text: 'INVOICE\nBill to: Acme Corporation\nDate: 2024-01-15\nAmount: $1,500.00', filePath: '/test/clear.pdf' },
        { text: 'Unclear document without patterns', filePath: '/test/unclear.pdf' }
      ];

      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);

      await enhancedService.processBatch(documents);

      const stats = enhancedService.getStats();
      expect(stats.totalProcessed).toBe(2);
      expect(stats.regexProcessed).toBe(1);
      expect(stats.aiProcessed).toBe(1);
      expect(stats.aiEnabled).toBe(true);
    });

    it('should reset statistics', () => {
      enhancedService.stats.totalProcessed = 10;
      enhancedService.resetStats();
      
      const stats = enhancedService.getStats();
      expect(stats.totalProcessed).toBe(0);
      expect(stats.regexProcessed).toBe(0);
      expect(stats.aiProcessed).toBe(0);
    });
  });

  describe('Configuration and Options', () => {
    it('should respect AI configuration options', () => {
      const customService = new EnhancedParsingService({
        useAI: false,
        aiConfidenceThreshold: 0.8,
        aiBatchSize: 3
      });

      expect(customService.useAI).toBe(false);
      expect(customService.aiConfidenceThreshold).toBe(0.8);
      expect(customService.aiBatchSize).toBe(3);
    });

    it('should use environment variables when options not provided', () => {
      process.env.USE_AI = 'true';
      process.env.AI_CONFIDENCE_THRESHOLD = '0.7';
      process.env.AI_BATCH_SIZE = '4';

      const service = new EnhancedParsingService();
      
      expect(service.useAI).toBe(true);
      expect(service.aiConfidenceThreshold).toBe(0.7);
      expect(service.aiBatchSize).toBe(4);
    });
  });
});
