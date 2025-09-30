/**
 * Lazy Initialization Memory Leak Test
 * Tests that lazy initialization prevents Jest timer detection issues
 */

describe('Lazy Initialization Memory Leak Prevention', () => {
  let SignatureDetector;
  let LanguageService;
  let AICache;
  let TelemetryService;

  beforeAll(() => {
    // Import services only when needed
    SignatureDetector = require('../src/services/signatureDetector');
    LanguageService = require('../src/services/langService');
    AICache = require('../src/services/aiCache');
    TelemetryService = require('../src/services/telemetryService');
  });

  afterAll(async () => {
    // Clean up any services that might have been initialized
    // This is defensive cleanup
  });

  test('Services should not create timers on import', () => {
    // Create service instances - these should NOT create timers
    const signatureService = new SignatureDetector({ debug: false });
    const langService = new LanguageService({ debug: false });
    const aiCache = new AICache({ debug: false });
    const telemetryService = new TelemetryService({ debug: false });

    // Verify no timers are created on construction
    expect(signatureService.cacheCleanupInterval).toBeNull();
    expect(langService.cacheCleanupInterval).toBeNull();
    expect(aiCache.saveIntervalId).toBeNull();
    expect(telemetryService.saveIntervalId).toBeNull();

    // Verify initialization flags are false
    expect(signatureService.initialized).toBe(false);
    expect(langService.initialized).toBe(false);
    expect(aiCache.initialized).toBe(false);
    expect(telemetryService.isInitialized).toBe(false);
  });

  test('Services should create timers only when initialized', async () => {
    const signatureService = new SignatureDetector({ debug: false });
    const langService = new LanguageService({ debug: false });

    // Verify no timers before initialization
    expect(signatureService.cacheCleanupInterval).toBeNull();
    expect(langService.cacheCleanupInterval).toBeNull();

    // Initialize services
    await signatureService.initialize();
    await langService.initialize();

    // Verify timers are created after initialization
    expect(signatureService.cacheCleanupInterval).toBeDefined();
    expect(langService.cacheCleanupInterval).toBeDefined();

    // Clean up
    await signatureService.shutdown();
    await langService.shutdown();

    // Verify timers are cleared after shutdown
    expect(signatureService.cacheCleanupInterval).toBeNull();
    expect(langService.cacheCleanupInterval).toBeNull();
  });

  test('Services should work with lazy initialization', async () => {
    const signatureService = new SignatureDetector({ debug: false });
    const langService = new LanguageService({ debug: false });

    // Use services without explicit initialization - should trigger lazy init
    await signatureService.detectSignatures('This is a test document');
    await langService.detectLanguage('This is a test document');

    // Verify services were initialized
    expect(signatureService.initialized).toBe(true);
    expect(langService.initialized).toBe(true);

    // Verify timers were created
    expect(signatureService.cacheCleanupInterval).toBeDefined();
    expect(langService.cacheCleanupInterval).toBeDefined();

    // Clean up
    await signatureService.shutdown();
    await langService.shutdown();
  });
});
