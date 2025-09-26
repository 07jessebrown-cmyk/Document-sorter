const https = require('https');
const { URL } = require('url');

/**
 * Semaphore class for concurrency control
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits;
    this.waiting = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release() {
    this.permits++;
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      this.permits--;
      resolve();
    }
  }
}

/**
 * LLM Client Wrapper for AI Text Service
 * Provides a unified interface for calling various LLM providers
 * with retry logic, error handling, and mock mode support
 */

class LLMClient {
  constructor(options = {}) {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || options.apiKey;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.defaultModel = options.defaultModel || 'gpt-3.5-turbo';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // Base delay in ms
    this.maxDelay = options.maxDelay || 10000; // Max delay in ms
    this.timeout = options.timeout || 30000; // Request timeout in ms
    
    // Concurrency control
    this.maxConcurrentRequests = options.maxConcurrentRequests || 3;
    this.requestQueue = [];
    this.activeRequests = 0;
    this.requestSemaphore = new Semaphore(this.maxConcurrentRequests);
    
    // Batching configuration
    this.batchSize = options.batchSize || 5;
    this.batchDelay = options.batchDelay || 100; // Delay between batches in ms
    this.batchTimeout = options.batchTimeout || 2000; // Max time to wait for batch to fill
    
    // Mock mode for testing
    this.mockMode = process.env.NODE_ENV === 'test' || options.mockMode === true;
    
    // Telemetry instance
    this.telemetry = null;
    
    // Validate API key in non-mock mode
    if (!this.mockMode && !this.apiKey) {
      console.warn('LLM Client: No API key found. Set OPENAI_API_KEY or AI_API_KEY environment variable.');
    }
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

    // Validate API key
    if (!this.apiKey) {
      throw new Error('API key is required for LLM calls');
    }

    // Prepare request payload
    const payload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stream
    };

    // Add optional parameters
    if (stop) {
      payload.stop = stop;
    }

