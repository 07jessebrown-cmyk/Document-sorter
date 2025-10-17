/**
 * Enhanced PDF Text Extraction Service
 * Provides multiple fallback methods for robust PDF text extraction
 * Handles corrupted PDFs, image-based PDFs, and various PDF versions
 */

const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class EnhancedPdfExtractor {
  constructor(options = {}) {
    this.options = {
      minTextLength: 50,
      maxRetries: 3,
      retryDelay: 1000,
      enablePoppler: true,
      enablePdf2pic: true,
      enableOcr: true,
      ...options
    };
    
    this.methods = [
      'pdf-parse',
      'poppler-pdftotext',
      'pdf2pic-ocr',
      'manual-fallback'
    ];
  }

  /**
   * Extract text from PDF using multiple fallback methods
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Object>} Extraction result
   */
  async extractText(filePath) {
    const startTime = Date.now();
    const results = {
      success: false,
      text: '',
      method: 'none',
      confidence: 0,
      processingTime: 0,
      errors: [],
      metadata: {
        filePath,
        fileSize: 0,
        pageCount: 0,
        timestamp: new Date().toISOString()
      }
    };

    try {
      // Get file stats
      const stats = await fs.stat(filePath);
      results.metadata.fileSize = stats.size;

      // Try each extraction method in order
      for (const method of this.methods) {
        try {
          console.log(`🔍 Trying ${method} for: ${path.basename(filePath)}`);
          
          let text = '';
          let pageCount = 0;
          
          switch (method) {
            case 'pdf-parse':
              ({ text, pageCount } = await this.extractWithPdfParse(filePath));
              break;
            case 'poppler-pdftotext':
              ({ text, pageCount } = await this.extractWithPoppler(filePath));
              break;
            case 'pdf2pic-ocr':
              ({ text, pageCount } = await this.extractWithPdf2pic(filePath));
              break;
            case 'manual-fallback':
              ({ text, pageCount } = await this.extractWithManualFallback(filePath));
              break;
          }

          if (text && text.trim().length >= this.options.minTextLength) {
            results.success = true;
            results.text = text;
            results.method = method;
            results.metadata.pageCount = pageCount;
            results.confidence = this.calculateConfidence(text, method);
            results.processingTime = Date.now() - startTime;
            
            console.log(`✅ ${method} succeeded: ${text.length} chars, ${pageCount} pages`);
            break;
          } else {
            console.log(`⚠️ ${method} returned insufficient text: ${text ? text.length : 0} chars`);
          }
        } catch (error) {
          console.log(`❌ ${method} failed: ${error.message}`);
          results.errors.push(`${method}: ${error.message}`);
        }
      }

      if (!results.success) {
        results.errors.push('All extraction methods failed');
      }

      results.processingTime = Date.now() - startTime;
      return results;

    } catch (error) {
      results.errors.push(`General error: ${error.message}`);
      results.processingTime = Date.now() - startTime;
      return results;
    }
  }

  /**
   * Extract text using pdf-parse (primary method)
   */
  async extractWithPdfParse(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer, {
      // Add options to handle corrupted PDFs
      max: 0, // Parse all pages
      version: 'v1.10.100' // Use specific version for stability
    });
    
    return {
      text: pdfData.text || '',
      pageCount: pdfData.numpages || 0
    };
  }

  /**
   * Extract text using Poppler's pdftotext (fallback method)
   */
  async extractWithPoppler(filePath) {
    if (!this.options.enablePoppler) {
      throw new Error('Poppler extraction disabled');
    }

    try {
      // Check if pdftotext is available
      await execAsync('which pdftotext');
      
      const outputPath = filePath.replace('.pdf', '_extracted.txt');
      await execAsync(`pdftotext -layout "${filePath}" "${outputPath}"`);
      
      const text = await fs.readFile(outputPath, 'utf8');
      await fs.unlink(outputPath); // Clean up temp file
      
      // Get page count using pdfinfo
      const { stdout } = await execAsync(`pdfinfo "${filePath}" | grep Pages`);
      const pageCount = parseInt(stdout.match(/\d+/)?.[0] || '0');
      
      return {
        text: text || '',
        pageCount: pageCount || 0
      };
    } catch (error) {
      throw new Error(`Poppler extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text using pdf2pic + OCR (for image-based PDFs)
   */
  async extractWithPdf2pic(filePath) {
    if (!this.options.enablePdf2pic) {
      throw new Error('PDF2PIC extraction disabled');
    }

    try {
      const pdf2pic = require('pdf2pic');
      const convert = pdf2pic.fromPath(filePath, {
        density: 300,
        saveFilename: 'page',
        savePath: './temp_pdf_images',
        format: 'png',
        width: 2000,
        height: 2000
      });

      const results = await convert.bulk(-1); // Convert all pages
      let fullText = '';
      
      for (const result of results) {
        if (result.path) {
          // Use OCR on the converted image
          const ocrText = await this.ocrImage(result.path);
          fullText += ocrText + '\n';
          
          // Clean up image file
          await fs.unlink(result.path);
        }
      }

      // Clean up temp directory
      try {
        await fs.rmdir('./temp_pdf_images', { recursive: true });
      } catch (e) {
        // Directory might not exist, ignore
      }

      return {
        text: fullText,
        pageCount: results.length
      };
    } catch (error) {
      throw new Error(`PDF2PIC extraction failed: ${error.message}`);
    }
  }

  /**
   * Manual fallback extraction (basic text recovery)
   */
  async extractWithManualFallback(filePath) {
    try {
      // Try to read as binary and extract any readable text
      const buffer = await fs.readFile(filePath);
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 100000)); // Read first 100KB
      
      // Extract text between common PDF text markers
      const textMatches = text.match(/BT\s+[^E]*ET/g) || [];
      const extractedText = textMatches
        .map(match => {
          // Extract text content from PDF text objects
          const textContent = match.replace(/BT\s+/, '').replace(/\s+ET$/, '');
          return textContent.replace(/[^\x20-\x7E]/g, ' ').trim(); // Keep only printable ASCII
        })
        .filter(t => t.length > 3)
        .join(' ');

      return {
        text: extractedText,
        pageCount: 1 // Assume single page for manual extraction
      };
    } catch (error) {
      throw new Error(`Manual fallback failed: ${error.message}`);
    }
  }

  /**
   * Perform OCR on an image file
   */
  async ocrImage(imagePath) {
    try {
      // This would require Tesseract.js or similar OCR library
      // For now, return empty string as OCR is not fully implemented
      return '';
    } catch (error) {
      console.warn(`OCR failed for ${imagePath}: ${error.message}`);
      return '';
    }
  }

  /**
   * Calculate confidence score based on text quality and method used
   */
  calculateConfidence(text, method) {
    let confidence = 0.5; // Base confidence

    // Method-specific confidence adjustments
    switch (method) {
      case 'pdf-parse':
        confidence = 0.9;
        break;
      case 'poppler-pdftotext':
        confidence = 0.8;
        break;
      case 'pdf2pic-ocr':
        confidence = 0.6;
        break;
      case 'manual-fallback':
        confidence = 0.3;
        break;
    }

    // Text quality adjustments
    if (text.length > 500) confidence += 0.1;
    if (text.length > 1000) confidence += 0.1;
    if (text.match(/[A-Za-z]{3,}/)) confidence += 0.1; // Has words
    if (text.match(/\d{4}/)) confidence += 0.1; // Has years/dates
    if (text.match(/[A-Za-z]+@[A-Za-z]+/)) confidence += 0.1; // Has emails

    return Math.min(confidence, 1.0);
  }

  /**
   * Test extraction on multiple files
   */
  async testExtraction(filePaths) {
    const results = [];
    
    for (const filePath of filePaths) {
      console.log(`\n📄 Testing: ${path.basename(filePath)}`);
      const result = await this.extractText(filePath);
      results.push({
        file: path.basename(filePath),
        ...result
      });
    }

    return results;
  }
}

module.exports = EnhancedPdfExtractor;
