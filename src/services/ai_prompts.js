/**
 * AI Prompt Templates for Document Metadata Extraction
 * Provides structured prompts for LLM calls to extract document metadata
 * 
 * This service generates prompts that enforce JSON-only output with required
 * fields and confidence scores for document classification.
 */

/**
 * Build enhanced context with file metadata and pre-extracted entities
 * @param {string} text - Document text
 * @param {Object} fileMetadata - File metadata (created, modified, size, name, mimeType)
 * @param {Object} preExtractedEntities - Pre-extracted entities (docType, clientName, date, amount)
 * @param {Object} options - Context enhancement options
 * @returns {string} Enhanced context string
 */
function buildEnhancedContext(text, fileMetadata = null, preExtractedEntities = null, options = {}) {
  const { includeFileMetadata = true, includePreExtractedEntities = true, maxTextLength = 6000 } = options;
  
  // Calculate space needed for metadata and entities (approximate)
  const metadataSpace = includeFileMetadata && fileMetadata ? 200 : 0;
  const entitiesSpace = includePreExtractedEntities && preExtractedEntities ? 150 : 0;
  const headerSpace = 50; // "DOCUMENT CONTENT:" etc.
  
  const availableTextSpace = maxTextLength - metadataSpace - entitiesSpace - headerSpace;
  const truncatedText = text.length > availableTextSpace 
    ? text.substring(0, availableTextSpace) + '\n\n[Text truncated...]'
    : text;
  
  let context = `DOCUMENT CONTENT:\n${truncatedText}`;
  
  // Add file metadata context
  if (includeFileMetadata && fileMetadata) {
    context += `\n\nFILE METADATA:\n`;
    if (fileMetadata.created) {
      context += `- Created: ${fileMetadata.created}\n`;
    }
    if (fileMetadata.modified) {
      context += `- Modified: ${fileMetadata.modified}\n`;
    }
    if (fileMetadata.size) {
      const sizeKB = Math.round(fileMetadata.size / 1024);
      context += `- File size: ${sizeKB} KB\n`;
    }
    if (fileMetadata.name) {
      context += `- Original filename: ${fileMetadata.name}\n`;
    }
    if (fileMetadata.mimeType) {
      context += `- MIME type: ${fileMetadata.mimeType}\n`;
    }
  }
  
  // Add pre-extracted entities context
  if (includePreExtractedEntities && preExtractedEntities) {
    context += `\n\nPRE-EXTRACTED ENTITIES:\n`;
    if (preExtractedEntities.docType) {
      context += `- Document type: ${preExtractedEntities.docType}\n`;
    }
    if (preExtractedEntities.clientName) {
      context += `- Client name: ${preExtractedEntities.clientName}\n`;
    }
    if (preExtractedEntities.date) {
      context += `- Date: ${preExtractedEntities.date}\n`;
    }
    if (preExtractedEntities.amount) {
      context += `- Amount: ${preExtractedEntities.amount}\n`;
    }
  }
  
  return context;
}

/**
 * Build a metadata extraction prompt for a single document
 * @param {string} text - Raw extracted text from document
 * @param {Object} options - Optional configuration
 * @param {string} options.model - AI model being used (for model-specific instructions)
 * @param {boolean} options.includeExamples - Whether to include examples in prompt
 * @param {number} options.maxTokens - Maximum tokens for response
 * @returns {Object} Prompt object with messages array for LLM call
 */
function buildMetadataPrompt(text, options = {}) {
  const {
    model = 'gpt-4-turbo',
    includeExamples = true,
    maxTokens = 250,
    temperature = 0.25,
    hasTableData = false,
    tableContext = null,
    fileMetadata = null,
    preExtractedEntities = null,
    contextEnhancement = {}
  } = options;

  // Truncate text if too long (leave room for prompt and response)
  // Use configurable maxTextLength from context enhancement config
  const maxTextLength = options.maxTextLength || contextEnhancement.maxTextLength || 6000;
  const truncatedText = text.length > maxTextLength 
    ? text.substring(0, maxTextLength) + '\n\n[Text truncated...]'
    : text;

  const systemPrompt = buildSystemPrompt(model, includeExamples, hasTableData, tableContext);
  const userPrompt = buildEnhancedContext(
    truncatedText, 
    fileMetadata, 
    preExtractedEntities, 
    contextEnhancement
  );

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
    temperature, // Use configurable temperature
    model
  };
}

