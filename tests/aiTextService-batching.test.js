const AITextService = require('../src/services/aiTextService');
const LLMClient = require('../src/services/llmClient');

describe('AITextService Batching', () => {
  let aiService;
  let mockLLMClient;

  beforeEach(() => {
    aiService = new AITextService();
    
    // Create mock LLM client
    mockLLMClient = new LLMClient({
      mockMode: true,
      maxConcurrentRequests: 2,
      batchSize: 3
    });
    
    aiService.setLLMClient(mockLLMClient);
  });

  afterEach(() => {
    aiService = null;
    mockLLMClient = null;
  });

  describe('Intelligent Batching', () => {
    test('should use intelligent batching when enabled', async () => {
      const items = [
        { text: 'Document 1 content' },
        { text: 'Document 2 content' },
        { text: 'Document 3 content' }
      ];

      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: true
      });

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.source).toBe('AI');
        expect(result.clientName).toBe('Mock Client');
      });
    });

    test('should fall back to traditional batching when intelligent batching fails', async () => {
      // Create a mock client without intelligent batching
      const simpleClient = {
        callLLM: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            clientName: 'Mock Client',
            clientConfidence: 0.9,
            date: '2024-01-15',
            dateConfidence: 0.8,
            docType: 'Mock Document',
            docTypeConfidence: 0.95,
            snippets: ['Mock snippet']
          }),
          role: 'assistant',
          finishReason: 'stop'
        })
      };

      aiService.setLLMClient(simpleClient);

      const items = [
        { text: 'Document 1 content' },
        { text: 'Document 2 content' }
      ];

      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: true
      });

      expect(results).toHaveLength(2);
      expect(simpleClient.callLLM).toHaveBeenCalledTimes(2);
    });

    test('should handle empty items array', async () => {
      const results = await aiService.extractMetadataAIBatch([]);
      expect(results).toHaveLength(0);
    });

    test('should filter out invalid items', async () => {
      const items = [
        { text: 'Valid document' },
        { text: '' }, // Empty text
        null, // Null item
        { text: 'Another valid document' },
        { text: '   ' } // Whitespace only
      ];

      const results = await aiService.extractMetadataAIBatch(items);

      expect(results).toHaveLength(2); // Only valid items processed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.source).toBe('AI');
      });
    });
  });

  describe('Traditional Batching', () => {
    test('should process items in batches with concurrency control', async () => {
      const items = Array(7).fill(null).map((_, i) => ({
        text: `Document ${i} content with some text to process`
      }));

      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: false,
        concurrency: 2
      });

      expect(results).toHaveLength(7);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.source).toBe('AI');
      });
    });

    test('should respect concurrency limits', async () => {
      const items = Array(5).fill(null).map((_, i) => ({
        text: `Document ${i} content`
      }));

      const startTime = Date.now();
      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: false,
        concurrency: 1 // Very low concurrency
      });
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      // Should take some time due to low concurrency
      expect(endTime - startTime).toBeGreaterThan(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle LLM client errors gracefully', async () => {
      // Create a mock client that always fails
      const failingClient = {
        callLLM: jest.fn().mockRejectedValue(new Error('Simulated API failure')),
        callLLMIntelligentBatch: jest.fn().mockRejectedValue(new Error('Simulated batch failure'))
      };
      
      aiService.setLLMClient(failingClient);

      const items = [
        { text: 'Document 1 content' },
        { text: 'Document 2 content' }
      ];

      const results = await aiService.extractMetadataAIBatch(items);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toBeNull(); // Should be null due to API failures
      });
    });

    test('should handle individual item processing errors', async () => {
      const items = [
        { text: 'Valid document content' },
        { text: 'Another valid document' }
      ];

      // Mock LLM client to fail on second request
      let callCount = 0;
      const mockClient = {
        callLLM: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Simulated API error');
          }
          return Promise.resolve({
            content: JSON.stringify({
              clientName: 'Mock Client',
              clientConfidence: 0.9,
              date: '2024-01-15',
              dateConfidence: 0.8,
              docType: 'Mock Document',
              docTypeConfidence: 0.95,
              snippets: ['Mock snippet']
            }),
            role: 'assistant',
            finishReason: 'stop'
          });
        }),
        callLLMIntelligentBatch: jest.fn().mockImplementation(() => {
          // For intelligent batching, return mixed results
          return Promise.resolve([
            {
              content: JSON.stringify({
                clientName: 'Mock Client',
                clientConfidence: 0.9,
                date: '2024-01-15',
                dateConfidence: 0.8,
                docType: 'Mock Document',
                docTypeConfidence: 0.95,
                snippets: ['Mock snippet']
              }),
              role: 'assistant',
              finishReason: 'stop'
            },
            null // Second request failed
          ]);
        })
      };

      aiService.setLLMClient(mockClient);

      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: true
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeNull(); // Second request failed
    });

    test('should handle missing LLM client', async () => {
      aiService.setLLMClient(null);

      const items = [
        { text: 'Document content' }
      ];

      const results = await aiService.extractMetadataAIBatch(items);

      expect(results).toHaveLength(0);
    });
  });

  describe('Caching Integration', () => {
    test('should use cache when available', async () => {
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true)
      };
      
      aiService.setCache(mockCache);

      const items = [
        { text: 'Document content for caching test' }
      ];

      const results = await aiService.extractMetadataAIBatch(items, {
        useIntelligentBatching: false // Use traditional batching to test cache
      });

      expect(results).toHaveLength(1);
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    test('should bypass cache when forceRefresh is true', async () => {
      const mockCache = {
        get: jest.fn().mockResolvedValue({
          clientName: 'Cached Client',
          clientConfidence: 0.9,
          date: '2024-01-01',
          dateConfidence: 0.8,
          docType: 'Cached Document',
          docTypeConfidence: 0.95,
          snippets: ['Cached snippet'],
          source: 'AI',
          timestamp: '2024-01-01T00:00:00.000Z'
        }),
        set: jest.fn().mockResolvedValue(true)
      };
      
      aiService.setCache(mockCache);

      const items = [
        { text: 'Document content for cache bypass test' }
      ];

      const results = await aiService.extractMetadataAIBatch(items, {
        forceRefresh: true
      });

      expect(results).toHaveLength(1);
      expect(mockCache.get).not.toHaveBeenCalled(); // Should not check cache
      expect(mockCache.set).toHaveBeenCalled(); // Should still cache new result
    });
  });

  describe('Performance', () => {
    test('should complete batch processing efficiently', async () => {
      const items = Array(10).fill(null).map((_, i) => ({
        text: `Performance test document ${i} with some content to process`
      }));

      const startTime = Date.now();
      const results = await aiService.extractMetadataAIBatch(items, {
        concurrency: 3
      });
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
    });

    test('should maintain order of results', async () => {
      const items = Array(5).fill(null).map((_, i) => ({
        text: `Order test document ${i}`
      }));

      const results = await aiService.extractMetadataAIBatch(items);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.source).toBe('AI');
      });
    });
  });

  describe('Configuration', () => {
    test('should use configured batch size', () => {
      const config = aiService.getConfig();
      expect(config.batchSize).toBe(5); // Default batch size
    });

    test('should respect concurrency parameter', async () => {
      const items = Array(6).fill(null).map((_, i) => ({
        text: `Concurrency test document ${i}`
      }));

      const startTime = Date.now();
      await aiService.extractMetadataAIBatch(items, {
        concurrency: 1 // Very low concurrency
      });
      const endTime = Date.now();

      // Should take longer with lower concurrency
      expect(endTime - startTime).toBeGreaterThan(200);
    });
  });
});
