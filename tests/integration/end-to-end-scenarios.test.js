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

describe('End-to-End Document Processing Scenarios', () => {
  let parsingService;
  let mockServices;

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

    // Initialize parsing service with all features enabled
    parsingService = new EnhancedParsingService({
      useAI: true,
      useOCR: true,
      useTableExtraction: true,
      useHandwritingDetection: true,
      useWatermarkDetection: true
    });

    // Create comprehensive mock services
    mockServices = {
      tableExtractor: {
        extractTables: jest.fn()
      },
      ocrService: {
        extractText: jest.fn(),
        terminate: jest.fn(),
        isLanguageSupported: jest.fn(() => true)
      },
      watermarkService: {
        detectWatermarks: jest.fn(),
        filterWatermarks: jest.fn()
      },
      handwritingService: {
        analyzeTextForHandwriting: jest.fn(),
        analyzeHandwritingCharacteristics: jest.fn()
      },
      languageService: {
        detectLanguage: jest.fn()
      },
      aiTextService: {
        extractMetadataAI: jest.fn()
      },
      aiCache: {
        get: jest.fn(),
        set: jest.fn(),
        generateHash: jest.fn(() => 'test-hash')
      }
    };

    // Set up mocks
    parsingService.tableExtractor = mockServices.tableExtractor;
    parsingService.ocrService = mockServices.ocrService;
    parsingService.watermarkService = mockServices.watermarkService;
    parsingService.handwritingService = mockServices.handwritingService;
    parsingService.languageService = mockServices.languageService;
    parsingService.aiTextService = mockServices.aiTextService;
    parsingService.aiCache = mockServices.aiCache;
  });

  afterEach(async () => {
    if (parsingService) {
      await parsingService.shutdown();
    }
  });

  describe('Complete Document Processing Pipeline', () => {
    test('should process a complex business invoice end-to-end', async () => {
      const invoiceText = `
        INVOICE
        Invoice #: INV-2024-001
        Date: January 15, 2024
        Bill To: Acme Corporation
        123 Business Street
        New York, NY 10001
        
        Description                    Quantity    Unit Price    Total
        Software Development License   1           $2,500.00     $2,500.00
        Technical Support (12 months) 1           $1,200.00     $1,200.00
        Implementation Services       40 hours    $150.00       $6,000.00
        
        Subtotal: $9,700.00
        Tax (8.25%): $800.25
        Total: $10,500.25
        
        Payment Terms: Net 30
        Thank you for your business!
      `;

      // Mock all services for complete processing
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [{
          page: 1,
          rows: 4,
          columns: 4,
          confidence: 0.95,
          method: 'pdfplumber',
          data: [
            ['Description', 'Quantity', 'Unit Price', 'Total'],
            ['Software Development License', '1', '$2,500.00', '$2,500.00'],
            ['Technical Support (12 months)', '1', '$1,200.00', '$1,200.00'],
            ['Implementation Services', '40 hours', '$150.00', '$6,000.00']
          ]
        }],
        confidence: 0.95,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Acme Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Invoice',
        docTypeConfidence: 0.97,
        amount: '$10,500.25',
        amountConfidence: 0.96,
        title: 'Invoice #INV-2024-001',
        titleConfidence: 0.94,
        snippets: ['INVOICE', 'Acme Corporation', 'Invoice #: INV-2024-001'],
        source: 'AI',
        overallConfidence: 0.95
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        invoiceText,
        '/examples/complex-invoice.pdf'
      );

      // Verify complete processing
      expect(result.success).toBe(true);
      expect(result.source).toBe('hybrid');
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
      expect(result.amount).toBe('$10,500.25');
      expect(result.title).toBe('Invoice #INV-2024-001');
      
      // Verify table extraction
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(4);
      expect(result.tables[0].columns).toBe(4);
      expect(result.tableConfidence).toBe(0.95);
      
      // Verify language detection
      expect(result.detectedLanguage).toBe('eng');
      expect(result.languageName).toBe('English');
      
      // Verify no watermarks
      expect(result.watermarks).toHaveLength(0);
      
      // Verify no handwriting
      expect(result.hasHandwriting).toBe(false);
      
      // Verify merge metadata
      expect(result.mergeMetadata).toBeDefined();
      expect(result.fieldSources).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('should process a multilingual contract with signatures', async () => {
      const contractText = `
        CONTRATO DE SERVICIOS / SERVICE AGREEMENT
        Fecha / Date: 15 de enero de 2024 / January 15, 2024
        Entre / Between: ABC Corporation y / and XYZ Ltd
        
        TÉRMINOS Y CONDICIONES / TERMS AND CONDITIONS
        1. Descripción del Servicio / Service Description
        Este contrato cubre la prestación de servicios de desarrollo
        de software incluyendo diseño, implementación y pruebas.
        
        2. Duración / Duration
        El plazo de este contrato es de 12 meses comenzando
        en la fecha de vigencia.
        
        3. Términos de Pago / Payment Terms
        Valor total del contrato: $50,000.00
        Cronograma de pagos: Cuotas mensuales de $4,166.67
        
        4. Firmas / Signatures
        ABC Corporation                    XYZ Ltd
        Firma Autorizada:                 Authorized Signature:
        ____________________               ____________________
        John Smith, CEO                   Jane Doe, Director
        Fecha: _______________            Date: _______________
        
        Por favor firme y devuelva este acuerdo para completar
        el proceso de ejecución del contrato.
      `;

      // Mock all services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'spa',
        languageName: 'Spanish',
        confidence: 0.8
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['signature_pattern', 'signature_block'],
        confidence: 0.85,
        type: 'signature',
        isSignature: true,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'ABC Corporation',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        docType: 'Contract',
        docTypeConfidence: 0.92,
        amount: '$50,000.00',
        amountConfidence: 0.88,
        title: 'Service Agreement',
        titleConfidence: 0.85,
        snippets: ['CONTRATO DE SERVICIOS', 'ABC Corporation', 'XYZ Ltd'],
        source: 'AI',
        overallConfidence: 0.9
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        contractText,
        '/examples/multilingual-contract.pdf'
      );

      // Verify complete processing
      expect(result.success).toBe(true);
      expect(result.source).toBe('hybrid');
      expect(result.clientName).toBe('ABC Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Contract');
      expect(result.amount).toBe('$50,000.00');
      
      // Verify language detection
      expect(result.detectedLanguage).toBe('spa');
      expect(result.languageName).toBe('Spanish');
      
      // Verify signature detection
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('signature');
      expect(result.isSignature).toBe(true);
      
      // Verify merge metadata
      expect(result.mergeMetadata).toBeDefined();
      expect(result.fieldSources).toBeDefined();
    });

    test('should process a confidential document with watermarks', async () => {
      const confidentialText = `
        CONFIDENTIAL - INTERNAL USE ONLY
        STRATEGIC PLANNING DOCUMENT
        Version: 1.2
        Date: January 15, 2024
        
        Executive Summary
        This document contains highly confidential information regarding
        our strategic planning initiatives for Q1 2024. All information
        contained herein is proprietary and should not be shared outside
        the organization without proper authorization.
        
        Key Strategic Initiatives
        1. Market expansion into European markets
        2. Product development roadmap for new AI features
        3. Strategic partnership opportunities
        4. Financial projections and budget allocations
        
        Confidential Financial Data
        Projected revenue: $2.5M
        Key partnerships: 3 strategic alliances planned
        Timeline: Q1 implementation
        Budget allocation: $500K for marketing
        
        CONFIDENTIAL - INTERNAL USE ONLY
        For questions, contact: strategy@company.com
        Document classification: Internal Use Only
        Last updated: January 15, 2024
        CONFIDENTIAL - INTERNAL USE ONLY
      `;

      // Mock all services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: [
          {
            text: 'CONFIDENTIAL - INTERNAL USE ONLY',
            normalizedText: 'confidential internal use only',
            type: 'confidentiality',
            occurrences: 3,
            confidence: 0.98,
            pages: [1]
          }
        ]
      });

      mockServices.watermarkService.filterWatermarks.mockReturnValue(`
        STRATEGIC PLANNING DOCUMENT
        Version: 1.2
        Date: January 15, 2024
        
        Executive Summary
        This document contains highly confidential information regarding
        our strategic planning initiatives for Q1 2024. All information
        contained herein is proprietary and should not be shared outside
        the organization without proper authorization.
        
        Key Strategic Initiatives
        1. Market expansion into European markets
        2. Product development roadmap for new AI features
        3. Strategic partnership opportunities
        4. Financial projections and budget allocations
        
        Confidential Financial Data
        Projected revenue: $2.5M
        Key partnerships: 3 strategic alliances planned
        Timeline: Q1 implementation
        Budget allocation: $500K for marketing
        
        For questions, contact: strategy@company.com
        Document classification: Internal Use Only
        Last updated: January 15, 2024
      `);

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Internal',
        clientConfidence: 0.7,
        date: '2024-01-15',
        dateConfidence: 0.95,
        docType: 'Strategic Document',
        docTypeConfidence: 0.9,
        amount: '$2.5M',
        amountConfidence: 0.85,
        title: 'Strategic Planning Document',
        titleConfidence: 0.88,
        snippets: ['STRATEGIC PLANNING', 'confidential information', 'Q1 2024'],
        source: 'AI',
        overallConfidence: 0.85
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        confidentialText,
        '/examples/confidential-strategy.pdf'
      );

      // Verify complete processing
      expect(result.success).toBe(true);
      expect(result.source).toBe('hybrid');
      expect(result.type).toBe('Strategic Document');
      expect(result.date).toBe('2024-01-15');
      
      // Verify watermark detection and filtering
      expect(result.watermarks).toHaveLength(1);
      expect(result.watermarks[0].type).toBe('confidentiality');
      expect(result.watermarks[0].text).toBe('CONFIDENTIAL - INTERNAL USE ONLY');
      expect(result.filteredText).not.toContain('CONFIDENTIAL - INTERNAL USE ONLY');
      
      // Verify language detection
      expect(result.detectedLanguage).toBe('eng');
      expect(result.languageName).toBe('English');
      
      // Verify no handwriting
      expect(result.hasHandwriting).toBe(false);
      
      // Verify merge metadata
      expect(result.mergeMetadata).toBeDefined();
      expect(result.fieldSources).toBeDefined();
    });
  });

  describe('Error Recovery and Fallback Scenarios', () => {
    test('should handle partial service failures gracefully', async () => {
      const documentText = 'Test document for error handling';

      // Mock some services to fail
      mockServices.languageService.detectLanguage.mockRejectedValue(new Error('Language detection failed'));
      mockServices.tableExtractor.extractTables.mockRejectedValue(new Error('Table extraction failed'));
      
      // Mock other services to work
      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Test Client',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        docType: 'Document',
        docTypeConfidence: 0.7,
        snippets: ['Test document'],
        source: 'AI',
        overallConfidence: 0.8
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        documentText,
        '/examples/error-test.pdf'
      );

      // Should still process successfully despite some service failures
      expect(result.success).toBe(true);
      expect(result.clientName).toBe('Test Client');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Document');
      
      // Should have empty tables due to extraction failure
      expect(result.tables).toHaveLength(0);
      
      // Should have fallback language detection
      expect(result.detectedLanguage).toBe('eng'); // Default fallback
    });

    test('should handle complete service failure gracefully', async () => {
      const documentText = 'Test document for complete failure';

      // Mock all services to fail
      mockServices.languageService.detectLanguage.mockRejectedValue(new Error('Language detection failed'));
      mockServices.tableExtractor.extractTables.mockRejectedValue(new Error('Table extraction failed'));
      mockServices.watermarkService.detectWatermarks.mockRejectedValue(new Error('Watermark detection failed'));
      mockServices.handwritingService.analyzeTextForHandwriting.mockImplementation(() => {
        throw new Error('Handwriting analysis failed');
      });
      mockServices.aiTextService.extractMetadataAI.mockRejectedValue(new Error('AI processing failed'));

      const result = await parsingService.analyzeDocumentEnhanced(
        documentText,
        '/examples/complete-failure.pdf'
      );

      // Should still return a result with basic information
      expect(result.success).toBe(true);
      expect(result.source).toBe('regex'); // Should fall back to regex
      expect(result.rawText).toBe(documentText);
    });
  });

  describe('Performance and Scalability Scenarios', () => {
    test('should process batch of documents efficiently', async () => {
      const documents = [
        { text: 'Invoice 1 content', filePath: '/examples/invoice1.pdf' },
        { text: 'Contract 1 content', filePath: '/examples/contract1.pdf' },
        { text: 'Statement 1 content', filePath: '/examples/statement1.pdf' },
        { text: 'Invoice 2 content', filePath: '/examples/invoice2.pdf' },
        { text: 'Contract 2 content', filePath: '/examples/contract2.pdf' }
      ];

      // Mock all services for batch processing
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Test Client',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        docType: 'Document',
        docTypeConfidence: 0.7,
        snippets: ['Test content'],
        source: 'AI',
        overallConfidence: 0.8
      });

      const startTime = Date.now();
      const results = await parsingService.processBatch(documents);
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.source).toBeDefined();
      });
    });

    test('should handle memory pressure with large documents', async () => {
      // Create a large document
      const largeText = 'Large document content. '.repeat(2000); // ~50KB text

      // Mock all services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Large Corp',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        docType: 'Large Document',
        docTypeConfidence: 0.7,
        snippets: ['Large document content'],
        source: 'AI',
        overallConfidence: 0.8
      });

      const startTime = Date.now();
      const result = await parsingService.analyzeDocumentEnhanced(
        largeText,
        '/examples/large-document.pdf'
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds
      expect(result.clientName).toBe('Large Corp');
    });
  });

  describe('Real-World Document Types', () => {
    test('should process financial statement with tables', async () => {
      const statementText = `
        FINANCIAL STATEMENT
        Company: Acme Corporation
        Period: Q4 2023
        Date: January 15, 2024
        
        INCOME STATEMENT
        Revenue                    $1,000,000
        Cost of Goods Sold        $600,000
        Gross Profit              $400,000
        Operating Expenses        $200,000
        Net Income                $200,000
        
        BALANCE SHEET
        Assets
        Cash                      $50,000
        Accounts Receivable       $100,000
        Inventory                 $150,000
        Total Assets              $300,000
        
        Liabilities
        Accounts Payable          $50,000
        Long-term Debt            $100,000
        Total Liabilities         $150,000
        
        Equity
        Retained Earnings         $150,000
        Total Equity              $150,000
      `;

      // Mock all services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [
          {
            page: 1,
            rows: 6,
            columns: 2,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Revenue', '$1,000,000'],
              ['Cost of Goods Sold', '$600,000'],
              ['Gross Profit', '$400,000'],
              ['Operating Expenses', '$200,000'],
              ['Net Income', '$200,000']
            ]
          },
          {
            page: 1,
            rows: 8,
            columns: 2,
            confidence: 0.85,
            method: 'pdfplumber',
            data: [
              ['Cash', '$50,000'],
              ['Accounts Receivable', '$100,000'],
              ['Inventory', '$150,000'],
              ['Total Assets', '$300,000'],
              ['Accounts Payable', '$50,000'],
              ['Long-term Debt', '$100,000'],
              ['Total Liabilities', '$150,000'],
              ['Total Equity', '$150,000']
            ]
          }
        ],
        confidence: 0.875,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: false,
        patterns: [],
        confidence: 0,
        type: 'printed',
        isSignature: false,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Acme Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Financial Statement',
        docTypeConfidence: 0.97,
        amount: '$200,000',
        amountConfidence: 0.9,
        title: 'Q4 2023 Financial Statement',
        titleConfidence: 0.92,
        snippets: ['FINANCIAL STATEMENT', 'Acme Corporation', 'Q4 2023'],
        source: 'AI',
        overallConfidence: 0.94
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        statementText,
        '/examples/financial-statement.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Financial Statement');
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].rows).toBe(6);
      expect(result.tables[1].rows).toBe(8);
      expect(result.tableConfidence).toBe(0.875);
    });

    test('should process legal document with signatures and watermarks', async () => {
      const legalText = `
        CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE
        LEGAL CONSULTATION AGREEMENT
        Date: January 15, 2024
        
        Client: ABC Corporation
        Attorney: Smith & Associates Law Firm
        
        TERMS OF ENGAGEMENT
        1. Scope of Services
        Legal consultation and representation in corporate matters
        including contract review, compliance, and litigation support.
        
        2. Fees and Payment
        Hourly rate: $500.00
        Retainer: $10,000.00
        Payment terms: Net 30 days
        
        3. Confidentiality
        All communications are protected by attorney-client privilege
        and will be kept strictly confidential.
        
        4. Signatures
        Client Signature: ____________________
        Attorney Signature: ____________________
        Date: _______________
        
        CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE
        This document contains privileged information.
        CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE
      `;

      // Mock all services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
      });

      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: [
          {
            text: 'CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE',
            normalizedText: 'confidential attorney client privilege',
            type: 'confidentiality',
            occurrences: 3,
            confidence: 0.98,
            pages: [1]
          }
        ]
      });

      mockServices.watermarkService.filterWatermarks.mockReturnValue(`
        LEGAL CONSULTATION AGREEMENT
        Date: January 15, 2024
        
        Client: ABC Corporation
        Attorney: Smith & Associates Law Firm
        
        TERMS OF ENGAGEMENT
        1. Scope of Services
        Legal consultation and representation in corporate matters
        including contract review, compliance, and litigation support.
        
        2. Fees and Payment
        Hourly rate: $500.00
        Retainer: $10,000.00
        Payment terms: Net 30 days
        
        3. Confidentiality
        All communications are protected by attorney-client privilege
        and will be kept strictly confidential.
        
        4. Signatures
        Client Signature: ____________________
        Attorney Signature: ____________________
        Date: _______________
        
        This document contains privileged information.
      `);

      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['signature_pattern', 'legal_signature'],
        confidence: 0.9,
        type: 'signature',
        isSignature: true,
        requiresManualReview: false
      });

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'ABC Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Legal Document',
        docTypeConfidence: 0.96,
        amount: '$10,000.00',
        amountConfidence: 0.9,
        title: 'Legal Consultation Agreement',
        titleConfidence: 0.94,
        snippets: ['LEGAL CONSULTATION', 'ABC Corporation', 'Smith & Associates'],
        source: 'AI',
        overallConfidence: 0.94
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        legalText,
        '/examples/legal-document.pdf'
      );

      expect(result.success).toBe(true);
      expect(result.clientName).toBe('ABC Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Legal Document');
      expect(result.amount).toBe('$10,000.00');
      
      // Verify watermark detection and filtering
      expect(result.watermarks).toHaveLength(1);
      expect(result.watermarks[0].type).toBe('confidentiality');
      expect(result.filteredText).not.toContain('CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGE');
      
      // Verify signature detection
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('signature');
      expect(result.isSignature).toBe(true);
    });
  });
});