/**
 * Build the system prompt with instructions and examples
 * @param {string} model - AI model being used
 * @param {boolean} includeExamples - Whether to include examples
 * @returns {string} System prompt content
 */
function buildSystemPrompt(model, includeExamples = true,   hasTableData = false, tableContext = null) {
  // Add language-specific instructions if language is detected

  // Add table context if table data is present
  const tableContextHint = hasTableData 
    ? `\nTABLE CONTEXT: This document contains structured table data. Pay special attention to table headers, rows, and cells when extracting client names, dates, and document types. Table data often contains the most reliable metadata.`
    : '';

  const baseInstructions = `You are a document metadata extraction assistant. Your task is to analyze document text and extract structured information about the client, date, and document type.${tableContextHint}

CRITICAL REQUIREMENTS:
1. You MUST respond with ONLY valid JSON
2. Do not include any text before or after the JSON
3. Use the exact field names specified below
4. Provide confidence scores as numbers between 0.0 and 1.0
5. If information is not found, use null for the value and 0.0 for confidence
6. Extract relevant text snippets that support your findings
7. Extract ACTUAL values from the document - do not guess or make assumptions

REQUIRED JSON STRUCTURE:
{
  "clientName": "string or null",
  "clientConfidence": "number between 0.0 and 1.0",
  "date": "string in YYYY-MM-DD format or null",
  "dateConfidence": "number between 0.0 and 1.0", 
  "docType": "string or null",
  "docTypeConfidence": "number between 0.0 and 1.0",
  "overallConfidence": "number between 0.0 and 1.0",
  "snippets": ["array of supporting text snippets"]
}

DOCUMENT TYPES - Choose the MOST APPROPRIATE from this list:
- Invoice: Bills, invoices, billing statements
- Receipt: Payment receipts, purchase receipts, transaction receipts
- Contract: Service agreements, contracts, legal agreements, terms of service
- Purchase Order: PO documents, purchase orders, procurement documents
- Statement: Bank statements, account statements, financial statements
- Report: Financial reports, analysis reports, status reports, audit reports
- Quote: Price quotes, estimates, proposals
- Resume: CV, curriculum vitae, job applications
- Certificate: Certificates, diplomas, awards, credentials
- Manual: Instruction manuals, guides, documentation
- Letter: Business letters, correspondence, formal letters
- Unknown: If document type is unclear or doesn't fit other categories

FIELD GUIDELINES:
- clientName: Extract the ACTUAL company, organization, or person name from the document (e.g., "Acme Corporation", "John Smith", "Microsoft Corp")
- date: Extract the ACTUAL date in YYYY-MM-DD format (e.g., "2024-01-15", "2025-09-17")
- docType: Choose from the structured list above - be specific and accurate
- overallConfidence: Overall confidence in the extraction (0.95+ when all data is clear, lower for ambiguity)
- snippets: Array of 1-3 relevant text excerpts that support your findings

CONFIDENCE SCORING:
- 0.95-1.0: All data clearly visible and unambiguous
- 0.80-0.94: Most data clear with minor ambiguity
- 0.60-0.79: Some data clear but some uncertainty
- 0.40-0.59: Significant ambiguity or missing key data
- 0.0-0.39: Very unclear or no relevant data found

EXTRACTION PRIORITY:
1. Look for explicit document headers (INVOICE, RECEIPT, CONTRACT, etc.)
2. Find company names in "Bill to:", "From:", "Client:", "Customer:" fields
3. Extract dates from "Date:", "Invoice Date:", "Effective Date:", etc.
4. Use table data if present - it often contains the most reliable information
5. If unsure about document type, use "Unknown" rather than guessing`;

  if (!includeExamples) {
    return baseInstructions;
  }

  const examples = `

EXAMPLES:

Example 1 - Clear Invoice:
Input: "INVOICE #12345\\nBill to: Acme Corporation\\n123 Business St\\nInvoice Date: January 15, 2024\\nAmount Due: $1,500.00"
Output: {
  "clientName": "Acme Corporation",
  "clientConfidence": 0.98,
  "date": "2024-01-15",
  "dateConfidence": 0.95,
  "docType": "Invoice",
  "docTypeConfidence": 0.99,
  "overallConfidence": 0.97,
  "snippets": ["INVOICE #12345", "Bill to: Acme Corporation", "Invoice Date: January 15, 2024"]
}

Example 2 - Contract with Clear Data:
Input: "SERVICE AGREEMENT\\nBetween ABC Company and XYZ Corp\\nEffective Date: March 1, 2024\\nThis agreement covers software development services..."
Output: {
  "clientName": "ABC Company",
  "clientConfidence": 0.90,
  "date": "2024-03-01", 
  "dateConfidence": 0.88,
  "docType": "Contract",
  "docTypeConfidence": 0.95,
  "overallConfidence": 0.91,
  "snippets": ["SERVICE AGREEMENT", "Between ABC Company and XYZ Corp", "Effective Date: March 1, 2024"]
}

Example 3 - Receipt with Partial Data:
Input: "RECEIPT\\nThank you for your payment\\nTransaction #: TXN-789\\nDate: 12/15/2023\\nAmount: $150.00\\nPayment Method: Credit Card"
Output: {
  "clientName": null,
  "clientConfidence": 0.0,
  "date": "2023-12-15",
  "dateConfidence": 0.85,
  "docType": "Receipt",
  "docTypeConfidence": 0.92,
  "overallConfidence": 0.59,
  "snippets": ["RECEIPT", "Date: 12/15/2023", "Amount: $150.00"]
}

Example 4 - Unclear Document:
Input: "Random text with no clear structure or identifiable information"
Output: {
  "clientName": null,
  "clientConfidence": 0.0,
  "date": null,
  "dateConfidence": 0.0,
  "docType": "Unknown",
  "docTypeConfidence": 0.0,
  "overallConfidence": 0.0,
  "snippets": []
}`;

  return baseInstructions + examples;
}

