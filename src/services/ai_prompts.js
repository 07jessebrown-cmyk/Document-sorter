/**
 * AI Prompt Templates for Document Metadata Extraction
 * Provides structured prompts for LLM calls to extract document metadata
 * 
 * This service generates prompts that enforce JSON-only output with required
 * fields and confidence scores for document classification.
 */

/**
 * Build a metadata extraction prompt for a single document
 * @param {string} text - Raw extracted text from document
 * @param {Object} options - Optional configuration
 * @param {string} options.model - AI model being used (for model-specific instructions)
 * @param {boolean} options.includeExamples - Whether to include examples in prompt
 * @param {number} options.maxTokens - Maximum tokens for response
 * @param {string} options.detectedLanguage - Detected language code (e.g., 'eng', 'spa', 'fra')
 * @param {string} options.languageName - Human-readable language name (e.g., 'English', 'Spanish')
 * @returns {Object} Prompt object with messages array for LLM call
 */
function buildMetadataPrompt(text, options = {}) {
  const {
    model = 'gpt-3.5-turbo',
    includeExamples = true,
    maxTokens = 1000,
    detectedLanguage = null,
    languageName = null,
    hasTableData = false,
    tableContext = null
  } = options;

  // Truncate text if too long (leave room for prompt and response)
  const maxTextLength = 3000;
  const truncatedText = text.length > maxTextLength 
    ? text.substring(0, maxTextLength) + '\n\n[Text truncated...]'
    : text;

  const systemPrompt = buildSystemPrompt(model, includeExamples, detectedLanguage, languageName, hasTableData, tableContext);
  const userPrompt = buildUserPrompt(truncatedText, detectedLanguage, languageName, hasTableData, tableContext);

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
    maxTokens,
    temperature: 0.1, // Low temperature for consistent JSON output
    model
  };
}

/**
 * Build the system prompt with instructions and examples
 * @param {string} model - AI model being used
 * @param {boolean} includeExamples - Whether to include examples
 * @param {string} detectedLanguage - Detected language code (optional)
 * @param {string} languageName - Human-readable language name (optional)
 * @returns {string} System prompt content
 */
function buildSystemPrompt(model, includeExamples = true, detectedLanguage = null, languageName = null, hasTableData = false, tableContext = null) {
  // Add language-specific instructions if language is detected
  const languageContext = detectedLanguage && languageName 
    ? `\nLANGUAGE CONTEXT: The document appears to be written in ${languageName} (${detectedLanguage}). Please consider this when extracting metadata and interpreting document structure.`
    : '';

  // Add table context if table data is present
  const tableContextHint = hasTableData 
    ? `\nTABLE CONTEXT: This document contains structured table data. Pay special attention to table headers, rows, and cells when extracting client names, dates, and document types. Table data often contains the most reliable metadata.`
    : '';

  const baseInstructions = `You are a document metadata extraction assistant. Your task is to analyze document text and extract structured information about the client, date, and document type.${languageContext}${tableContextHint}

CRITICAL REQUIREMENTS:
1. You MUST respond with ONLY valid JSON
2. Do not include any text before or after the JSON
3. Use the exact field names specified below
4. Provide confidence scores as numbers between 0.0 and 1.0
5. If information is not found, use null for the value and 0.0 for confidence
6. Extract relevant text snippets that support your findings

REQUIRED JSON STRUCTURE:
{
  "clientName": "string or null",
  "clientConfidence": "number between 0.0 and 1.0",
  "date": "string in YYYY-MM-DD format or null",
  "dateConfidence": "number between 0.0 and 1.0", 
  "docType": "string or null",
  "docTypeConfidence": "number between 0.0 and 1.0",
  "snippets": ["array of supporting text snippets"]
}

FIELD GUIDELINES:
- clientName: Company, organization, or person name (e.g., "Acme Corporation", "John Smith")
- date: Document date in YYYY-MM-DD format (e.g., "2024-01-15")
- docType: Document type (e.g., "Invoice", "Contract", "Receipt", "Statement", "Report")
- snippets: Array of 1-3 relevant text excerpts that support your findings
- confidence: How certain you are (0.0 = not found, 1.0 = very certain)`;

  if (!includeExamples) {
    return baseInstructions;
  }

  const examples = `

EXAMPLES:

Example 1 - Invoice:
Input: "INVOICE #12345\\nAcme Corporation\\n123 Business St\\nInvoice Date: January 15, 2024\\nAmount Due: $1,500.00"
Output: {
  "clientName": "Acme Corporation",
  "clientConfidence": 0.95,
  "date": "2024-01-15",
  "dateConfidence": 0.90,
  "docType": "Invoice",
  "docTypeConfidence": 0.98,
  "snippets": ["INVOICE #12345", "Acme Corporation", "Invoice Date: January 15, 2024"]
}

Example 2 - Contract:
Input: "SERVICE AGREEMENT\\nBetween ABC Company and XYZ Corp\\nEffective Date: March 1, 2024\\nThis agreement covers..."
Output: {
  "clientName": "ABC Company",
  "clientConfidence": 0.85,
  "date": "2024-03-01", 
  "dateConfidence": 0.80,
  "docType": "Contract",
  "docTypeConfidence": 0.90,
  "snippets": ["SERVICE AGREEMENT", "Between ABC Company and XYZ Corp", "Effective Date: March 1, 2024"]
}

Example 3 - Unclear Document:
Input: "Random text with no clear structure or identifiable information"
Output: {
  "clientName": null,
  "clientConfidence": 0.0,
  "date": null,
  "dateConfidence": 0.0,
  "docType": null,
  "docTypeConfidence": 0.0,
  "snippets": []
}`;

  return baseInstructions + examples;
}

