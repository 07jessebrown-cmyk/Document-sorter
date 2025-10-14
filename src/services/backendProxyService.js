const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Backend Proxy Service
 * Handles communication with the backend server instead of direct OpenAI API calls
 */
class BackendProxyService {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:3000';
    this.clientToken = options.clientToken || 'your_secure_client_token_here';
    this.timeout = options.timeout || 30000; // 30 seconds
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second base delay
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   * @private
   */
  async makeRequest(endpoint, options = {}) {
    const url = new URL(endpoint, this.baseURL);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': this.clientToken,
        ...options.headers
      },
      timeout: this.timeout
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    return new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const responseData = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(responseData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData.error || data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  /**
   * Call OpenAI API through backend proxy
   * @param {Object} params - LLM call parameters
   * @returns {Promise<Object>} LLM response object
   */
  async callLLM(params) {
    const { model, messages, maxTokens, temperature, ...otherParams } = params;
    
    const payload = {
      model: model || 'gpt-3.5-turbo',
      messages,
      max_tokens: maxTokens || 500,
      temperature: temperature || 0.1,
      ...otherParams
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest('/api/openai', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        // Transform response to match expected format
        if (response.choices && response.choices[0]) {
          return {
            content: response.choices[0].message.content,
            usage: response.usage,
            model: response.model,
            choices: response.choices
          };
        } else {
          throw new Error('Invalid response format from backend');
        }
      } catch (error) {
        console.warn(`Backend proxy attempt ${attempt}/${this.maxRetries} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  /**
   * Process document with AI through backend proxy
   * @param {string} text - Document text
   * @param {string} instructions - Processing instructions
   * @returns {Promise<Object>} AI processing result
   */
  async processDocument(text, instructions) {
    const payload = {
      text,
      instructions
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest('/api/process-document', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        // Transform response to match expected format
        if (response.choices && response.choices[0]) {
          return {
            content: response.choices[0].message.content,
            usage: response.usage,
            model: response.model,
            choices: response.choices
          };
        } else {
          throw new Error('Invalid response format from backend');
        }
      } catch (error) {
        console.warn(`Backend proxy attempt ${attempt}/${this.maxRetries} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  /**
   * Test backend connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('/health');
      return {
        success: true,
        message: 'Backend connection successful',
        status: response.status,
        timestamp: response.timestamp
      };
    } catch (error) {
      return {
        success: false,
        error: `Backend connection failed: ${error.message}`
      };
    }
  }

  /**
   * Suggest filename using backend proxy
   * @param {string} filePath - File path
   * @param {string} text - Document text
   * @returns {Promise<Object>} Rename suggestions
   */
  async suggestRename(filePath, text) {
    try {
      const filename = require('path').basename(filePath);
      const instructions = `Current filename: ${filename}

Document content:
${text}

Suggest 3 improved filenames that:
- Are clear and descriptive
- Include key info (date, type, parties involved)
- Use standard naming conventions (Title_Case or snake_case)
- Keep under 50 characters
- Preserve the file extension

Return ONLY a JSON array of 3 strings. Example: ["Invoice_Acme_Corp_2024-01-15.pdf", "2024_Acme_Invoice.pdf", "Acme_Jan2024_Invoice.pdf"]`;

      const response = await this.processDocument(text, instructions);
      
      if (response && response.content) {
        const suggestions = JSON.parse(response.content);
        return { success: true, suggestions };
      } else {
        throw new Error('Invalid response from backend');
      }
    } catch (error) {
      console.error('Backend proxy suggestRename error:', error);
      return { 
        success: false, 
        error: `Backend error: ${error.message}` 
      };
    }
  }

  /**
   * Test API key through backend (this will be handled by backend authentication)
   * @param {string} apiKey - API key (not used directly, backend handles this)
   * @returns {Promise<Object>} Test result
   */
  async testApiKey(apiKey) {
    try {
      const result = await this.testConnection();
      if (result.success) {
        return { success: true, message: 'Backend connection successful' };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: `Backend test failed: ${error.message}` };
    }
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
}

module.exports = BackendProxyService;
