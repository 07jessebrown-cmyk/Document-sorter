/**
 * Filename Generation Service
 * Dedicated service for generating high-quality filenames from document metadata
 */

const { buildMetadataPrompt } = require('./ai_prompts');

class FilenameGenerator {
  constructor(options = {}) {
    this.options = {
      maxLength: options.maxLength || 100,
      temperature: options.temperature || 0.3,
      model: options.model || 'gpt-3.5-turbo',
      ...options
    };
  }

  /**
   * Generate filename from metadata using AI
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated filename
   */
  async generateFilenameFromMetadata(metadata, fileExtension, options = {}) {
    const {
      maxLength = this.options.maxLength,
      temperature = this.options.temperature,
      model = this.options.model
    } = { ...this.options, ...options };

    try {
      // Build the filename generation prompt with regeneration context
      const prompt = this.buildFilenamePrompt(metadata, fileExtension, maxLength, options);
      
      // For now, use the basic filename generation logic
      // TODO: Integrate with AI service when available
      return this.generateBasicFilename(metadata, fileExtension, maxLength);
      
    } catch (error) {
      console.error('Filename generation failed:', error);
      return this.generateFallbackFilename(metadata, fileExtension);
    }
  }

  /**
   * Build filename generation prompt
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @param {number} maxLength - Maximum filename length
   * @param {Object} options - Additional options including regeneration context
   * @returns {Object} Prompt object
   */
  buildFilenamePrompt(metadata, fileExtension, maxLength, options = {}) {
    const systemPrompt = this.buildFilenameSystemPrompt(maxLength);
    const userPrompt = this.buildFilenameUserPrompt(metadata, fileExtension, options);

    return {
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      maxTokens: 150,
      temperature: options.temperature || this.options.temperature,
      model: options.model || this.options.model
    };
  }

  /**
   * Build system prompt for filename generation
   * @param {number} maxLength - Maximum filename length
   * @returns {string} System prompt
   */
  buildFilenameSystemPrompt(maxLength) {
    return `You are a filename generation assistant. Your task is to create clean, professional filenames from document metadata.

CRITICAL REQUIREMENTS:
1. Generate ONLY the filename (no explanations or additional text)
2. Use the exact format: {DocumentType}_{ClientName}_{YYYY-MM-DD}.{ext}
3. Maximum length: ${maxLength} characters
4. Use only letters, numbers, underscores (_), and hyphens (-)
5. Use PascalCase or TitleCase for readability
6. If metadata is missing, use "Unknown" or skip gracefully
7. Sanitize all special characters to underscores
8. Keep client names concise (max 30 chars)

NAMING CONVENTIONS:
- DocumentType: Invoice, Contract, Report, Receipt, etc.
- ClientName: Company or person name (sanitized)
- Date: YYYY-MM-DD format
- Extension: Keep original file extension

EXAMPLES:
Input: {type: "Invoice", clientName: "Acme Corp", date: "2024-01-15"}
Output: Invoice_AcmeCorp_2024-01-15.pdf

Input: {type: "Contract", clientName: "Microsoft Corporation", date: "2024-03-20"}
Output: Contract_MicrosoftCorp_2024-03-20.pdf

Input: {type: "Report", clientName: null, date: "2024-02-10"}
Output: Report_UnknownClient_2024-02-10.pdf

Input: {type: "Invoice", clientName: "ABC Company", date: null}
Output: Invoice_ABCCompany_UnknownDate.pdf

QUALITY GUIDELINES:
- Be concise but descriptive
- Avoid generic names like "Document" or "File"
- Use consistent formatting
- Make it human-readable
- Prioritize clarity over brevity`;
  }

  /**
   * Build user prompt for filename generation
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @param {Object} options - Additional options including regeneration context
   * @returns {string} User prompt
   */
  buildFilenameUserPrompt(metadata, fileExtension, options = {}) {
    let prompt = `Generate a filename for this document:

Document Type: ${metadata.type || 'Unknown'}
Client Name: ${metadata.clientName || 'Unknown'}
Date: ${metadata.date || 'Unknown'}
File Extension: ${fileExtension}`;

    // Add regeneration context if this is a regeneration attempt
    if (options.previousSuggestion && options.regenerationAttempt) {
      prompt += `

REGENERATION CONTEXT:
This is regeneration attempt #${options.regenerationAttempt}.
Previous suggestion was: "${options.previousSuggestion}"
Please generate a different filename that captures the same meaning but avoids repetition.
Be more creative and try a different approach while maintaining accuracy.`;
    }

    prompt += `

Respond with ONLY the filename, no additional text.`;

    return prompt;
  }

  /**
   * Generate basic filename using current logic (fallback)
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @param {number} maxLength - Maximum filename length
   * @returns {string} Generated filename
   */
  generateBasicFilename(metadata, fileExtension, maxLength) {
    const parts = [];
    
    // Document type
    let documentType = 'Unknown';
    if (metadata.type && metadata.type.trim()) {
      documentType = this.sanitizeComponent(metadata.type.trim());
    }
    parts.push(documentType);
    
    // Client name
    let clientName = 'UnknownClient';
    if (metadata.clientName && metadata.clientName.trim()) {
      clientName = this.sanitizeComponent(metadata.clientName.trim());
      // Truncate if too long
      if (clientName.length > 30) {
        clientName = clientName.substring(0, 30);
      }
    }
    parts.push(clientName);
    
    // Date
    if (metadata.date) {
      parts.push(metadata.date);
    }
    
    // Build filename
    let filename = parts.join('_') + fileExtension;
    
    // Truncate if too long
    if (filename.length > maxLength) {
      const baseLength = maxLength - fileExtension.length - 1;
      const truncated = parts.join('_').substring(0, baseLength);
      filename = truncated + fileExtension;
    }
    
    return filename;
  }

  /**
   * Generate fallback filename when all else fails
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @returns {string} Fallback filename
   */
  generateFallbackFilename(metadata, fileExtension) {
    const timestamp = new Date().toISOString().split('T')[0];
    return `Document_${timestamp}${fileExtension}`;
  }

  /**
   * Sanitize component for filename
   * @param {string} component - Component to sanitize
   * @returns {string} Sanitized component
   */
  sanitizeComponent(component) {
    return component
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50); // Limit component length
  }

  /**
   * Validate generated filename
   * @param {string} filename - Filename to validate
   * @param {number} maxLength - Maximum allowed length
   * @returns {Object} Validation result
   */
  validateFilename(filename, maxLength = 100) {
    const issues = [];
    
    if (filename.length > maxLength) {
      issues.push(`Filename too long: ${filename.length} > ${maxLength}`);
    }
    
    if (filename.includes(' ')) {
      issues.push('Filename contains spaces');
    }
    
    if (/[<>:"/\\|?*]/.test(filename)) {
      issues.push('Filename contains invalid characters');
    }
    
    if (filename.startsWith('.')) {
      issues.push('Filename starts with dot');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      filename
    };
  }
}

module.exports = FilenameGenerator;
