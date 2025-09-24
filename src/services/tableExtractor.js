const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Table Extractor Service
 * 
 * Extracts table structures from PDF documents and returns structured JSON.
 * Supports multiple extraction methods with fallback mechanisms.
 * 
 * Features:
 * - Multiple extraction engines (pdfplumber, pdf2table, regex fallback)
 * - Structured JSON output with table metadata
 * - Confidence scoring for extraction quality
 * - Error handling and graceful degradation
 */
class TableExtractorService {
  constructor(options = {}) {
    this.options = {
      // Primary extraction method
      primaryMethod: options.primaryMethod || 'pdfplumber',
      // Fallback methods in order of preference
      fallbackMethods: options.fallbackMethods || ['pdf2table', 'regex'],
      // Confidence thresholds
      minConfidence: options.minConfidence || 0.7,
      // Timeout for external processes
      timeout: options.timeout || 30000,
      // Enable debug logging
      debug: options.debug || false,
      ...options
    };
    
    this.stats = {
      totalExtractions: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      methodUsage: {},
      averageConfidence: 0
    };
  }

  /**
   * Extract tables from a PDF file
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction results with tables and metadata
   */
  async extractTables(filePath, options = {}) {
    const startTime = Date.now();
    this.stats.totalExtractions++;
    
    try {
      this.log(`Starting table extraction for: ${path.basename(filePath)}`);
      
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Try primary method first
      let result = await this.extractWithMethod(filePath, this.options.primaryMethod, options);
      let allErrors = [...(result.errors || [])];
      
      // If primary method fails or confidence is low, try fallbacks
      if (!result.success || result.confidence < this.options.minConfidence) {
        this.log(`Primary method failed or low confidence (${result.confidence}), trying fallbacks`);
        
        for (const method of this.options.fallbackMethods) {
          try {
            const fallbackResult = await this.extractWithMethod(filePath, method, options);
            allErrors = [...allErrors, ...(fallbackResult.errors || [])];
            if (fallbackResult.success && fallbackResult.confidence > result.confidence) {
              result = fallbackResult;
              this.log(`Fallback method ${method} provided better result (confidence: ${result.confidence})`);
            }
          } catch (error) {
            allErrors.push(`Fallback method ${method} failed: ${error.message}`);
            this.log(`Fallback method ${method} failed: ${error.message}`);
          }
        }
      }

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(result.success, result.method, result.confidence, processingTime);
      
      return {
        success: result.success,
        tables: result.tables || [],
        metadata: {
          filePath,
          method: result.method,
          confidence: result.confidence,
          processingTime,
          pageCount: result.pageCount || 1,
          tableCount: result.tables ? result.tables.length : 0,
          extractionDate: new Date().toISOString()
        },
        errors: allErrors
      };

    } catch (error) {
      this.stats.failedExtractions++;
      this.log(`Table extraction failed: ${error.message}`);
      
      return {
        success: false,
        tables: [],
        metadata: {
          filePath,
          method: 'none',
          confidence: 0,
          processingTime: Date.now() - startTime,
          pageCount: 0,
          tableCount: 0,
          extractionDate: new Date().toISOString()
        },
        errors: [error.message]
      };
    }
  }

  /**
   * Extract tables using a specific method
   * @param {string} filePath - Path to the PDF file
   * @param {string} method - Extraction method to use
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction result
   */
  async extractWithMethod(filePath, method, options = {}) {
    switch (method) {
      case 'pdfplumber':
        return await this.extractWithPdfplumber(filePath, options);
      case 'pdf2table':
        return await this.extractWithPdf2table(filePath, options);
      case 'regex':
        return await this.extractWithRegex(filePath, options);
      default:
        throw new Error(`Unknown extraction method: ${method}`);
    }
  }

