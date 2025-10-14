const BackendProxyService = require('./backendProxyService');

/**
 * LLM Client Wrapper for Backend Proxy
 * Provides a unified interface for calling LLM through backend proxy
 * with retry logic, error handling, and mock mode support
 */
class LLMClientBackend {
  constructor(options = {}) {
    this.baseURL = options.baseURL || process.env.BACKEND_URL || 'http://localhost:3000';
    this.clientToken = options.clientToken || process.env.CLIENT_TOKEN || 'your_secure_client_token_here';
    this.defaultModel = options.defaultModel || 'gpt-3.5-turbo';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // Base delay in ms
    this.maxDelay = options.maxDelay || 10000; // Max delay in ms
    this.timeout = options.timeout || 30000; // Request timeout in ms
    
    // Concurrency control
    this.maxConcurrentRequests = options.maxConcurrentRequests || 3;
    this.activeRequests = 0;
    
    // Mock mode for testing
    this.mockMode = process.env.NODE_ENV === 'test' || options.mockMode === true;
    
    // Initialize backend proxy service
    this.backendProxy = new BackendProxyService({
      baseURL: this.baseURL,
      clientToken: this.clientToken,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    });
    
    // Telemetry instance
    this.telemetry = null;
  }

  /**
   * Call the LLM with the specified parameters
   * @param {Object} params - LLM call parameters
   * @param {string} params.model - Model to use (defaults to configured model)
   * @param {Array<Object>} params.messages - Array of message objects with role and content
   * @param {number} [params.maxTokens=500] - Maximum tokens to generate
   * @param {number} [params.temperature=0.1] - Sampling temperature (0-2)
   * @param {number} [params.topP=1] - Nucleus sampling parameter
   * @param {number} [params.frequencyPenalty=0] - Frequency penalty (-2 to 2)
   * @param {number} [params.presencePenalty=0] - Presence penalty (-2 to 2)
   * @param {string} [params.stop] - Stop sequence
   * @param {boolean} [params.stream=false] - Whether to stream the response
   * @param {boolean} [params.bypassConcurrency=false] - Whether to bypass concurrency control
   * @returns {Promise<Object>} LLM response object
   */
  async callLLM(params) {
    const {
      model = this.defaultModel,
      messages,
      maxTokens = 500,
      temperature = 0.1,
      topP = 1,
      frequencyPenalty = 0,
      presencePenalty = 0,
      stop = null,
      stream = false,
      bypassConcurrency = false
    } = params;

    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and must not be empty');
    }

    // Validate message format
    for (const message of messages) {
      if (!message.role || !message.content) {
        throw new Error('Each message must have role and content properties');
      }
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new Error('Message role must be system, user, or assistant');
      }
    }

    // Use mock response in test mode
    if (this.mockMode) {
      return this.getMockResponse(params);
    }

    // Check concurrency limits
    if (!bypassConcurrency && this.activeRequests >= this.maxConcurrentRequests) {
      throw new Error('Maximum concurrent requests exceeded');
    }

    // Track concurrency metrics
    if (this.telemetry) {
      this.telemetry.trackConcurrency({
        activeRequests: this.activeRequests,
        maxConcurrent: this.maxConcurrentRequests
      });
    }

    try {
      this.activeRequests++;
      
      // Prepare request payload
      const payload = {
        model,
        messages,
        maxTokens,
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        stream
      };

      // Add optional parameters
      if (stop) {
        payload.stop = stop;
      }

      // Call backend proxy
      const response = await this.backendProxy.callLLM(payload);
      
      // Track successful request
      if (this.telemetry) {
        this.telemetry.trackLLMUsage({
          model: response.model || model,
          tokens: response.usage?.total_tokens || 0,
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0
        });
      }
      
      return response;
      
    } catch (error) {
      // Track error
      if (this.telemetry) {
        this.telemetry.trackError('llm_backend_error', error.message, {
          model,
          activeRequests: this.activeRequests
        });
      }
      
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Call multiple LLM requests in batch
   * @param {Array<Object>} requests - Array of request objects
   * @param {Object} options - Batch options
   * @returns {Promise<Array<Object>>} Array of response objects
   */
  async callLLMBatch(requests, options = {}) {
    if (!Array.isArray(requests) || requests.length === 0) {
      return [];
    }

    // Validate all requests
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      if (!request.messages || !Array.isArray(request.messages)) {
        throw new Error(`Request ${i} is missing required messages array`);
      }
    }

    // Process requests with concurrency control
    const results = [];
    const concurrency = Math.min(options.concurrency || this.maxConcurrentRequests, requests.length);
    
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (request, index) => {
        try {
          const result = await this.callLLM({ ...request, bypassConcurrency: true });
          return {
            index: i + index,
            result: result,
            success: true
          };
        } catch (error) {
          console.error(`Batch request ${i + index} failed:`, error.message);
          return {
            index: i + index,
            result: null,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches if not the last batch
      if (i + concurrency < requests.length) {
        await this.delay(options.batchDelay || 100);
      }
    }

    // Sort results by original index and return only the results
    return results
      .sort((a, b) => a.index - b.index)
      .map(item => item.result);
  }

  /**
   * Test backend connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    return await this.backendProxy.testConnection();
  }

  /**
   * Get mock response for testing
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Mock response
   * @private
   */
  getMockResponse(params) {
    const { messages, model = this.defaultModel } = params;
    const lastMessage = messages[messages.length - 1];
    
    return Promise.resolve({
      content: `Mock response for: ${lastMessage.content.substring(0, 50)}...`,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      },
      model: model,
      choices: [{
        message: {
          role: 'assistant',
          content: `Mock response for: ${lastMessage.content.substring(0, 50)}...`
        },
        finish_reason: 'stop'
      }]
    });
  }

  /**
   * Delay utility function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set telemetry instance
   * @param {Object} telemetry - Telemetry instance
   */
  setTelemetry(telemetry) {
    this.telemetry = telemetry;
  }
}

module.exports = LLMClientBackend;
