const AITextService = require('../src/services/aiTextService');

describe('AITextService', () => {
  let aiService;
  let mockLLMClient;
  let mockCache;

  beforeEach(() => {
    aiService = new AITextService();
    
    // Mock LLM client
    mockLLMClient = {
      callLLM: jest.fn()
    };
    
    // Mock cache
    mockCache = {
      get: jest.fn(),
      set: jest.fn()
    };
    
    aiService.setLLMClient(mockLLMClient);
    aiService.setCache(mockCache);
  });

  describe('extractMetadataAI', () => {
    it('should return null when AI is disabled', async () => {
      // Mock disabled state
      aiService.isEnabled = false;
      
      const result = await aiService.extractMetadataAI('test text');
      expect(result).toBeNull();
    });

    it('should return null for empty text', async () => {
      const result = await aiService.extractMetadataAI('');
      expect(result).toBeNull();
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        clientName: 'Test Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #12345', 'Bill to Test Client'],
        source: 'AI',
        overallConfidence: 0.88
      };

      mockCache.get.mockResolvedValue(cachedResult);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toEqual(cachedResult);
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('should call AI service when no cache available', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345', 'Bill to Test Client']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
      expect(result.source).toBe('AI');
      expect(mockLLMClient.callLLM).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should handle AI service errors gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockRejectedValue(new Error('API Error'));

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
    });

    it('should validate and enhance metadata', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: '  Test Client  ',
          clientConfidence: 1.5, // Invalid confidence
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345', 'Bill to Test Client']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result.clientName).toBe('Test Client'); // Trimmed
      expect(result.clientConfidence).toBe(1.0); // Clamped to 1.0
      expect(result.date).toBe('2024-01-15');
      expect(result.overallConfidence).toBeDefined();
    });
  });

  describe('extractMetadataAIBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await aiService.extractMetadataAIBatch([]);
      expect(result).toEqual([]);
    });

    it('should process multiple items in batches', async () => {
      const items = [
        { text: 'Invoice for Client A' },
        { text: 'Contract for Client B' },
        { text: 'Receipt for Client C' }
      ];

      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Test snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const results = await aiService.extractMetadataAIBatch(items);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('should handle batch processing errors gracefully', async () => {
      const items = [
        { text: 'Valid text' },
        { text: '' }, // Invalid - will be filtered out
        { text: 'Another valid text' }
      ];

      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Test snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const results = await aiService.extractMetadataAIBatch(items);
      
      // Empty text items are filtered out before processing, so we get 2 results
      expect(results).toHaveLength(2);
      expect(results[0]).toBeDefined(); // Valid text processed
      expect(results[1]).toBeDefined(); // Another valid text processed
    });
  });

  describe('utility methods', () => {
    it('should generate consistent text hashes', () => {
      const text = 'test text';
      const hash1 = aiService.generateTextHash(text);
      const hash2 = aiService.generateTextHash(text);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 format
    });

    it('should check if service is ready', () => {
      expect(aiService.isReady()).toBe(true);
      
      aiService.setLLMClient(null);
      expect(aiService.isReady()).toBe(false);
    });

    it('should return configuration', () => {
      const config = aiService.getConfig();
      
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('confidenceThreshold');
      expect(config).toHaveProperty('batchSize');
      expect(config).toHaveProperty('hasLLMClient');
      expect(config).toHaveProperty('hasCache');
    });
  });

  describe('metadata validation', () => {
    it('should validate client names correctly', () => {
      const result = aiService.validateClientName('  Valid Client Name  ');
      expect(result).toBe('Valid Client Name');
      
      const result2 = aiService.validateClientName('');
      expect(result2).toBeNull();
      
      const result3 = aiService.validateClientName(null);
      expect(result3).toBeNull();
    });

    it('should validate dates correctly', () => {
      const result1 = aiService.validateDate('2024-01-15');
      expect(result1).toBe('2024-01-15');
      
      const result2 = aiService.validateDate('January 15, 2024');
      expect(result2).toBe('2024-01-15');
      
      const result3 = aiService.validateDate('invalid date');
      expect(result3).toBeNull();
    });

    it('should validate confidence scores correctly', () => {
      expect(aiService.validateConfidence(0.5)).toBe(0.5);
      expect(aiService.validateConfidence(1.5)).toBe(1.0);
      expect(aiService.validateConfidence(-0.5)).toBe(0.0);
      expect(aiService.validateConfidence('invalid')).toBe(0.0);
    });
  });
});
