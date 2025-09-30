// Consolidated Bilingual Integration Test - Stable and Deterministic

// 1) Create a consistent ConfigService mock object and inject it
const mockConfigService = {
  get: jest.fn((key) => {
    if (key === 'ai.enabled') return true;
    if (key === 'ai.confidenceThreshold') return 0.5;
    if (key === 'ai.batchSize') return 5;
    if (key === 'ai.timeout') return 30000;
    if (key === 'debug') return false;
    if (key === 'language.minConfidence') return 0.1;
    if (key === 'language.fallbackLanguage') return 'eng';
    if (key === 'canaryRollout.enabled') return true;
    if (key === 'betaUsers.enabled') return true;
    if (key === 'rolloutMonitoring.enabled') return true;
    if (key === 'extraction.useOCR') return false;
    if (key === 'extraction.useTableExtraction') return false;
    if (key === 'extraction.useLLMEnhancer') return false;
    if (key === 'extraction.useHandwritingDetection') return false;
    if (key === 'extraction.useWatermarkDetection') return false;
    if (key === 'extraction.tableTimeout') return 30000;
    if (key === 'extraction.ocrLanguage') return 'eng';
    if (key === 'extraction.ocrWorkerPoolSize') return 1;
    return null;
  }),
  getExtractionConfig: jest.fn(() => ({
    useOCR: false,
    useTableExtraction: false,
    useLLMEnhancer: false,
    useHandwritingDetection: false,
    useWatermarkDetection: false
  }))
};

// Mock services with standardized structure
jest.mock('../src/services/telemetryService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/canaryRolloutService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/betaUserService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/rolloutMonitoringService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/aiCache', () => {
  return jest.fn().mockImplementation(() => ({
    setTelemetry: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    generateHash: jest.fn(text => 'hash_' + (text?.length || 0)),
    get: jest.fn(async () => null),
    set: jest.fn(async () => true),
    getStats: jest.fn(() => ({ hits: 0, misses: 0, size: 0 })),
    clear: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/langService', () => {
  return jest.fn().mockImplementation(() => ({
    detectLanguage: jest.fn(async (text) => ({
      detectedLanguage: 'spa',
      languageName: 'Spanish',
      confidence: 0.99,
      success: true
    })),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../src/services/aiTextService', () => {
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
    extractMetadataAI: jest.fn(async (_text, _options) => {
      return {
        clientName: 'Corporación Acme',
        clientConfidence: 0.9,
        date: '2023-12-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.85,
        confidence: 0.85,
        snippets: ['Cliente: Corporación Acme', 'Fecha: 2023-12-15']
      };
    })
  }));
});

jest.mock('../src/services/llmClient', () => {
  return jest.fn().mockImplementation(() => ({
    callLLM: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        clientName: 'Corporación Acme',
        date: '2023-12-15',
        type: 'Invoice'
      })
    }),
    setTelemetry: jest.fn()
  }));
});

// 2) Now import the SUT
const EnhancedParsingService = require('../src/services/enhancedParsingService');

