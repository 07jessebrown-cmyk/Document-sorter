const fs = require('fs');
const path = require('path');

class WatermarkService {
  constructor(options = {}) {
    this.options = {
      minOccurrences: options.minOccurrences || 3, // Minimum times text must appear to be considered watermark
      minLength: options.minLength || 5, // Minimum length of text to consider
      maxLength: options.maxLength || 100, // Maximum length of text to consider
      similarityThreshold: options.similarityThreshold || 0.8, // Similarity threshold for text matching
      pageOverlapThreshold: options.pageOverlapThreshold || 0.5, // Minimum overlap across pages
      debug: options.debug || false,
      ...options
    };
    
    this.watermarkPatterns = [];
    this.detectedWatermarks = new Map();
    this.stats = {
      documentsProcessed: 0,
      watermarksDetected: 0,
      falsePositives: 0,
      processingTime: 0
    };
  }

  /**
   * Detect watermarks in a document
   * @param {string} filePath - Path to the document
   * @param {Object} options - Additional options
   * @returns {Object} Detection results
   */
  async detectWatermarks(filePath, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      let textContent = '';

      // Extract text based on file type
      if (fileExtension === '.pdf') {
        textContent = await this.extractTextFromPDF(filePath);
      } else if (['.txt', '.md', '.html', '.htm'].includes(fileExtension)) {
        textContent = await this.extractTextFromTextFile(filePath);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      if (!textContent || textContent.trim().length === 0) {
        return {
          success: false,
          watermarks: [],
          message: 'No text content found in document',
          confidence: 0
        };
      }

      // Split content into pages/sections
      const pages = this.splitIntoPages(textContent);
      
      // Detect watermarks across pages
      const watermarks = await this.analyzeWatermarks(pages, options);
      
      // Update statistics
      this.stats.documentsProcessed++;
      this.stats.watermarksDetected += watermarks.length;
      this.stats.processingTime += Date.now() - startTime;

      return {
        success: true,
        watermarks,
        confidence: this.calculateOverallConfidence(watermarks),
        metadata: {
          pagesAnalyzed: pages.length,
          totalTextLength: textContent.length,
          processingTime: Date.now() - startTime,
          method: 'text-analysis'
        }
      };

    } catch (error) {
      console.error(`Watermark detection failed for ${filePath}:`, error);
      return {
        success: false,
        watermarks: [],
        error: error.message,
        confidence: 0
      };
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  async extractTextFromPDF(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from text-based files
   */
  async extractTextFromTextFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Text file reading failed: ${error.message}`);
    }
  }

  /**
   * Split text content into pages/sections
   */
  splitIntoPages(textContent) {
    // Split by common page break patterns
    const pageBreaks = [
      /\f/g, // Form feed
      /\n\s*\n\s*\n/g, // Multiple newlines
      /Page \d+/gi, // Page numbers
      /---+/g, // Horizontal rules
      /\*\*\*+/g // Asterisk separators
    ];

    let pages = [textContent];
    
    for (const pattern of pageBreaks) {
      const newPages = [];
      for (const page of pages) {
        newPages.push(...page.split(pattern).filter(p => p.trim().length > 0));
      }
      pages = newPages;
    }

    // Filter out very short pages
    return pages.filter(page => page.trim().length >= this.options.minLength);
  }

  /**
   * Analyze text across pages to detect watermarks
   */
  async analyzeWatermarks(pages, options = {}) {
    const watermarks = [];
    const textFrequency = new Map();
    const pageTexts = new Map();

    // Count text frequency across pages
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const words = this.extractWords(page);
      
      for (const word of words) {
        if (word.length < this.options.minLength || word.length > this.options.maxLength) {
          continue;
        }

        const normalizedWord = this.normalizeText(word);
        if (!textFrequency.has(normalizedWord)) {
          textFrequency.set(normalizedWord, { count: 0, pages: new Set() });
        }
        
        textFrequency.get(normalizedWord).count++;
        textFrequency.get(normalizedWord).pages.add(i);
        pageTexts.set(normalizedWord, word);
      }
    }

    // Identify potential watermarks
    for (const [normalizedText, data] of textFrequency) {
      if (data.count >= this.options.minOccurrences) {
        const pageOverlap = data.pages.size / pages.length;
        
        if (pageOverlap >= this.options.pageOverlapThreshold) {
          const originalText = pageTexts.get(normalizedText);
          const confidence = this.calculateWatermarkConfidence(data, pages.length, normalizedText);
          
          watermarks.push({
            text: originalText,
            normalizedText,
            occurrences: data.count,
            pages: Array.from(data.pages),
            pageOverlap,
            confidence,
            type: this.classifyWatermarkType(originalText),
            position: this.detectWatermarkPosition(originalText, pages)
          });
        }
      }
    }

    // Sort by confidence and filter out low-confidence watermarks
    return watermarks
      .filter(w => w.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract words from text
   */
  extractWords(text) {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Normalize text for comparison
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Calculate confidence score for a potential watermark
   */
  calculateWatermarkConfidence(data, totalPages, normalizedText) {
    const frequencyScore = Math.min(data.count / totalPages, 1);
    const pageOverlapScore = data.pages.size / totalPages;
    const lengthScore = Math.min((normalizedText || '').length / 20, 1);
    
    return (frequencyScore * 0.4 + pageOverlapScore * 0.4 + lengthScore * 0.2);
  }

  /**
   * Classify the type of watermark
   */
  classifyWatermarkType(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('confidential') || lowerText.includes('proprietary')) {
      return 'confidentiality';
    } else if (lowerText.includes('draft') || lowerText.includes('preliminary')) {
      return 'draft';
    } else if (lowerText.includes('copyright') || lowerText.includes('©')) {
      return 'copyright';
    } else if (lowerText.includes('watermark') || lowerText.includes('stamp')) {
      return 'watermark';
    } else if (lowerText.includes('page') || lowerText.includes('page of')) {
      return 'pagination';
    } else {
      return 'unknown';
    }
  }

  /**
   * Detect watermark position in text
   */
  detectWatermarkPosition(text, pages) {
    const positions = [];
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const index = page.toLowerCase().indexOf(text.toLowerCase());
      
      if (index !== -1) {
        const position = index / page.length;
        positions.push({
          page: i,
          position: position < 0.2 ? 'top' : position > 0.8 ? 'bottom' : 'middle'
        });
      }
    }
    
    return positions;
  }

  /**
   * Calculate overall confidence for all detected watermarks
   */
  calculateOverallConfidence(watermarks) {
    if (watermarks.length === 0) return 0;
    
    const totalConfidence = watermarks.reduce((sum, w) => sum + w.confidence, 0);
    return totalConfidence / watermarks.length;
  }

  /**
   * Filter watermarks from text content
   */
  filterWatermarks(textContent, watermarks) {
    let filteredText = textContent;
    
    for (const watermark of watermarks) {
      if (watermark.confidence >= 0.5) {
        // Remove high-confidence watermarks
        const regex = new RegExp(watermark.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        filteredText = filteredText.replace(regex, '');
      }
    }
    
    // Clean up extra whitespace
    return filteredText.replace(/\s+/g, ' ').trim();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageProcessingTime: this.stats.documentsProcessed > 0 
        ? this.stats.processingTime / this.stats.documentsProcessed 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      documentsProcessed: 0,
      watermarksDetected: 0,
      falsePositives: 0,
      processingTime: 0
    };
  }
}

module.exports = WatermarkService;
