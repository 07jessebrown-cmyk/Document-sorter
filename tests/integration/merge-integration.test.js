const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const path = require('path');

describe('Enhanced Merge Integration Tests', () => {
  let parsingService;
  let mockLLMClient;
  let mockAICache;

  beforeEach(() => {
    // Mock LLM Client
    mockLLMClient = {
      callLLM: jest.fn(),
      isEnabled: jest.fn(() => true)
    };

    // Mock AI Cache
    mockAICache = {
      get: jest.fn(),
      set: jest.fn(),
      generateHash: jest.fn(() => 'test-hash'),
      getStats: jest.fn(() => ({ hits: 0, misses: 0 }))
    };

    // Initialize parsing service with mocks
    parsingService = new EnhancedParsingService({
      useAI: true,
      useTableExtraction: true,
      useOCR: false,
      useHandwritingDetection: false,
      useWatermarkDetection: false
    });

    // Set up mocks
    parsingService.llmClient = mockLLMClient;
    parsingService.aiCache = mockAICache;
    parsingService.aiTextService = {
      extractMetadataAI: jest.fn()
    };
  });

  afterEach(async () => {
    if (parsingService) {
      await parsingService.shutdown();
    }
  });

  describe('Merge Logic Priority', () => {
    it('should prioritize regex over table and AI when regex has high confidence', async () => {
      const testText = 'Invoice #12345\nBill to: Acme Corp\nDate: 2024-01-15\nAmount: $1,000.00';
      
      // Mock regex result with high confidence
      const regexResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        type: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8,
        confidence: 0.9,
        source: 'regex'
      };

      // Mock table result with lower confidence
      const tableResult = {
        clientName: 'Acme Corporation',
        clientConfidence: 0.7,
        date: '2024-01-15',
        dateConfidence: 0.8,
        type: 'Invoice',
        typeConfidence: 0.75,
        amount: '$1,000.00',
        amountConfidence: 0.8,
        title: 'Invoice #12345',
        titleConfidence: 0.7
      };

      // Mock AI result with lower confidence
      const aiResult = {
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.65,
        amount: '$1,000.00',
        amountConfidence: 0.7,
        title: 'Invoice #12345',
        titleConfidence: 0.6
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, tableResult);

      // Should use regex values due to high confidence
      expect(merged.clientName).toBe('Acme Corp');
      expect(merged.fieldSources.clientName).toBe('regex');
      expect(merged.date).toBe('2024-01-15');
      expect(merged.fieldSources.date).toBe('regex');
      expect(merged.type).toBe('Invoice');
      expect(merged.fieldSources.type).toBe('regex');
    });

    it('should fall back to table when regex has low confidence', async () => {
      const regexResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.2, // Low confidence
        date: '2024-01-15',
        dateConfidence: 0.1, // Low confidence
        type: 'Unclassified',
        docTypeConfidence: 0.1, // Low confidence
        amount: '$1,000.00',
        amountConfidence: 0.2,
        title: 'Invoice #12345',
        titleConfidence: 0.1,
        confidence: 0.2,
        source: 'regex'
      };

      const tableResult = {
        clientName: 'Acme Corporation',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        type: 'Invoice',
        typeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8
      };

      const aiResult = {
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.65,
        amount: '$1,000.00',
        amountConfidence: 0.7,
        title: 'Invoice #12345',
        titleConfidence: 0.6
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, tableResult);

      // Should use table values due to higher confidence
      expect(merged.clientName).toBe('Acme Corporation');
      expect(merged.fieldSources.clientName).toBe('table');
      expect(merged.date).toBe('2024-01-15');
      expect(merged.fieldSources.date).toBe('table');
      expect(merged.type).toBe('Invoice');
      expect(merged.fieldSources.type).toBe('table');
    });

    it('should fall back to AI when regex and table have low confidence', async () => {
      const regexResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.2, // Low confidence
        date: '2024-01-15',
        dateConfidence: 0.1, // Low confidence
        type: 'Unclassified',
        docTypeConfidence: 0.1, // Low confidence
        amount: '$1,000.00',
        amountConfidence: 0.2,
        title: 'Invoice #12345',
        titleConfidence: 0.1,
        confidence: 0.2,
        source: 'regex'
      };

      const tableResult = {
        clientName: 'Acme Corporation',
        clientConfidence: 0.25, // Low confidence
        date: '2024-01-15',
        dateConfidence: 0.2, // Low confidence
        type: 'Invoice',
        typeConfidence: 0.15, // Low confidence
        amount: '$1,000.00',
        amountConfidence: 0.25,
        title: 'Invoice #12345',
        titleConfidence: 0.2
      };

      const aiResult = {
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        type: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, tableResult);

      // Should use AI values due to highest confidence
      expect(merged.clientName).toBe('Acme Corp Inc');
      expect(merged.fieldSources.clientName).toBe('ai');
      expect(merged.date).toBe('2024-01-15');
      expect(merged.fieldSources.date).toBe('ai');
      expect(merged.type).toBe('Invoice');
      expect(merged.fieldSources.type).toBe('ai');
    });
  });

  describe('Weighted Confidence Calculation', () => {
    it('should calculate weighted confidence correctly', async () => {
      const regexResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        type: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8,
        confidence: 0.9,
        source: 'regex'
      };

      const aiResult = {
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.65,
        amount: '$1,000.00',
        amountConfidence: 0.7,
        title: 'Invoice #12345',
        titleConfidence: 0.6
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, null);

      // Check that confidence is calculated correctly
      expect(merged.confidence).toBeGreaterThan(0);
      expect(merged.confidence).toBeLessThanOrEqual(1);
      
      // Check merge metadata
      expect(merged.mergeMetadata).toBeDefined();
      expect(merged.mergeMetadata.methodsUsed).toContain('regex');
      expect(merged.mergeMetadata.confidenceBreakdown).toBeDefined();
      expect(merged.mergeMetadata.sourceBreakdown).toBeDefined();
    });
  });

  describe('Field Source Tracking', () => {
    it('should track which method provided each field', async () => {
      const regexResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.95,
        type: 'Unclassified',
        docTypeConfidence: 0.1, // Low confidence
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8,
        confidence: 0.9,
        source: 'regex'
      };

      const tableResult = {
        clientName: 'Acme Corporation',
        clientConfidence: 0.7,
        date: '2024-01-15',
        dateConfidence: 0.8,
        type: 'Invoice',
        typeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.8,
        title: 'Invoice #12345',
        titleConfidence: 0.7
      };

      const aiResult = {
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.6,
        date: '2024-01-15',
        dateConfidence: 0.7,
        type: 'Invoice',
        docTypeConfidence: 0.65,
        amount: '$1,000.00',
        amountConfidence: 0.7,
        title: 'Invoice #12345',
        titleConfidence: 0.6
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, tableResult);

      // Check field sources
      expect(merged.fieldSources.clientName).toBe('regex'); // High confidence regex
      expect(merged.fieldSources.date).toBe('regex'); // High confidence regex
      expect(merged.fieldSources.type).toBe('table'); // Table has higher confidence than regex
      expect(merged.fieldSources.amount).toBe('regex'); // High confidence regex
      expect(merged.fieldSources.title).toBe('regex'); // High confidence regex

      // Check methods used
      expect(merged.mergeMetadata.methodsUsed).toContain('regex');
      expect(merged.mergeMetadata.methodsUsed).toContain('table');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing values gracefully', async () => {
      const regexResult = {
        clientName: null,
        clientConfidence: 0,
        date: null,
        dateConfidence: 0,
        type: 'Unclassified',
        docTypeConfidence: 0,
        amount: null,
        amountConfidence: 0,
        title: null,
        titleConfidence: 0,
        confidence: 0,
        source: 'regex'
      };

      const aiResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        type: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, null);

      // Should use AI values when regex has no values
      expect(merged.clientName).toBe('Acme Corp');
      expect(merged.date).toBe('2024-01-15');
      expect(merged.type).toBe('Invoice');
      expect(merged.amount).toBe('$1,000.00');
      expect(merged.title).toBe('Invoice #12345');

      // All fields should come from AI
      expect(merged.fieldSources.clientName).toBe('ai');
      expect(merged.fieldSources.date).toBe('ai');
      expect(merged.fieldSources.type).toBe('ai');
      expect(merged.fieldSources.amount).toBe('ai');
      expect(merged.fieldSources.title).toBe('ai');
    });

    it('should handle empty string values', async () => {
      const regexResult = {
        clientName: '',
        clientConfidence: 0,
        date: '',
        dateConfidence: 0,
        type: 'Unclassified',
        docTypeConfidence: 0,
        amount: '',
        amountConfidence: 0,
        title: '',
        titleConfidence: 0,
        confidence: 0,
        source: 'regex'
      };

      const aiResult = {
        clientName: 'Acme Corp',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        type: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8
      };

      const merged = parsingService.mergeResults(regexResult, aiResult, null);

      // Should use AI values when regex has empty strings
      expect(merged.clientName).toBe('Acme Corp');
      expect(merged.date).toBe('2024-01-15');
      expect(merged.type).toBe('Invoice');
      expect(merged.amount).toBe('$1,000.00');
      expect(merged.title).toBe('Invoice #12345');
    });
  });

  describe('Integration with Enhanced Parsing', () => {
    it('should integrate merge logic with full document analysis', async () => {
      const testText = 'Invoice #12345\nBill to: Acme Corp\nDate: 2024-01-15\nAmount: $1,000.00';
      const filePath = '/test/path/document.pdf';

      // Mock AI service response
      mockAICache.get.mockResolvedValue(null);
      parsingService.aiTextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Acme Corp Inc',
        clientConfidence: 0.8,
        date: '2024-01-15',
        dateConfidence: 0.9,
        docType: 'Invoice',
        docTypeConfidence: 0.85,
        amount: '$1,000.00',
        amountConfidence: 0.9,
        title: 'Invoice #12345',
        titleConfidence: 0.8,
        snippets: ['Invoice #12345', 'Bill to: Acme Corp'],
        source: 'AI',
        overallConfidence: 0.85
      });

      // Mock table extraction
      parsingService.tableExtractor = {
        extractTables: jest.fn().mockResolvedValue({
          success: true,
          tables: [{
            data: [['Client', 'Acme Corp'], ['Date', '2024-01-15']],
            confidence: 0.8,
            method: 'pdf-table-extractor'
          }],
          confidence: 0.8,
          method: 'pdf-table-extractor'
        })
      };

      const result = await parsingService.analyzeDocumentEnhanced(testText, filePath, { forceAI: true });

      // Should have merged results
      expect(result.source).toBe('hybrid');
      expect(result.mergeMetadata).toBeDefined();
      expect(result.fieldSources).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
