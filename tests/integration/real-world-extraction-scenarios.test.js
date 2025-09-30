const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const fs = require('fs');
const path = require('path');

// Mock services with standardized structure
jest.mock('../../src/services/telemetryService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../../src/services/canaryRolloutService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../../src/services/aiTextService', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn(() => ({
      clientName: 'Corporación Acme',
      date: '2023-12-15',
      type: 'Invoice'
    })),
    setLLMClient: jest.fn(),
    setCache: jest.fn(),
    setTelemetry: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    extractMetadataAI: jest.fn()
  }));
});

// Standardized ConfigService mock
const mockConfigService = {
  get: jest.fn((key) => {
    if (key === 'ai.enabled') return true;
    if (key === 'ai.confidenceThreshold') return 0.5;
    if (key === 'ai.batchSize') return 5;
    if (key === 'ai.timeout') return 30000;
    if (key === 'debug') return false;
    if (key === 'extraction.useOCR') return true;
    if (key === 'extraction.useTableExtraction') return true;
    if (key === 'extraction.useLLMEnhancer') return true;
    if (key === 'extraction.useHandwritingDetection') return true;
    if (key === 'extraction.useWatermarkDetection') return true;
    if (key === 'extraction.tableTimeout') return 30000;
    if (key === 'extraction.ocrLanguage') return 'eng';
    if (key === 'extraction.ocrWorkerPoolSize') return 2;
    return null;
  }),
  getExtractionConfig: jest.fn(() => ({
    useOCR: true,
    useTableExtraction: true,
    useLLMEnhancer: true,
    useHandwritingDetection: true,
    useWatermarkDetection: true
  }))
};

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

