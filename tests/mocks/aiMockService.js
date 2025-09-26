/**
 * Mock AI Service for CI Testing
 * Provides consistent mock responses for AI-related services
 */

const ciConfig = require('../../config/ci.json');

class AIMockService {
  constructor() {
    this.mockResponses = ciConfig.ai.mockResponses;
    this.callCount = 0;
  }

  /**
   * Mock document analysis
   */
  async analyzeDocument(text, options = {}) {
    this.callCount++;
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const response = { ...this.mockResponses.documentAnalysis };
    
    // Add some variation based on input
    if (text.includes('invoice') || text.includes('bill')) {
      response.fields.documentType = 'Invoice';
    } else if (text.includes('contract') || text.includes('agreement')) {
      response.fields.documentType = 'Contract';
    } else if (text.includes('receipt')) {
      response.fields.documentType = 'Receipt';
    }
    
    // Add confidence variation
    response.confidence = Math.max(0.7, Math.min(0.99, response.confidence + (Math.random() - 0.5) * 0.1));
    
    return response;
  }

  /**
   * Mock table extraction
   */
  async extractTables(pdfBuffer) {
    this.callCount++;
    
    await new Promise(resolve => setTimeout(resolve, 5));
    
    return this.mockResponses.tableExtraction;
  }

  /**
   * Mock language detection
   */
  async detectLanguage(text) {
    this.callCount++;
    
    await new Promise(resolve => setTimeout(resolve, 2));
    
    const response = { ...this.mockResponses.languageDetection };
    
    // Detect language based on text content
    if (text.includes('español') || text.includes('hola')) {
      response.language = 'es';
    } else if (text.includes('français') || text.includes('bonjour')) {
      response.language = 'fr';
    } else if (text.includes('deutsch') || text.includes('hallo')) {
      response.language = 'de';
    }
    
    return response;
  }

  /**
   * Mock signature detection
   */
  async detectSignature(pdfBuffer) {
    this.callCount++;
    
    await new Promise(resolve => setTimeout(resolve, 8));
    
    const response = { ...this.mockResponses.signatureDetection };
    
    // Simulate signature detection based on content
    response.hasSignature = Math.random() > 0.3; // 70% chance of signature
    
    return response;
  }

  /**
   * Mock watermark detection
   */
  async detectWatermark(pdfBuffer) {
    this.callCount++;
    
    await new Promise(resolve => setTimeout(resolve, 6));
    
    return this.mockResponses.watermarkDetection;
  }

  /**
   * Mock handwriting detection
   */
  async detectHandwriting(pdfBuffer) {
    this.callCount++;
    
    await new Promise(resolve => setTimeout(resolve, 7));
    
    return this.mockResponses.handwritingDetection;
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      totalCalls: this.callCount,
      mockMode: true
    };
  }

  /**
   * Reset call counter
   */
  reset() {
    this.callCount = 0;
  }
}

module.exports = AIMockService;
