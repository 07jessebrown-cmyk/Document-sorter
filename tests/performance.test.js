const fs = require('fs').promises;
const path = require('path');
const ParsingService = require('../src/services/parsingService');
const RenamingService = require('../src/services/renamingService');

describe('Performance Tests', () => {
  let parsingService;
  let renamingService;
  let testDir;

  beforeEach(() => {
    parsingService = new ParsingService();
    renamingService = new RenamingService();
    testDir = path.join(__dirname, `perf_test_${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  });

  describe('Document Processing Performance', () => {
    test('should process small text document in under 2 seconds', async () => {
      // Create a small test document
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'small_doc.txt');
      const content = `
        INVOICE
        Bill to: Acme Corporation
        Invoice #: INV-001
        Date: 12/15/2023
        Total Amount: $1,500.00
        Payment due within 30 days
      `;
      await fs.writeFile(testFile, content);

      const startTime = Date.now();
      
      // Test parsing performance
      const metadata = parsingService.analyzeDocument(content, testFile);
      
      // Test renaming performance
      const renameResult = await renamingService.generateNewFilename(metadata, testFile, true);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(2000); // Should be under 2 seconds
      expect(metadata.type).toBe('Invoice');
      expect(renameResult.success).toBe(true);
    });

    test('should process medium text document in under 2 seconds', async () => {
      // Create a medium test document
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'medium_doc.txt');
      const content = `
        CONTRACT AGREEMENT
        Between: Acme Corporation
        And: Globex Inc.
        Date: 12/15/2023
        Effective Date: 01/01/2024
        
        This agreement outlines the terms and conditions for the provision of services.
        The contractor agrees to provide consulting services as outlined in the scope of work.
        Payment terms are net 30 days from invoice date.
        
        The contractor shall maintain confidentiality of all proprietary information.
        This agreement shall be governed by the laws of the state of California.
        
        IN WITNESS WHEREOF, the parties have executed this agreement.
        
        Signature: _________________    Date: _______________
        Acme Corporation
        
        Signature: _________________    Date: _______________
        Globex Inc.
      `;
      await fs.writeFile(testFile, content);

      const startTime = Date.now();
      
      // Test parsing performance
      const metadata = parsingService.analyzeDocument(content, testFile);
      
      // Test renaming performance
      const renameResult = await renamingService.generateNewFilename(metadata, testFile, true);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(2000); // Should be under 2 seconds
      expect(metadata.type).toBe('Contract');
      expect(renameResult.success).toBe(true);
    });

    test('should process large text document in under 2 seconds', async () => {
      // Create a large test document
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'large_doc.txt');
      
      // Generate a large document with repeated content
      const baseContent = `
        FINANCIAL REPORT
        Company: Acme Corporation
        Period: Q4 2023
        Date: 12/15/2023
        
        EXECUTIVE SUMMARY
        This report provides a comprehensive analysis of the company's financial performance
        for the fourth quarter of 2023. The analysis includes revenue, expenses, profit margins,
        and key performance indicators.
        
        REVENUE ANALYSIS
        Total revenue for Q4 2023 was $2.5 million, representing a 15% increase over Q3 2023.
        The growth was driven by increased sales in the enterprise segment and new product launches.
        
        EXPENSE ANALYSIS
        Operating expenses totaled $1.8 million, including salaries, marketing, and overhead.
        Cost of goods sold was $1.2 million, resulting in a gross margin of 52%.
        
        PROFIT MARGINS
        Net profit for the quarter was $300,000, representing a 12% net margin.
        This is an improvement over the previous quarter's 10% margin.
        
        KEY PERFORMANCE INDICATORS
        - Customer acquisition cost: $150
        - Customer lifetime value: $2,500
        - Monthly recurring revenue: $850,000
        - Churn rate: 2.5%
        
        RECOMMENDATIONS
        1. Continue investing in enterprise sales team
        2. Focus on customer retention programs
        3. Optimize marketing spend for better ROI
        4. Consider expanding into new markets
        
        CONCLUSION
        The company is well-positioned for continued growth in 2024.
        The strong financial performance and key metrics indicate a healthy business.
      `;
      
      // Repeat content to create a large document
      const content = baseContent.repeat(10);
      await fs.writeFile(testFile, content);

      const startTime = Date.now();
      
      // Test parsing performance
      const metadata = parsingService.analyzeDocument(content, testFile);
      
      // Test renaming performance
      const renameResult = await renamingService.generateNewFilename(metadata, testFile, true);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(2000); // Should be under 2 seconds
      expect(metadata.type).toBe('Report');
      expect(renameResult.success).toBe(true);
    });
  });

  describe('Batch Processing Performance', () => {
    test('should process multiple files efficiently', async () => {
      await fs.mkdir(testDir, { recursive: true });
      
      // Create multiple test files
      const files = [];
      for (let i = 0; i < 10; i++) {
        const testFile = path.join(testDir, `test_${i}.txt`);
        const content = `
          INVOICE
          Bill to: Client ${i}
          Invoice #: INV-${i.toString().padStart(3, '0')}
          Date: 12/15/2023
          Total Amount: $${(1000 + i * 100).toFixed(2)}
        `;
        await fs.writeFile(testFile, content);
        files.push(testFile);
      }

      const startTime = Date.now();
      
      // Process all files
      const results = [];
      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const metadata = parsingService.analyzeDocument(content, file);
        const renameResult = await renamingService.generateNewFilename(metadata, file, true);
        results.push({ file, metadata, renameResult });
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / files.length;

      expect(totalTime).toBeLessThan(10000); // Total time should be under 10 seconds
      expect(averageTime).toBeLessThan(2000); // Average time per file should be under 2 seconds
      expect(results).toHaveLength(10);
      
      // Verify all files were processed correctly
      results.forEach(result => {
        expect(result.metadata.type).toBe('Invoice');
        expect(result.renameResult.success).toBe(true);
      });
    });
  });

  describe('Memory Usage', () => {
    test('should not exceed memory limits during processing', async () => {
      await fs.mkdir(testDir, { recursive: true });
      
      // Get initial memory usage
      const initialMemory = process.memoryUsage();
      
      // Create a large document
      const testFile = path.join(testDir, 'memory_test.txt');
      const content = 'This is a test document. '.repeat(10000);
      await fs.writeFile(testFile, content);

      // Process the document
      const metadata = parsingService.analyzeDocument(content, testFile);
      const renameResult = await renamingService.generateNewFilename(metadata, testFile, true);
      
      // Get final memory usage
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      expect(renameResult.success).toBe(true);
    });
  });
});