describe('Real-World Extraction Scenarios with Mocks', () => {
  let parsingService;
  let mockServices;

  beforeEach(async () => {
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
      useWatermarkDetection: true,
      configService: mockConfigService
    });

    // Clear AI cache
    if (parsingService.aiCache) {
      await parsingService.aiCache.clear();
    }

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
        analyze: jest.fn(() => ({
          clientName: 'Corporación Acme',
          date: '2023-12-15',
          type: 'Invoice'
        })),
        setLLMClient: jest.fn(),
        setCache: jest.fn(),
        setTelemetry: jest.fn(),
        extractMetadataAI: jest.fn()
      },
      aiCache: {
        get: jest.fn(),
        set: jest.fn(),
        clear: jest.fn(),
        generateHash: jest.fn(() => 'test-hash')
      },
      telemetry: {
        initialize: jest.fn(),
        close: jest.fn()
      },
      canaryRolloutService: {
        initialize: jest.fn()
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
    parsingService.telemetry = mockServices.telemetry;
    parsingService.canaryRolloutService = mockServices.canaryRolloutService;
  });

  afterEach(async () => {
    if (parsingService) {
      await parsingService.shutdown();
    }
  });

  describe('Table Structure Preservation Scenarios', () => {
    test('should preserve complex table structures in financial reports', async () => {
      const financialReportText = `
        QUARTERLY FINANCIAL REPORT
        Company: TechCorp Inc.
        Period: Q4 2023
        Date: January 15, 2024
        
        REVENUE BREAKDOWN
        Product Line              Q1 2023    Q2 2023    Q3 2023    Q4 2023    Total
        Software Licenses        $500,000   $550,000   $600,000   $650,000   $2,300,000
        Support Services         $200,000   $220,000   $240,000   $260,000   $920,000
        Professional Services    $300,000   $330,000   $360,000   $390,000   $1,380,000
        Total Revenue            $1,000,000 $1,100,000 $1,200,000 $1,300,000 $4,600,000
        
        EXPENSE BREAKDOWN
        Category                 Q1 2023    Q2 2023    Q3 2023    Q4 2023    Total
        Salaries & Benefits      $400,000   $420,000   $440,000   $460,000   $1,720,000
        Marketing & Sales        $100,000   $110,000   $120,000   $130,000   $460,000
        Research & Development   $150,000   $160,000   $170,000   $180,000   $660,000
        General & Administrative $50,000    $55,000    $60,000    $65,000    $230,000
        Total Expenses           $700,000   $745,000   $790,000   $835,000   $3,070,000
        
        NET INCOME
        Q1 2023: $300,000
        Q2 2023: $355,000
        Q3 2023: $410,000
        Q4 2023: $465,000
        Total: $1,530,000
      `;

      // Mock table extraction with complex multi-table structure
      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [
          {
            page: 1,
            rows: 5,
            columns: 6,
            confidence: 0.95,
            method: 'pdfplumber',
            data: [
              ['Product Line', 'Q1 2023', 'Q2 2023', 'Q3 2023', 'Q4 2023', 'Total'],
              ['Software Licenses', '$500,000', '$550,000', '$600,000', '$650,000', '$2,300,000'],
              ['Support Services', '$200,000', '$220,000', '$240,000', '$260,000', '$920,000'],
              ['Professional Services', '$300,000', '$330,000', '$360,000', '$390,000', '$1,380,000'],
              ['Total Revenue', '$1,000,000', '$1,100,000', '$1,200,000', '$1,300,000', '$4,600,000']
            ]
          },
          {
            page: 1,
            rows: 6,
            columns: 6,
            confidence: 0.92,
            method: 'pdfplumber',
            data: [
              ['Category', 'Q1 2023', 'Q2 2023', 'Q3 2023', 'Q4 2023', 'Total'],
              ['Salaries & Benefits', '$400,000', '$420,000', '$440,000', '$460,000', '$1,720,000'],
              ['Marketing & Sales', '$100,000', '$110,000', '$120,000', '$130,000', '$460,000'],
              ['Research & Development', '$150,000', '$160,000', '$170,000', '$180,000', '$660,000'],
              ['General & Administrative', '$50,000', '$55,000', '$60,000', '$65,000', '$230,000'],
              ['Total Expenses', '$700,000', '$745,000', '$790,000', '$835,000', '$3,070,000']
            ]
          }
        ],
        confidence: 0.935,
        method: 'pdfplumber',
        errors: []
      });

      // Mock other services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
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
        clientName: 'TechCorp Inc.',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Financial Report',
        docTypeConfidence: 0.97,
        amount: '$1,530,000',
        amountConfidence: 0.9,
        title: 'Q4 2023 Quarterly Financial Report',
        titleConfidence: 0.94,
        snippets: ['QUARTERLY FINANCIAL REPORT', 'TechCorp Inc.', 'Q4 2023'],
        source: 'AI',
        overallConfidence: 0.94
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        financialReportText,
        '/examples/financial-report.pdf'
      );

      // Verify table preservation
      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].rows).toBe(5);
      expect(result.tables[0].columns).toBe(6);
      expect(result.tables[1].rows).toBe(6);
      expect(result.tables[1].columns).toBe(6);
      expect(result.tableConfidence).toBe(0.935);
      
      // Verify table data integrity
      expect(result.tables[0].data[0]).toEqual(['Product Line', 'Q1 2023', 'Q2 2023', 'Q3 2023', 'Q4 2023', 'Total']);
      expect(result.tables[0].data[1]).toEqual(['Software Licenses', '$500,000', '$550,000', '$600,000', '$650,000', '$2,300,000']);
      
      // Verify other metadata
      expect(result.clientName).toBe('TechCorp Inc.');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Financial Report');
      expect(result.amount).toBe('$1,530,000');
    });

    test('should handle table extraction with mixed content types', async () => {
      const mixedContentText = `
        PRODUCT CATALOG
        Company: WidgetCorp
        Date: January 15, 2024
        
        PRODUCT LISTING
        Product ID    Name                Category        Price      In Stock
        WID-001       Widget A            Electronics     $99.99     Yes
        WID-002       Widget B            Electronics     $149.99    No
        WID-003       Gadget X            Accessories     $29.99     Yes
        WID-004       Tool Y              Tools           $79.99     Yes
        
        CUSTOMER INFORMATION
        Name: John Smith
        Email: john@example.com
        Phone: (555) 123-4567
        Address: 123 Main St, City, State 12345
        
        ORDER SUMMARY
        Subtotal: $259.97
        Tax: $20.80
        Shipping: $9.99
        Total: $290.76
      `;

      // Mock table extraction with mixed content
      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [
          {
            page: 1,
            rows: 5,
            columns: 5,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Product ID', 'Name', 'Category', 'Price', 'In Stock'],
              ['WID-001', 'Widget A', 'Electronics', '$99.99', 'Yes'],
              ['WID-002', 'Widget B', 'Electronics', '$149.99', 'No'],
              ['WID-003', 'Gadget X', 'Accessories', '$29.99', 'Yes'],
              ['WID-004', 'Tool Y', 'Tools', '$79.99', 'Yes']
            ]
          }
        ],
        confidence: 0.9,
        method: 'pdfplumber',
        errors: []
      });

      // Mock other services
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'eng',
        languageName: 'English',
        confidence: 0.95
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
        clientName: 'John Smith',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        docType: 'Product Catalog',
        docTypeConfidence: 0.85,
        amount: '$290.76',
        amountConfidence: 0.9,
        title: 'Product Catalog',
        titleConfidence: 0.8,
        snippets: ['PRODUCT CATALOG', 'WidgetCorp', 'John Smith'],
        source: 'AI',
        overallConfidence: 0.88
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        mixedContentText,
        '/examples/product-catalog.pdf'
      );

      // Verify table preservation
      expect(result.success).toBe(true);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(5);
      expect(result.tables[0].columns).toBe(5);
      expect(result.tableConfidence).toBe(0.9);
      
      // Verify table data integrity
      expect(result.tables[0].data[0]).toEqual(['Product ID', 'Name', 'Category', 'Price', 'In Stock']);
      expect(result.tables[0].data[1]).toEqual(['WID-001', 'Widget A', 'Electronics', '$99.99', 'Yes']);
      
      // Verify other metadata
      expect(result.clientName).toBe('John Smith');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Product Catalog');
      expect(result.amount).toBe('$290.76');
    });
  });

  describe('Multilingual Document Processing Scenarios', () => {
    test('should process French business document with proper language detection', async () => {
      const frenchDocumentText = `
        FACTURE
        Numéro de facture: FAC-2024-001
        Date: 15 janvier 2024
        Client: Société Acme
        Adresse: 123 Rue des Affaires
        Ville, État 12345
        
        Description                    Quantité    Prix Unitaire    Total
        Licence Logicielle            1           $500.00          $500.00
        Services de Support           12          $100.00          $1,200.00
        Services de Conseil           8           $150.00          $1,200.00
        
        Sous-total: $2,900.00
        Taxes (8%): $232.00
        Total: $3,132.00
        
        Conditions de paiement: Net 30 jours
        Merci pour votre entreprise!
      `;

      // Mock language detection
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'fra',
        languageName: 'French',
        confidence: 0.95
      });

      // Mock table extraction
      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [
          {
            page: 1,
            rows: 4,
            columns: 4,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Description', 'Quantité', 'Prix Unitaire', 'Total'],
              ['Licence Logicielle', '1', '$500.00', '$500.00'],
              ['Services de Support', '12', '$100.00', '$1,200.00'],
              ['Services de Conseil', '8', '$150.00', '$1,200.00']
            ]
          }
        ],
        confidence: 0.9,
        method: 'pdfplumber',
        errors: []
      });

      // Mock other services
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
        clientName: 'Société Acme',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Invoice',
        docTypeConfidence: 0.97,
        amount: '$3,132.00',
        amountConfidence: 0.96,
        title: 'FACTURE FAC-2024-001',
        titleConfidence: 0.94,
        snippets: ['FACTURE', 'Société Acme', 'Numéro de facture: FAC-2024-001'],
        source: 'AI',
        overallConfidence: 0.95
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        frenchDocumentText,
        '/examples/french-invoice.pdf'
      );

      // Verify language detection
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('fra');
      expect(result.languageName).toBe('French');
      
      // Verify table preservation
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(4);
      expect(result.tables[0].columns).toBe(4);
      expect(result.tableConfidence).toBe(0.9);
      
      // Verify metadata extraction
      expect(result.clientName).toBe('Société Acme');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
      expect(result.amount).toBe('$3,132.00');
    });

    test('should process German technical document with complex terminology', async () => {
      const germanDocumentText = `
        TECHNISCHE SPEZIFIKATION
        Dokumentnummer: TS-2024-001
        Datum: 15. Januar 2024
        Kunde: Deutsche Technologie AG
        Adresse: Musterstraße 123, 10115 Berlin
        
        PRODUKTÜBERSICHT
        Produktname: Industrielle Steuerungseinheit
        Modell: ISE-2024
        Seriennummer: 1234567890
        
        TECHNISCHE DATEN
        Spannung: 24V DC
        Stromverbrauch: 2.5A
        Betriebstemperatur: -20°C bis +60°C
        Schutzart: IP65
        Abmessungen: 200x150x50mm
        Gewicht: 1.2kg
        
        FUNKTIONEN
        - Automatische Steuerung
        - Fernüberwachung
        - Datenprotokollierung
        - Fehlerdiagnose
        - Wartungsfreundlichkeit
        
        PREISE
        Einzelpreis: €1,500.00
        Mengenrabatt (10+): €1,350.00
        Lieferzeit: 2-3 Wochen
        
        GARANTIE
        2 Jahre Herstellergarantie
        Erweiterte Garantie verfügbar
      `;

      // Mock language detection
      mockServices.languageService.detectLanguage.mockResolvedValue({
        success: true,
        detectedLanguage: 'deu',
        languageName: 'German',
        confidence: 0.98
      });

      // Mock table extraction (no tables in this document)
      mockServices.tableExtractor.extractTables.mockResolvedValue({
        success: true,
        tables: [],
        confidence: 0,
        method: 'pdfplumber',
        errors: []
      });

      // Mock other services
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
        clientName: 'Deutsche Technologie AG',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Technical Specification',
        docTypeConfidence: 0.97,
        amount: '€1,500.00',
        amountConfidence: 0.9,
        title: 'TECHNISCHE SPEZIFIKATION TS-2024-001',
        titleConfidence: 0.94,
        snippets: ['TECHNISCHE SPEZIFIKATION', 'Deutsche Technologie AG', 'ISE-2024'],
        source: 'AI',
        overallConfidence: 0.94
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        germanDocumentText,
        '/examples/german-technical.pdf'
      );

      // Verify language detection
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('deu');
      expect(result.languageName).toBe('German');
      
      // Verify metadata extraction
      expect(result.clientName).toBe('Deutsche Technologie AG');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Technical Specification');
      expect(result.amount).toBe('€1,500.00');
    });
  });

  describe('Signature and Handwriting Detection Scenarios', () => {
    test('should detect and process handwritten signatures in legal documents', async () => {
      const legalDocumentText = `
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
        John Smith, CEO                   Jane Doe, Director
        Date: _______________              Date: _______________
        
        Please sign and return this agreement to complete
        the contract execution process.
        
        Handwritten Note: Please review section 3.2 before signing.
        Signature: John Smith
        Date: 1/15/2024
      `;

      // Mock handwriting detection
      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['signature_pattern', 'signature_block', 'handwritten_note'],
        confidence: 0.9,
        type: 'signature',
        isSignature: true,
        requiresManualReview: false
      });

      // Mock other services
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

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'ABC Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Contract',
        docTypeConfidence: 0.97,
        amount: '$50,000.00',
        amountConfidence: 0.9,
        title: 'Service Agreement',
        titleConfidence: 0.94,
        snippets: ['SERVICE AGREEMENT', 'ABC Corporation', 'XYZ Ltd'],
        source: 'AI',
        overallConfidence: 0.94
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        legalDocumentText,
        '/examples/legal-contract.pdf'
      );

      // Verify handwriting detection
      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('signature');
      expect(result.isSignature).toBe(true);
      expect(result.handwritingConfidence).toBe(0.9);
      
      // Verify other metadata
      expect(result.clientName).toBe('ABC Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Contract');
      expect(result.amount).toBe('$50,000.00');
    });

    test('should detect handwritten notes and annotations', async () => {
      const annotatedDocumentText = `
        PROJECT PROPOSAL
        Date: January 15, 2024
        Client: TechStart Inc.
        
        EXECUTIVE SUMMARY
        This proposal outlines the development of a new mobile application
        for our client's business needs.
        
        Handwritten Note: Client wants iOS version first
        Annotation: Budget increased by 20%
        Personal Note: Follow up on timeline
        
        PROJECT SCOPE
        1. Mobile app development
        2. Backend API development
        3. Database design
        4. Testing and deployment
        
        Handwritten Addition: Add security features
        Signature: Project Manager
        Date: 1/15/2024
      `;

      // Mock handwriting detection
      mockServices.handwritingService.analyzeTextForHandwriting.mockReturnValue({
        hasHandwriting: true,
        patterns: ['handwritten_note', 'annotation', 'personal_note', 'signature_pattern'],
        confidence: 0.8,
        type: 'handwritten',
        isSignature: false,
        requiresManualReview: false
      });

      // Mock other services
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

      mockServices.aiCache.get.mockResolvedValue(null);
      mockServices.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'TechStart Inc.',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        docType: 'Project Proposal',
        docTypeConfidence: 0.9,
        amount: null,
        amountConfidence: 0,
        title: 'Project Proposal',
        titleConfidence: 0.85,
        snippets: ['PROJECT PROPOSAL', 'TechStart Inc.', 'mobile application'],
        source: 'AI',
        overallConfidence: 0.9
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        annotatedDocumentText,
        '/examples/annotated-proposal.pdf'
      );

      // Verify handwriting detection
      expect(result.success).toBe(true);
      expect(result.hasHandwriting).toBe(true);
      expect(result.handwritingType).toBe('handwritten');
      expect(result.isSignature).toBe(false);
      expect(result.handwritingConfidence).toBe(0.8);
      
      // Verify other metadata
      expect(result.clientName).toBe('TechStart Inc.');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Project Proposal');
    });
  });

  describe('Watermark Detection and Filtering Scenarios', () => {
    test('should detect and filter multiple types of watermarks', async () => {
      const watermarkedDocumentText = `
        DRAFT - CONFIDENTIAL
        INTERNAL DOCUMENT
        Version: 1.0
        Date: January 15, 2024
        
        STRATEGIC PLANNING
        This document contains confidential information regarding
        our strategic planning initiatives for Q1 2024.
        
        DRAFT - CONFIDENTIAL
        Key Initiatives:
        1. Market expansion
        2. Product development
        3. Partnership opportunities
        
        DRAFT - CONFIDENTIAL
        Financial Projections:
        Revenue: $2.5M
        Expenses: $1.8M
        Net Profit: $700K
        
        DRAFT - CONFIDENTIAL
        For internal use only.
        Copyright 2024 Company Inc.
        DRAFT - CONFIDENTIAL
      `;

      // Mock watermark detection
      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: [
          {
            text: 'DRAFT - CONFIDENTIAL',
            normalizedText: 'draft confidential',
            type: 'draft',
            occurrences: 5,
            confidence: 0.98,
            pages: [1]
          },
          {
            text: 'Copyright 2024 Company Inc.',
            normalizedText: 'copyright 2024 company inc',
            type: 'copyright',
            occurrences: 1,
            confidence: 0.95,
            pages: [1]
          }
        ]
      });

      // Mock watermark filtering
      mockServices.watermarkService.filterWatermarks.mockReturnValue(`
        INTERNAL DOCUMENT
        Version: 1.0
        Date: January 15, 2024
        
        STRATEGIC PLANNING
        This document contains confidential information regarding
        our strategic planning initiatives for Q1 2024.
        
        Key Initiatives:
        1. Market expansion
        2. Product development
        3. Partnership opportunities
        
        Financial Projections:
        Revenue: $2.5M
        Expenses: $1.8M
        Net Profit: $700K
        
        For internal use only.
      `);

      // Mock other services
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
        amount: '$700K',
        amountConfidence: 0.85,
        title: 'Strategic Planning Document',
        titleConfidence: 0.88,
        snippets: ['STRATEGIC PLANNING', 'confidential information', 'Q1 2024'],
        source: 'AI',
        overallConfidence: 0.88
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        watermarkedDocumentText,
        '/examples/watermarked-strategy.pdf'
      );

      // Verify watermark detection
      expect(result.success).toBe(true);
      expect(result.watermarks).toHaveLength(2);
      expect(result.watermarks[0].type).toBe('draft');
      expect(result.watermarks[0].text).toBe('DRAFT - CONFIDENTIAL');
      expect(result.watermarks[1].type).toBe('copyright');
      expect(result.watermarks[1].text).toBe('Copyright 2024 Company Inc.');
      
      // Verify watermark filtering
      expect(result.filteredText).not.toContain('DRAFT - CONFIDENTIAL');
      expect(result.filteredText).not.toContain('Copyright 2024 Company Inc.');
      expect(result.filteredText).toContain('STRATEGIC PLANNING');
      expect(result.filteredText).toContain('Key Initiatives');
      
      // Verify other metadata
      expect(result.type).toBe('Strategic Document');
      expect(result.date).toBe('2024-01-15');
      expect(result.amount).toBe('$700K');
    });

    test('should handle documents without watermarks', async () => {
      const cleanDocumentText = `
        BUSINESS PROPOSAL
        Date: January 15, 2024
        Client: Acme Corporation
        
        EXECUTIVE SUMMARY
        This proposal outlines our services for your business needs.
        
        SERVICES OFFERED
        1. Consulting services
        2. Implementation support
        3. Ongoing maintenance
        
        PRICING
        Base package: $5,000
        Additional services: $200/hour
        Total estimated cost: $8,000
        
        NEXT STEPS
        Please review this proposal and contact us with any questions.
      `;

      // Mock watermark detection (no watermarks)
      mockServices.watermarkService.detectWatermarks.mockResolvedValue({
        success: true,
        watermarks: []
      });

      // Mock other services
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
        docType: 'Business Proposal',
        docTypeConfidence: 0.9,
        amount: '$8,000',
        amountConfidence: 0.85,
        title: 'Business Proposal',
        titleConfidence: 0.85,
        snippets: ['BUSINESS PROPOSAL', 'Acme Corporation', 'services'],
        source: 'AI',
        overallConfidence: 0.9
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        cleanDocumentText,
        '/examples/clean-proposal.pdf'
      );

      // Verify no watermarks
      expect(result.success).toBe(true);
      expect(result.watermarks).toHaveLength(0);
      expect(result.filteredText).toBe(cleanDocumentText);
      
      // Verify other metadata
      expect(result.clientName).toBe('Acme Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Business Proposal');
      expect(result.amount).toBe('$8,000');
    });
  });

  describe('OCR Fallback Scenarios', () => {
    test('should use OCR for image-based PDFs', async () => {
      const imageBasedText = `
        INVOICE
        Invoice #: INV-2024-001
        Date: January 15, 2024
        Bill To: Microsoft Corporation
        Address: One Microsoft Way, Redmond, WA 98052
        
        Description                    Quantity    Unit Price    Total
        Software License               1           $2,500.00     $2,500.00
        Technical Support (12 months) 1           $1,200.00     $1,200.00
        Implementation Services        40 hours    $150.00       $6,000.00
        
        Subtotal: $9,700.00
        Tax (8.25%): $800.25
        Total: $10,500.25
        
        Payment Terms: Net 30
        Thank you for your business!
      `;

      // Mock PDF parsing to return empty text (simulating image-based PDF)
      pdfParse.mockResolvedValue({
        text: '',
        numpages: 1
      });

      // Mock OCR service
      mockServices.ocrService.extractText.mockResolvedValue({
        success: true,
        text: imageBasedText,
        confidence: 0.85,
        method: 'tesseract',
        processingTime: 2000
      });

      // Mock other services
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
            rows: 4,
            columns: 4,
            confidence: 0.9,
            method: 'pdfplumber',
            data: [
              ['Description', 'Quantity', 'Unit Price', 'Total'],
              ['Software License', '1', '$2,500.00', '$2,500.00'],
              ['Technical Support (12 months)', '1', '$1,200.00', '$1,200.00'],
              ['Implementation Services', '40 hours', '$150.00', '$6,000.00']
            ]
          }
        ],
        confidence: 0.9,
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
        clientName: 'Microsoft Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.98,
        docType: 'Invoice',
        docTypeConfidence: 0.97,
        amount: '$10,500.25',
        amountConfidence: 0.96,
        title: 'Invoice #INV-2024-001',
        titleConfidence: 0.94,
        snippets: ['INVOICE', 'Microsoft Corporation', 'Invoice #: INV-2024-001'],
        source: 'AI',
        overallConfidence: 0.95
      });

      const result = await parsingService.analyzeDocumentEnhanced(
        imageBasedText,
        '/examples/image-invoice.pdf'
      );

      // Verify OCR was used
      expect(result.success).toBe(true);
      expect(result.rawText).toBe(imageBasedText);
      expect(result.ocrUsed).toBe(true);
      expect(result.ocrConfidence).toBe(0.85);
      
      // Verify table extraction
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rows).toBe(4);
      expect(result.tables[0].columns).toBe(4);
      expect(result.tableConfidence).toBe(0.9);
      
      // Verify other metadata
      expect(result.clientName).toBe('Microsoft Corporation');
      expect(result.date).toBe('2024-01-15');
      expect(result.type).toBe('Invoice');
      expect(result.amount).toBe('$10,500.25');
    });

    test('should handle OCR failure gracefully', async () => {
      // Mock PDF parsing to return empty text
      pdfParse.mockResolvedValue({
        text: '',
        numpages: 1
      });

      // Mock OCR service failure
      mockServices.ocrService.extractText.mockResolvedValue({
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
});