  /**
   * Extract tables using pdfplumber (Python)
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction result
   */
  async extractWithPdfplumber(filePath, options = {}) {
    return new Promise((resolve) => {
      const pythonScript = `
import json
import sys
import pdfplumber
from pdfplumber.table import TableSettings

def extract_tables(pdf_path):
    try:
        tables = []
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # Extract tables from this page
                page_tables = page.extract_tables(table_settings={
                    "vertical_strategy": "lines_strict",
                    "horizontal_strategy": "lines_strict",
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                    "edge_min_length": 3,
                    "min_words_vertical": 1,
                    "min_words_horizontal": 1
                })
                
                for table_num, table in enumerate(page_tables):
                    if table and len(table) > 0:
                        # Clean and structure the table data
                        cleaned_table = []
                        for row in table:
                            cleaned_row = [cell.strip() if cell else "" for cell in row]
                            cleaned_table.append(cleaned_row)
                        
                        tables.append({
                            "page": page_num + 1,
                            "table": table_num + 1,
                            "data": cleaned_table,
                            "rows": len(cleaned_table),
                            "columns": len(cleaned_table[0]) if cleaned_table else 0,
                            "method": "pdfplumber"
                        })
        
        return {
            "success": True,
            "tables": tables,
            "confidence": 0.9 if tables else 0.0,
            "method": "pdfplumber",
            "pageCount": len(pdf.pages) if 'pdf' in locals() else 0
        }
    except Exception as e:
        return {
            "success": False,
            "tables": [],
            "confidence": 0.0,
            "method": "pdfplumber",
            "error": str(e)
        }

if __name__ == "__main__":
    result = extract_tables(sys.argv[1])
    print(json.dumps(result))
`;

      const pythonProcess = spawn('python3', ['-c', pythonScript, filePath], {
        timeout: this.options.timeout
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (parseError) {
            resolve({
              success: false,
              tables: [],
              confidence: 0.0,
              method: 'pdfplumber',
              errors: [`Failed to parse output: ${parseError.message}`]
            });
          }
        } else {
          resolve({
            success: false,
            tables: [],
            confidence: 0.0,
            method: 'pdfplumber',
            errors: [`Python process failed with code ${code}: ${errorOutput}`]
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          tables: [],
          confidence: 0.0,
          method: 'pdfplumber',
          errors: [`Failed to start Python process: ${error.message}`]
        });
      });
    });
  }

  /**
   * Extract tables using pdf2table (Node.js)
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction result
   */
  async extractWithPdf2table(filePath, options = {}) {
    try {
      // This would require installing pdf2table package
      // For now, return a placeholder implementation
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'pdf2table',
        errors: ['pdf2table not implemented - requires package installation']
      };
    } catch (error) {
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'pdf2table',
        errors: [error.message]
      };
    }
  }

  /**
   * Extract tables using regex patterns (fallback method)
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction result
   */
  async extractWithRegex(filePath, options = {}) {
    try {
      // This would require the PDF to be converted to text first
      // For now, return a placeholder implementation
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'regex',
        errors: ['Regex extraction not implemented - requires text extraction first']
      };
    } catch (error) {
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'regex',
        errors: [error.message]
      };
    }
  }

  /**
   * Update statistics
   * @param {boolean} success - Whether extraction was successful
   * @param {string} method - Method used
   * @param {number} confidence - Confidence score
   * @param {number} processingTime - Processing time in ms
   */
  updateStats(success, method, confidence, processingTime) {
    if (success) {
      this.stats.successfulExtractions++;
    } else {
      this.stats.failedExtractions++;
    }

    // Update method usage
    if (!this.stats.methodUsage[method]) {
      this.stats.methodUsage[method] = 0;
    }
    this.stats.methodUsage[method]++;

    // Update average confidence
    const totalSuccessful = this.stats.successfulExtractions;
    if (totalSuccessful > 0) {
      this.stats.averageConfidence = 
        ((this.stats.averageConfidence * (totalSuccessful - 1)) + confidence) / totalSuccessful;
    }
  }

  /**
   * Get extraction statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalExtractions > 0 
        ? this.stats.successfulExtractions / this.stats.totalExtractions 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalExtractions: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      methodUsage: {},
      averageConfidence: 0
    };
  }

  /**
   * Log debug messages
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[TableExtractor] ${message}`);
    }
  }
}

module.exports = TableExtractorService;
