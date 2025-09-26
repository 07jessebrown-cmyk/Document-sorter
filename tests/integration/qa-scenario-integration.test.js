const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const fs = require('fs');
const path = require('path');

// Mock all external dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}));
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
  recognize: jest.fn()
}));
jest.mock('sharp', () => jest.fn());

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  statSync: jest.fn(),
  readFile: jest.fn(),
  existsSync: jest.fn(),
  constants: {
    F_OK: 0
  }
}));

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

describe('QA Scenario Integration Tests', () => {
  let parsingService;
  let mockTableExtractor;
  let mockOCRService;
  let mockWatermarkService;
  let mockHandwritingService;
  let mockLanguageService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    fs.mkdirSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    fs.statSync.mockImplementation(() => ({
      mtime: new Date('2024-01-15')
    }));
    fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
    fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
    fs.existsSync.mockReturnValue(true);

    // Mock table extractor
    mockTableExtractor = {
      extractTables: jest.fn()
    };

    // Mock OCR service
    mockOCRService = {
      extractText: jest.fn(),
      terminate: jest.fn(),
      isLanguageSupported: jest.fn(() => true)
    };

    // Mock watermark service
    mockWatermarkService = {
      detectWatermarks: jest.fn(),
      filterWatermarks: jest.fn()
    };

    // Mock handwriting service
    mockHandwritingService = {
      analyzeTextForHandwriting: jest.fn(),
      analyzeHandwritingCharacteristics: jest.fn()
    };

    // Mock language service
    mockLanguageService = {
      detectLanguage: jest.fn()
    };

    // Initialize parsing service with all features enabled
    parsingService = new EnhancedParsingService({
      useAI: true,
      useOCR: true,
      useTableExtraction: true,
      useHandwritingDetection: true,
      useWatermarkDetection: true
    });

    // Set up mocks
    parsingService.tableExtractor = mockTableExtractor;
    parsingService.ocrService = mockOCRService;
    parsingService.watermarkService = mockWatermarkService;
    parsingService.handwritingService = mockHandwritingService;
    parsingService.languageService = mockLanguageService;
  });

  afterEach(async () => {
    if (parsingService) {
      await parsingService.shutdown();
    }
  });

  describe('Table Extraction QA Scenarios', () => {
    test('should process table-heavy invoice with complex structure', async () => {
      const tableInvoiceText = `
        INVOICE
        Invoice #: INV-2024-001
        Date: January 15, 2024
        Bill To: Acme Corporation
        123 Business St
        City, State 12345
        
        Description          Quantity    Unit Price    Total
        Software License    1           $500.00       $500.00
        Support Services    12          $100.00       $1,200.00
        Consulting          8           $150.00       $1,200.00
        
        Subtotal: $2,900.00
        Tax (8%): $232.00
        Total: $3,132.00
      `;

      // Mock table extraction result
      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [{
          page: 1,
          rows: 4,
          columns: 4,
          confidence: 0.95,
          method: 'pdfplumber',
          data: [
            ['Description', 'Quantity', 'Unit Price', 'Total'],
            ['Software License', '1', '$500.00', '$500.00'],
            ['Support Services', '12', '$100.00', '$1,200.00'],
            ['Consulting', '8', '$150.00', '$1,200.00']
          ]
        }],
        confidence: 0.95,
        method: 'pdfplumber',
        errors: []
      });

      // Mock watermark detection (no watermarks)
      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      // Mock language detection
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        tableInvoiceText,
        '/examples/table-invoice.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(4);
      expect(result.tables[0].columns).toBe(4);
      expect(result.tableConfidence).toBe(0.95);
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
    });

    test('should handle table extraction failure gracefully', async () => {
      const textWithTables = 'Invoice with tables that failed to extract';

      // Mock table extraction failure
      mockTableExtractor.extractTables.mockResolvedValue({
        success: false,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: ['Table extraction failed']
      });

      // Mock other services
      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        textWithTables,
        '/examples/table-invoice.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(0);
      expect(result.tableConfidence).toBe(0);
      // Should still extract other metadata
      expect(result.source).toBeDefined();
    });
  });

  describe('Multilingual Document QA Scenarios', () => {
    test('should process Spanish invoice with language detection', async () => {
      const spanishInvoiceText = `
        FACTURA
        Número de factura: FAC-2024-001
        Fecha: 15 de enero de 2024
        Cliente: Corporación Acme
        Dirección: Calle Principal 123
        Ciudad, Estado 12345
        
        Descripción          Cantidad    Precio Unitario    Total
        Licencia de Software 1           $500.00           $500.00
        Servicios de Soporte 12          $100.00           $1,200.00
        Consultoría          8           $150.00           $1,200.00
        
        Subtotal: $2,900.00
        Impuestos (8%): $232.00
        Total: $3,132.00
        Términos de pago: Neto 30 días
        Gracias por su negocio.
      `;

      // Mock language detection
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'spa',
        languageName: 'Spanish',
        confidence: 0.95
      });

      // Mock table extraction
      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      // Mock watermark detection
      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        spanishInvoiceText,
        '/examples/multilingual-spanish.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('spa');
      expect(result.languageName).toBe('Spanish');
      expect(result.clientName).toBe('Corporación Acme');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
    });

    test('should handle mixed language documents', async () => {
      const mixedLanguageText = `
        INVOICE / FACTURA
        Client / Cliente: Acme Corporation
        Date / Fecha: 15/01/2024
        Amount / Monto: $3,132.00
        Payment due / Pago vence: 30 days / 30 días
      `;

      // Mock language detection for mixed content
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.6
      });

      // Mock other services
      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        mixedLanguageText,
        '/examples/mixed-language.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
    });
  });

  describe('Signature Detection QA Scenarios', () => {
    test('should process contract with signature blocks', async () => {
      const contractText = `
        SERVICE AGREEMENT
        Agreement Date: January 15, 2024
        Between: ABC Corporation and XYZ Ltd
        
        TERMS AND CONDITIONS
        1. Service Description
        This agreement covers the provision of software development
        services including design, implementation, and testing.
        
        2. Duration
        The term of this agreement is 12 months commencing
        on the effective date.
        
        3. Payment Terms
        Total contract value: $50,000.00
        Payment schedule: Monthly installments of $4,166.67
        
        4. Signatures
        ABC Corporation                    XYZ Ltd
        Authorized Signature:              Authorized Signature:
        ____________________               ____________________
        John Smith, CEO                    Jane Doe, Director
        Date: _______________              Date: _______________
        
        Please sign and return this agreement to complete
        the contract execution process.
      `;

      // Mock signature detection
      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['signature_pattern', 'signature_block'],
        confidence: 0.8,
        type: 'signature',
        isSignature: true,
        requiresManualReview: false
      });

      // Mock other services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        contractText,
        '/examples/signature-contract.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('signature');
      expect(result.isSignature).toBe(true);
      expect(result.clientName).toBe('ABC Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Contract');
    });

    test('should handle handwritten notes document', async () => {
      const handwrittenNotesText = `
        MEETING NOTES - HANDWRITTEN
        Date: January 15, 2024
        Attendees: John, Jane, Mike
        
        Key Points:
        - Discussed project timeline
        - Need to follow up with client
        - Budget approval pending
        - Next meeting scheduled for next week
        
        Action Items:
        1. John to prepare proposal
        2. Jane to contact vendor
        3. Mike to review contracts
        
        Handwritten Notes:
        Please review this section - handwritten
        Signature: John Smith
        Please sign and date: _______________
        Personal memo: Important client feedback
      `;

      // Mock handwriting detection
      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['handwritten_notes', 'signature_pattern', 'memo'],
        confidence: 0.7,
        type: 'handwritten',
        isSignature: false,
        requiresManualReview: false
      });

      // Mock other services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        handwrittenNotesText,
        '/examples/handwriting-notes.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('handwritten');
      expect(result.isSignature).toBe(false);
      expect(result.type).toBe('Notes');
    });
  });

  describe('Watermark Detection QA Scenarios', () => {
    test('should process confidential document and filter watermarks', async () => {
      const confidentialText = `
        CONFIDENTIAL - INTERNAL USE ONLY
        STRATEGIC PLANNING DOCUMENT
        
        Executive Summary
        This document contains confidential information regarding
        our strategic planning initiatives for Q1 2024.
        All information contained herein is proprietary and
        should not be shared outside the organization.
        
        Key Initiatives
        1. Market expansion into European markets
        2. Product development roadmap
        3. Partnership opportunities
        4. Financial projections
        
        Confidential financial data: $2.5M projected revenue
        Key partnerships: 3 strategic alliances planned
        Timeline: Q1 implementation
        
        CONFIDENTIAL - INTERNAL USE ONLY
        For questions, contact: strategy@company.com
        Document version: 1.2
        Last updated: January 15, 2024
        
        CONFIDENTIAL - INTERNAL USE ONLY
      `;

      // Mock watermark detection
      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: [
          {
            text: 'CONFIDENTIAL - INTERNAL USE ONLY',
            normalizedText: 'confidential internal use only',
            type: 'confidentiality',
            occurrences: 3,
            confidence: 0.95,
            pages: [1]
          }
        ]
      });

      // Mock watermark filtering
      mockWatermarkService.filterWatermarks.mockReturnValue(`
        STRATEGIC PLANNING DOCUMENT
        
        Executive Summary
        This document contains confidential information regarding
        our strategic planning initiatives for Q1 2024.
        All information contained herein is proprietary and
        should not be shared outside the organization.
        
        Key Initiatives
        1. Market expansion into European markets
        2. Product development roadmap
        3. Partnership opportunities
        4. Financial projections
        
        Confidential financial data: $2.5M projected revenue
        Key partnerships: 3 strategic alliances planned
        Timeline: Q1 implementation
        
        For questions, contact: strategy@company.com
        Document version: 1.2
        Last updated: January 15, 2024
      `);

      // Mock other services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        confidentialText,
        '/examples/watermark-confidential.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.watermarks).toHaveLength(1);
      expect(result.watermarks[0].type).toBe('confidentiality');
      expect(result.watermarks[0].text).toBe('CONFIDENTIAL - INTERNAL USE ONLY');
      expect(result.filteredText).not.toContain('CONFIDENTIAL - INTERNAL USE ONLY');
      expect(result.type).toBe('Strategic Document');
    });

    test('should handle document without watermarks', async () => {
      const normalText = `
        REGULAR BUSINESS DOCUMENT
        Date: January 15, 2024
        Client: Acme Corporation
        
        This is a regular business document without any watermarks.
        It contains standard business information and should be
        processed normally without any watermark filtering.
      `;

      // Mock watermark detection (no watermarks)
      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      // Mock other services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        normalText,
        '/examples/normal-document.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.watermarks).toHaveLength(0);
      expect(result.filteredText).toBe(normalText);
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
    });
  });

  describe('OCR Fallback QA Scenarios', () => {
    test('should use OCR when PDF text extraction fails', async () => {
      const imageBasedText = `
        INVOICE
        Bill To: Microsoft Corporation
        Date: 2024-01-15
        Amount: $2,500.00
        Payment Terms: Net 30
      `;

      // Mock PDF parsing to return empty text (simulating image-based PDF)
      pdfParse.mockResolvedValue({
        text: '',
        numpages: 1
      });

      // Mock OCR service
      mockOCRService.extractText.mockResolvedValue({
        success: true,
        text: imageBasedText,
        confidence: 0.85,
        method: 'tesseract',
        processingTime: 1500
      });

      // Mock other services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        imageBasedText,
        '/examples/image-invoice.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.rawText).toBe(imageBasedText);
      expect(result.ocrUsed).toBe(true);
      expect(result.ocrConfidence).toBe(0.85);
      expect(result.clientName).toBe('Microsoft Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
    });

    test('should handle OCR failure gracefully', async () => {
      // Mock PDF parsing to return empty text
      pdfParse.mockResolvedValue({
        text: '',
        numpages: 1
      });

      // Mock OCR service failure
      mockOCRService.extractText.mockResolvedValue({
        success: false,
        text: '',
        confidence: 0,
        method: 'tesseract',
        processingTime: 1000,
        errors: ['OCR extraction failed']
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        '',
        '/examples/failed-ocr.pdf'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCR extraction failed');
    });
  });

  describe('Complex Real-World Scenarios', () => {
    test('should process complex multilingual document with all features', async () => {
      const complexText = `
        CONFIDENTIAL - INTERNAL USE ONLY
        FACTURA / INVOICE
        Número de factura / Invoice #: FAC-2024-001
        Fecha / Date: 15 de enero de 2024 / January 15, 2024
        Cliente / Client: Corporación Acme / Acme Corporation
        
        Descripción / Description    Cantidad / Qty    Precio / Price    Total
        Software License             1                 $500.00          $500.00
        Support Services             12                $100.00          $1,200.00
        
        Subtotal: $1,700.00
        Impuestos / Tax (8%): $136.00
        Total: $1,836.00
        
        Authorized Signature: ____________________
        Firma autorizada: ____________________
        
        CONFIDENTIAL - INTERNAL USE ONLY
      `;

      // Mock all services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'spa',
        languageName: 'Spanish',
        confidence: 0.7
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [{
          page: 1,
          rows: 3,
          columns: 4,
          confidence: 0.9,
          method: 'pdfplumber',
          data: [
            ['Descripción / Description', 'Cantidad / Qty', 'Precio / Price', 'Total'],
            ['Software License', '1', '$500.00', '$500.00'],
            ['Support Services', '12', '$100.00', '$1,200.00']
          ]
        }],
        confidence: 0.9,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: [
          {
            text: 'CONFIDENTIAL - INTERNAL USE ONLY',
            normalizedText: 'confidential internal use only',
            type: 'confidentiality',
            occurrences: 2,
            confidence: 0.95,
            pages: [1]
          }
        ]
      });

      mockWatermarkService.filterWatermarks.mockReturnValue(`
        FACTURA / INVOICE
        Número de factura / Invoice #: FAC-2024-001
        Fecha / Date: 15 de enero de 2024 / January 15, 2024
        Cliente / Client: Corporación Acme / Acme Corporation
        
        Descripción / Description    Cantidad / Qty    Precio / Price    Total
        Software License             1                 $500.00          $500.00
        Support Services             12                $100.00          $1,200.00
        
        Subtotal: $1,700.00
        Impuestos / Tax (8%): $136.00
        Total: $1,836.00
        
        Authorized Signature: ____________________
        Firma autorizada: ____________________
      `);

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['signature_pattern'],
        confidence: 0.8,
        type: 'signature',
        isSignature: true,
        requiresManualReview: false
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        complexText,
        '/examples/complex-multilingual.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('spa');
      expect(result.tables).toHaveLength(1);
      expect(result.watermarks).toHaveLength(1);
      expect(result.hasHandwriting).toBe(true);
      expect(result.isSignature).toBe(true);
      expect(result.clientName).toBe('Corporación Acme');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
      expect(result.filteredText).not.toContain('CONFIDENTIAL - INTERNAL USE ONLY');
    });

    test('should handle document processing errors gracefully', async () => {
      // Mock service failures
      mockLanguageService.detectLanguage.mockRejectedValue(new Error('Language detection failed'));
      mockTableExtractor.extractTables.mockRejectedValue(new Error('Table extraction failed'));
      mockWatermarkService.detectWatermarks.mockRejectedValue(new Error('Watermark detection failed'));
      mockHandwritingService.analyzeTextForHandwriting.mockImplementation(() => {
        throw new Error('Handwriting analysis failed');
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        'Test document',
        '/examples/error-document.pdf'
      );

      // Should still process the document with basic extraction
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.source).toBeDefined();
    });
  });

  describe('Performance and Reliability QA', () => {
    test('should process multiple documents efficiently', async () => {
      const documents = [
        { text: 'Invoice 1', filePath: '/examples/invoice1.pdf' },
        { text: 'Invoice 2', filePath: '/examples/invoice2.pdf' },
        { text: 'Contract 1', filePath: '/examples/contract1.pdf' }
      ];

      // Mock all services for batch processing
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      const startTime = Date.now();
      const results = await parsingService.processBatch(documents);
      const endTime = Date.now();

      expect(results).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.source).toBeDefined();
      });
    });

    test('should handle memory pressure with large documents', async () => {
      const largeText = 'Large document content. '.repeat(1000); // ~25KB text

      // Mock all services
      mockLanguageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockTableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockWatermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockHandwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      const startTime = Date.now();
      const result = await parsingService.analyzeDocumentEnhanced(
        largeText,
        '/examples/large-document.pdf'
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