/**
 * Build the user prompt with the document text
 * @param {string} text - Document text to analyze
 * @returns {string} User prompt content
 */
function buildUserPrompt(text,   hasTableData = false, tableContext = null) {

  const tableHint = hasTableData 
    ? `\nNote: This document contains table data. Focus on table content for the most accurate metadata extraction.`
    : '';

  return `Please analyze the following document text and extract the metadata as specified in the system instructions. Respond with ONLY the JSON object, no additional text.${tableHint}

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
    model = 'gpt-4-turbo',
    includeExamples = false, // Skip examples for batch to save tokens
    maxTokens = 500,
    temperature = 0.25,
    contextEnhancement = {}
  } = options;

  // Filter out empty items and truncate text
  // Use configurable maxTextLength from context enhancement config
  const maxTextLength = options.maxTextLength || contextEnhancement.maxTextLength || 2000; // Higher limit for batch processing
  const validItems = items
    .filter(item => item.text && item.text.trim().length > 0)
    .map(item => ({
      ...item,
      text: item.text.length > maxTextLength 
        ? item.text.substring(0, maxTextLength) + '\n\n[Text truncated...]'
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
    temperature, // Use configurable temperature
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
      'overallConfidence',
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
    if (typeof parsed.overallConfidence !== 'number' || parsed.overallConfidence < 0 || parsed.overallConfidence > 1) {
      typeErrors.push('overallConfidence must be number between 0.0 and 1.0');
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
  buildEnhancedContext,
  validateResponse,
  getPromptStats
};
