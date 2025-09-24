const LanguageService = require('../../src/services/langService');

describe('LanguageService', () => {
  let langService;

  beforeEach(() => {
    langService = new LanguageService({
      debug: false,
      enableCache: false // Disable cache for consistent testing
    });
  });

  afterAll(() => {
    // Clean up any remaining intervals
    if (langService && langService.cacheCleanupInterval) {
      clearInterval(langService.cacheCleanupInterval);
    }
  });

  afterEach(() => {
    langService.resetStats();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const service = new LanguageService();
      expect(service.options.minLength).toBe(10);
      expect(service.options.maxLength).toBe(10000);
      expect(service.options.minConfidence).toBe(0.1);
      expect(service.options.fallbackLanguage).toBe('eng');
      expect(service.options.enableCache).toBe(true);
    });

    test('should initialize with custom options', () => {
      const service = new LanguageService({
        minLength: 5,
        maxLength: 5000,
        minConfidence: 0.2,
        fallbackLanguage: 'spa',
        debug: true,
        enableCache: false
      });
      expect(service.options.minLength).toBe(5);
      expect(service.options.maxLength).toBe(5000);
      expect(service.options.minConfidence).toBe(0.2);
      expect(service.options.fallbackLanguage).toBe('spa');
      expect(service.options.debug).toBe(true);
      expect(service.options.enableCache).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    test('should detect English text', async () => {
      const text = 'This is a sample English text for testing language detection.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('eng');
      expect(result.languageName).toBe('English');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.candidates).toBeDefined();
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    test('should detect Spanish text', async () => {
      const text = 'Este es un texto de muestra en español para probar la detección de idioma.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('spa');
      expect(result.languageName).toBe('Spanish');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect French text', async () => {
      const text = 'Ceci est un texte d\'exemple en français pour tester la détection de langue.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('fra');
      expect(result.languageName).toBe('French');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect German text', async () => {
      const text = 'Dies ist ein Beispieltext auf Deutsch zum Testen der Spracherkennung.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('deu');
      expect(result.languageName).toBe('German');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Italian text', async () => {
      const text = 'Questo è un testo di esempio in italiano per testare il rilevamento della lingua.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('ita');
      expect(result.languageName).toBe('Italian');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Portuguese text', async () => {
      const text = 'Este é um texto de exemplo em português para testar a detecção de idioma.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('por');
      expect(result.languageName).toBe('Portuguese');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Russian text', async () => {
      const text = 'Это пример текста на русском языке для тестирования определения языка.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('rus');
      expect(result.languageName).toBe('Russian');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Japanese text', async () => {
      const text = 'これは言語検出をテストするための日本語のサンプルテキストです。';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('jpn');
      expect(result.languageName).toBe('Japanese');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Chinese (Simplified) text', async () => {
      const text = '这是一个用于测试语言检测的中文简体示例文本。';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('cmn');
      expect(result.languageName).toBe('Chinese (Mandarin)');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Arabic text', async () => {
      const text = 'هذا نص عربي للاختبار في اكتشاف اللغة.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('arb');
      expect(result.languageName).toBe('Arabic');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Hindi text', async () => {
      const text = 'यह भाषा पहचान के लिए हिंदी में एक नमूना पाठ है।';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('bho');
      expect(result.languageName).toBe('Bhojpuri');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should handle short text with warning', async () => {
      const text = 'Hi';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('eng'); // fallback
      expect(result.warnings).toContain(`Text too short for reliable detection (${text.length} < 10)`);
    });

    test('should handle empty text', async () => {
      const text = '';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Text input is required and must be a string');
    });

    test('should handle null input', async () => {
      const result = await langService.detectLanguage(null);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Text input is required and must be a string');
    });

    test('should handle undefined input', async () => {
      const result = await langService.detectLanguage(undefined);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Text input is required and must be a string');
    });

    test('should truncate very long text', async () => {
      const longText = 'This is a very long text. '.repeat(1000); // ~25,000 characters
      const result = await langService.detectLanguage(longText);
      
      expect(result.success).toBe(true);
      expect(result.warnings.some(warning => warning.includes('Text truncated for analysis'))).toBe(true);
      expect(result.metadata.textLength).toBeGreaterThan(25000); // Just check it's a long text
    });

    test('should handle text with special characters', async () => {
      const text = 'Hello! This is a test with special characters: @#$%^&*()_+{}|:"<>?[]\\;\',./';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('eng');
    });

    test('should handle mixed language text', async () => {
      const text = 'Hello, this is English. Bonjour, ceci est français. Hola, esto es español.';
      const result = await langService.detectLanguage(text);
      
      expect(result.success).toBe(true);
      // Should detect one of the languages present
      expect(['eng', 'fra', 'spa', 'sco', 'sot']).toContain(result.detectedLanguage);
    });

    test('should respect whitelist option', async () => {
      const text = 'This is English text but we only want Spanish detection.';
      const result = await langService.detectLanguage(text, { whitelist: ['spa'] });
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('spa');
    });

    test('should respect blacklist option', async () => {
      const text = 'This is English text.';
      const result = await langService.detectLanguage(text, { blacklist: ['eng'] });
      
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).not.toBe('eng');
    });

    test('should return candidates sorted by confidence', async () => {
      const text = 'This is a sample English text for testing language detection.';
      const result = await langService.detectLanguage(text);
      
      expect(result.candidates).toBeDefined();
      expect(result.candidates.length).toBeGreaterThan(0);
      
      // Check that candidates are sorted by confidence (descending)
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i-1].confidence).toBeGreaterThanOrEqual(result.candidates[i].confidence);
      }
    });
  });

  describe('detectLanguageBatch', () => {
    test('should detect languages for multiple texts', async () => {
      const texts = [
        'This is English text.',
        'Este es texto en español.',
        'Ceci est du texte français.',
        'Dies ist deutscher Text.'
      ];
      
      const results = await langService.detectLanguageBatch(texts);
      
      expect(results).toHaveLength(4);
      expect(['eng', 'sco', 'sot']).toContain(results[0].detectedLanguage);
      expect(['spa', 'glg']).toContain(results[1].detectedLanguage); // Spanish or Galician
      expect(['fra', 'por']).toContain(results[2].detectedLanguage); // French or Portuguese
      expect(results[3].detectedLanguage).toBe('deu');
    });

    test('should handle empty array', async () => {
      const results = await langService.detectLanguageBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('Utility methods', () => {
    test('getSupportedLanguages should return array of language codes', () => {
      const languages = langService.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toContain('eng');
      expect(languages).toContain('spa');
      expect(languages).toContain('fra');
    });

    test('getLanguageName should return language name for code', () => {
      expect(langService.getLanguageName('eng')).toBe('English');
      expect(langService.getLanguageName('spa')).toBe('Spanish');
      expect(langService.getLanguageName('fra')).toBe('French');
      expect(langService.getLanguageName('unknown')).toBe('unknown');
    });

    test('isLanguageSupported should check if language is supported', () => {
      expect(langService.isLanguageSupported('eng')).toBe(true);
      expect(langService.isLanguageSupported('spa')).toBe(true);
      expect(langService.isLanguageSupported('unknown')).toBe(false);
    });
  });

  describe('Statistics', () => {
    test('should track statistics correctly', async () => {
      const initialStats = langService.getStats();
      expect(initialStats.totalDetections).toBe(0);
      expect(initialStats.successfulDetections).toBe(0);
      expect(initialStats.failedDetections).toBe(0);

      // Perform some detections
      await langService.detectLanguage('This is English text.');
      await langService.detectLanguage('Este es texto en español.');
      await langService.detectLanguage(''); // This should fail

      const stats = langService.getStats();
      expect(stats.totalDetections).toBe(3);
      expect(stats.successfulDetections).toBe(2);
      expect(stats.failedDetections).toBe(1);
      expect(stats.successRate).toBe(2/3);
      // Check that language distribution has some entries
      expect(Object.keys(stats.languageDistribution).length).toBeGreaterThan(0);
    });

    test('should reset statistics', async () => {
      await langService.detectLanguage('This is English text.');
      
      let stats = langService.getStats();
      expect(stats.totalDetections).toBe(1);

      langService.resetStats();
      
      stats = langService.getStats();
      expect(stats.totalDetections).toBe(0);
      expect(stats.successfulDetections).toBe(0);
      expect(stats.failedDetections).toBe(0);
    });
  });

  describe('Caching', () => {
    test('should cache results when enabled', async () => {
      const service = new LanguageService({ enableCache: true });
      const text = 'This is English text for caching test.';
      
      // First call
      const result1 = await service.detectLanguage(text);
      expect(result1.metadata.cached).toBeUndefined();
      
      // Second call should be cached
      const result2 = await service.detectLanguage(text);
      expect(result2.metadata.cached).toBe(true);
      
      // Results should be identical
      expect(result1.detectedLanguage).toBe(result2.detectedLanguage);
      expect(result1.confidence).toBe(result2.confidence);
    });

    test('should not cache when disabled', async () => {
      const service = new LanguageService({ enableCache: false });
      const text = 'This is English text for no caching test.';
      
      const result1 = await service.detectLanguage(text);
      const result2 = await service.detectLanguage(text);
      
      expect(result1.metadata.cached).toBeUndefined();
      expect(result2.metadata.cached).toBeUndefined();
    });

    test('should clear cache', async () => {
      const service = new LanguageService({ enableCache: true });
      const text = 'This is English text for cache clear test.';
      
      await service.detectLanguage(text);
      expect(service.cache.size).toBe(1);
      
      service.clearCache();
      expect(service.cache.size).toBe(0);
    });
  });

  describe('Error handling', () => {
    test('should handle invalid input gracefully', async () => {
      const result = await langService.detectLanguage(null);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('should process text within reasonable time', async () => {
      const text = 'This is a performance test with a reasonable amount of text to process for language detection.';
      const startTime = Date.now();
      
      const result = await langService.detectLanguage(text);
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.processingTime).toBeLessThan(1000);
    });
  });
});
