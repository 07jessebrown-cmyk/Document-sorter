const fs = require('fs').promises;
const path = require('path');
const ParsingService = require('../src/services/parsingService');
const RenamingService = require('../src/services/renamingService');

describe('Usability Tests', () => {
  let parsingService;
  let renamingService;
  let testDir;

  beforeEach(() => {
    parsingService = new ParsingService();
    renamingService = new RenamingService();
    testDir = path.join(__dirname, `usability_test_${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  });

  describe('New User Setup Time', () => {
    test('should complete basic setup in under 2 minutes', async () => {
      const startTime = Date.now();
      
      // Simulate new user setup process
      // 1. Initialize services (instant)
      const services = {
        parsing: new ParsingService(),
        renaming: new RenamingService()
      };
      
      // 2. Create test directory (simulate user creating workspace)
      await fs.mkdir(testDir, { recursive: true });
      
      // 3. Create sample documents (simulate user adding files)
      const sampleFiles = [
        {
          name: 'invoice_sample.pdf',
          content: `
            INVOICE
            Bill to: Acme Corporation
            Invoice #: INV-001
            Date: 12/15/2023
            Total Amount: $1,500.00
          `
        },
        {
          name: 'contract_sample.pdf',
          content: `
            CONTRACT AGREEMENT
            Between: Acme Corporation
            And: Globex Inc.
            Date: 12/15/2023
            This agreement outlines the terms and conditions.
          `
        },
        {
          name: 'resume_sample.pdf',
          content: `
            JOHN DOE
            Software Engineer
            Experience: 5 years
            Education: Computer Science Degree
            Skills: JavaScript, Python, React
          `
        }
      ];
      
      for (const file of sampleFiles) {
        const filePath = path.join(testDir, file.name);
        await fs.writeFile(filePath, file.content);
      }
      
      // 4. Process sample files (simulate user testing the app)
      const results = [];
      for (const file of sampleFiles) {
        const filePath = path.join(testDir, file.name);
        const metadata = services.parsing.analyzeDocument(file.content, filePath);
        const renameResult = await services.renaming.generateNewFilename(metadata, filePath, true);
        results.push({ file: file.name, metadata, renameResult });
      }
      
      // 5. Verify results (simulate user reviewing output)
      expect(results).toHaveLength(3);
      expect(results[0].metadata.type).toBe('Invoice');
      expect(results[1].metadata.type).toBe('Contract');
      expect(results[2].metadata.type).toBe('Resume');
      
      const endTime = Date.now();
      const setupTime = endTime - startTime;
      const setupTimeMinutes = setupTime / (1000 * 60);
      
      expect(setupTimeMinutes).toBeLessThan(2); // Should complete in under 2 minutes
      console.log(`Setup completed in ${setupTimeMinutes.toFixed(2)} minutes`);
    });
  });

  describe('Error Handling and User Feedback', () => {
    test('should provide clear error messages for invalid files', async () => {
      await fs.mkdir(testDir, { recursive: true });
      
      // Test with empty file
      const emptyFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');
      
      const metadata = parsingService.analyzeDocument('', emptyFile);
      expect(metadata.type).toBe('Unclassified');
      expect(metadata.confidence).toBeLessThan(0.5);
      
      // Test with very short content
      const shortFile = path.join(testDir, 'short.txt');
      await fs.writeFile(shortFile, 'Hi');
      
      const shortMetadata = parsingService.analyzeDocument('Hi', shortFile);
      expect(shortMetadata.type).toBe('Unclassified');
    });

    test('should handle files with special characters gracefully', async () => {
      await fs.mkdir(testDir, { recursive: true });
      
      const specialFile = path.join(testDir, 'special_chars.txt');
      const content = `
        INVOICE
        Bill to: Acme & Co. (Ltd.)
        Invoice #: INV-001
        Date: 12/15/2023
        Total: $1,500.00
      `;
      await fs.writeFile(specialFile, content);
      
      const metadata = parsingService.analyzeDocument(content, specialFile);
      const renameResult = await renamingService.generateNewFilename(metadata, specialFile, true);
      
      expect(renameResult.success).toBe(true);
      expect(renameResult.newName).toContain('acme');
      expect(renameResult.newName).toContain('2023-12-15');
    });
  });

  describe('Document Type Recognition Accuracy', () => {
    test('should correctly identify common document types', async () => {
      const testCases = [
        {
          name: 'Invoice',
          content: `
            INVOICE
            Bill to: Acme Corporation
            Invoice #: INV-001
            Date: 12/15/2023
            Total Amount: $1,500.00
            Payment due within 30 days
          `,
          expectedType: 'Invoice'
        },
        {
          name: 'Contract',
          content: `
            CONTRACT AGREEMENT
            Between: Acme Corporation
            And: Globex Inc.
            Date: 12/15/2023
            This agreement outlines the terms and conditions.
            The contractor agrees to provide services.
          `,
          expectedType: 'Contract'
        },
        {
          name: 'Resume',
          content: `
            JOHN DOE
            Software Engineer
            Email: john@example.com
            Phone: (555) 123-4567
            
            EXPERIENCE
            Senior Developer at Tech Corp (2020-2023)
            Junior Developer at Startup Inc (2018-2020)
            
            EDUCATION
            Computer Science Degree, University of Tech (2018)
          `,
          expectedType: 'Resume'
        },
        {
          name: 'Receipt',
          content: `
            RECEIPT
            Thank you for your payment
            Transaction #: TXN-001
            Date: 12/15/2023
            Amount: $150.00
            Payment Method: Credit Card
          `,
          expectedType: 'Receipt'
        }
      ];
      
      for (const testCase of testCases) {
        const metadata = parsingService.analyzeDocument(testCase.content, 'test.txt');
        expect(metadata.type).toBe(testCase.expectedType);
        expect(metadata.confidence).toBeGreaterThanOrEqual(0.1);
      }
    });
  });

  describe('Date Extraction Accuracy', () => {
    test('should extract dates from various formats', async () => {
      const dateTestCases = [
        {
          content: 'Date: 12/15/2023',
          expectedDate: '2023-12-15'
        },
        {
          content: 'December 15, 2023',
          expectedDate: '2023-12-15'
        },
        {
          content: '15 December 2023',
          expectedDate: '2023-12-15'
        }
      ];
      
      for (const testCase of dateTestCases) {
        const metadata = parsingService.analyzeDocument(testCase.content, 'test.txt');
        expect(metadata.date).toBe(testCase.expectedDate);
      }
    });
  });

  describe('Client Name Detection', () => {
    test('should detect client names from various patterns', async () => {
      const clientTestCases = [
        {
          content: 'Bill to: Acme Corporation',
          expectedClient: 'Acme Corporation'
        },
        {
          content: 'From: Soylent Corp',
          expectedClient: 'Soylent Corp'
        }
      ];
      
      for (const testCase of clientTestCases) {
        const metadata = parsingService.analyzeDocument(testCase.content, 'test.txt');
        expect(metadata.clientName).toBe(testCase.expectedClient);
      }
    });
  });

  describe('File Naming Consistency', () => {
    test('should generate consistent filenames for similar documents', async () => {
      await fs.mkdir(testDir, { recursive: true });
      
      const testFile = path.join(testDir, 'test.txt');
      const content = `
        INVOICE
        Bill to: Acme Corporation
        Date: 12/15/2023
        Total: $1,500.00
      `;
      await fs.writeFile(testFile, content);
      
      // Generate filename multiple times
      const metadata = parsingService.analyzeDocument(content, testFile);
      const renameResult1 = await renamingService.generateNewFilename(metadata, testFile, true);
      const renameResult2 = await renamingService.generateNewFilename(metadata, testFile, true);
      
      expect(renameResult1.newName).toBe(renameResult2.newName);
      expect(renameResult1.newName).toContain('acme_corporation');
      expect(renameResult1.newName).toContain('2023-12-15');
      expect(renameResult1.newName).toContain('invoice');
    });
  });
});
