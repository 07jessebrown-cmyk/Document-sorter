# Table Extraction Library Evaluation

**Project:** Document Sorter — AI Text Extraction Hardening  
**Date:** 2025-01-24  
**Phase:** 1.2 - Foundation  

## Overview

This document evaluates available table extraction libraries for PDF documents to support the enhanced text extraction pipeline. The evaluation focuses on JavaScript/Node.js compatible solutions that can be integrated into the Electron-based Document Sorter application.

## Evaluation Criteria

1. **Language Support**: JavaScript/Node.js compatibility
2. **Installation Complexity**: Ease of setup and dependencies
3. **Performance**: Speed and memory usage
4. **Accuracy**: Quality of table structure preservation
5. **Maintenance**: Active development and community support
6. **Integration**: Compatibility with existing PDF processing pipeline

## Library Analysis

### 1. pdfplumber (Python → Node.js via child_process)

**Description**: Python library with excellent table extraction capabilities

**Pros**:
- High accuracy for table detection and extraction
- Preserves table structure and formatting
- Active development and good documentation
- Handles complex table layouts well
- Can extract tables with merged cells

**Cons**:
- Requires Python runtime
- Additional complexity for Node.js integration
- Larger memory footprint
- Slower startup time

**Integration Approach**:
```javascript
// Via child_process execution
const { spawn } = require('child_process');
const pythonProcess = spawn('python', ['extract_tables.py', pdfPath]);
```

**Verdict**: ⭐⭐⭐⭐ (High accuracy, complex integration)

### 2. camelot-py (Python → Node.js via child_process)

**Description**: Specialized PDF table extraction library

**Pros**:
- Specifically designed for table extraction
- Multiple extraction methods (lattice, stream)
- Good accuracy on well-formatted tables
- Can handle tables with lines and borders

**Cons**:
- Requires Python and additional dependencies (OpenCV, Ghostscript)
- Complex installation process
- May struggle with tables without clear borders
- Limited to Python ecosystem

**Integration Approach**:
```javascript
// Via child_process with Python script
const extractTables = async (pdfPath) => {
  const result = await exec(`python -c "import camelot; tables = camelot.read_pdf('${pdfPath}'); print(tables[0].df.to_json())"`);
  return JSON.parse(result.stdout);
};
```

**Verdict**: ⭐⭐⭐ (Good for specific use cases, complex setup)

### 3. tabula-py (Python → Node.js via child_process)

**Description**: Python wrapper for Java-based Tabula

**Pros**:
- Based on proven Tabula library
- Good for tables with clear separators
- Can extract to multiple formats (CSV, JSON)
- Handles some complex layouts

**Cons**:
- Requires Java runtime
- Python dependency
- May miss tables without clear borders
- Complex dependency chain

**Integration Approach**:
```javascript
// Via child_process
const extractTables = async (pdfPath) => {
  const result = await exec(`python -c "import tabula; df = tabula.read_pdf('${pdfPath}', pages='all'); print(df.to_json())"`);
  return JSON.parse(result.stdout);
};
```

**Verdict**: ⭐⭐ (Moderate accuracy, complex dependencies)

### 4. pdf-parse + Custom Table Detection

**Description**: Use existing pdf-parse with custom table detection logic

**Pros**:
- Already integrated in the project
- No additional dependencies
- Full control over extraction logic
- Lightweight and fast

**Cons**:
- Requires custom implementation
- May miss complex table structures
- Limited to text-based extraction
- No built-in table formatting

**Integration Approach**:
```javascript
// Extend existing pdf-parse usage
const detectTables = (text) => {
  // Custom regex-based table detection
  const tablePatterns = [
    /(\w+\s+\w+.*\n){3,}/g, // Multi-line patterns
    /\|\s*.*\s*\|/g, // Pipe-separated tables
    /\s{2,}.*\s{2,}/g // Space-separated tables
  ];
  // Implementation details...
};
```

**Verdict**: ⭐⭐⭐⭐ (Good balance, requires development)

### 5. pdf2pic + Tesseract OCR + Custom Table Detection

**Description**: Convert PDF to images, then use OCR with table detection

**Pros**:
- Can handle scanned PDFs
- Works with any table format
- Already have Tesseract integration
- Flexible approach

**Cons**:
- Slower processing
- OCR accuracy limitations
- Complex implementation
- Higher resource usage

**Integration Approach**:
```javascript
// Use existing Tesseract setup
const extractTablesFromImage = async (pdfPath) => {
  const images = await pdf2pic(pdfPath);
  const tables = [];
  for (const image of images) {
    const ocrResult = await Tesseract.recognize(image, 'eng');
    const detectedTables = detectTablesInOCR(ocrResult.data.text);
    tables.push(...detectedTables);
  }
  return tables;
};
```

**Verdict**: ⭐⭐⭐ (Good for scanned PDFs, complex implementation)

## Recommended Approach

### Phase 1: Enhanced pdf-parse with Custom Table Detection

**Rationale**:
- Leverages existing infrastructure
- No additional dependencies
- Good performance
- Full control over implementation

**Implementation Plan**:
1. Extend `enhancedParsingService.js` with table detection
2. Add table extraction methods using regex patterns
3. Preserve table structure in JSON format
4. Integrate with existing confidence scoring

**Code Structure**:
```javascript
class TableExtractor {
  detectTables(text) {
    // Regex-based table detection
  }
  
  extractTableData(tableText) {
    // Parse table into structured data
  }
  
  formatTableOutput(tables) {
    // Convert to standardized format
  }
}
```

### Phase 2: Python Integration (if needed)

**Fallback Option**: If custom implementation proves insufficient, integrate pdfplumber via child_process for high-accuracy table extraction.

## Testing Strategy

### Test Documents
1. **Simple Tables**: Basic 2x2, 3x3 tables
2. **Complex Tables**: Merged cells, multiple headers
3. **Formatted Tables**: With borders, spacing, alignment
4. **Scanned Tables**: Image-based PDFs with tables
5. **Mixed Content**: Tables within larger documents

### Success Metrics
- **Accuracy**: >90% correct table structure detection
- **Performance**: <2 seconds per document
- **Memory**: <100MB additional usage
- **Integration**: Seamless with existing pipeline

## Implementation Timeline

1. **Week 1**: Custom table detection implementation
2. **Week 2**: Integration with enhanced parsing service
3. **Week 3**: Testing and optimization
4. **Week 4**: Python fallback integration (if needed)

## Conclusion

The recommended approach starts with enhancing the existing pdf-parse pipeline with custom table detection. This provides a good balance of performance, maintainability, and accuracy while avoiding complex dependencies. The Python integration options remain available as fallbacks for documents requiring higher accuracy.

**Next Steps**:
1. Implement custom table detection in `enhancedParsingService.js`
2. Create unit tests for table extraction
3. Test with sample PDF documents
4. Integrate with UI for table preview
