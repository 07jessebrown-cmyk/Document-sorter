const LLMClient = require('../src/services/llmClient');

// Mock https module
jest.mock('https');

describe('LLMClient', () => {
  let llmClient;
  let mockHttps;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    process.env.NODE_ENV = 'test';
    
    // Mock https module
    mockHttps = require('https');
    mockHttps.request = jest.fn();
    
    llmClient = new LLMClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const config = llmClient.getConfig();
      
      expect(config.baseURL).toBe('https://api.openai.com/v1');
      expect(config.defaultModel).toBe('gpt-3.5-turbo');
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelay).toBe(1000);
      expect(config.mockMode).toBe(true);
    });

    it('should use custom configuration when provided', () => {
      const customClient = new LLMClient({
        baseURL: 'https://custom.api.com',
        defaultModel: 'gpt-4',
        maxRetries: 5,
        apiKey: 'test-key'
      });
      
      const config = customClient.getConfig();
      expect(config.baseURL).toBe('https://custom.api.com');
      expect(config.defaultModel).toBe('gpt-4');
      expect(config.maxRetries).toBe(5);
      expect(config.hasApiKey).toBe(true);
    });

    it('should read API key from environment variables', () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      const client = new LLMClient();
      expect(client.apiKey).toBe('env-api-key');
    });

    it('should prioritize OPENAI_API_KEY over AI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.AI_API_KEY = 'ai-key';
      const client = new LLMClient();
      expect(client.apiKey).toBe('openai-key');
    });
  });

  describe('callLLM', () => {
    it('should return mock response in test mode', async () => {
      const messages = [
        { role: 'user', content: 'Extract metadata from this document' }
      ];

      const result = await llmClient.callLLM({ messages });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.role).toBe('assistant');
      expect(result.model).toBe('gpt-3.5-turbo');
    });

    it('should validate required parameters', async () => {
      await expect(llmClient.callLLM({})).rejects.toThrow('Messages array is required');
      await expect(llmClient.callLLM({ messages: [] })).rejects.toThrow('Messages array is required');
      await expect(llmClient.callLLM({ messages: [{ role: 'user' }] })).rejects.toThrow('content properties');
      await expect(llmClient.callLLM({ messages: [{ content: 'test' }] })).rejects.toThrow('role and content');
    });

    it('should validate message roles', async () => {
      const messages = [{ role: 'invalid', content: 'test' }];
      await expect(llmClient.callLLM({ messages })).rejects.toThrow('role must be system, user, or assistant');
    });

    it('should use custom parameters', async () => {
      const messages = [{ role: 'user', content: 'test' }];
      const result = await llmClient.callLLM({
        messages,
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.5
      });

      expect(result.model).toBe('gpt-4');
    });

    it('should handle different message types in mock mode', async () => {
      const testCases = [
        { content: 'Extract metadata from document', expectedType: 'metadata' },
        { content: 'Classify this document type', expectedType: 'classification' },
        { content: 'Summarize this content', expectedType: 'summary' },
        { content: 'Random question', expectedType: 'default' }
      ];

      for (const testCase of testCases) {
        const result = await llmClient.callLLM({
          messages: [{ role: 'user', content: testCase.content }]
        });
        
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe('string');
      }
    });
  });

  describe('API call functionality', () => {
    beforeEach(() => {
      // Switch to non-mock mode for API testing
      llmClient.mockMode = false;
      llmClient.apiKey = 'test-api-key';
    });

    it('should throw error when no API key is provided', async () => {
      llmClient.apiKey = null;
      
      await expect(llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('API key is required');
    });

    it('should make successful API call', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Test response',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-3.5-turbo',
        id: 'test-id',
        created: 1234567890
      };

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      const mockRes = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify(mockResponse));
          } else if (event === 'end') {
            callback();
          }
        }),
        statusCode: 200
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const result = await llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(result.content).toBe('Test response');
      expect(result.role).toBe('assistant');
      expect(result.model).toBe('gpt-3.5-turbo');
    });

    it('should handle API errors', async () => {
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      const mockRes = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({ error: { message: 'API Error' } }));
          } else if (event === 'end') {
            callback();
          }
        }),
        statusCode: 400
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      await expect(llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('API Error 400');
    });

    it('should handle network errors', async () => {
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Network error'));
          }
        })
      };

      mockHttps.request.mockImplementation(() => mockReq);

      await expect(llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('Request failed: Network error');
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      llmClient.mockMode = false;
      llmClient.apiKey = 'test-api-key';
    });

    it('should retry on retryable errors', async () => {
      let attemptCount = 0;
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        attemptCount++;
        const mockRes = {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              if (attemptCount < 3) {
                callback(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
              } else {
                callback(JSON.stringify({
                  choices: [{ message: { content: 'Success', role: 'assistant' }, finish_reason: 'stop' }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                  model: 'gpt-3.5-turbo',
                  id: 'test-id',
                  created: 1234567890
                }));
              }
            } else if (event === 'end') {
              callback();
            }
          }),
          statusCode: attemptCount < 3 ? 429 : 200
        };
        callback(mockRes);
        return mockReq;
      });

      const result = await llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(attemptCount).toBe(3);
      expect(result.content).toBe('Success');
    });

    it('should not retry on non-retryable errors', async () => {
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        const mockRes = {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify({ error: { message: 'Invalid API key' } }));
            } else if (event === 'end') {
              callback();
            }
          }),
          statusCode: 401
        };
        callback(mockRes);
        return mockReq;
      });

      await expect(llmClient.callLLM({
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow('API Error 401');
    });
  });

  describe('utility methods', () => {
    it('should test connection in mock mode', async () => {
      const isConnected = await llmClient.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should test connection in API mode', async () => {
      llmClient.mockMode = false;
      llmClient.apiKey = 'test-key';

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      const mockRes = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              choices: [{ message: { content: 'Test', role: 'assistant' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              model: 'gpt-3.5-turbo',
              id: 'test-id',
              created: 1234567890
            }));
          } else if (event === 'end') {
            callback();
          }
        }),
        statusCode: 200
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const isConnected = await llmClient.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should update configuration', () => {
      llmClient.updateConfig({
        baseURL: 'https://new.api.com',
        defaultModel: 'gpt-4',
        maxRetries: 5
      });

      const config = llmClient.getConfig();
      expect(config.baseURL).toBe('https://new.api.com');
      expect(config.defaultModel).toBe('gpt-4');
      expect(config.maxRetries).toBe(5);
    });

    it('should calculate retry delay correctly', () => {
      expect(llmClient.calculateRetryDelay(1)).toBe(1000);
      expect(llmClient.calculateRetryDelay(2)).toBe(2000);
      expect(llmClient.calculateRetryDelay(3)).toBe(4000);
      expect(llmClient.calculateRetryDelay(10)).toBe(10000); // Max delay
    });

    it('should identify retryable errors', () => {
      expect(llmClient.shouldRetry(new Error('Rate limit exceeded'))).toBe(true);
      expect(llmClient.shouldRetry(new Error('Network timeout'))).toBe(true);
      expect(llmClient.shouldRetry(new Error('Service unavailable'))).toBe(true);
      expect(llmClient.shouldRetry(new Error('Invalid API key'))).toBe(false);
      expect(llmClient.shouldRetry(new Error('Bad request'))).toBe(false);
    });
  });

  describe('response formatting', () => {
    it('should format API response correctly', () => {
      const rawResponse = {
        choices: [{
          message: {
            content: 'Test response',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-3.5-turbo',
        id: 'test-id',
        created: 1234567890
      };

      const formatted = llmClient.formatResponse(rawResponse);
      
      expect(formatted).toEqual({
        content: 'Test response',
        role: 'assistant',
        finishReason: 'stop',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-3.5-turbo',
        id: 'test-id',
        created: 1234567890
      });
    });

    it('should handle malformed API response', () => {
      const rawResponse = { choices: [] };
      
      expect(() => llmClient.formatResponse(rawResponse)).toThrow('Invalid API response: no choices found');
    });
  });
});
