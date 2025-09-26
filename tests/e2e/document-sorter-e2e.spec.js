// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Test data files
const testFiles = {
  pdf: path.join(__dirname, '../../examples/table-invoice.pdf'),
  docx: path.join(__dirname, '../../examples/multilingual-spanish.pdf'), // Using PDF as DOCX for now
  image: path.join(__dirname, '../../examples/handwriting-notes.pdf'), // Using PDF as image for now
  signature: path.join(__dirname, '../../examples/signature-contract.pdf'),
  watermark: path.join(__dirname, '../../examples/watermark-confidential.pdf')
};

test.describe('Document Sorter E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://127.0.0.1:3000');
    
    // Wait for the application to load
    await expect(page.locator('h1')).toContainText('Document Sorter');
    await expect(page.locator('.version')).toContainText('v1.1 (AI Enhanced)');
  });

  test('should display the main interface correctly', async ({ page }) => {
    // Check main UI elements
    await expect(page.locator('h1')).toContainText('Document Sorter');
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('#browseBtn')).toBeVisible();
    await expect(page.locator('#startSortingBtn')).toBeVisible();
    await expect(page.locator('#settingsBtn')).toBeVisible();
    
    // Check drop zone content
    await expect(page.locator('.drop-zone-content h2')).toContainText('Drag and drop files here');
    await expect(page.locator('.drop-zone-content p')).toContainText('Or click to browse files');
  });

  test('should open and close settings modal', async ({ page }) => {
    // Open settings modal
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('.modal-header h2')).toContainText('Settings');
    
    // Check settings tabs
    await expect(page.locator('[data-tab="settings"]')).toBeVisible();
    await expect(page.locator('[data-tab="diagnostics"]')).toBeVisible();
    
    // Check AI settings
    await expect(page.locator('#useAIToggle')).toBeVisible();
    await expect(page.locator('#aiConfidenceThreshold')).toBeVisible();
    await expect(page.locator('#aiModel')).toBeVisible();
    
    // Check extraction settings
    await expect(page.locator('#useOCRToggle')).toBeVisible();
    await expect(page.locator('#useTableExtractionToggle')).toBeVisible();
    await expect(page.locator('#useLLMEnhancerToggle')).toBeVisible();
    
    // Close modal
    await page.click('.close');
    await expect(page.locator('#settingsModal')).not.toBeVisible();
  });

  test('should toggle AI settings correctly', async ({ page }) => {
    // Open settings modal
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    
    // Toggle AI processing
    const aiToggle = page.locator('#useAIToggle');
    await aiToggle.click();
    await expect(aiToggle).toBeChecked();
    
    // Adjust confidence threshold
    const confidenceSlider = page.locator('#aiConfidenceThreshold');
    await confidenceSlider.fill('0.7');
    await expect(page.locator('#confidenceValue')).toContainText('70%');
    
    // Change AI model
    await page.selectOption('#aiModel', 'gpt-4');
    await expect(page.locator('#aiModel')).toHaveValue('gpt-4');
    
    // Save settings
    await page.click('#saveSettings');
    await expect(page.locator('#settingsModal')).not.toBeVisible();
  });

  test('should handle file upload via browse button', async ({ page }) => {
    // Mock file upload
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    
    // Check that file list appears
    await expect(page.locator('#fileList')).toBeVisible();
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
    await expect(page.locator('#fileListItems li')).toContainText('table-invoice.pdf');
  });

  test('should handle drag and drop file upload', async ({ page }) => {
    // Create a mock file for drag and drop
    const fileBuffer = fs.readFileSync(testFiles.pdf);
    
    // Simulate drag and drop
    await page.dispatchEvent('#dropZone', 'dragover', { dataTransfer: new DataTransfer() });
    await page.dispatchEvent('#dropZone', 'drop', {
      dataTransfer: {
        files: [new File([fileBuffer], 'test-document.pdf', { type: 'application/pdf' })]
      }
    });
    
    // Check that file list appears
    await expect(page.locator('#fileList')).toBeVisible();
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
  });

  test('should process files and show preview with AI enabled', async ({ page }) => {
    // Enable AI processing in settings
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.click('#saveSettings');
    
    // Upload a file
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await expect(page.locator('#fileList')).toBeVisible();
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Wait for processing to complete and preview to appear
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check preview table headers
    await expect(page.locator('#previewTable thead th')).toContainText(['Original Filename', 'Client', 'Date', 'Document Type', 'Source', 'Confidence', 'Tables', 'Snippets', 'Proposed Filename', 'Status']);
    
    // Check that preview data is populated
    const tableBody = page.locator('#previewTableBody');
    await expect(tableBody.locator('tr')).toHaveCount(1);
    
    // Check that AI source is shown
    const sourceCell = tableBody.locator('tr td:nth-child(5)');
    await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
    
    // Check that confidence is shown
    const confidenceCell = tableBody.locator('tr td:nth-child(6)');
    await expect(confidenceCell).toContainText(/\d+%/);
  });

  test('should show confidence and source information in preview', async ({ page }) => {
    // Enable AI processing
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.check('#useTableExtractionToggle');
    await page.click('#saveSettings');
    
    // Upload multiple files
    await page.setInputFiles('#fileInput', [testFiles.pdf, testFiles.signature, testFiles.watermark]);
    await expect(page.locator('#fileListItems li')).toHaveCount(3);
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Wait for preview table
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check each row has required data
    const rows = page.locator('#previewTableBody tr');
    await expect(rows).toHaveCount(3);
    
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      
      // Check source column (5th column)
      const sourceCell = row.locator('td:nth-child(5)');
      await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
      
      // Check confidence column (6th column)
      const confidenceCell = row.locator('td:nth-child(6)');
      await expect(confidenceCell).toContainText(/\d+%/);
      
      // Check that client name is populated
      const clientCell = row.locator('td:nth-child(2)');
      await expect(clientCell).not.toBeEmpty();
      
      // Check that document type is populated
      const typeCell = row.locator('td:nth-child(4)');
      await expect(typeCell).not.toBeEmpty();
      
      // Check that proposed filename is generated
      const filenameCell = row.locator('td:nth-child(9)');
      await expect(filenameCell).not.toBeEmpty();
    }
  });

  test('should handle table extraction and display table details', async ({ page }) => {
    // Enable table extraction
    await page.click('#settingsBtn');
    await page.check('#useTableExtractionToggle');
    await page.click('#saveSettings');
    
    // Upload a file with tables
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await page.click('#startSortingBtn');
    
    // Wait for preview
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check if table data is shown in the Tables column
    const tableCell = page.locator('#previewTableBody tr td:nth-child(7)');
    await expect(tableCell).toBeVisible();
    
    // If table data is present, check that it's clickable
    const tableLink = tableCell.locator('a, button');
    if (await tableLink.count() > 0) {
      await tableLink.first().click();
      
      // Check that table modal opens
      await expect(page.locator('#tableModal')).toBeVisible();
      await expect(page.locator('#tableModal h2')).toContainText('Table Details');
      
      // Close table modal
      await page.click('#closeTableModalBtn');
      await expect(page.locator('#tableModal')).not.toBeVisible();
    }
  });

  test('should show processing status and progress', async ({ page }) => {
    // Upload files
    await page.setInputFiles('#fileInput', [testFiles.pdf, testFiles.signature]);
    await page.click('#startSortingBtn');
    
    // Check that status updates are shown
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();
    
    // Wait for processing to complete
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Check that status shows completion
    await expect(statusElement).toContainText(/complete|done|finished/i);
  });

  test('should handle error scenarios gracefully', async ({ page }) => {
    // Upload an invalid file (empty file)
    const emptyFile = path.join(__dirname, '../../test-document.html'); // Use existing test file
    await page.setInputFiles('#fileInput', [emptyFile]);
    await page.click('#startSortingBtn');
    
    // Check that error is handled gracefully
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();
    
    // Should either show error or complete processing
    await expect(statusElement).toContainText(/error|complete|done|finished/i);
  });

  test('should display diagnostics information', async ({ page }) => {
    // Open settings and go to diagnostics tab
    await page.click('#settingsBtn');
    await page.click('[data-tab="diagnostics"]');
    
    // Check diagnostics sections
    await expect(page.locator('#diagnosticsTab')).toBeVisible();
    await expect(page.locator('.diagnostics-section h3')).toContainText(['AI Performance', 'Cache Performance', 'Processing Statistics', 'System Performance', 'Error Log']);
    
    // Check diagnostic values are displayed
    await expect(page.locator('#totalAICalls')).toBeVisible();
    await expect(page.locator('#successfulAICalls')).toBeVisible();
    await expect(page.locator('#cacheHits')).toBeVisible();
    await expect(page.locator('#totalFiles')).toBeVisible();
    
    // Test refresh diagnostics
    await page.click('#refreshDiagnostics');
    
    // Test clear telemetry
    await page.click('#clearTelemetry');
    
    // Test export telemetry
    await page.click('#exportTelemetry');
  });

  test('should handle multiple file processing with different types', async ({ page }) => {
    // Enable all features
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.check('#useOCRToggle');
    await page.check('#useTableExtractionToggle');
    await page.check('#useLLMEnhancerToggle');
    await page.click('#saveSettings');
    
    // Upload multiple different file types
    const files = [testFiles.pdf, testFiles.signature, testFiles.watermark, testFiles.image];
    await page.setInputFiles('#fileInput', files);
    
    // Verify all files are listed
    await expect(page.locator('#fileListItems li')).toHaveCount(4);
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Wait for processing to complete
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
    
    // Verify all files are processed
    const rows = page.locator('#previewTableBody tr');
    await expect(rows).toHaveCount(4);
    
    // Check that each file has been processed with appropriate metadata
    for (let i = 0; i < 4; i++) {
      const row = rows.nth(i);
      
      // Each row should have source and confidence
      const sourceCell = row.locator('td:nth-child(5)');
      const confidenceCell = row.locator('td:nth-child(6)');
      
      await expect(sourceCell).toContainText(/AI|Hybrid|Regex/);
      await expect(confidenceCell).toContainText(/\d+%/);
    }
  });

  test('should maintain state across settings changes', async ({ page }) => {
    // Upload files first
    await page.setInputFiles('#fileInput', [testFiles.pdf]);
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
    
    // Change settings
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.selectOption('#aiModel', 'gpt-4');
    await page.click('#saveSettings');
    
    // Verify files are still there
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
    
    // Process files
    await page.click('#startSortingBtn');
    await expect(page.locator('#previewTable')).toBeVisible({ timeout: 30000 });
  });
});
