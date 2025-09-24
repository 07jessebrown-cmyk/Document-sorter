const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Parsing Service for Document Metadata Extraction
 * Handles PDF, DOCX, and other document formats
 */

class ParsingService {
  constructor() {
    this.clientList = this.loadClientList();
    this.documentTypeKeywords = {
      'Invoice': ['invoice', 'bill', 'billing', 'amount due', 'payment due', 'total amount', 'invoice number', 'billed to'],
      'Resume': ['resume', 'cv', 'curriculum vitae', 'professional summary', 'work experience', 'education', 'skills', 'objective'],
      'Contract': ['contract', 'agreement', 'terms and conditions', 'service agreement', 'partnership agreement', 'nda', 'non-disclosure'],
      'Statement': ['statement', 'account statement', 'bank statement', 'balance', 'account balance', 'transaction history'],
      'Receipt': ['receipt', 'payment received', 'thank you for your payment', 'transaction', 'purchase confirmation'],
      'Proposal': ['proposal', 'project proposal', 'business proposal', 'scope of work', 'deliverables'],
      'Report': ['report', 'analysis', 'findings', 'conclusions', 'executive summary', 'monthly report'],
      'Letter': ['dear', 'sincerely', 'yours truly', 'letter', 'correspondence', 'memo'],
      'Tax Document': ['tax return', 'w-2', '1099', 'irs', 'federal tax', 'state tax', 'deduction'],
      'Legal Document': ['legal', 'court', 'lawsuit', 'litigation', 'attorney', 'lawyer', 'legal notice']
    };
    
    this.datePatterns = [
      // MM/DD/YYYY or MM-DD-YYYY
      /(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-]((?:19|20)?\d\d)/i,
      // DD-MM-YYYY or DD.MM.YYYY
      /([0-2]?[0-9]|3[01])[\-\.](0?[1-9]|1[0-2])[\-\.]((?:19|20)?\d\d)/i,
      // YYYY-MM-DD
      /((?:19|20)\d\d)[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])/i,
      // Month DD, YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+((?:19|20)\d\d)/i,
      // DD Month YYYY
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+((?:19|20)\d\d)/i
    ];
    