/**
 * Build the user prompt with the document text
 * @param {string} text - Document text to analyze
 * @param {string} detectedLanguage - Detected language code (optional)
 * @param {string} languageName - Human-readable language name (optional)
 * @returns {string} User prompt content
 */
function buildUserPrompt(text, detectedLanguage = null, languageName = null, hasTableData = false, tableContext = null) {
  const languageHint = detectedLanguage && languageName 
    ? `\nNote: This document appears to be in ${languageName}. Please consider this when extracting metadata.`
    : '';

  const tableHint = hasTableData 
    ? `\nNote: This document contains table data. Focus on table content for the most accurate metadata extraction.`
    : '';

  return `Please analyze the following document text and extract the metadata as specified in the system instructions. Respond with ONLY the JSON object, no additional text.${languageHint}${tableHint}

DOCUMENT TEXT:
${text}`;
}

/**
 * Build a batch metadata extraction prompt for multiple documents
 * @param {Array<Object>} items - Array of items with text property
 * @param {Object} options - Optional configuration
 * @param {string} options.model - AI model being used
 * @param {boolean} options.includeExamples - Whether to include examples
 * @param {number} options.maxTokens - Maximum tokens for response
 * @returns {Object} Prompt object with messages array for batch LLM call
 */
function buildBatchMetadataPrompt(items, options = {}) {
  const {
    model = 'gpt-3.5-turbo',
    includeExamples = false, // Skip examples for batch to save tokens
    maxTokens = 2000
  } = options;

  // Filter out empty items and truncate text
  const validItems = items
    .filter(item => item.text && item.text.trim().length > 0)
    .map(item => ({
      ...item,
      text: item.text.length > 1000 
        ? item.text.substring(0, 1000) + '\n\n[Text truncated...]'
        : item.text
    }));

  if (validItems.length === 0) {
    throw new Error('No valid items provided for batch processing');
  }

  const systemPrompt = buildSystemPrompt(model, includeExamples);
  const userPrompt = buildBatchUserPrompt(validItems);

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
    maxTokens,
    temperature: 0.1,
    model
  };
}

/**
 * Build the user prompt for batch processing
 * @param {Array<Object>} items - Array of items with text property
 * @returns {string} User prompt content for batch processing
 */
function buildBatchUserPrompt(items) {
  const documentsText = items
    .map((item, index) => `Document ${index + 1}:\n${item.text}`)
    .join('\n\n' + '='.repeat(50) + '\n\n');

  return `Please analyze the following ${items.length} document(s) and extract metadata for each one. Respond with a JSON array where each element follows the required structure.

DOCUMENTS:
${documentsText}

Respond with ONLY a JSON array, no additional text.`;
}

/**
 * Validate that a response follows the required JSON structure
 * @param {string} response - Raw response from LLM
 * @returns {Object} Validation result with isValid and parsed data
 */
function validateResponse(response) {
  try {
    // Clean the response - remove any non-JSON text
    const cleanedResponse = response.trim();
    
    // Try to find JSON in the response
    let jsonStart = cleanedResponse.indexOf('{');
    let jsonEnd = cleanedResponse.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      return {
        isValid: false,
        error: 'No valid JSON object found in response',
        data: null
      };
    }

    const jsonString = cleanedResponse.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    // Validate required fields
    const requiredFields = [
      'clientName', 'clientConfidence', 
      'date', 'dateConfidence',
      'docType', 'docTypeConfidence', 
      'snippets'
    ];

    const missingFields = requiredFields.filter(field => !(field in parsed));
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        data: parsed
      };
    }

    // Validate field types
    const typeErrors = [];
    
    if (parsed.clientName !== null && typeof parsed.clientName !== 'string') {
      typeErrors.push('clientName must be string or null');
    }
    if (typeof parsed.clientConfidence !== 'number' || parsed.clientConfidence < 0 || parsed.clientConfidence > 1) {
      typeErrors.push('clientConfidence must be number between 0.0 and 1.0');
    }
    if (parsed.date !== null && typeof parsed.date !== 'string') {
      typeErrors.push('date must be string or null');
    }
    if (typeof parsed.dateConfidence !== 'number' || parsed.dateConfidence < 0 || parsed.dateConfidence > 1) {
      typeErrors.push('dateConfidence must be number between 0.0 and 1.0');
    }
    if (parsed.docType !== null && typeof parsed.docType !== 'string') {
      typeErrors.push('docType must be string or null');
    }
    if (typeof parsed.docTypeConfidence !== 'number' || parsed.docTypeConfidence < 0 || parsed.docTypeConfidence > 1) {
      typeErrors.push('docTypeConfidence must be number between 0.0 and 1.0');
    }
    if (!Array.isArray(parsed.snippets)) {
      typeErrors.push('snippets must be an array');
    }

    if (typeErrors.length > 0) {
      return {
        isValid: false,
        error: `Type validation errors: ${typeErrors.join(', ')}`,
        data: parsed
      };
    }

    return {
      isValid: true,
      error: null,
      data: parsed
    };

  } catch (error) {
    return {
      isValid: false,
      error: `JSON parsing error: ${error.message}`,
      data: null
    };
  }
}

/**
 * Get prompt statistics for monitoring
 * @returns {Object} Statistics about prompt usage
 */
function getPromptStats() {
  return {
    totalPromptsGenerated: 0, // This would be tracked in a real implementation
    averageTokensUsed: 0,
    validationSuccessRate: 0,
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  buildMetadataPrompt,
  buildBatchMetadataPrompt,
  validateResponse,
  getPromptStats
};