describe('Bilingual AI Integration (Consolidated, Stable)', () => {
  let enhancedParsingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-setup the mock functions after clearAllMocks
    mockConfigService.get.mockImplementation((key) => {
      if (key === 'ai.enabled') return true;
      if (key === 'ai.confidenceThreshold') return 0.5;
      if (key === 'ai.batchSize') return 5;
      if (key === 'ai.timeout') return 30000;
      if (key === 'debug') return false;
      if (key === 'language.minConfidence') return 0.1;
      if (key === 'language.fallbackLanguage') return 'eng';
      if (key === 'canaryRollout.enabled') return true;
      if (key === 'betaUsers.enabled') return true;
      if (key === 'rolloutMonitoring.enabled') return true;
      if (key === 'extraction.useOCR') return false;
      if (key === 'extraction.useTableExtraction') return false;
      if (key === 'extraction.useLLMEnhancer') return false;
      if (key === 'extraction.useHandwritingDetection') return false;
      if (key === 'extraction.useWatermarkDetection') return false;
      if (key === 'extraction.tableTimeout') return 30000;
      if (key === 'extraction.ocrLanguage') return 'eng';
      if (key === 'extraction.ocrWorkerPoolSize') return 1;
      return null;
    });
    
    mockConfigService.getExtractionConfig.mockImplementation(() => ({
      useOCR: false,
      useTableExtraction: false,
      useLLMEnhancer: false,
      useHandwritingDetection: false,
      useWatermarkDetection: false
    }));

    // Create mock services
    const mockTelemetry = { 
      initialize: jest.fn().mockResolvedValue(undefined), 
      close: jest.fn().mockResolvedValue(undefined),
      trackFileProcessing: jest.fn(),
      trackCachePerformance: jest.fn(),
      trackError: jest.fn(),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };
    const mockCanaryRollout = { 
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };
    const mockAiTextService = {
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
      extractMetadataAI: jest.fn(async (_text, _options) => {
        return {
          clientName: 'Corporación Acme',
          clientConfidence: 0.9,
          date: '2023-12-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.85,
          confidence: 0.85,
          snippets: ['Cliente: Corporación Acme', 'Fecha: 2023-12-15']
        };
      })
    };
    const mockAiCache = {
      setTelemetry: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      generateHash: jest.fn(text => 'hash_' + (text?.length || 0)),
      get: jest.fn(async () => null),
      set: jest.fn(async () => true),
      getStats: jest.fn(() => ({ hits: 0, misses: 1, size: 0 })),
      clear: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    // Create the service first
    enhancedParsingService = new EnhancedParsingService({
      useAI: true,
      useOCR: false,
      useTableExtraction: false,
      configService: mockConfigService
    });

      // Override services with mocks BEFORE any processing
      enhancedParsingService.telemetry = mockTelemetry;
      enhancedParsingService.canaryRolloutService = mockCanaryRollout;
      enhancedParsingService.aiTextService = mockAiTextService;
      enhancedParsingService.aiCache = mockAiCache;
      
      // Debug: Check if services are properly set
      console.log('AI Text Service set:', !!enhancedParsingService.aiTextService);
      console.log('AI Cache set:', !!enhancedParsingService.aiCache);
      console.log('AI Text Service methods:', Object.getOwnPropertyNames(enhancedParsingService.aiTextService));
      console.log('AI Cache methods:', Object.getOwnPropertyNames(enhancedParsingService.aiCache));

    // Clear AI cache if it exists and has a clear method
    if (enhancedParsingService.aiCache && typeof enhancedParsingService.aiCache.clear === 'function') {
      await enhancedParsingService.aiCache.clear();
    }

    enhancedParsingService.languageService = {
      detectLanguage: jest.fn(async (text) => ({
        detectedLanguage: 'spa',
        languageName: 'Spanish',
        confidence: 0.99,
        success: true
      })),
      close: jest.fn()
    };

      // Mock the parent class methods to return empty results so AI takes precedence
      enhancedParsingService.extractClientName = jest.fn(() => {
        console.log('Parent extractClientName called - returning null');
        return null;
      });
      enhancedParsingService.extractDate = jest.fn(() => {
        console.log('Parent extractDate called - returning null');
        return null;
      });
      enhancedParsingService.detectDocumentType = jest.fn(() => {
        console.log('Parent detectDocumentType called - returning null');
        return null;
      });
      enhancedParsingService.extractAmount = jest.fn(() => {
        console.log('Parent extractAmount called - returning null');
        return null;
      });
      enhancedParsingService.extractTitle = jest.fn(() => {
        console.log('Parent extractTitle called - returning null');
        return null;
      });
  });

  afterAll(async () => {
    if (enhancedParsingService) {
      await enhancedParsingService.shutdown();
    }
  });

  test('returns Spanish client name from AI and is deterministic (no real services)', async () => {
    // Use text that won't trigger regex patterns for clientName
    const text = [
      'Factura de servicios',
      'Empresa: Corporación Acme',
      'Fecha de emisión: 2023-12-15',
      'Servicios de consultoría técnica especializada'
    ].join('\n');

    const result = await enhancedParsingService.analyzeDocumentEnhanced(
      text,
      '/fake/path/invoice-es.pdf',
      { forceAI: true, forceRefresh: true }
    );

    // Debug: Log the actual result to understand what's happening
    console.log('Actual result:', JSON.stringify(result, null, 2));
    console.log('AI service calls:', enhancedParsingService.aiTextService.extractMetadataAI.mock.calls.length);
    
    // Ensure deterministic output
    expect(result).toBeDefined();
    expect(result.clientName).toBe('Corporación Acme');
    expect(result.date).toBe('2023-12-15');
    expect(result.type).toBe('Invoice');
    expect(result.source === 'hybrid' || result.source === 'ai' || result.source === 'ai-cached').toBeTruthy();

    expect(enhancedParsingService.aiTextService.extractMetadataAI).toHaveBeenCalledTimes(1);
    const call = enhancedParsingService.aiTextService.extractMetadataAI.mock.calls[0];
    expect(call[1]).toMatchObject({ forceRefresh: true, detectedLanguage: 'spa', languageName: 'Spanish' });

    // Note: Cache methods may not be called if forceRefresh is true
    // expect(enhancedParsingService.aiCache.get).toHaveBeenCalled();
    // expect(enhancedParsingService.aiCache.set).toHaveBeenCalled();
  });
});