    this.clientPatterns = [
      /(bill\s*to|billed\s*to|invoice\s*to|to)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})(?:\s|$)/i,
      /(from|vendor|supplier|company|client)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})(?:\s|$)/i,
      /(customer|account\s*holder|payee)\s*[:\-]\s*([A-Za-z0-9&.,'\- ]{2,80})(?:\s|$)/i
    ];
  }

  /**
   * Load client list from configuration file
   */
  loadClientList() {
    try {
      const configPath = path.join(__dirname, '..', '..', 'config', 'clients.json');
      const config = require(configPath);
      return config.clients || [];
    } catch (error) {
      console.warn('No client configuration found, using empty list');
      return [];
    }
  }

  /**
   * Extract text from various document formats
   */
  async extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      switch (ext) {
        case '.pdf':
          return await this.extractTextFromPDF(filePath);
        case '.docx':
          return await this.extractTextFromDOCX(filePath);
        case '.txt':
          return await this.extractTextFromTXT(filePath);
        default:
          console.warn(`Unsupported file format: ${ext}`);
          return '';
      }
    } catch (error) {
      console.error(`Error extracting text from ${filePath}:`, error.message);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF files using pdf-parse
   */
  async extractTextFromPDF(filePath) {
    console.log(`Processing PDF: ${path.basename(filePath)}`);
    
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      if (pdfData && pdfData.text && pdfData.text.trim().length > 50) {
        console.log(`PDF text extraction successful: ${pdfData.text.length} characters`);
        return pdfData.text;
      } else {
        console.log('PDF appears to be image-based or empty, returning empty text');
        return '';
      }
    } catch (error) {
      console.warn(`PDF text extraction failed: ${error.message}`);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX files using mammoth
   */
  async extractTextFromDOCX(filePath) {
    console.log(`Processing DOCX: ${path.basename(filePath)}`);
    
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.warn(`DOCX text extraction failed: ${error.message}`);
      throw new Error(`DOCX processing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from TXT files
   */
  async extractTextFromTXT(filePath) {
    console.log(`Processing TXT: ${path.basename(filePath)}`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.warn(`TXT text extraction failed: ${error.message}`);
      throw new Error(`TXT processing failed: ${error.message}`);
    }
  }

  /**
   * Analyze document text and extract metadata
   */
  analyzeDocument(text, filePath) {
    const result = { 
      date: undefined, 
      type: 'Unclassified',
      name: undefined, 
      clientName: undefined,
      amount: undefined, 
      title: undefined, 
      confidence: 0,
      rawText: text,
      filePath: filePath
    };
    
    if (!text || text.trim().length === 0) {
      return result;
    }

    // Normalize text for analysis
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    const content = text.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract document type
    result.type = this.detectDocumentType(content);
    result.confidence = this.calculateConfidence(content, result.type);

    // Extract date
    result.date = this.extractDate(content);

    // Extract client name
    result.clientName = this.extractClientName(content);
    result.name = result.clientName;

    // Extract amount (for invoices/receipts)
    if (result.type === 'Invoice' || result.type === 'Receipt') {
      result.amount = this.extractAmount(content);
    }

    // Extract title (first meaningful line)
    result.title = this.extractTitle(lines);

    return result;
  }

  /**
   * Detect document type based on keyword analysis
   */
  detectDocumentType(content) {
    const typeScores = {};
    
    for (const [docType, keywords] of Object.entries(this.documentTypeKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const matches = (content.match(regex) || []).length;
        score += matches * 10;
      }
      typeScores[docType] = score;
    }

    const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
    if (sortedTypes.length > 0 && sortedTypes[0][1] > 5) {
      return sortedTypes[0][0];
    }
    
    return 'Unclassified';
  }

  /**
   * Calculate confidence score for document type detection
   */
  calculateConfidence(content, detectedType) {
    if (detectedType === 'Unclassified') {
      return 0;
    }

    const keywords = this.documentTypeKeywords[detectedType] || [];
    let totalMatches = 0;
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = (content.match(regex) || []).length;
      totalMatches += matches;
    }

    // Adjust confidence calculation to be more reasonable
    const baseConfidence = Math.min(totalMatches / 10, 1);
    return Math.max(baseConfidence, 0.1); // Minimum confidence of 0.1 for detected types
  }

  /**
   * Extract date from content using multiple regex patterns
   */
  extractDate(content) {
    for (const pattern of this.datePatterns) {
      const match = content.match(pattern);
      if (match) {
        return this.normalizeDateMatch(match);
      }
    }
    return undefined;
  }

  /**
   * Normalize date match to YYYY-MM-DD format
   */
  normalizeDateMatch(match) {
    let year, month, day;

    if ((match[1] && (match[1].toLowerCase().includes('january') || match[1].toLowerCase().includes('february') || 
        match[1].toLowerCase().includes('march') || match[1].toLowerCase().includes('april') || 
        match[1].toLowerCase().includes('may') || match[1].toLowerCase().includes('june') || 
        match[1].toLowerCase().includes('july') || match[1].toLowerCase().includes('august') || 
        match[1].toLowerCase().includes('september') || match[1].toLowerCase().includes('october') || 
        match[1].toLowerCase().includes('november') || match[1].toLowerCase().includes('december'))) ||
        (match[2] && (match[2].toLowerCase().includes('january') || match[2].toLowerCase().includes('february') || 
        match[2].toLowerCase().includes('march') || match[2].toLowerCase().includes('april') || 
        match[2].toLowerCase().includes('may') || match[2].toLowerCase().includes('june') || 
        match[2].toLowerCase().includes('july') || match[2].toLowerCase().includes('august') || 
        match[2].toLowerCase().includes('september') || match[2].toLowerCase().includes('october') || 
        match[2].toLowerCase().includes('november') || match[2].toLowerCase().includes('december')))) {
      
      // Handle month name formats
      const monthNames = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12
      };
      
      if (match[1] && monthNames[match[1].toLowerCase()]) {
        month = monthNames[match[1].toLowerCase()];
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else {
        month = monthNames[match[2].toLowerCase()];
        day = parseInt(match[1]);
        year = parseInt(match[3]);
      }
    } else {
      // Handle numeric formats
      const a = parseInt(match[1]);
      const b = parseInt(match[2]);
      let y = parseInt(match[3]);
      
      if (y < 100) y += 2000;
      
      // Determine if first number is month or day
      if (a <= 12 && b <= 12) {
        // Ambiguous case, assume MM/DD/YYYY
        month = a;
        day = b;
        year = y;
      } else if (a > 12 && b <= 12) {
        // DD-MM-YYYY format
        month = b;
        day = a;
        year = y;
      } else if (a <= 12 && b > 12) {
        // MM-DD-YYYY format
        month = a;
        day = b;
        year = y;
      } else {
        // YYYY-MM-DD format
        year = a;
        month = b;
        day = y;
      }
    }

    // Ensure all values are valid numbers
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return undefined;
    }

    return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Extract client name using fuzzy matching with configurable client list
   */
  extractClientName(content) {
    // First try pattern-based extraction
    for (const pattern of this.clientPatterns) {
      const match = content.match(pattern);
      if (match) {
        const extractedName = match[2] ? match[2].trim() : match[1].trim();
        const cleanName = extractedName.replace(/[^\w\s\-&.,']/g, '').trim();
        if (cleanName.length > 2 && cleanName.length < 100) {
          // Return the extracted name directly - don't fuzzy match against client list
          // The regex has already found a specific client name in the text
          return cleanName;
        }
      }
    }

    // If no pattern match, try fuzzy matching against known clients
    const words = content.split(/\s+/).filter(word => word.length > 3);
    for (const word of words) {
      const matchedClient = this.fuzzyMatchClient(word);
      if (matchedClient) {
        return matchedClient;
      }
    }

    return undefined;
  }

  /**
   * Fuzzy match client name against known client list
   */
  fuzzyMatchClient(name) {
    if (!this.clientList || this.clientList.length === 0) {
      return null;
    }

    const normalizedName = name.toLowerCase().trim();
    
    // Exact match
    for (const client of this.clientList) {
      if (client.toLowerCase().includes(normalizedName) || 
          normalizedName.includes(client.toLowerCase())) {
        return client;
      }
    }

    // Fuzzy match using simple string similarity
    let bestMatch = null;
    let bestScore = 0;
    const threshold = 0.6;

    for (const client of this.clientList) {
      const score = this.calculateSimilarity(normalizedName, client.toLowerCase());
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = client;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Extract monetary amount from content
   */
  extractAmount(content) {
    const amountPatterns = [
      /\$[\d,]+\.?\d*/g,
      /total[:\s]*\$?[\d,]+\.?\d*/gi,
      /amount[:\s]*\$?[\d,]+\.?\d*/gi,
      /balance[:\s]*\$?[\d,]+\.?\d*/gi
    ];

    for (const pattern of amountPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Return the largest amount found
        const amounts = matches.map(match => 
          parseFloat(match.replace(/[$,]/g, ''))
        ).filter(amount => !isNaN(amount));
        
        if (amounts.length > 0) {
          return Math.max(...amounts);
        }
      }
    }

    return undefined;
  }

  /**
   * Extract document title (first meaningful line)
   */
  extractTitle(lines) {
    for (const line of lines) {
      if (line.length > 5 && line.length < 100 && 
          !line.match(/^\d+$/) && 
          !line.match(/^[A-Z\s]+$/) && 
          !line.includes('page') && 
          !line.includes('of')) {
        return line;
      }
    }
    return undefined;
  }

  /**
   * Get file metadata as fallback
   */
  async getFileMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        created: stats.birthtime,
        modified: stats.mtime,
        size: stats.size,
        name: path.basename(filePath)
      };
    } catch (error) {
      console.warn(`Could not get file metadata for ${filePath}:`, error.message);
      return null;
    }
  }
}

module.exports = ParsingService;