    // Apply concurrency control unless bypassed
    if (bypassConcurrency) {
      return await this.makeAPICallWithRetry(payload);
    } else {
      return await this.callWithConcurrencyControl(payload);
    }
  }

  /**
   * Call LLM with concurrency control using semaphore
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} LLM response object
   * @private
   */
  async callWithConcurrencyControl(payload) {
    // Acquire semaphore permit
    await this.requestSemaphore.acquire();
    
    try {
      this.activeRequests++;
      
      // Track concurrency metrics
      if (this.telemetry) {
        this.telemetry.trackConcurrency({
          activeRequests: this.activeRequests,
          maxConcurrent: this.maxConcurrentRequests,
          queueLength: this.requestQueue.length
        });
      }
      
      return await this.makeAPICallWithRetry(payload);
    } finally {
      this.activeRequests--;
      this.requestSemaphore.release();
    }
  }

  /**
   * Call multiple LLM requests in batch with concurrency control
   * @param {Array<Object>} requests - Array of request objects
   * @param {Object} options - Batch options
   * @param {number} [options.concurrency] - Max concurrent requests (defaults to maxConcurrentRequests)
   * @param {number} [options.batchDelay] - Delay between batches in ms
   * @returns {Promise<Array<Object>>} Array of response objects
   */
  async callLLMBatch(requests, options = {}) {
    const { 
      concurrency = this.maxConcurrentRequests,
      batchDelay = this.batchDelay 
    } = options;

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

    const results = [];
    const tempSemaphore = new Semaphore(concurrency);

    // Process requests in batches
    for (let i = 0; i < requests.length; i += this.batchSize) {
      const batch = requests.slice(i, i + this.batchSize);
      
      const batchPromises = batch.map(async (request, index) => {
        await tempSemaphore.acquire();
        
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
        } finally {
          tempSemaphore.release();
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches if not the last batch
      if (i + this.batchSize < requests.length) {
        await this.delay(batchDelay);
      }
    }

    // Sort results by original index and return only the results
    return results
      .sort((a, b) => a.index - b.index)
      .map(item => item.result);
  }

  /**
   * Call LLM with intelligent batching - groups similar requests
   * @param {Array<Object>} requests - Array of request objects
   * @param {Object} options - Batching options
   * @param {Function} [options.groupBy] - Function to group requests by similarity
   * @param {number} [options.maxBatchSize] - Maximum batch size
   * @returns {Promise<Array<Object>>} Array of response objects
   */
  async callLLMIntelligentBatch(requests, options = {}) {
    const { 
      groupBy = (req) => req.model || this.defaultModel,
      maxBatchSize = this.batchSize
    } = options;

    if (!Array.isArray(requests) || requests.length === 0) {
      return [];
    }

    // Group requests by similarity (e.g., by model)
    const groups = new Map();
    requests.forEach((request, index) => {
      const key = groupBy(request);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push({ ...request, originalIndex: index });
    });

    const results = new Array(requests.length);

    // Process each group
    for (const [groupKey, groupRequests] of groups) {
      // Split large groups into smaller batches
      for (let i = 0; i < groupRequests.length; i += maxBatchSize) {
        const batch = groupRequests.slice(i, i + maxBatchSize);
        
        try {
          const batchResults = await this.callLLMBatch(batch, options);
          
          // Map results back to original indices
          batch.forEach((request, batchIndex) => {
            results[request.originalIndex] = batchResults[batchIndex];
          });
        } catch (error) {
          console.error(`Intelligent batch processing failed for group ${groupKey}:`, error.message);
          
          // Mark all requests in this batch as failed
          batch.forEach(request => {
            results[request.originalIndex] = null;
          });
        }
      }
    }

    return results;
  }

  /**
   * Get current concurrency statistics
   * @returns {Object} Concurrency statistics
   */
  getConcurrencyStats() {
    return {
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      queueLength: this.requestQueue.length,
      availablePermits: this.requestSemaphore.permits,
      utilizationRate: this.activeRequests / this.maxConcurrentRequests
    };
  }

  /**
   * Update concurrency settings
   * @param {Object} settings - New concurrency settings
   */
  updateConcurrencySettings(settings) {
    if (settings.maxConcurrentRequests !== undefined) {
      this.maxConcurrentRequests = Math.max(1, settings.maxConcurrentRequests);
      this.requestSemaphore = new Semaphore(this.maxConcurrentRequests);
    }
    if (settings.batchSize !== undefined) {
      this.batchSize = Math.max(1, settings.batchSize);
    }
    if (settings.batchDelay !== undefined) {
      this.batchDelay = Math.max(0, settings.batchDelay);
    }
    if (settings.batchTimeout !== undefined) {
      this.batchTimeout = Math.max(100, settings.batchTimeout);
    }
  }

  /**
   * Make API call with exponential backoff retry logic
   * @param {Object} payload - Request payload
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} API response
   * @private
   */
  async makeAPICallWithRetry(payload, attempt = 1) {
    try {
      const response = await this.makeAPICall(payload);
      return response;
    } catch (error) {
      // Track retry attempt
      if (this.telemetry) {
        this.telemetry.trackError('llm_api_retry', `Attempt ${attempt}: ${error.message}`, {
          attempt,
          maxRetries: this.maxRetries,
          model: payload.model
        });
      }
      
      // Check if we should retry
      if (attempt < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.calculateRetryDelay(attempt);
        console.log(`LLM API call failed (attempt ${attempt}), retrying in ${delay}ms...`);
        
        await this.delay(delay);
        return await this.makeAPICallWithRetry(payload, attempt + 1);
      }
      
      // Max retries exceeded or non-retryable error
      const finalError = new Error(`LLM API call failed after ${attempt} attempts: ${error.message}`);
      
      // Track final failure
      if (this.telemetry) {
        this.telemetry.trackError('llm_api_final_failure', finalError.message, {
          attempts: attempt,
          model: payload.model,
          originalError: error.message
        });
      }
      
      throw finalError;
    }
  }

  /**
   * Make the actual API call
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   * @private
   */
  async makeAPICall(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseURL}/chat/completions`);
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(this.formatResponse(response));
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${response.error?.message || data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse API response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Format the API response to a consistent structure
   * @param {Object} response - Raw API response
   * @returns {Object} Formatted response
   * @private
   */
  formatResponse(response) {
    if (!response.choices || !response.choices[0]) {
      throw new Error('Invalid API response: no choices found');
    }

    const choice = response.choices[0];
    
    return {
      content: choice.message?.content || '',
      role: choice.message?.role || 'assistant',
      finishReason: choice.finish_reason,
      usage: response.usage || {},
      model: response.model,
      id: response.id,
      created: response.created
    };
  }

  /**
   * Determine if an error should trigger a retry
   * @param {Error} error - The error that occurred
   * @returns {boolean} True if should retry
   * @private
   */
  shouldRetry(error) {
    const message = error.message.toLowerCase();
    
    // Retry on network errors, timeouts, and rate limits
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('rate limit') ||
           message.includes('too many requests') ||
           message.includes('service unavailable') ||
           message.includes('internal server error') ||
           message.includes('bad gateway') ||
           message.includes('gateway timeout');
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   * @private
   */
  calculateRetryDelay(attempt) {
    const delay = this.retryDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Add delay between operations
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get mock response for testing
   * @param {Object} params - Original call parameters
   * @returns {Promise<Object>} Mock response
   * @private
   */
  async getMockResponse(params) {
    // Simulate API delay
    await this.delay(100 + Math.random() * 200);
    
    // Generate mock response based on the last user message
    const lastMessage = params.messages.find(m => m.role === 'user');
    const content = lastMessage ? lastMessage.content : '';
    
    // Simple mock logic for different types of requests
    let mockContent = 'Mock AI response';
    
    if (content.includes('metadata') || content.includes('extract')) {
      mockContent = JSON.stringify({
        clientName: 'Mock Client',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Mock Document',
        docTypeConfidence: 0.95,
        snippets: ['Mock snippet 1', 'Mock snippet 2']
      });
    } else if (content.includes('classify') || content.includes('type')) {
      mockContent = 'Mock classification result';
    } else if (content.includes('summarize')) {
      mockContent = 'Mock summary of the document content';
    }
    
    return {
      content: mockContent,
      role: 'assistant',
      finishReason: 'stop',
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75
      },
      model: params.model || this.defaultModel,
      id: 'mock-' + Date.now(),
      created: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Test the connection to the LLM service
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      if (this.mockMode) {
        return true;
      }

      const response = await this.callLLM({
        model: this.defaultModel,
        messages: [
          { role: 'user', content: 'Test connection' }
        ],
        maxTokens: 10
      });

      return response && response.content !== undefined;
    } catch (error) {
      console.error('LLM connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get client configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      hasApiKey: !!this.apiKey,
      baseURL: this.baseURL,
      defaultModel: this.defaultModel,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      maxDelay: this.maxDelay,
      timeout: this.timeout,
      mockMode: this.mockMode,
      concurrency: {
        maxConcurrentRequests: this.maxConcurrentRequests,
        activeRequests: this.activeRequests,
        availablePermits: this.requestSemaphore.permits
      },
      batching: {
        batchSize: this.batchSize,
        batchDelay: this.batchDelay,
        batchTimeout: this.batchTimeout
      }
    };
  }

  /**
   * Set the telemetry instance
   * @param {Object} telemetry - The telemetry instance
   */
  setTelemetry(telemetry) {
    this.telemetry = telemetry;
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration options
   */
  updateConfig(config) {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.baseURL !== undefined) this.baseURL = config.baseURL;
    if (config.defaultModel !== undefined) this.defaultModel = config.defaultModel;
    if (config.maxRetries !== undefined) this.maxRetries = config.maxRetries;
    if (config.retryDelay !== undefined) this.retryDelay = config.retryDelay;
    if (config.maxDelay !== undefined) this.maxDelay = config.maxDelay;
    if (config.timeout !== undefined) this.timeout = config.timeout;
    if (config.mockMode !== undefined) this.mockMode = config.mockMode;
    
    // Update concurrency settings
    if (config.maxConcurrentRequests !== undefined) {
      this.updateConcurrencySettings({ maxConcurrentRequests: config.maxConcurrentRequests });
    }
    if (config.batchSize !== undefined) {
      this.updateConcurrencySettings({ batchSize: config.batchSize });
    }
    if (config.batchDelay !== undefined) {
      this.updateConcurrencySettings({ batchDelay: config.batchDelay });
    }
    if (config.batchTimeout !== undefined) {
      this.updateConcurrencySettings({ batchTimeout: config.batchTimeout });
    }
  }

  /**
   * Close the service and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    // Clear any pending operations
    this.waiting = [];
    this.permits = 0;
    
    // Clear any pending batches
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    // Clear any pending operations
    this.pendingOperations = [];
    this.currentBatch = [];
    
    console.log('🔒 LLM Client closed');
  }
}

module.exports = LLMClient;
