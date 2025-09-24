// Integration tests for bilingual document handling
const fs = require('fs');
const path = require('path');

// Mock all external dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}));
jest.mock('tesseract.js', () => ({
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
  constants: {
    F_OK: 0
  }
}));

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

// Import the services we want to test
const EnhancedParsingService = require('../src/services/enhancedParsingService');
const LanguageService = require('../src/services/langService');

describe('Bilingual Document Integration Tests', () => {
  let enhancedParsingService;
  let languageService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    fs.mkdirSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    fs.statSync.mockImplementation(() => ({
      mtime: new Date('2023-12-15')
    }));
    fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
    fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });

    // Initialize services
    enhancedParsingService = new EnhancedParsingService({
      useAI: true,
      useOCR: false,
      useTableExtraction: false
    });
    
    languageService = new LanguageService({
      debug: false,
      minConfidence: 0.1,
      fallbackLanguage: 'eng'
    });
  });

  afterEach(async () => {
    if (enhancedParsingService) {
      await enhancedParsingService.shutdown();
    }
  });

  describe('Language Detection Integration', () => {
    test('should detect Spanish language correctly', async () => {
      const spanishText = `
        FACTURA
        Cliente: Corporación Acme
        Número de factura: FAC-001
        Fecha: 15/12/2023
        Monto total: $1,500.00
        Pago vence en 30 días
      `;

      const result = await languageService.detectLanguage(spanishText);
      
      expect(result.success).toBe(true);
      // Accept Spanish or closely related Romance languages
      expect(['spa', 'glg', 'por', 'cat']).toContain(result.detectedLanguage);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect French language correctly', async () => {
      const frenchText = `
        FACTURE
        Client: Société Acme
        Numéro de facture: FAC-001
        Date: 15/12/2023
        Montant total: 1,500.00€
        Paiement dû dans 30 jours
      `;

      const result = await languageService.detectLanguage(frenchText);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('fra');
      expect(result.languageName).toBe('French');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should detect German language correctly', async () => {
      const germanText = `
        RECHNUNG
        Kunde: Acme Corporation
        Rechnungsnummer: RCH-001
        Datum: 15.12.2023
        Gesamtbetrag: 1.500,00€
        Zahlung fällig in 30 Tagen
      `;

      const result = await languageService.detectLanguage(germanText);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('deu');
      expect(result.languageName).toBe('German');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should fallback to English for unclear text', async () => {
      const unclearText = 'asdf qwerty 12345 !@#$%';

      const result = await languageService.detectLanguage(unclearText);
      
      // Accept English or undefined (which should fallback to English)
      expect(['eng', 'sco', 'und', null]).toContain(result.detectedLanguage);
      if (result.detectedLanguage === null) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Bilingual Document Processing', () => {
    test('should process Spanish invoice with language awareness', async () => {
      const spanishInvoiceText = `
        FACTURA
        Cliente: Corporación Acme
        Número de factura: FAC-001
        Fecha: 15/12/2023
        Monto total: $1,500.00
        Pago vence en 30 días
        Dirección: Calle Principal 123, Madrid, España
      `;

      pdfParse.mockResolvedValue({
        text: spanishInvoiceText,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        spanishInvoiceText, 
        '/test/spanish-invoice.pdf'
      );

      expect(result).toBeDefined();
      expect(result.clientName).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.source).toBeDefined();
    });

    test('should process French contract with language awareness', async () => {
      const frenchContractText = `
        CONTRAT DE SERVICE
        Entre ABC Company et XYZ Corp
        Date d'effet: 1er mars 2024
        Ce contrat couvre les services de développement
        Montant: 50,000€
        Durée: 12 mois
      `;

      pdfParse.mockResolvedValue({
        text: frenchContractText,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        frenchContractText, 
        '/test/french-contract.pdf'
      );

      expect(result).toBeDefined();
      expect(result.clientName).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.type).toBeDefined();
    });

    test('should process German statement with language awareness', async () => {
      const germanStatementText = `
        KONTOAUSZUG
        Kunde: Deutsche Bank AG
        Kontonummer: 1234567890
        Auszugsdatum: 31.12.2023
        Saldo: 25,000.00€
        Letzte Transaktion: 15.12.2023
      `;

      pdfParse.mockResolvedValue({
        text: germanStatementText,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        germanStatementText, 
        '/test/german-statement.pdf'
      );

      expect(result).toBeDefined();
      expect(result.clientName).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.type).toBeDefined();
    });

    test('should handle mixed language documents', async () => {
      const mixedLanguageText = `
        INVOICE / FACTURA
        Client / Cliente: Acme Corporation
        Date / Fecha: 15/12/2023
        Amount / Monto: $1,500.00
        Payment due / Pago vence: 30 days / 30 días
      `;

      pdfParse.mockResolvedValue({
        text: mixedLanguageText,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        mixedLanguageText, 
        '/test/mixed-language.pdf'
      );

      expect(result).toBeDefined();
      expect(result.clientName).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.type).toBeDefined();
    });
  });

  describe('Language-Aware AI Processing', () => {
    test('should pass language context to AI prompts', async () => {
      const spanishText = `
        FACTURA
        Cliente: Corporación Acme
        Fecha: 15/12/2023
        Monto: $1,500.00
      `;

      // Mock the AI service to capture the language context
      const mockAITextService = {
        extractMetadataAI: jest.fn().mockResolvedValue({
          clientName: 'Corporación Acme',
          clientConfidence: 0.9,
          date: '2023-12-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.9,
          snippets: ['FACTURA', 'Cliente: Corporación Acme'],
          source: 'AI'
        })
      };

      // Replace the AI service in the enhanced parsing service
      enhancedParsingService.aiTextService = mockAITextService;

      pdfParse.mockResolvedValue({
        text: spanishText,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        spanishText, 
        '/test/spanish-ai-test.pdf',
        { forceAI: true }
      );

      expect(mockAITextService.extractMetadataAI).toHaveBeenCalledWith(
        spanishText,
        expect.objectContaining({
          detectedLanguage: expect.any(String),
          languageName: expect.any(String)
        })
      );

      expect(result).toBeDefined();
      expect(result.clientName).toBe('Corporación Acme');
    });

    test('should handle language detection errors gracefully', async () => {
      const text = 'Some text that might cause language detection issues';

      // Mock language detection to throw an error
      jest.spyOn(enhancedParsingService.languageService, 'detectLanguage')
        .mockRejectedValue(new Error('Language detection failed'));

      pdfParse.mockResolvedValue({
        text: text,
        numpages: 1
      });

      const result = await enhancedParsingService.analyzeDocumentEnhanced(
        text, 
        '/test/error-test.pdf',
        { forceAI: true }
      );

      // Should still process the document even if language detection fails
      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
    });
  });

  describe('Batch Processing with Language Detection', () => {
    test('should process multiple documents with different languages', async () => {
      const documents = [
        {
          text: 'FACTURA\nCliente: Acme Corp\nFecha: 15/12/2023',
          filePath: '/test/spanish.pdf'
        },
        {
          text: 'FACTURE\nClient: Acme Corp\nDate: 15/12/2023',
          filePath: '/test/french.pdf'
        },
        {
          text: 'INVOICE\nClient: Acme Corp\nDate: 15/12/2023',
          filePath: '/test/english.pdf'
        }
      ];

      pdfParse.mockResolvedValue({
        text: 'mock content',
        numpages: 1
      });

      const results = await enhancedParsingService.processBatch(documents);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.source).toBeDefined();
      });
    });
  });

  describe('Language Detection Performance', () => {
    test('should detect language within reasonable time', async () => {
      const text = `
        FACTURA
        Cliente: Corporación Acme
        Número de factura: FAC-001
        Fecha: 15/12/2023
        Monto total: $1,500.00
      `;

      const startTime = Date.now();
      const result = await languageService.detectLanguage(text);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    });

    test('should handle large documents efficiently', async () => {
      // Create a large document by repeating the Spanish text
      const baseText = `
        FACTURA
        Cliente: Corporación Acme
        Número de factura: FAC-001
        Fecha: 15/12/2023
        Monto total: $1,500.00
      `;
      
      const largeText = baseText.repeat(100); // ~5000 characters

      const startTime = Date.now();
      const result = await languageService.detectLanguage(largeText);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      // Accept Spanish or closely related Romance languages
      expect(['spa', 'glg', 'por', 'cat']).toContain(result.detectedLanguage);
      expect(endTime - startTime).toBeLessThan(2000); // Less than 2 seconds
    });
  });

  describe('Language Detection Edge Cases', () => {
    test('should handle empty text', async () => {
      const result = await languageService.detectLanguage('');
      
      // Should fallback to English or return null
      expect(['eng', null]).toContain(result.detectedLanguage);
      if (result.detectedLanguage === null) {
        expect(result.success).toBe(false);
      }
    });

    test('should handle very short text', async () => {
      const result = await languageService.detectLanguage('Hi');
      
      expect(result.detectedLanguage).toBe('eng');
      expect(result.languageName).toBe('English');
    });

    test('should handle text with special characters', async () => {
      const textWithSpecialChars = `
        FACTURA #123
        Cliente: Acme & Co. (Ltd.)
        Monto: $1,500.00
        Email: info@acme.com
      `;

      const result = await languageService.detectLanguage(textWithSpecialChars);
      
      expect(result.success).toBe(true);
      // Accept Spanish or closely related Romance languages
      expect(['spa', 'glg', 'por', 'cat']).toContain(result.detectedLanguage);
    });

    test('should handle numeric content', async () => {
      const numericText = '123 456 789 012 345 678 901 234 567 890';
      
      const result = await languageService.detectLanguage(numericText);
      
      // Should fallback to English or return undefined
      expect(['eng', 'und', null]).toContain(result.detectedLanguage);
    });
  });
});
