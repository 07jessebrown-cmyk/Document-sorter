const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pdfParse = require('pdf-parse');

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
   * Uses pdf-parse to extract text and then applies table detection algorithms
   * @param {string} filePath - Path to the PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction result
   */
  async extractWithPdf2table(filePath, options = {}) {
    try {
      this.log(`Extracting tables using pdf2table method from: ${path.basename(filePath)}`);
      
      // Read PDF file
      const pdfBuffer = fs.readFileSync(filePath);
      
      // Parse PDF to get text content
      const pdfData = await pdfParse(pdfBuffer);
      
      const text = pdfData.text;
      const pageCount = pdfData.numpages;
      
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          tables: [],
          confidence: 0.0,
          method: 'pdf2table',
          pageCount,
          errors: ['No text content found in PDF']
        };
      }
      
      // Split text into pages (approximate)
      const lines = text.split('\n');
      const linesPerPage = Math.ceil(lines.length / pageCount);
      const pages = [];
      
      for (let i = 0; i < pageCount; i++) {
        const startLine = i * linesPerPage;
        const endLine = Math.min((i + 1) * linesPerPage, lines.length);
        pages.push(lines.slice(startLine, endLine).join('\n'));
      }
      
      const tables = [];
      let totalConfidence = 0;
      
      // Process each page
      for (let pageNum = 0; pageNum < pages.length; pageNum++) {
        const pageText = pages[pageNum];
        const pageTables = this.detectTablesInText(pageText, pageNum + 1);
        
        if (pageTables.length > 0) {
          tables.push(...pageTables);
          totalConfidence += pageTables.reduce((sum, table) => sum + table.confidence, 0);
        }
      }
      
      const averageConfidence = tables.length > 0 ? totalConfidence / tables.length : 0;
      
      return {
        success: tables.length > 0,
        tables: tables.map(table => ({
          page: table.page,
          table: table.table,
          data: table.data,
          rows: table.rows,
          columns: table.columns,
          method: 'pdf2table',
          confidence: table.confidence
        })),
        confidence: averageConfidence,
        method: 'pdf2table',
        pageCount,
        errors: []
      };
      
    } catch (error) {
      this.log(`pdf2table extraction failed: ${error.message}`);
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'pdf2table',
        pageCount: 0,
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
      this.log(`Extracting tables using regex method from: ${path.basename(filePath)}`);
      
      // Read PDF file and extract text
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      
      const text = pdfData.text;
      const pageCount = pdfData.numpages;
      
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          tables: [],
          confidence: 0.0,
          method: 'regex',
          pageCount,
          errors: ['No text content found in PDF']
        };
      }
      
      // Split text into pages (approximate)
      const lines = text.split('\n');
      const linesPerPage = Math.ceil(lines.length / pageCount);
      const pages = [];
      
      for (let i = 0; i < pageCount; i++) {
        const startLine = i * linesPerPage;
        const endLine = Math.min((i + 1) * linesPerPage, lines.length);
        pages.push(lines.slice(startLine, endLine).join('\n'));
      }
      
      const tables = [];
      let totalConfidence = 0;
      
      // Process each page
      for (let pageNum = 0; pageNum < pages.length; pageNum++) {
        const pageText = pages[pageNum];
        const pageTables = this.detectTablesWithRegex(pageText, pageNum + 1);
        
        if (pageTables.length > 0) {
          tables.push(...pageTables);
          totalConfidence += pageTables.reduce((sum, table) => sum + table.confidence, 0);
        }
      }
      
      const averageConfidence = tables.length > 0 ? totalConfidence / tables.length : 0;
      
      return {
        success: tables.length > 0,
        tables: tables.map(table => ({
          page: table.page,
          table: table.table,
          data: table.data,
          rows: table.rows,
          columns: table.columns,
          method: 'regex',
          confidence: table.confidence
        })),
        confidence: averageConfidence,
        method: 'regex',
        pageCount,
        errors: []
      };
      
    } catch (error) {
      this.log(`Regex extraction failed: ${error.message}`);
      return {
        success: false,
        tables: [],
        confidence: 0.0,
        method: 'regex',
        pageCount: 0,
        errors: [error.message]
      };
    }
  }

  /**
   * Detect tables in text using advanced pattern matching
   * @param {string} text - Text content to analyze
   * @param {number} pageNum - Page number
   * @returns {Array} Array of detected tables
   */
  detectTablesInText(text, pageNum) {
    const tables = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      return tables;
    }
    
    // Look for patterns that suggest table structures
    const tableCandidates = [];
    let currentTable = [];
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if line looks like a table row (contains multiple columns separated by spaces/tabs)
      const columnCount = this.countColumns(line);
      
      if (columnCount >= 2) {
        if (!inTable) {
          inTable = true;
          currentTable = [line];
        } else {
          currentTable.push(line);
        }
      } else {
        if (inTable && currentTable.length >= 2) {
          // End of table, process it
          const table = this.processTableData(currentTable, pageNum, tables.length + 1);
          if (table) {
            tables.push(table);
          }
        }
        inTable = false;
        currentTable = [];
      }
    }
    
    // Process final table if we were in one
    if (inTable && currentTable.length >= 2) {
      const table = this.processTableData(currentTable, pageNum, tables.length + 1);
      if (table) {
        tables.push(table);
      }
    }
    
    return tables;
  }

  /**
   * Detect tables using regex patterns
   * @param {string} text - Text content to analyze
   * @param {number} pageNum - Page number
   * @returns {Array} Array of detected tables
   */
  detectTablesWithRegex(text, pageNum) {
    const tables = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      return tables;
    }
    
    // Regex patterns for common table structures
    const tablePatterns = [
      // Pattern 1: Lines with multiple columns separated by 2+ spaces
      /^.+?\s{2,}.+$/,
      // Pattern 2: Lines with tab-separated values
      /^.+?\t.+$/,
      // Pattern 3: Lines with pipe-separated values
      /^.+?\|.+$/,
      // Pattern 4: Lines with comma-separated values (but not too many commas)
      /^[^,]+(?:,[^,]+){1,4}$/
    ];
    
    const tableCandidates = [];
    let currentTable = [];
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchesPattern = tablePatterns.some(pattern => pattern.test(line));
      
      if (matchesPattern) {
        if (!inTable) {
          inTable = true;
          currentTable = [line];
        } else {
          currentTable.push(line);
        }
      } else {
        if (inTable && currentTable.length >= 2) {
          // End of table, process it
          const table = this.processTableData(currentTable, pageNum, tables.length + 1);
          if (table) {
            tables.push(table);
          }
        }
        inTable = false;
        currentTable = [];
      }
    }
    
    // Process final table if we were in one
    if (inTable && currentTable.length >= 2) {
      const table = this.processTableData(currentTable, pageNum, tables.length + 1);
      if (table) {
        tables.push(table);
      }
    }
    
    return tables;
  }

  /**
   * Count the number of columns in a line
   * @param {string} line - Line to analyze
   * @returns {number} Number of columns detected
   */
  countColumns(line) {
    // Count columns based on multiple spaces, tabs, or other separators
    const spaceColumns = (line.match(/\s{2,}/g) || []).length + 1;
    const tabColumns = (line.match(/\t/g) || []).length + 1;
    const pipeColumns = (line.match(/\|/g) || []).length + 1;
    const commaColumns = (line.match(/,/g) || []).length + 1;
    
    // Return the highest column count (most likely to be correct)
    return Math.max(spaceColumns, tabColumns, pipeColumns, commaColumns);
  }

  /**
   * Process table data and create structured table object
   * @param {Array} tableLines - Array of table lines
   * @param {number} pageNum - Page number
   * @param {number} tableNum - Table number on page
   * @returns {Object|null} Processed table object or null if invalid
   */
  processTableData(tableLines, pageNum, tableNum) {
    if (tableLines.length < 2) {
      return null;
    }
    
    // Determine the best separator by testing each line
    const separators = ['\t', '|', ','];
    let bestSeparator = '  '; // Default to double space
    let maxColumns = 0;
    
    // Test each separator on the first few lines
    for (const sep of separators) {
      let totalColumns = 0;
      let validLines = 0;
      
      for (let i = 0; i < Math.min(3, tableLines.length); i++) {
        const line = tableLines[i];
        if (sep === '  ') {
          const columns = (line.match(/\s{2,}/g) || []).length + 1;
          if (columns >= 2) {
            totalColumns += columns;
            validLines++;
          }
        } else {
          const columns = (line.match(new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length + 1;
          if (columns >= 2) {
            totalColumns += columns;
            validLines++;
          }
        }
      }
      
      if (validLines > 0) {
        const avgColumns = totalColumns / validLines;
        if (avgColumns > maxColumns) {
          maxColumns = avgColumns;
          bestSeparator = sep;
        }
      }
    }
    
    // If no good separator found, use space-based splitting
    if (maxColumns < 2) {
      bestSeparator = '  ';
    }
    
    // Parse table data
    const tableData = tableLines.map(line => {
      if (bestSeparator === '  ') {
        // Split by multiple spaces
        return line.split(/\s{2,}/).map(cell => cell.trim());
      } else {
        // Split by specific separator
        return line.split(bestSeparator).map(cell => cell.trim());
      }
    });
    
    // Normalize column count (pad with empty strings if needed)
    const maxCols = Math.max(...tableData.map(row => row.length));
    const normalizedData = tableData.map(row => {
      while (row.length < maxCols) {
        row.push('');
      }
      return row;
    });
    
    // Calculate confidence based on data quality
    const confidence = this.calculateTableConfidence(normalizedData);
    
    if (confidence < 0.3) {
      return null; // Skip low-confidence tables
    }
    
    return {
      page: pageNum,
      table: tableNum,
      data: normalizedData,
      rows: normalizedData.length,
      columns: maxCols,
      confidence: confidence
    };
  }

  /**
   * Calculate confidence score for a table
   * @param {Array} tableData - Table data array
   * @returns {number} Confidence score (0-1)
   */
  calculateTableConfidence(tableData) {
    if (tableData.length < 2) {
      return 0;
    }
    
    let confidence = 0;
    
    // Check for consistent column count
    const columnCounts = tableData.map(row => row.length);
    const isConsistentColumns = columnCounts.every(count => count === columnCounts[0]);
    if (isConsistentColumns) {
      confidence += 0.3;
    }
    
    // Check for non-empty cells
    const totalCells = tableData.length * tableData[0].length;
    const nonEmptyCells = tableData.flat().filter(cell => cell && cell.trim().length > 0).length;
    const fillRatio = nonEmptyCells / totalCells;
    confidence += fillRatio * 0.4;
    
    // Check for numeric patterns (common in tables)
    const numericCells = tableData.flat().filter(cell => 
      cell && /^\d+(\.\d+)?$/.test(cell.trim())
    ).length;
    const numericRatio = numericCells / totalCells;
    confidence += numericRatio * 0.2;
    
    // Check for header-like patterns in first row
    const firstRow = tableData[0];
    const hasHeaders = firstRow.some(cell => 
      cell && /^[A-Za-z]/.test(cell.trim()) && cell.length > 2
    );
    if (hasHeaders) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
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
