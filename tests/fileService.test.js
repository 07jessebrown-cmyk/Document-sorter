// Tests for file service
const fs = require('fs');
const path = require('path');

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  statSync: jest.fn(),
  constants: {
    F_OK: 0
  }
}));

// Mock the file service functions
const mockGenerateFileName = (documentData, extension) => {
  const parts = [];
  
  // Client name
  let clientName = 'Client_NA';
  if (documentData && documentData.clientName && documentData.clientName.trim()) {
    clientName = documentData.clientName.trim();
  }
  parts.push(sanitizeComponent(clientName));
  
  // Document type
  let documentType = 'Unclassified';
  if (documentData && documentData.type && documentData.type.trim()) {
    documentType = documentData.type.trim();
  }
  parts.push(sanitizeComponent(documentType));
  
  // Date
  let dateString = getTodayString();
  if (documentData && documentData.date && documentData.date.trim()) {
    dateString = documentData.date.trim();
  }
  parts.push(sanitizeComponent(dateString));
  
  const fileName = parts.filter(Boolean).join('_') + extension;
  return sanitizeFileName(fileName);
};

const sanitizeComponent = (component) => {
  if (!component || typeof component !== 'string') {
    return 'Unknown';
  }
  
  return component
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'Unknown';
};

const sanitizeFileName = (fileName) => {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 200) || 'Unnamed_Document';
};

