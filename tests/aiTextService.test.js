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
          clientConfidence: 0.9, // Valid confidence
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
      expect(result.clientName).toBe('Test Client'); // Trimmed
      expect(result.clientConfidence).toBe(0.9);
      expect(result.date).toBe('2024-01-15');
      expect(result.overallConfidence).toBeDefined();
    });

    it('should retry on malformed AI responses', async () => {
      const malformedResponse = {
        content: 'This is not valid JSON at all'
      };
      const validResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM
        .mockResolvedValueOnce(malformedResponse)
        .mockResolvedValueOnce(validResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('should handle language context in prompts', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text', {
        detectedLanguage: 'spa',
        languageName: 'Spanish'
      });
      
      expect(result).toBeDefined();
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Spanish')
            })
          ])
        })
      );
    });

    it('should handle table context in prompts', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text', {
        hasTableData: true,
        tableContext: 'Invoice table with client details'
      });
      
      expect(result).toBeDefined();
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('table data')
            })
          ])
        })
      );
    });

    it('should fail after max retries with malformed responses', async () => {
      const malformedResponse = {
        content: 'This is not valid JSON at all'
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(malformedResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3); // Max retries
    });

    it('should handle empty AI responses', async () => {
      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue({ content: '' });

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
    });

    it('should handle null AI responses', async () => {
      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(null);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
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

  describe('JSON response parsing and validation', () => {
    it('should parse valid JSON responses correctly', () => {
      const validResponse = JSON.stringify({
        clientName: 'Test Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #12345']
      });

      const result = aiService.parseAIResponse(validResponse);
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
    });

    it('should handle malformed JSON responses', () => {
      const malformedResponse = 'This is not JSON at all';
      const result = aiService.parseAIResponse(malformedResponse);
      expect(result).toBeNull();
    });

    it('should handle JSON with missing required fields', () => {
      const incompleteResponse = JSON.stringify({
        clientName: 'Test Client',
        // Missing other required fields
      });

      const result = aiService.parseAIResponse(incompleteResponse);
      expect(result).toBeNull();
    });

    it('should handle JSON with invalid field types', () => {
      const invalidTypesResponse = JSON.stringify({
        clientName: 123, // Should be string
        clientConfidence: 'high', // Should be number
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: 'not an array' // Should be array
      });

      const result = aiService.parseAIResponse(invalidTypesResponse);
      expect(result).toBeNull();
    });

    it('should extract JSON from mixed content responses', () => {
      const mixedResponse = 'Here is the JSON response:\n' + JSON.stringify({
        clientName: 'Test Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #12345']
      }) + '\nEnd of response';

      const result = aiService.parseAIResponse(mixedResponse);
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
    });

    it('should handle responses with multiple JSON objects', () => {
      const multipleJsonResponse = 'Some text before ' + JSON.stringify({
        clientName: 'Test Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #12345']
      }) + ' and some text after';

      const result = aiService.parseAIResponse(multipleJsonResponse);
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
    });
  });

  describe('retry logic', () => {
    it('should retry on JSON parsing failures', async () => {
      const malformedResponse = { content: 'Not JSON' };
      const validResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM
        .mockResolvedValueOnce(malformedResponse)
        .mockResolvedValueOnce(validResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('should retry on validation failures', async () => {
      const invalidResponse = {
        content: JSON.stringify({
          clientName: 123, // Invalid type
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };
      const validResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(validResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('should fail after maximum retries', async () => {
      const malformedResponse = { content: 'Not JSON' };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(malformedResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3);
    });
  });

  describe('text sanitization', () => {
    it('should sanitize client names', () => {
      const result = aiService.sanitizeText('<script>alert("xss")</script>Test Client');
      expect(result).toBe('scriptalert("xss")/scriptTest Client');
    });

    it('should remove javascript protocols', () => {
      const result = aiService.sanitizeText('javascript:alert("xss")');
      expect(result).toBe('alert("xss")');
    });

    it('should remove event handlers', () => {
      const result = aiService.sanitizeText('onclick="alert(\'xss\')" Test Client');
      expect(result).toBe('Test Client');
    });

    it('should normalize whitespace', () => {
      const result = aiService.sanitizeText('  Test    Client  ');
      expect(result).toBe('Test Client');
    });

    it('should handle null and undefined inputs', () => {
      expect(aiService.sanitizeText(null)).toBeNull();
      expect(aiService.sanitizeText(undefined)).toBeUndefined();
      expect(aiService.sanitizeText('')).toBe('');
    });

    it('should sanitize snippets in metadata', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['<script>alert("xss")</script>Invoice #12345', 'Normal snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(result.snippets[0]).toBe('scriptalert("xss")/scriptInvoice #12345');
      expect(result.snippets[1]).toBe('Normal snippet');
    });
  });

  describe('enhanced validation', () => {
    it('should reject metadata with no valid data', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: null,
          clientConfidence: 0.0,
          date: null,
          dateConfidence: 0.0,
          docType: null,
          docTypeConfidence: 0.0,
          snippets: []
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();
    });

    it('should accept metadata with at least one valid field', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: null,
          dateConfidence: 0.0,
          docType: null,
          docTypeConfidence: 0.0,
          snippets: []
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeDefined();
      expect(result.clientName).toBe('Test Client');
    });

    it('should handle validation errors gracefully', async () => {
      const mockResponse = {
        content: JSON.stringify({
          clientName: 'Test Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['Invoice #12345']
        })
      };

      // Mock validateAndEnhanceMetadata to throw an error
      const originalMethod = aiService.validateAndEnhanceMetadata;
      aiService.validateAndEnhanceMetadata = jest.fn().mockImplementation(() => {
        throw new Error('Validation error');
      });

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockResponse);

      const result = await aiService.extractMetadataAI('test text');
      
      expect(result).toBeNull();

      // Restore original method
      aiService.validateAndEnhanceMetadata = originalMethod;
    });
  });
});
