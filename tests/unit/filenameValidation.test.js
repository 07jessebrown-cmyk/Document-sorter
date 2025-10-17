const { FileOpsHelpers } = require('../../src/services/fileOpsHelpers');
const FilenameGenerator = require('../../src/services/filenameGenerator');

/**
 * Unit Tests for Filename Validation and Sanitization
 * Tests the core filename validation logic as used in edge cases
 */
describe('Filename Validation Unit Tests', () => {
  let filenameGenerator;

  beforeEach(() => {
    filenameGenerator = new FilenameGenerator();
  });

  describe('FileOpsHelpers.validateFilename()', () => {
    test('should validate normal filenames correctly', () => {
      const testCases = [
        'Invoice_AcmeCorp_2024-01-15.pdf',
        'Contract_Microsoft_2024-03-20.pdf',
        'Report_UnknownClient_2024-02-10.pdf',
        'Receipt_Store_2024-12-01.pdf'
      ];

      testCases.forEach(filename => {
        const result = FileOpsHelpers.validateFilename(filename);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(filename);
        expect(result.changes).toBe(false);
        expect(result.error).toBeUndefined();
      });
    });

    test('should sanitize invalid characters correctly', () => {
      const testCases = [
        { input: 'contract:2025?.pdf', expected: 'contract_2025_.pdf' },
        { input: 'file<name>.pdf', expected: 'file_name_.pdf' },
        { input: 'doc|with|pipes.pdf', expected: 'doc_with_pipes.pdf' },
        { input: 'test"quotes".pdf', expected: 'test_quotes_.pdf' },
        { input: 'file/with\\slashes.pdf', expected: 'file_with_slashes.pdf' },
        { input: 'doc*with?wildcards.pdf', expected: 'doc_with_wildcards.pdf' },
        { input: 'file<with>brackets.pdf', expected: 'file_with_brackets.pdf' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = FileOpsHelpers.validateFilename(input);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(expected);
        expect(result.changes).toBe(true);
        expect(result.original).toBe(input);
      });
    });

    test('should handle empty and invalid inputs', () => {
      const testCases = [
        { input: '', expected: 'Invalid filename: must be a non-empty string' },
        { input: null, expected: 'Invalid filename: must be a non-empty string' },
        { input: undefined, expected: 'Invalid filename: must be a non-empty string' },
        { input: 123, expected: 'Invalid filename: must be a non-empty string' },
        { input: '   ', expected: 'Filename is empty after sanitization' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = FileOpsHelpers.validateFilename(input);
        expect(result.valid).toBe(false);
        expect(result.sanitized).toBeNull();
        expect(result.error).toBe(expected);
      });
    });

    test('should handle filenames that become empty after sanitization', () => {
      const testCases = [
        '<<<>>>',
        '???',
        '|||',
        ':::',
        '***'
      ];

      testCases.forEach(input => {
        const result = FileOpsHelpers.validateFilename(input);
        expect(result.valid).toBe(false);
        expect(result.sanitized).toBeNull();
        expect(result.error).toBe('Filename is empty after sanitization');
      });
    });

    test('should handle length limits correctly', () => {
      // Test filename longer than 255 characters
      const longFilename = 'A'.repeat(300) + '.pdf';
      const result = FileOpsHelpers.validateFilename(longFilename);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(255);
      expect(result.sanitized).toEndWith('.pdf');
    });

    test('should handle reserved Windows names', () => {
      const reservedNames = [
        'CON.pdf',
        'PRN.pdf',
        'AUX.pdf',
        'NUL.pdf',
        'COM1.pdf',
        'LPT1.pdf'
      ];

      reservedNames.forEach(filename => {
        const result = FileOpsHelpers.validateFilename(filename);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toEndWith('_.pdf');
        expect(result.changes).toBe(true);
      });
    });

    test('should remove leading and trailing dots and spaces', () => {
      const testCases = [
        { input: '  filename.pdf  ', expected: 'filename.pdf' },
        { input: '...filename.pdf...', expected: 'filename.pdf' },
        { input: ' . filename . pdf . ', expected: 'filename.pdf' },
        { input: '   .pdf', expected: '.pdf' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = FileOpsHelpers.validateFilename(input);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(expected);
        expect(result.changes).toBe(input !== expected);
      });
    });
  });

  describe('FilenameGenerator.sanitizeComponent()', () => {
    test('should sanitize component strings correctly', () => {
      const testCases = [
        { input: 'Acme Corporation', expected: 'Acme_Corporation' },
        { input: 'Microsoft Corp.', expected: 'Microsoft_Corp' },
        { input: 'Smith & Associates LLC', expected: 'Smith_Associates_LLC' },
        { input: 'Test/Component', expected: 'Test_Component' },
        { input: 'Component<with>brackets', expected: 'Component_with_brackets' },
        { input: '  Component  ', expected: 'Component' },
        { input: 'Component...', expected: 'Component' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = filenameGenerator.sanitizeComponent(input);
        expect(result).toBe(expected);
      });
    });

    test('should limit component length to 50 characters', () => {
      const longComponent = 'A'.repeat(100);
      const result = filenameGenerator.sanitizeComponent(longComponent);
      
      expect(result.length).toBeLessThanOrEqual(50);
    });

    test('should handle empty and null components', () => {
      const testCases = ['', null, undefined, '   '];
      
      testCases.forEach(input => {
        const result = filenameGenerator.sanitizeComponent(input);
        expect(result).toBe('');
      });
    });
  });

  describe('FilenameGenerator.validateFilename()', () => {
    test('should validate generated filenames correctly', () => {
      const testCases = [
        'Invoice_AcmeCorp_2024-01-15.pdf',
        'Contract_Microsoft_2024-03-20.pdf',
        'Report_UnknownClient_2024-02-10.pdf'
      ];

      testCases.forEach(filename => {
        const result = filenameGenerator.validateFilename(filename);
        expect(result.isValid).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(result.filename).toBe(filename);
      });
    });

    test('should detect filename length issues', () => {
      const longFilename = 'A'.repeat(150) + '.pdf';
      const result = filenameGenerator.validateFilename(longFilename, 100);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Filename too long: 154 > 100');
    });

    test('should detect spaces in filenames', () => {
      const filename = 'Invoice Acme Corp 2024-01-15.pdf';
      const result = filenameGenerator.validateFilename(filename);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Filename contains spaces');
    });

    test('should detect invalid characters', () => {
      const filename = 'Invoice<Acme>Corp.pdf';
      const result = filenameGenerator.validateFilename(filename);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Filename contains invalid characters');
    });

    test('should detect filenames starting with dots', () => {
      const filename = '.hidden_file.pdf';
      const result = filenameGenerator.validateFilename(filename);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Filename starts with dot');
    });

    test('should detect generic filenames', () => {
      const genericFilenames = ['Document.pdf', 'File.pdf'];
      
      genericFilenames.forEach(filename => {
        const result = filenameGenerator.validateFilename(filename);
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Filename is too generic');
      });
    });

    test('should handle multiple validation issues', () => {
      const filename = ' Document<with>spaces.pdf ';
      const result = filenameGenerator.validateFilename(filename);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Filename contains spaces');
      expect(result.issues).toContain('Filename contains invalid characters');
      expect(result.issues.length).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases for Filename Validation', () => {
    test('should handle Unicode characters', () => {
      const filename = 'Invoice_Acme_Corp_2024-01-15.pdf';
      const result = FileOpsHelpers.validateFilename(filename);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(filename);
    });

    test('should handle very long filenames with proper truncation', () => {
      const veryLongFilename = 'A'.repeat(500) + '.pdf';
      const result = FileOpsHelpers.validateFilename(veryLongFilename);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized.length).toBeLessThanOrEqual(255);
      expect(result.sanitized).toEndWith('.pdf');
    });

    test('should handle filenames with only special characters', () => {
      const specialOnly = '!@#$%^&*()';
      const result = FileOpsHelpers.validateFilename(specialOnly);
      
      expect(result.valid).toBe(false);
      expect(result.sanitized).toBeNull();
      expect(result.error).toBe('Filename is empty after sanitization');
    });

    test('should handle mixed valid and invalid characters', () => {
      const mixed = 'Valid_Name<with>Invalid_Chars.pdf';
      const result = FileOpsHelpers.validateFilename(mixed);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Valid_Name_with_Invalid_Chars.pdf');
      expect(result.changes).toBe(true);
    });
  });
});
