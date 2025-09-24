const https = require('https');
const { URL } = require('url');

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
      stream = false
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

    // Make the API call with retry logic
    return await this.makeAPICallWithRetry(payload);
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
      mockMode: this.mockMode
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
  }
}

module.exports = LLMClient;
