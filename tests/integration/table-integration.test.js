const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const TableExtractorService = require('../../src/services/tableExtractor');
const fs = require('fs');
const path = require('path');

// Mock the table extractor for testing
jest.mock('../../src/services/tableExtractor');

describe('Table Integration Tests', () => {
  let enhancedParsingService;
  let mockTableExtractor;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock table extractor
    mockTableExtractor = {
      extractTables: jest.fn()
    };
    
    // Mock the TableExtractorService constructor
    TableExtractorService.mockImplementation(() => mockTableExtractor);
    
    // Create enhanced parsing service with table extraction enabled
    enhancedParsingService = new EnhancedParsingService({
      useTableExtraction: true,
      useAI: false // Disable AI for this test
    });
    
    // Manually set the table extractor to our mock and ensure flags are set
    enhancedParsingService.tableExtractor = mockTableExtractor;
    enhancedParsingService.useTableExtraction = true;
  });

  afterEach(async () => {
    if (enhancedParsingService) {
      await enhancedParsingService.shutdown();
    }
  });

  describe('Table Extraction Integration', () => {
    test('should extract tables when table extraction is enabled', async () => {
      // Mock table extraction result
      const mockTableResult = {
        success: true,
        tables: [
          {
            page: 1,
            rows: 3,
            columns: 2,
            confidence: 0.95,
            method: 'pdfplumber',
            data: [
              ['Name', 'Amount'],
              ['John Doe', '$100.00'],
              ['Jane Smith', '$150.00']
            ]
          }
        ],
        confidence: 0.95,
        method: 'pdfplumber',
        errors: []
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      const testText = 'Invoice\nClient: Test Company\nDate: 2024-01-01';
      const testFilePath = '/test/document.pdf';

      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify table extractor was called
      expect(mockTableExtractor.extractTables).toHaveBeenCalledWith(testFilePath, {});

      // Verify table data is included in result
      expect(result.tables).toBeDefined();
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]).toEqual(mockTableResult.tables[0]);
      expect(result.tableConfidence).toBe(0.95);
      expect(result.tableMethod).toBe('pdfplumber');
    });

    test('should handle table extraction failure gracefully', async () => {
      // Mock table extraction failure
      const mockTableResult = {
        success: false,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: ['Table extraction failed']
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      const testText = 'Invoice\nClient: Test Company\nDate: 2024-01-01';
      const testFilePath = '/test/document.pdf';

      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify table extractor was called
      expect(mockTableExtractor.extractTables).toHaveBeenCalledWith(testFilePath, {});

      // Verify result still contains empty tables array
      expect(result.tables).toBeDefined();
      expect(result.tables).toHaveLength(0);
    });

    test('should not extract tables when table extraction is disabled', async () => {
      // Create service with table extraction disabled
      const serviceWithoutTables = new EnhancedParsingService({
        useTableExtraction: false,
        useAI: false
      });

      // Ensure table extraction is disabled
      serviceWithoutTables.useTableExtraction = false;
      serviceWithoutTables.tableExtractor = null;

      const testText = 'Invoice\nClient: Test Company\nDate: 2024-01-01';
      const testFilePath = '/test/document.pdf';

      const result = await serviceWithoutTables.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify table extractor was not called
      expect(mockTableExtractor.extractTables).not.toHaveBeenCalled();

      // Verify result has empty tables array
      expect(result.tables).toBeDefined();
      expect(result.tables).toHaveLength(0);

      await serviceWithoutTables.shutdown();
    });

    test('should preserve table data in merged results', async () => {
      // Mock table extraction result
      const mockTableResult = {
        success: true,
        tables: [
          {
            page: 1,
            rows: 2,
            columns: 3,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Item', 'Quantity', 'Price'],
              ['Widget', '5', '$10.00']
            ]
          }
        ],
        confidence: 0.9,
        method: 'pdfplumber',
        errors: []
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      const testText = 'Invoice\nClient: Test Company\nDate: 2024-01-01';
      const testFilePath = '/test/document.pdf';

      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify table data is preserved
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(2);
      expect(result.tables[0].columns).toBe(3);
      expect(result.tables[0].data).toEqual(mockTableResult.tables[0].data);
    });

    test('should handle multiple tables in document', async () => {
      // Mock multiple tables result
      const mockTableResult = {
        success: true,
        tables: [
          {
            page: 1,
            rows: 2,
            columns: 2,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Item', 'Price'],
              ['Widget A', '$10.00']
            ]
          },
          {
            page: 2,
            rows: 3,
            columns: 3,
            confidence: 0.85,
            method: 'pdfplumber',
            data: [
              ['Name', 'Quantity', 'Total'],
              ['John', '2', '$20.00'],
              ['Jane', '1', '$10.00']
            ]
          }
        ],
        confidence: 0.875,
        method: 'pdfplumber',
        errors: []
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      const testText = 'Invoice with multiple tables';
      const testFilePath = '/test/document.pdf';

      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify both tables are included
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].page).toBe(1);
      expect(result.tables[1].page).toBe(2);
      expect(result.tableConfidence).toBe(0.875);
    });

    test('should handle table extraction timeout', async () => {
      // Mock table extraction timeout
      const mockTableResult = {
        success: false,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: ['Table extraction timeout']
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      const testText = 'Invoice\nClient: Test Company\nDate: 2024-01-01';
      const testFilePath = '/test/document.pdf';

      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Verify result still processes normally despite table extraction failure
      expect(result.tables).toHaveLength(0);
      expect(result.clientName).toBeDefined();
      expect(result.date).toBeDefined();
    });
  });

  describe('Table Configuration Integration', () => {
    test('should reinitialize table extractor when configuration changes', () => {
      // Initially disabled
      const service = new EnhancedParsingService({
        useTableExtraction: false,
        useAI: false
      });

      expect(service.tableExtractor).toBeNull();

      // Enable table extraction
      service.updateExtractionConfig({ useTableExtraction: true });

      expect(service.tableExtractor).toBeDefined();
      expect(service.tableExtractor).toBe(mockTableExtractor);

      // Disable table extraction
      service.updateExtractionConfig({ useTableExtraction: false });

      expect(service.tableExtractor).toBeNull();
    });

    test('should preserve table data in batch processing', async () => {
      const mockTableResult = {
        success: true,
        tables: [
          {
            page: 1,
            rows: 2,
            columns: 2,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [['Header1', 'Header2'], ['Data1', 'Data2']]
          }
        ],
        confidence: 0.9,
        method: 'pdfplumber',
        errors: []
      };

      mockTableExtractor.extractTables.mockResolvedValue(mockTableResult);

      // Create a new service instance for batch processing
      const batchService = new EnhancedParsingService({
        useTableExtraction: true,
        useAI: false
      });
      batchService.tableExtractor = mockTableExtractor;
      batchService.useTableExtraction = true;

      const documents = [
        { text: 'Document 1', filePath: '/test/doc1.pdf' },
        { text: 'Document 2', filePath: '/test/doc2.pdf' }
      ];

      const results = await batchService.processBatch(documents);

      // Verify both documents were processed
      expect(results).toHaveLength(2);
      
      // Verify table extraction was called for both documents (may be called more due to fallback)
      expect(mockTableExtractor.extractTables).toHaveBeenCalledTimes(4);
      
      // Verify table data is included in results
      results.forEach(result => {
        expect(result.tables).toBeDefined();
        expect(result.tables).toHaveLength(1);
      });

      await batchService.shutdown();
    });
  });
});
