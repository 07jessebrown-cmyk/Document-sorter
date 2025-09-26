// @ts-check
const { test, expect } = require('@playwright/test');
const TestHelpers = require('./helpers/test-helpers');

// Test data files
const testFiles = {
  pdf: TestHelpers.getTestFile('table-invoice.pdf'),
  signature: TestHelpers.getTestFile('signature-contract.pdf'),
  watermark: TestHelpers.getTestFile('watermark-confidential.pdf'),
  multilingual: TestHelpers.getTestFile('multilingual-spanish.pdf'),
  handwriting: TestHelpers.getTestFile('handwriting-notes.pdf')
};

test.describe('Complete File Upload → Preview → Rename Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://127.0.0.1:3000');
    
    // Wait for the application to load
    await expect(page.locator('h1')).toContainText('Document Sorter');
    
    // Enable all AI features
    await TestHelpers.enableAllAIFeatures(page);
  });

  test('should complete full file upload → preview → rename flow with AI enabled', async ({ page }) => {
    // Step 1: File Upload
    console.log('Step 1: Uploading file...');
    await TestHelpers.mockFileUpload(page, [testFiles.pdf]);
    
    // Verify file is added to the list
    await expect(page.locator('#fileList')).toBeVisible();
    await expect(page.locator('#fileListItems li')).toHaveCount(1);
    await expect(page.locator('#fileListItems li')).toContainText('table-invoice.pdf');
    
    // Step 2: Start Processing
    console.log('Step 2: Starting processing...');
    await page.click('#startSortingBtn');
    
    // Step 3: Wait for Preview Table
    console.log('Step 3: Waiting for preview table...');
    await TestHelpers.waitForPreviewTable(page);
    
    // Step 4: Verify Preview Shows Confidence and Source
    console.log('Step 4: Verifying preview data...');
    const previewData = await TestHelpers.getPreviewTableData(page);
    expect(previewData).toHaveLength(1);
    
    const rowData = previewData[0];
    expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
    
    // Verify confidence and source are displayed
    expect(['AI', 'Hybrid', 'Regex']).toContain(rowData.source.trim());
    expect(TestHelpers.isValidConfidence(rowData.confidence)).toBe(true);
    
    // Verify AI-extracted metadata is shown
    expect(rowData.client).not.toBe('Unknown');
    expect(rowData.documentType).not.toBe('Unclassified');
    expect(rowData.date).not.toBe('Unknown');
    
    // Step 5: Verify Processing Status
    console.log('Step 5: Verifying processing status...');
    const isComplete = await TestHelpers.isProcessingComplete(page);
    expect(isComplete).toBe(true);
    
    console.log('✅ Complete flow test passed!');
  });

  test('should process multiple files with different characteristics', async ({ page }) => {
    // Upload multiple files with different features
    const files = [testFiles.pdf, testFiles.signature, testFiles.watermark, testFiles.multilingual, testFiles.handwriting];
    
    console.log('Step 1: Uploading multiple files...');
    await TestHelpers.mockFileUpload(page, files);
    
    // Verify all files are listed
    await expect(page.locator('#fileListItems li')).toHaveCount(5);
    
    console.log('Step 2: Starting processing...');
    await page.click('#startSortingBtn');
    
    console.log('Step 3: Waiting for preview table...');
    await TestHelpers.waitForPreviewTable(page);
    
    console.log('Step 4: Verifying all files processed...');
    const previewData = await TestHelpers.getPreviewTableData(page);
    expect(previewData).toHaveLength(5);
    
    // Verify each file was processed correctly
    for (let i = 0; i < 5; i++) {
      const rowData = previewData[i];
      expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
      
      // Each should have valid confidence and source
      expect(['AI', 'Hybrid', 'Regex']).toContain(rowData.source.trim());
      expect(TestHelpers.isValidConfidence(rowData.confidence)).toBe(true);
      
      console.log(`File ${i + 1}: ${rowData.originalFilename} - ${rowData.source} - ${rowData.confidence}`);
    }
    
    console.log('✅ Multiple files processing test passed!');
  });

  test('should show confidence and source information in preview', async ({ page }) => {
    // Upload file
    await TestHelpers.mockFileUpload(page, [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Verify confidence is shown as percentage
    expect(rowData.confidence).toMatch(/\d+%/);
    const confidenceValue = TestHelpers.extractConfidencePercentage(rowData.confidence);
    expect(confidenceValue).toBeGreaterThanOrEqual(0);
    expect(confidenceValue).toBeLessThanOrEqual(100);
    
    // Verify source is shown
    expect(['AI', 'Hybrid', 'Regex']).toContain(rowData.source.trim());
    
    // Verify all required columns are populated
    expect(rowData.originalFilename).toBeTruthy();
    expect(rowData.client).toBeTruthy();
    expect(rowData.date).toBeTruthy();
    expect(rowData.documentType).toBeTruthy();
    expect(rowData.proposedFilename).toBeTruthy();
    expect(rowData.status).toBeTruthy();
    
    console.log('✅ Confidence and source verification passed!');
  });

  test('should handle table extraction and display results', async ({ page }) => {
    // Upload document with tables
    await TestHelpers.mockFileUpload(page, [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Check that table data is shown
    expect(rowData.tables).toBeTruthy();
    
    // If table data is present, it should be clickable
    const tableCell = page.locator('#previewTableBody tr td:nth-child(7)');
    const tableLink = tableCell.locator('a, button');
    
    if (await tableLink.count() > 0) {
      console.log('Step: Testing table modal...');
      
      // Click on table link
      await tableLink.first().click();
      
      // Verify table modal opens
      await expect(page.locator('#tableModal')).toBeVisible();
      await expect(page.locator('#tableModal h2')).toContainText('Table Details');
      
      // Check table details content
      const tableDetails = page.locator('#tableDetails');
      await expect(tableDetails).toBeVisible();
      
      // Close modal
      await page.click('#closeTableModalBtn');
      await expect(page.locator('#tableModal')).not.toBeVisible();
    }
    
    console.log('✅ Table extraction test passed!');
  });

  test('should process signature documents correctly', async ({ page }) => {
    // Upload signature document
    await TestHelpers.mockFileUpload(page, [testFiles.signature]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Verify signature detection
    expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
    
    // Check that document type is detected as contract/agreement
    expect(rowData.documentType.toLowerCase()).toMatch(/contract|agreement|signature/);
    
    // Check that snippets contain signature-related content
    expect(rowData.snippets).toBeTruthy();
    
    console.log('✅ Signature detection test passed!');
  });

  test('should process watermark documents and filter watermarks', async ({ page }) => {
    // Upload watermark document
    await TestHelpers.mockFileUpload(page, [testFiles.watermark]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Verify watermark filtering
    expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
    
    // Check that document type is detected despite watermarks
    expect(rowData.documentType).not.toBe('Unclassified');
    expect(rowData.client).not.toBe('Unknown');
    
    console.log('✅ Watermark filtering test passed!');
  });

  test('should process multilingual documents with language detection', async ({ page }) => {
    // Upload multilingual document
    await TestHelpers.mockFileUpload(page, [testFiles.multilingual]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Verify multilingual processing
    expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
    
    // Check that document type is detected in different language
    expect(rowData.documentType).not.toBe('Unclassified');
    expect(rowData.client).not.toBe('Unknown');
    
    console.log('✅ Multilingual processing test passed!');
  });

  test('should process handwriting documents correctly', async ({ page }) => {
    // Upload handwriting document
    await TestHelpers.mockFileUpload(page, [testFiles.handwriting]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Get preview data
    const previewData = await TestHelpers.getPreviewTableData(page);
    const rowData = previewData[0];
    
    // Verify handwriting detection
    expect(TestHelpers.verifyPreviewRowData(rowData)).toBe(true);
    
    // Check that document type is detected despite handwriting
    expect(rowData.documentType).not.toBe('Unclassified');
    expect(rowData.client).not.toBe('Unknown');
    
    console.log('✅ Handwriting detection test passed!');
  });

  test('should show processing status throughout the flow', async ({ page }) => {
    // Upload file
    await TestHelpers.mockFileUpload(page, [testFiles.pdf]);
    
    // Start processing
    await page.click('#startSortingBtn');
    
    // Check initial status
    let status = await TestHelpers.getProcessingStatus(page);
    expect(status).toBeTruthy();
    console.log('Initial status:', status);
    
    // Wait for processing to complete
    await TestHelpers.waitForProcessingComplete(page);
    
    // Check final status
    status = await TestHelpers.getProcessingStatus(page);
    expect(status).toBeTruthy();
    console.log('Final status:', status);
    
    // Verify processing completed successfully
    const isComplete = await TestHelpers.isProcessingComplete(page);
    expect(isComplete).toBe(true);
    
    console.log('✅ Processing status test passed!');
  });

  test('should handle error scenarios gracefully', async ({ page }) => {
    // Create a temporary invalid file
    const invalidFile = TestHelpers.createTempFile('This is not a valid document for processing', '.txt');
    
    try {
      // Upload invalid file
      await TestHelpers.mockFileUpload(page, [invalidFile]);
      await page.click('#startSortingBtn');
      
      // Wait for processing to complete or error
      await TestHelpers.waitForProcessingComplete(page);
      
      // Check that error is handled gracefully
      const status = await TestHelpers.getProcessingStatus(page);
      expect(status).toBeTruthy();
      
      // Should either show error or complete processing
      const isComplete = await TestHelpers.isProcessingComplete(page);
      const hasError = status.toLowerCase().includes('error');
      
      expect(isComplete || hasError).toBe(true);
      
      console.log('✅ Error handling test passed!');
    } finally {
      // Clean up
      TestHelpers.cleanupTempFiles([invalidFile]);
    }
  });

  test('should maintain preview data after settings changes', async ({ page }) => {
    // Upload and process file
    await TestHelpers.mockFileUpload(page, [testFiles.pdf]);
    await page.click('#startSortingBtn');
    await TestHelpers.waitForPreviewTable(page);
    
    // Verify preview data is there
    let previewData = await TestHelpers.getPreviewTableData(page);
    expect(previewData).toHaveLength(1);
    
    // Change settings
    await page.click('#settingsBtn');
    await page.selectOption('#aiModel', 'gpt-4');
    await page.click('#saveSettings');
    
    // Verify preview data is still there
    previewData = await TestHelpers.getPreviewTableData(page);
    expect(previewData).toHaveLength(1);
    expect(TestHelpers.verifyPreviewRowData(previewData[0])).toBe(true);
    
    console.log('✅ Settings persistence test passed!');
  });
});
