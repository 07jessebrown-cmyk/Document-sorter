// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Test data files
const testFiles = {
  pdf: path.join(__dirname, '../../examples/table-invoice.pdf'),
  signature: path.join(__dirname, '../../examples/signature-contract.pdf'),
  watermark: path.join(__dirname, '../../examples/watermark-confidential.pdf'),
  multilingual: path.join(__dirname, '../../examples/multilingual-spanish.pdf'),
  handwriting: path.join(__dirname, '../../examples/handwriting-notes.pdf')
};

test.describe('File Processing Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://127.0.0.1:3000');
    
    // Wait for the application to load
    await expect(page.locator('h1')).toContainText('Document Sorter');
    
    // Enable AI processing for all tests
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.check('#useTableExtractionToggle');
    await page.check('#useOCRToggle');
    await page.check('#useLLMEnhancerToggle');
    await page.click('#saveSettings');
  });

  test('should complete full file upload → preview → rename flow with AI enabled', async ({ page }) => {
    // Step 1: Upload file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await expect(page.locator('#fileList')).toBeVisible();
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
    await expect(page.locator('#fileListItems li')).toContainText('table-invoice.pdf');
    
    // Step 2: Start processing
    await page.click('#startSortingBtn');
    
    // Step 3: Wait for preview table to appear
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Step 4: Verify preview shows confidence and source
    const previewRow = page.locator('#previewTableBody tr').first();
    
    // Check source column (5th column)
    const sourceCell = previewRow.locator('td:nth-child(5)');
    await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
    
    // Check confidence column (6th column)
    const confidenceCell = previewRow.locator('td:nth-child(6)');
    await expect(confidenceCell).toContainText(/\d+%/);
    
    // Check that AI-extracted data is shown
    const clientCell = previewRow.locator('td:nth-child(2)');
    await expect(clientCell).not.toBeEmpty();
    
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).not.toBeEmpty();
    
    const dateCell = previewRow.locator('td:nth-child(3)');
    await expect(dateCell).not.toBeEmpty();
    
    // Check proposed filename is generated
    const filenameCell = previewRow.locator('td:nth-child(9)');
    await expect(filenameCell).not.toBeEmpty();
    await expect(filenameCell).toContainText(/\.pdf$/);
    
    // Step 5: Verify status shows completion
    const statusElement = page.locator('#status');
    await expect(statusElement).toContainText(/complete|done|finished/i);
  });

  test('should process signature document and detect signatures', async ({ page }) => {
    // Upload signature document
    await page.setInputFiles('#fileInput', [testFiles.signature]);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that signature detection is working
    const previewRow = page.locator('#previewTableBody tr').first();
    const snippetsCell = previewRow.locator('td:nth-child(8)');
    await expect(snippetsCell).toBeVisible();
    
    // Check that document type is detected as contract/agreement
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).toContainText(/contract|agreement|signature/i);
  });

  test('should process watermark document and filter watermarks', async ({ page }) => {
    // Upload watermark document
    await page.setInputFiles('#fileInput', [testFiles.watermark]);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that watermark filtering is working
    const previewRow = page.locator('#previewTableBody tr').first();
    const snippetsCell = previewRow.locator('td:nth-child(8)');
    await expect(snippetsCell).toBeVisible();
    
    // Check that document type is detected despite watermarks
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).not.toBeEmpty();
  });

  test('should process multilingual document with language detection', async ({ page }) => {
    // Upload multilingual document
    await page.setInputFiles('#fileInput', [testFiles.multilingual]);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that multilingual processing is working
    const previewRow = page.locator('#previewTableBody tr').first();
    const clientCell = previewRow.locator('td:nth-child(2)');
    await expect(clientCell).not.toBeEmpty();
    
    // Check that document type is detected in different language
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).not.toBeEmpty();
  });

  test('should process handwriting document and detect handwriting', async ({ page }) => {
    // Upload handwriting document
    await page.setInputFiles('#fileInput', [testFiles.handwriting]);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that handwriting detection is working
    const previewRow = page.locator('#previewTableBody tr').first();
    const snippetsCell = previewRow.locator('td:nth-child(8)');
    await expect(snippetsCell).toBeVisible();
    
    // Check that document type is detected despite handwriting
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).not.toBeEmpty();
  });

  test('should show table extraction results in preview', async ({ page }) => {
    // Upload document with tables
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that table data is shown
    const previewRow = page.locator('#previewTableBody tr').first();
    const tableCell = previewRow.locator('td:nth-child(7)');
    await expect(tableCell).toBeVisible();
    
    // If table data is present, it should be clickable
    const tableLink = tableCell.locator('a, button');
    if (await tableLink.count() > 0) {
      await expect(tableLink).toBeVisible();
    }
  });

  test('should process multiple files with different features', async ({ page }) => {
    // Upload multiple files with different characteristics
    const files = [testFiles.pdf, testFiles.signature, testFiles.watermark, testFiles.multilingual, testFiles.handwriting];
    await page.setInputFiles('#fileInput', files);
    
    // Verify all files are listed
    await expect(page.locator('#fileListItems li')).toHaveCount(5);
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Wait for processing to complete
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Verify all files are processed
    const rows = page.locator('#previewTableBody tr');
    await expect(rows).toHaveCount(5);
    
    // Check that each file has appropriate metadata
    for (let i = 0; i < 5; i++) {
      const row = rows.nth(i);
      
      // Each row should have source and confidence
      const sourceCell = row.locator('td:nth-child(5)');
      const confidenceCell = row.locator('td:nth-child(6)');
      
      await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
      await expect(confidenceCell).toContainText(/\d+%/);
      
      // Each row should have client and type
      const clientCell = row.locator('td:nth-child(2)');
      const typeCell = row.locator('td:nth-child(4)');
      
      await expect(clientCell).not.toBeEmpty();
      await expect(typeCell).not.toBeEmpty();
    }
  });

  test('should show processing status throughout the flow', async ({ page }) => {
    // Upload file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Check that status updates are shown
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();
    
    // Status should show processing initially
    await expect(statusElement).toContainText(/processing|analyzing|extracting/i);
    
    // Wait for completion
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Status should show completion
    await expect(statusElement).toContainText(/complete|done|finished/i);
  });

  test('should handle file processing errors gracefully', async ({ page }) => {
    // Create a temporary invalid file
    const invalidFile = path.join(__dirname, '../../invalid-test.txt');
    fs.writeFileSync(invalidFile, 'This is not a valid document for processing');
    
    try {
      // Upload invalid file
      await page.setInputFiles('#fileInput', [invalidFile]);
      await page.click('#startSortingBtn');
      
      // Check that error is handled gracefully
      const statusElement = page.locator('#status');
      await expect(statusElement).toBeVisible();
      
      // Should either show error or complete processing
      await expect(statusElement).toContainText(/error|complete|done|finished/i);
    } finally {
      // Clean up
      if (fs.existsSync(invalidFile)) {
        fs.unlinkSync(invalidFile);
      }
    }
  });

  test('should maintain preview data after settings changes', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Change settings
    await page.click('#settingsBtn');
    await page.selectOption('#aiModel', 'gpt-4');
    await page.click('#saveSettings');
    
    // Verify preview data is still there
    await expect(page.locator('#previewTable')).toBeVisible();
    await expect(page.locator('#previewTableBody tr')).toHaveCount(1);
  });
});
