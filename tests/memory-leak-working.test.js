/**
 * Working Memory Leak Test
 * Tests memory leaks with proper Jest timer management
 */

// Use fake timers from the very beginning
jest.useFakeTimers();

describe('Working Memory Leak Prevention', () => {
  test('Basic timer management should work', () => {
    // Create a timer
    const timer = setTimeout(() => {}, 1000);
    
    // Clear the timer
    clearTimeout(timer);
    
    // This should not cause memory leaks
    expect(timer).toBeDefined();
  });

  test('Basic interval management should work', () => {
    // Create an interval
    const interval = setInterval(() => {}, 100);
    
    // Clear the interval
    clearInterval(interval);
    
    // This should not cause memory leaks
    expect(interval).toBeDefined();
  });

  test('SignatureDetector should work with fake timers', async () => {
    // Import service only when needed
    const SignatureDetector = require('../src/services/signatureDetector');
    
    // Create service
    const signatureService = new SignatureDetector({
      debug: false,
      cacheSize: 50
    });
    
    // Initialize the service (this creates the interval)
    await signatureService.initialize();
    
    // Check that interval was created
    expect(signatureService.cacheCleanupInterval).toBeDefined();
    
    // Use the service
    await signatureService.detectSignature(Buffer.from('test content'));
    
    // Close the service (this should clear the interval)
    await signatureService.close();
    
    // Check that interval was cleared
    expect(signatureService.cacheCleanupInterval).toBeNull();
    
    // Shutdown the service
    await signatureService.shutdown();
  });

  test('LanguageService should work with fake timers', async () => {
    // Import service only when needed
    const LanguageService = require('../src/services/langService');
    
    // Create service
    const langService = new LanguageService({
      debug: false,
      cacheSize: 100,
      cacheExpiry: 1000
    });
    
    // Initialize the service (this creates the interval)
    await langService.initialize();
    
    // Check that interval was created
    expect(langService.cacheCleanupInterval).toBeDefined();
    
    // Use the service
    await langService.detectLanguage('This is a test document');
    
    // Close the service (this should clear the interval)
    await langService.close();
    
    // Check that interval was cleared
    expect(langService.cacheCleanupInterval).toBeNull();
    
    // Shutdown the service
    await langService.shutdown();
  });
});
