// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

// Test data files
const testFiles = {
  pdf: path.join(__dirname, '../../examples/table-invoice.pdf'),
  signature: path.join(__dirname, '../../examples/signature-contract.pdf'),
  watermark: path.join(__dirname, '../../examples/watermark-confidential.pdf'),
  multilingual: path.join(__dirname, '../../examples/multilingual-spanish.pdf'),
  handwriting: path.join(__dirname, '../../examples/handwriting-notes.pdf')
};

test.describe('Preview UI E2E Tests', () => {
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

  test('should show confidence and source in preview table', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check preview table headers
    const headers = page.locator('#previewTable thead th');
    await expect(headers).toContainText(['Original Filename', 'Client', 'Date', 'Document Type', 'Source', 'Confidence', 'Tables', 'Snippets', 'Proposed Filename', 'Status']);
    
    // Check that preview data shows confidence and source
    const previewRow = page.locator('#previewTableBody tr').first();
    
    // Source column (5th column)
    const sourceCell = previewRow.locator('td:nth-child(5)');
    await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
    
    // Confidence column (6th column)
    const confidenceCell = previewRow.locator('td:nth-child(6)');
    await expect(confidenceCell).toContainText(/\d+%/);
    
    // Verify confidence is a valid percentage
    const confidenceText = await confidenceCell.textContent();
    const confidenceValue = parseInt(confidenceText.replace('%', ''));
    expect(confidenceValue).toBeGreaterThanOrEqual(0);
    expect(confidenceValue).toBeLessThanOrEqual(100);
  });

  test('should display AI-extracted metadata in preview', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    
    // Check that AI-extracted data is displayed
    const clientCell = previewRow.locator('td:nth-child(2)');
    await expect(clientCell).not.toBeEmpty();
    await expect(clientCell).not.toContainText('Unknown');
    
    const typeCell = previewRow.locator('td:nth-child(4)');
    await expect(typeCell).not.toBeEmpty();
    await expect(typeCell).not.toContainText('Unclassified');
    
    const dateCell = previewRow.locator('td:nth-child(3)');
    await expect(dateCell).not.toBeEmpty();
    await expect(dateCell).not.toContainText('Unknown');
    
    // Check proposed filename is generated
    const filenameCell = previewRow.locator('td:nth-child(9)');
    await expect(filenameCell).not.toBeEmpty();
    await expect(filenameCell).toContainText(/\.pdf$/);
  });

  test('should show snippets in preview table', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const snippetsCell = previewRow.locator('td:nth-child(8)');
    
    // Check that snippets are displayed
    await expect(snippetsCell).toBeVisible();
    
    // Snippets should contain some text
    const snippetsText = await snippetsCell.textContent();
    expect(snippetsText.length).toBeGreaterThan(0);
  });

  test('should show table extraction results in preview', async ({ page }) => {
    // Upload document with tables
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const tableCell = previewRow.locator('td:nth-child(7)');
    
    // Check that table data is shown
    await expect(tableCell).toBeVisible();
    
    // If table data is present, it should be clickable
    const tableLink = tableCell.locator('a, button');
    if (await tableLink.count() > 0) {
      await expect(tableLink).toBeVisible();
      
      // Click on table link to open modal
      await tableLink.first().click();
      
      // Check that table modal opens
      await expect(page.locator('#tableModal')).toBeVisible();
      await expect(page.locator('#tableModal h2')).toContainText('Table Details');
      
      // Check that table details are shown
      const tableDetails = page.locator('#tableDetails');
      await expect(tableDetails).toBeVisible();
      
      // Close table modal
      await page.click('#closeTableModalBtn');
      await expect(page.locator('#tableModal')).not.toBeVisible();
    }
  });

  test('should show different source types based on processing method', async ({ page }) => {
    // Test with AI processing enabled
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const sourceCell = previewRow.locator('td:nth-child(5)');
    
    // Should show AI, Hybrid, or Regex
    const sourceText = await sourceCell.textContent();
    expect(['AI', 'Hybrid', 'Regex']).toContain(sourceText.trim());
  });

  test('should show confidence levels for different processing methods', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const confidenceCell = previewRow.locator('td:nth-child(6)');
    
    // Should show percentage confidence
    const confidenceText = await confidenceCell.textContent();
    expect(confidenceText).toMatch(/\d+%/);
    
    const confidenceValue = parseInt(confidenceText.replace('%', ''));
    expect(confidenceValue).toBeGreaterThanOrEqual(0);
    expect(confidenceValue).toBeLessThanOrEqual(100);
  });

  test('should handle multiple files in preview table', async ({ page }) => {
    // Upload multiple files
    const files = [testFiles.pdf, testFiles.signature, testFiles.watermark];
    await page.setInputFiles('#fileInput', files);
    await page.click('#startSortingBtn');
    
    // Wait for processing
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that all files are shown in preview
    const rows = page.locator('#previewTableBody tr');
    await expect(rows).toHaveCount(3);
    
    // Check each row has required data
    for (let i = 0; i < 3; i++) {
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

  test('should show processing status in preview table', async ({ page }) => {
    // Upload file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    
    // Wait for preview to appear
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const statusCell = previewRow.locator('td:nth-child(10)');
    
    // Check that status is shown
    await expect(statusCell).toBeVisible();
    
    // Status should indicate completion
    const statusText = await statusCell.textContent();
    expect(['Complete', 'Done', 'Finished', 'Processed']).toContain(statusText.trim());
  });

  test('should show proposed filenames in preview table', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    const previewRow = page.locator('#previewTableBody tr').first();
    const filenameCell = previewRow.locator('td:nth-child(9)');
    
    // Check that proposed filename is shown
    await expect(filenameCell).not.toBeEmpty();
    
    // Filename should contain relevant information
    const filenameText = await filenameCell.textContent();
    expect(filenameText).toContain('.pdf');
    expect(filenameText.length).toBeGreaterThan(5); // Should be more than just ".pdf"
  });

  test('should maintain preview data when switching between tabs', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Open settings modal
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    
    // Switch to diagnostics tab
    await page.click('[data-tab="diagnostics"]');
    await expect(page.locator('#diagnosticsTab')).toBeVisible();
    
    // Close modal
    await page.click('.close');
    
    // Verify preview data is still there
    await expect(page.locator('#previewTable')).toBeVisible();
    await expect(page.locator('#previewTableBody tr')).toHaveCount(1);
  });

  test('should show preview table with proper styling and layout', async ({ page }) => {
    // Upload and process file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check table styling
    const table = page.locator('#previewTable table');
    await expect(table).toBeVisible();
    
    // Check table headers are styled
    const headers = page.locator('#previewTable thead th');
    await expect(headers).toHaveCount(10); // Should have 10 columns
    
    // Check table body has data
    const bodyRows = page.locator('#previewTableBody tr');
    await expect(bodyRows).toHaveCount(1);
    
    // Check that table is responsive
    const tableContainer = page.locator('.table-container');
    await expect(tableContainer).toBeVisible();
  });
});