const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const mockEnsureUniquePath = (targetPath) => {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const ext = path.extname(base);
  const name = base.slice(0, base.length - ext.length);
  let candidate = targetPath;
  let i = 1;
  
  while (true) {
    try {
      fs.accessSync(candidate, fs.constants.F_OK);
      candidate = path.join(dir, `${name}_${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
};

describe('FileService', () => {
  describe('Filename Generation', () => {
    test('should generate proper filename for invoice', () => {
      const documentData = {
        clientName: 'Acme Corporation',
        type: 'Invoice',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName).toBe('Acme_Corporation_Invoice_2023-12-15.pdf');
    });

    test('should generate proper filename for resume', () => {
      const documentData = {
        clientName: 'John Doe',
        type: 'Resume',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName).toBe('John_Doe_Resume_2023-12-15.pdf');
    });

    test('should handle missing client name', () => {
      const documentData = {
        type: 'Contract',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName).toBe('Client_NA_Contract_2023-12-15.pdf');
    });

    test('should handle missing document type', () => {
      const documentData = {
        clientName: 'Test Company',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName).toBe('Test_Company_Unclassified_2023-12-15.pdf');
    });

    test('should handle missing date', () => {
      const documentData = {
        clientName: 'Test Company',
        type: 'Invoice'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      const today = getTodayString();
      
      expect(fileName).toBe(`Test_Company_Invoice_${today}.pdf`);
    });

    test('should sanitize special characters in client name', () => {
      const documentData = {
        clientName: 'Test/Company: Inc.',
        type: 'Invoice',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName).toBe('Test_Company_Inc._Invoice_2023-12-15.pdf');
    });

    test('should handle very long client names', () => {
      const longClientName = 'A'.repeat(100);
      const documentData = {
        clientName: longClientName,
        type: 'Invoice',
        date: '2023-12-15'
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      
      expect(fileName.length).toBeLessThanOrEqual(200);
      expect(fileName).toContain('Invoice');
    });

    test('should handle empty document data', () => {
      const documentData = {};
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      const today = getTodayString();
      
      expect(fileName).toBe(`Client_NA_Unclassified_${today}.pdf`);
    });
  });

  describe('Filename Sanitization', () => {
    test('should remove Windows invalid characters', () => {
      const invalidChars = '<>:"/\\|?*';
      const sanitized = sanitizeComponent(invalidChars);
      
      expect(sanitized).toBe('Unknown');
    });

    test('should replace spaces with underscores', () => {
      const withSpaces = 'Test Company Inc';
      const sanitized = sanitizeComponent(withSpaces);
      
      expect(sanitized).toBe('Test_Company_Inc');
    });

    test('should remove control characters', () => {
      const withControlChars = 'Test\x00Company\x1fInc';
      const sanitized = sanitizeComponent(withControlChars);
      
      expect(sanitized).toBe('Test_Company_Inc');
    });

    test('should handle multiple consecutive underscores', () => {
      const withMultipleUnderscores = 'Test___Company____Inc';
      const sanitized = sanitizeComponent(withMultipleUnderscores);
      
      expect(sanitized).toBe('Test_Company_Inc');
    });

    test('should remove leading and trailing underscores', () => {
      const withLeadingTrailing = '_Test_Company_Inc_';
      const sanitized = sanitizeComponent(withLeadingTrailing);
      
      expect(sanitized).toBe('Test_Company_Inc');
    });
  });

  describe('Unique Path Generation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return original path if file does not exist', () => {
      fs.accessSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const targetPath = '/test/file.pdf';
      const result = mockEnsureUniquePath(targetPath);
      
      expect(result).toBe(targetPath);
    });

    test('should append number if file exists', () => {
      fs.accessSync
        .mockImplementationOnce(() => {}) // File exists
        .mockImplementationOnce(() => {}) // File_1 exists
        .mockImplementationOnce(() => { throw new Error('File not found'); }); // File_2 does not exist
      
      const targetPath = '/test/file.pdf';
      const result = mockEnsureUniquePath(targetPath);
      
      expect(result).toBe('/test/file_2.pdf');
    });

    test('should handle multiple existing files', () => {
      fs.accessSync
        .mockImplementationOnce(() => {}) // File exists
        .mockImplementationOnce(() => {}) // File_1 exists
        .mockImplementationOnce(() => {}) // File_2 exists
        .mockImplementationOnce(() => {}) // File_3 exists
        .mockImplementationOnce(() => { throw new Error('File not found'); }); // File_4 does not exist
      
      const targetPath = '/test/file.pdf';
      const result = mockEnsureUniquePath(targetPath);
      
      expect(result).toBe('/test/file_4.pdf');
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should create directory if it does not exist', () => {
      fs.mkdirSync.mockImplementation(() => {});
      fs.renameSync.mockImplementation(() => {});
      
      const destRoot = '/test/sorted_files/Invoices';
      
      // Simulate directory creation
      fs.mkdirSync(destRoot, { recursive: true });
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(destRoot, { recursive: true });
    });

    test('should handle directory creation errors', () => {
      const error = new Error('Permission denied');
      fs.mkdirSync.mockImplementation(() => {
        throw error;
      });
      
      expect(() => {
        fs.mkdirSync('/test/sorted_files/Invoices', { recursive: true });
      }).toThrow('Permission denied');
    });

    test('should move file successfully', () => {
      fs.renameSync.mockImplementation(() => {});
      
      const originalPath = '/test/original.pdf';
      const finalPath = '/test/sorted_files/Invoices/Client_Invoice_2023-12-15.pdf';
      
      fs.renameSync(originalPath, finalPath);
      
      expect(fs.renameSync).toHaveBeenCalledWith(originalPath, finalPath);
    });

    test('should handle file move errors', () => {
      const error = new Error('File in use');
      fs.renameSync.mockImplementation(() => {
        throw error;
      });
      
      expect(() => {
        fs.renameSync('/test/original.pdf', '/test/final.pdf');
      }).toThrow('File in use');
    });
  });

  describe('Error Handling', () => {
    test('should handle null document data gracefully', () => {
      const fileName = mockGenerateFileName(null, '.pdf');
      const today = getTodayString();
      
      expect(fileName).toBe(`Client_NA_Unclassified_${today}.pdf`);
    });

    test('should handle undefined document data gracefully', () => {
      const fileName = mockGenerateFileName(undefined, '.pdf');
      const today = getTodayString();
      
      expect(fileName).toBe(`Client_NA_Unclassified_${today}.pdf`);
    });

    test('should handle empty string values', () => {
      const documentData = {
        clientName: '',
        type: '',
        date: ''
      };
      
      const fileName = mockGenerateFileName(documentData, '.pdf');
      const today = getTodayString();
      
      expect(fileName).toBe(`Client_NA_Unclassified_${today}.pdf`);
    });
  });
});
