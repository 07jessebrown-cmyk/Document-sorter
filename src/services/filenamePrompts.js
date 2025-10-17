/**
 * AI Prompt Templates for Filename Generation
 * Provides structured prompts for generating high-quality filenames
 */

/**
 * Build a filename generation prompt
 * @param {Object} metadata - Document metadata
 * @param {string} fileExtension - File extension
 * @param {Object} options - Optional configuration
 * @returns {Object} Prompt object with messages array for LLM call
 */
function buildFilenamePrompt(metadata, fileExtension, options = {}) {
  const {
    model = 'gpt-3.5-turbo',
    maxLength = 100,
    temperature = 0.3,
    includeExamples = true
  } = options;

  const systemPrompt = buildFilenameSystemPrompt(maxLength, includeExamples);
  const userPrompt = buildFilenameUserPrompt(metadata, fileExtension);

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
    temperature,
    model
  };
}

/**
 * Build the system prompt for filename generation
 * @param {number} maxLength - Maximum filename length
 * @param {boolean} includeExamples - Whether to include examples
 * @returns {string} System prompt content
 */
function buildFilenameSystemPrompt(maxLength = 100, includeExamples = true) {
  const baseInstructions = `You are a filename generation assistant. Your task is to create clean, professional filenames from document metadata.

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
- DocumentType: Invoice, Contract, Report, Receipt, Statement, Quote, etc.
- ClientName: Company or person name (sanitized, max 30 chars)
- Date: YYYY-MM-DD format
- Extension: Keep original file extension

QUALITY GUIDELINES:
- Be concise but descriptive
- Avoid generic names like "Document" or "File"
- Use consistent formatting
- Make it human-readable
- Prioritize clarity over brevity
- Remove common business suffixes (Inc, Corp, LLC, Ltd) from client names
- Use abbreviations for long company names`;

  if (!includeExamples) {
    return baseInstructions;
  }

  const examples = `

EXAMPLES:

Example 1 - Clear Invoice:
Input: {type: "Invoice", clientName: "Acme Corporation", date: "2024-01-15"}
Output: Invoice_AcmeCorp_2024-01-15.pdf

Example 2 - Contract with Long Company Name:
Input: {type: "Contract", clientName: "Microsoft Corporation", date: "2024-03-20"}
Output: Contract_Microsoft_2024-03-20.pdf

Example 3 - Report with Missing Client:
Input: {type: "Report", clientName: null, date: "2024-02-10"}
Output: Report_UnknownClient_2024-02-10.pdf

Example 4 - Invoice with Missing Date:
Input: {type: "Invoice", clientName: "ABC Company", date: null}
Output: Invoice_ABCCompany_UnknownDate.pdf

Example 5 - Receipt with Short Name:
Input: {type: "Receipt", clientName: "Store", date: "2024-12-01"}
Output: Receipt_Store_2024-12-01.pdf

Example 6 - Statement with Special Characters:
Input: {type: "Statement", clientName: "Smith & Associates LLC", date: "2024-06-15"}
Output: Statement_SmithAssociates_2024-06-15.pdf

Example 7 - Quote with Long Name:
Input: {type: "Quote", clientName: "Very Long Company Name Incorporated", date: "2024-08-30"}
Output: Quote_VeryLongCompany_2024-08-30.pdf

Example 8 - Contract with Missing Data:
Input: {type: "Contract", clientName: null, date: null}
Output: Contract_UnknownClient_UnknownDate.pdf`;

  return baseInstructions + examples;
}

/**
 * Build the user prompt for filename generation
 * @param {Object} metadata - Document metadata
 * @param {string} fileExtension - File extension
 * @returns {string} User prompt content
 */
function buildFilenameUserPrompt(metadata, fileExtension) {
  return `Generate a filename for this document:

Document Type: ${metadata.type || 'Unknown'}
Client Name: ${metadata.clientName || 'Unknown'}
Date: ${metadata.date || 'Unknown'}
File Extension: ${fileExtension}

Respond with ONLY the filename, no additional text.`;
}

/**
 * Validate generated filename
 * @param {string} filename - Filename to validate
 * @param {number} maxLength - Maximum allowed length
 * @returns {Object} Validation result
 */
function validateFilename(filename, maxLength = 100) {
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
  
  if (filename === 'Document.pdf' || filename === 'File.pdf') {
    issues.push('Filename is too generic');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    filename
  };
}

/**
 * Sanitize component for filename
 * @param {string} component - Component to sanitize
 * @returns {string} Sanitized component
 */
function sanitizeFilenameComponent(component) {
  if (!component) return 'Unknown';
  
  return component
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/\b(Inc|Corp|LLC|Ltd|Incorporated|Corporation)\b/gi, '') // Remove common business suffixes
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50); // Limit component length
}

/**
 * Generate filename using improved logic
 * @param {Object} metadata - Document metadata
 * @param {string} fileExtension - File extension
 * @param {number} maxLength - Maximum filename length
 * @returns {string} Generated filename
 */
function generateImprovedFilename(metadata, fileExtension, maxLength = 100) {
  const parts = [];
  
  // Document type
  let documentType = 'Unknown';
  if (metadata.type && metadata.type.trim()) {
    documentType = sanitizeFilenameComponent(metadata.type.trim());
  }
  parts.push(documentType);
  
  // Client name
  let clientName = 'UnknownClient';
  if (metadata.clientName && metadata.clientName.trim()) {
    clientName = sanitizeFilenameComponent(metadata.clientName.trim());
    // Truncate if too long
    if (clientName.length > 30) {
      clientName = clientName.substring(0, 30);
    }
  }
  parts.push(clientName);
  
  // Date
  if (metadata.date) {
    parts.push(metadata.date);
  } else {
    parts.push('UnknownDate');
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

module.exports = {
  buildFilenamePrompt,
  buildFilenameSystemPrompt,
  buildFilenameUserPrompt,
  validateFilename,
  sanitizeFilenameComponent,
  generateImprovedFilename
};
