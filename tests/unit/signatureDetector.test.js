const SignatureDetector = require('../../src/services/signatureDetector');

describe('SignatureDetector', () => {
  let signatureDetector;

  afterAll(async () => {
    // Clear any remaining intervals
    jest.clearAllTimers();
  });

  beforeEach(() => {
    signatureDetector = new SignatureDetector({
      debug: false,
      enableCache: false
    });
  });

  afterEach(async () => {
    if (signatureDetector) {
      await signatureDetector.close();
      signatureDetector = null;
    }
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const detector = new SignatureDetector();
      expect(detector.options.minConfidence).toBe(0.6);
      expect(detector.options.debug).toBe(false);
      expect(detector.options.caseSensitive).toBe(false);
      expect(detector.options.maxTextLength).toBe(50000);
    });

    test('should initialize with custom options', () => {
      const detector = new SignatureDetector({
        minConfidence: 0.8,
        debug: true,
        caseSensitive: true,
        maxTextLength: 10000
      });
      expect(detector.options.minConfidence).toBe(0.8);
      expect(detector.options.debug).toBe(true);
      expect(detector.options.caseSensitive).toBe(true);
      expect(detector.options.maxTextLength).toBe(10000);
    });

    test('should initialize statistics', () => {
      expect(signatureDetector.stats.totalDetections).toBe(0);
      expect(signatureDetector.stats.successfulDetections).toBe(0);
      expect(signatureDetector.stats.failedDetections).toBe(0);
      expect(signatureDetector.stats.averageConfidence).toBe(0);
    });
  });

  describe('detectSignatures', () => {
    test('should detect direct signature indicators', async () => {
      const text = `
        CONTRACT AGREEMENT
        
        This agreement is signed by John Doe on behalf of Acme Corp.
        
        Terms and conditions apply.
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('signature_indicator');
      expect(result.signatures[0].confidence).toBeGreaterThan(0.8);
    });

    test('should detect signature labels', async () => {
      const text = `
        INVOICE #12345
        
        Amount: $1,500.00
        Due Date: 30 days
        
        Signature: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      
      // Check if any signature has the label type
      const hasSignatureLabel = result.signatures.some(sig => sig.type === 'signature_label');
      expect(hasSignatureLabel).toBe(true);
    });

    test('should detect authorized signatures', async () => {
      const text = `
        AUTHORIZATION FORM
        
        This document is authorized by the digital signature of Jane Smith.
        
        Date: 12/15/2023
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      
      // Check if any signature has the authorized type
      const hasAuthorizedSignature = result.signatures.some(sig => sig.type === 'authorized_signature');
      expect(hasAuthorizedSignature).toBe(true);
    });

    test('should detect signature lines', async () => {
      const text = `
        AGREEMENT
        
        Terms: Payment due in 30 days
        
        Sign here: ________________
        
        Date: _______________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('signature_line');
    });

    test('should detect witness signatures', async () => {
      const text = `
        LEGAL DOCUMENT
        
        This document is witnessed by Robert Johnson.
        
        Signature: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('witness_signature');
    });

    test('should detect notarized signatures', async () => {
      const text = `
        AFFIDAVIT
        
        This document is notarized by Mary Wilson, Notary Public.
        
        Notary Seal: _______________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('notarized_signature');
    });

    test('should detect executed signatures', async () => {
      const text = `
        CONTRACT
        
        This contract is executed by both parties on 12/15/2023.
        
        Party A: ________________
        Party B: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('executed_signature');
    });

    test('should detect acknowledged signatures', async () => {
      const text = `
        RECEIPT
        
        This receipt is acknowledged by the recipient.
        
        Acknowledged by: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('acknowledged_signature');
    });

    test('should detect certified signatures', async () => {
      const text = `
        CERTIFICATE
        
        This document is certified by the issuing authority.
        
        Certified by: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('certified_signature');
    });

    test('should detect verified signatures', async () => {
      const text = `
        VERIFICATION FORM
        
        This document is verified by the authorized personnel.
        
        Verified by: ________________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('verified_signature');
    });

    test('should detect signature lines with underscores', async () => {
      const text = `
        FORM
        
        Name: John Doe
        Signature: ________________
        Date: _______________
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('underscore_line');
    });

    test('should detect signature lines with dashes', async () => {
      const text = `
        FORM
        
        Name: Jane Smith
        Signature: -----------------
        Date: ---------------
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('dash_line');
    });

    test('should detect signature lines with equals', async () => {
      const text = `
        FORM
        
        Name: Bob Johnson
        Signature: ================
        Date: ================
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('equals_line');
    });

    test('should detect signature lines with dots', async () => {
      const text = `
        FORM
        
        Name: Alice Brown
        Signature: ................
        Date: ................
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('dot_line');
    });

    test('should detect dates near signatures', async () => {
      const text = `
        CONTRACT
        
        This contract is signed by John Doe on 12/15/2023.
        
        Signature: ________________
        Date: 12/15/2023
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      const dateMatch = result.signatures.find(sig => sig.type === 'signature_date' || sig.type === 'signature_date_context');
      expect(dateMatch).toBeDefined();
    });

    test('should detect multiple signature types in one document', async () => {
      const text = `
        LEGAL DOCUMENT
        
        This document is signed by John Doe and witnessed by Jane Smith.
        It is notarized by Mary Wilson, Notary Public.
        
        Signed by: ________________
        Witnessed by: ________________
        Notarized by: ________________
        
        Date: 12/15/2023
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(2);
      
      const types = result.signatures.map(sig => sig.type);
      expect(types).toContain('signature_indicator');
      expect(types).toContain('witness_signature');
      expect(types).toContain('notarized_signature');
    });

    test('should handle case insensitive detection', async () => {
      const text = `
        CONTRACT
        
        This document is SIGNED BY John Doe.
        It is AUTHORIZED by the manager.
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
    });

    test('should handle case sensitive detection when enabled', async () => {
      const detector = new SignatureDetector({
        caseSensitive: true,
        debug: false
      });

      const text = `
        CONTRACT
        
        This document is signed by John Doe.
        It is SIGNED BY the manager.
      `;

      const result = await detector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);

      await detector.close();
    });

    test('should filter by minimum confidence', async () => {
      const detector = new SignatureDetector({
        minConfidence: 0.9,
        debug: false
      });

      const text = `
        FORM
        
        Name: John Doe
        Signature: ________________
      `;

      const result = await detector.detectSignatures(text);

      // Should only return high-confidence matches
      result.signatures.forEach(sig => {
        expect(sig.confidence).toBeGreaterThanOrEqual(0.9);
      });

      await detector.close();
    });

    test('should handle empty text', async () => {
      const result = await signatureDetector.detectSignatures('');

      expect(result.success).toBe(false);
      expect(result.signatures.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    test('should handle null text', async () => {
      const result = await signatureDetector.detectSignatures(null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined text', async () => {
      const result = await signatureDetector.detectSignatures(undefined);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should truncate very long text', async () => {
      const detector = new SignatureDetector({
        maxTextLength: 100,
        debug: false
      });

      const longText = 'A'.repeat(200) + ' signed by John Doe';

      const result = await detector.detectSignatures(longText);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);

      await detector.close();
    });

    test('should return context for matches', async () => {
      const text = `
        CONTRACT AGREEMENT
        
        This agreement is signed by John Doe on behalf of Acme Corp.
        
        Terms and conditions apply.
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].context).toBeDefined();
      expect(result.signatures[0].context.length).toBeGreaterThan(0);
    });

    test('should return match positions', async () => {
      const text = `
        CONTRACT
        
        This document is signed by John Doe.
      `;

      const result = await signatureDetector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].startIndex).toBeGreaterThanOrEqual(0);
      expect(result.signatures[0].endIndex).toBeGreaterThan(result.signatures[0].startIndex);
    });
  });

  describe('Caching', () => {
    test('should cache results when enabled', async () => {
      const detector = new SignatureDetector({
        enableCache: true,
        debug: false
      });

      const text = 'This document is signed by John Doe.';

      // First call
      const result1 = await detector.detectSignatures(text);
      expect(result1.success).toBe(true);

      // Second call should use cache
      const result2 = await detector.detectSignatures(text);
      expect(result2.success).toBe(true);
      expect(detector.stats.cacheHits).toBe(1);

      await detector.close();
    });

    test('should not cache when disabled', async () => {
      const detector = new SignatureDetector({
        enableCache: false,
        debug: false
      });

      const text = 'This document is signed by John Doe.';

      // First call
      const result1 = await detector.detectSignatures(text);
      expect(result1.success).toBe(true);

      // Second call should not use cache
      const result2 = await detector.detectSignatures(text);
      expect(result2.success).toBe(true);
      expect(detector.stats.cacheHits).toBe(0);

      await detector.close();
    });
  });

  describe('Statistics', () => {
    test('should track detection statistics', async () => {
      const text = 'This document is signed by John Doe.';

      await signatureDetector.detectSignatures(text);

      expect(signatureDetector.stats.totalDetections).toBe(1);
      expect(signatureDetector.stats.successfulDetections).toBe(1);
      expect(signatureDetector.stats.failedDetections).toBe(0);
      expect(signatureDetector.stats.averageConfidence).toBeGreaterThan(0);
    });

    test('should track signature types', async () => {
      const text = 'This document is signed by John Doe and witnessed by Jane Smith.';

      await signatureDetector.detectSignatures(text);

      expect(signatureDetector.stats.signatureTypes).toBeDefined();
      expect(Object.keys(signatureDetector.stats.signatureTypes).length).toBeGreaterThan(0);
    });

    test('should track processing time', async () => {
      const text = 'This document is signed by John Doe.';

      await signatureDetector.detectSignatures(text);

      expect(signatureDetector.stats.averageProcessingTime).toBeGreaterThan(0);
      expect(signatureDetector.stats.totalProcessingTime).toBeGreaterThan(0);
    });

    test('should reset statistics', () => {
      signatureDetector.stats.totalDetections = 10;
      signatureDetector.stats.successfulDetections = 8;

      signatureDetector.resetStats();

      expect(signatureDetector.stats.totalDetections).toBe(0);
      expect(signatureDetector.stats.successfulDetections).toBe(0);
    });
  });

  describe('Custom Patterns', () => {
    test('should use custom patterns when provided', async () => {
      const detector = new SignatureDetector({
        customPatterns: [
          {
            pattern: /custom\s+signature/i,
            type: 'custom_signature',
            weight: 0.9,
            description: 'Custom signature pattern'
          }
        ],
        debug: false
      });

      const text = 'This document has a custom signature by John Doe.';

      const result = await detector.detectSignatures(text);

      expect(result.success).toBe(true);
      expect(result.signatures.length).toBeGreaterThan(0);
      expect(result.signatures[0].type).toBe('custom_signature');

      await detector.close();
    });
  });

  describe('Cleanup', () => {
    test('should close properly', async () => {
      const detector = new SignatureDetector({
        enableCache: true,
        debug: false
      });

      await detector.close();

      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should clear cache on close', async () => {
      const detector = new SignatureDetector({
        enableCache: true,
        debug: false
      });

      const text = 'This document is signed by John Doe.';
      await detector.detectSignatures(text);

      expect(detector.cache.size).toBeGreaterThan(0);

      await detector.close();

      expect(detector.cache.size).toBe(0);
    });
  });
});
