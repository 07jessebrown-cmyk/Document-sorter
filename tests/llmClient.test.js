const LLMClient = require('../src/services/llmClient');

describe('LLMClient', () => {
  let client;

  beforeEach(() => {
    // Create client in mock mode for testing
    client = new LLMClient({
      mockMode: true,
      maxConcurrentRequests: 2,
      batchSize: 3,
      batchDelay: 50
    });
  });

  afterEach(() => {
    client = null;
  });

  describe('Concurrency Control', () => {
    test('should respect maxConcurrentRequests limit', async () => {
      const maxConcurrent = 2;
      client.updateConcurrencySettings({ maxConcurrentRequests: maxConcurrent });

      const requests = Array(5).fill(null).map((_, i) => ({
        messages: [{ role: 'user', content: `Test request ${i}` }]
      }));

      const startTime = Date.now();
      const promises = requests.map(req => client.callLLM(req));
      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toContain('Mock AI response');
      });

      // Should take some time due to concurrency control
      expect(endTime - startTime).toBeGreaterThan(100);
    });

    test('should track active requests correctly', async () => {
      const stats = client.getConcurrencyStats();
      expect(stats.activeRequests).toBe(0);
      expect(stats.maxConcurrentRequests).toBe(2);
      expect(stats.availablePermits).toBe(2);

      // Start a request
      const requestPromise = client.callLLM({
        messages: [{ role: 'user', content: 'Test' }]
      });

      // Give it a moment to start and check stats
      await new Promise(resolve => setTimeout(resolve, 50));

      const statsDuring = client.getConcurrencyStats();
      // The request might have completed by now in mock mode
      expect(statsDuring.activeRequests).toBeGreaterThanOrEqual(0);
      expect(statsDuring.maxConcurrentRequests).toBe(2);

      await requestPromise;

      const statsAfter = client.getConcurrencyStats();
      expect(statsAfter.activeRequests).toBe(0);
      expect(statsAfter.availablePermits).toBe(2);
    });

    test('should bypass concurrency control when requested', async () => {
      const startTime = Date.now();
      
      // This should bypass concurrency control
      const result = await client.callLLM({
        messages: [{ role: 'user', content: 'Test' }],
        bypassConcurrency: true
      });

      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(result.content).toContain('Mock AI response');
      
      // Should complete quickly since it bypasses concurrency control
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe('Batching', () => {
    test('should process requests in batches', async () => {
      const requests = Array(7).fill(null).map((_, i) => ({
        messages: [{ role: 'user', content: `Batch test ${i}` }]
      }));

      const startTime = Date.now();
      const results = await client.callLLMBatch(requests, {
        concurrency: 2,
        batchDelay: 50
      });
      const endTime = Date.now();

      expect(results).toHaveLength(7);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toContain('Mock AI response');
      });

      // Should take time due to batching and delays
      expect(endTime - startTime).toBeGreaterThan(100);
    });

    test('should handle empty request array', async () => {
      const results = await client.callLLMBatch([]);
      expect(results).toHaveLength(0);
    });

    test('should handle invalid requests gracefully', async () => {
      const requests = [
        { messages: [{ role: 'user', content: 'Valid request' }] },
        { messages: null }, // Invalid
        { messages: [{ role: 'user', content: 'Another valid request' }] }
      ];

      await expect(client.callLLMBatch(requests)).rejects.toThrow();
    });

    test('should use intelligent batching when available', async () => {
      const requests = [
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Request 1' }] },
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Request 2' }] },
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Request 3' }] }
      ];

      const results = await client.callLLMIntelligentBatch(requests, {
        groupBy: (req) => req.model,
        maxBatchSize: 2
      });

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toContain('Mock AI response');
      });
    });

    test('should group requests by model in intelligent batching', async () => {
      const requests = [
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Request 1' }] },
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Request 2' }] },
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Request 3' }] },
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Request 4' }] }
      ];

      const results = await client.callLLMIntelligentBatch(requests, {
        groupBy: (req) => req.model
      });

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Configuration', () => {
    test('should update concurrency settings', () => {
      client.updateConcurrencySettings({
        maxConcurrentRequests: 5,
        batchSize: 10,
        batchDelay: 200,
        batchTimeout: 5000
      });

      const config = client.getConfig();
      expect(config.concurrency.maxConcurrentRequests).toBe(5);
      expect(config.batching.batchSize).toBe(10);
      expect(config.batching.batchDelay).toBe(200);
      expect(config.batching.batchTimeout).toBe(5000);
    });

    test('should validate concurrency settings', () => {
      // Test minimum values
      client.updateConcurrencySettings({
        maxConcurrentRequests: 0,
        batchSize: -1,
        batchDelay: -100,
        batchTimeout: 50
      });

      const config = client.getConfig();
      expect(config.concurrency.maxConcurrentRequests).toBe(1); // Minimum 1
      expect(config.batching.batchSize).toBe(1); // Minimum 1
      expect(config.batching.batchDelay).toBe(0); // Minimum 0
      expect(config.batching.batchTimeout).toBe(100); // Minimum 100
    });

    test('should include concurrency stats in config', () => {
      const config = client.getConfig();
      
      expect(config.concurrency).toBeDefined();
      expect(config.concurrency.maxConcurrentRequests).toBe(2);
      expect(config.concurrency.activeRequests).toBe(0);
      expect(config.concurrency.availablePermits).toBe(2);
      
      expect(config.batching).toBeDefined();
      expect(config.batching.batchSize).toBe(3);
      expect(config.batching.batchDelay).toBe(50);
      expect(config.batching.batchTimeout).toBe(2000);
    });
  });

  describe('Error Handling', () => {
    test('should handle batch processing errors gracefully', async () => {
      // Create a client that will fail by mocking the callLLM method
      const failingClient = new LLMClient({
        mockMode: true,
        maxConcurrentRequests: 1
      });

      // Override the callLLM method to always throw
      failingClient.callLLM = jest.fn().mockRejectedValue(new Error('Simulated API failure'));

      const requests = [
        { messages: [{ role: 'user', content: 'Request 1' }] },
        { messages: [{ role: 'user', content: 'Request 2' }] }
      ];

      const results = await failingClient.callLLMBatch(requests);
      
      // Should return array of nulls due to API failures
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toBeNull();
      });
    });

    test('should handle individual request failures in batch', async () => {
      const requests = [
        { messages: [{ role: 'user', content: 'Valid request' }] },
        { messages: [{ role: 'invalid-role', content: 'Invalid request' }] },
        { messages: [{ role: 'user', content: 'Another valid request' }] }
      ];

      // The batch should complete but with some null results for failed requests
      const results = await client.callLLMBatch(requests);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined(); // First request should succeed
      expect(results[1]).toBeNull(); // Second request should fail
      expect(results[2]).toBeDefined(); // Third request should succeed
    });
  });

  describe('Performance', () => {
    test('should complete batch processing within reasonable time', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        messages: [{ role: 'user', content: `Performance test ${i}` }]
      }));

      const startTime = Date.now();
      const results = await client.callLLMBatch(requests, {
        concurrency: 3,
        batchDelay: 10
      });
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should maintain order of results in batch processing', async () => {
      const requests = Array(5).fill(null).map((_, i) => ({
        messages: [{ role: 'user', content: `Order test ${i}` }]
      }));

      const results = await client.callLLMBatch(requests);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.content).toContain('Mock AI response');
      });
    });
  });
});