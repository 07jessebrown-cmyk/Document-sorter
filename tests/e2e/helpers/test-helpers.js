// @ts-check
const path = require('path');
const fs = require('fs');

/**
 * Test helper functions for E2E tests
 */
class TestHelpers {
  /**
   * Get the path to a test file
   * @param {string} filename - The test file name
   * @returns {string} The full path to the test file
   */
  static getTestFile(filename) {
    return path.join(__dirname, '../../examples', filename);
  }

  /**
   * Create a temporary test file
   * @param {string} content - The file content
   * @param {string} extension - The file extension
   * @returns {string} The path to the created file
   */
  static createTempFile(content, extension = '.txt') {
    const tempPath = path.join(__dirname, `../../temp-test-${Date.now()}${extension}`);
    fs.writeFileSync(tempPath, content);
    return tempPath;
  }

  /**
   * Clean up temporary files
   * @param {string[]} filePaths - Array of file paths to clean up
   */
  static cleanupTempFiles(filePaths) {
    filePaths.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }

  /**
   * Wait for a condition to be true
   * @param {Function} condition - Function that returns a boolean
   * @param {number} timeout - Timeout in milliseconds
   * @param {number} interval - Check interval in milliseconds
   * @returns {Promise<boolean>} True if condition is met, false if timeout
   */
  static async waitForCondition(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    return false;
  }

  /**
   * Mock file upload for testing
   * @param {Object} page - Playwright page object
   * @param {string[]} filePaths - Array of file paths to upload
   */
  static async mockFileUpload(page, filePaths) {
    await page.setInputFiles('#fileInput', filePaths);
  }

  /**
   * Enable all AI features in settings
   * @param {Object} page - Playwright page object
   */
  static async enableAllAIFeatures(page) {
    await page.click('#settingsBtn');
    await page.check('#useAIToggle');
    await page.check('#useTableExtractionToggle');
    await page.check('#useOCRToggle');
    await page.check('#useLLMEnhancerToggle');
    await page.click('#saveSettings');
  }

  /**
   * Wait for preview table to appear and be populated
   * @param {Object} page - Playwright page object
   * @param {number} timeout - Timeout in milliseconds
   */
  static async waitForPreviewTable(page, timeout = 30000) {
    await page.waitForSelector('#previewTable', { state: 'visible', timeout });
    await page.waitForSelector('#previewTableBody tr', { state: 'visible', timeout: 5000 });
  }

  /**
   * Get preview table data
   * @param {Object} page - Playwright page object
   * @returns {Promise<Array>} Array of preview row data
   */
  static async getPreviewTableData(page) {
    const rows = await page.locator('#previewTableBody tr').all();
    const data = [];
    
    for (const row of rows) {
      const cells = await row.locator('td').all();
      const rowData = {
        originalFilename: await cells[0].textContent(),
        client: await cells[1].textContent(),
        date: await cells[2].textContent(),
        documentType: await cells[3].textContent(),
        source: await cells[4].textContent(),
        confidence: await cells[5].textContent(),
        tables: await cells[6].textContent(),
        snippets: await cells[7].textContent(),
        proposedFilename: await cells[8].textContent(),
        status: await cells[9].textContent()
      };
      data.push(rowData);
    }
    
    return data;
  }

  /**
   * Verify preview row has required data
   * @param {Object} rowData - Preview row data object
   * @returns {boolean} True if row has required data
   */
  static verifyPreviewRowData(rowData) {
    return (
      rowData.originalFilename &&
      rowData.originalFilename.trim() !== '' &&
      rowData.client &&
      rowData.client.trim() !== '' &&
      rowData.documentType &&
      rowData.documentType.trim() !== '' &&
      rowData.source &&
      ['AI', 'Hybrid', 'Regex'].includes(rowData.source.trim()) &&
      rowData.confidence &&
      rowData.confidence.match(/\d+%/) &&
      rowData.proposedFilename &&
      rowData.proposedFilename.trim() !== ''
    );
  }

  /**
   * Extract confidence percentage from confidence text
   * @param {string} confidenceText - Confidence text (e.g., "85%")
   * @returns {number} Confidence percentage as number
   */
  static extractConfidencePercentage(confidenceText) {
    const match = confidenceText.match(/(\d+)%/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Check if confidence is within valid range
   * @param {string} confidenceText - Confidence text
   * @returns {boolean} True if confidence is valid
   */
  static isValidConfidence(confidenceText) {
    const percentage = this.extractConfidencePercentage(confidenceText);
    return percentage >= 0 && percentage <= 100;
  }

  /**
   * Wait for processing to complete
   * @param {Object} page - Playwright page object
   * @param {number} timeout - Timeout in milliseconds
   */
  static async waitForProcessingComplete(page, timeout = 30000) {
    // Wait for either preview table or error status
    await Promise.race([
      page.waitForSelector('#previewTable', { state: 'visible', timeout }),
      page.waitForSelector('#status:has-text("error")', { state: 'visible', timeout })
    ]);
  }

  /**
   * Get processing status
   * @param {Object} page - Playwright page object
   * @returns {Promise<string>} Status text
   */
  static async getProcessingStatus(page) {
    const statusElement = page.locator('#status');
    return await statusElement.textContent();
  }

  /**
   * Check if processing completed successfully
   * @param {Object} page - Playwright page object
   * @returns {Promise<boolean>} True if processing completed successfully
   */
  static async isProcessingComplete(page) {
    const status = await this.getProcessingStatus(page);
    return status.toLowerCase().includes('complete') || 
           status.toLowerCase().includes('done') || 
           status.toLowerCase().includes('finished');
  }
}

module.exports = TestHelpers;
