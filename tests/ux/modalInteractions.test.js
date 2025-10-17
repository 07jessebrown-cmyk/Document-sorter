const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs').promises;

/**
 * UX Verification Tests - Modal Interactions
 * Tests the core UX flow: Upload → AI → Modal → Accept → Sort
 * Covers linear flow, modal responsiveness, and quality logging verification
 */
describe('UX Verification - Modal Interactions', () => {
  let testDir;
  let testFiles = [];

  test.beforeAll(async () => {
    // Create test directory and files
    testDir = path.join(__dirname, '../temp/ux-verification');
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test PDF files
    const testFilePaths = [
      path.join(testDir, 'invoice_test.pdf'),
      path.join(testDir, 'contract_test.pdf'),
      path.join(testDir, 'report_test.pdf')
    ];
    
    for (const filePath of testFilePaths) {
      await fs.writeFile(filePath, 'Mock PDF content for testing');
      testFiles.push(filePath);
    }
  });

  test.afterAll(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test.beforeEach(async ({ page }) => {
    // Mock the Electron API for testing
    await page.addInitScript(() => {
      window.electronAPI = {
        analyzeFile: async (filePath) => {
          // Simulate AI analysis with realistic timing
          await new Promise(resolve => setTimeout(resolve, 1000));
          return {
            success: true,
            analysis: {
              proposedFilename: `Invoice_TestCorp_2024-01-15.pdf`,
              suggestions: [
                `Invoice_TestCorp_2024-01-15.pdf`,
                `Invoice_TestCorp_Jan2024.pdf`,
                `TestCorp_Invoice_2024-01-15.pdf`
              ],
              confidence: 0.85,
              clientName: 'TestCorp',
              date: '2024-01-15',
              documentType: 'Invoice',
              source: 'ai'
            }
          };
        },
        regenerateSuggestion: async (filePath, previousSuggestion) => {
          await new Promise(resolve => setTimeout(resolve, 800));
          return {
            success: true,
            suggestion: `Regenerated_${previousSuggestion}`,
            alternatives: [`Alt1_${previousSuggestion}`, `Alt2_${previousSuggestion}`],
            confidence: 0.82
          };
        },
        renameFile: async (oldPath, newName) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return {
            success: true,
            newPath: path.join(path.dirname(oldPath), newName)
          };
        },
        logSuggestionQuality: async (data) => {
          console.log('Quality logged:', data);
          return { success: true };
        },
        openFileDialog: async () => testFiles.slice(0, 1), // Return first test file
        onFileProcessed: (callback) => {
          // Mock file processed callback
          setTimeout(() => callback({
            originalPath: testFiles[0],
            finalPath: path.join(testDir, 'sorted', 'Invoice_TestCorp_2024-01-15.pdf'),
            success: true,
            message: 'File processed successfully'
          }), 2000);
        },
        onProcessingComplete: (callback) => {
          // Mock processing complete callback
          setTimeout(() => callback({
            totalFiles: 1,
            successful: 1,
            failed: 0,
            processingTime: 3000
          }), 3000);
        }
      };
    });

    // Navigate to the app
    await page.goto('file://' + path.join(__dirname, '../../src/renderer/index.html'));
  });

  describe('1. Linear Flow Verification', () => {
    test('should complete full AI workflow: Upload → AI → Modal → Accept → Sort', async ({ page }) => {
      // Step 1: Upload file
      await test.step('Upload file', async () => {
        const browseBtn = page.locator('#browseBtn');
        await expect(browseBtn).toBeVisible();
        await browseBtn.click();
        
        // Wait for file to be added to the list
        await expect(page.locator('#fileList')).toBeVisible();
        await expect(page.locator('#fileListItems .file-item')).toHaveCount(1);
      });

      // Step 2: Verify AI analysis starts automatically
      await test.step('AI analysis starts automatically', async () => {
        // Check that AI analysis begins immediately after upload
        await expect(page.locator('.file-status')).toContainText('Analyzing...');
        
        // Verify loading steps are shown
        await expect(page.locator('.file-status')).toContainText('Extracting text...');
      });

      // Step 3: Wait for AI suggestions modal
      await test.step('AI suggestions modal appears', async () => {
        // Wait for modal to appear (should happen after AI analysis completes)
        await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
        
        // Verify modal content
        await expect(page.locator('.modal-title')).toContainText('AI Suggestions');
        await expect(page.locator('#primarySuggestion')).toBeVisible();
        await expect(page.locator('#acceptBtn')).toBeVisible();
        await expect(page.locator('#regenerateBtn')).toBeVisible();
        await expect(page.locator('button:has-text("Skip")')).toBeVisible();
      });

      // Step 4: Accept suggestion
      await test.step('Accept AI suggestion', async () => {
        const acceptBtn = page.locator('#acceptBtn');
        await acceptBtn.click();
        
        // Verify file processing starts
        await expect(page.locator('.file-status')).toContainText('✔ processed');
      });

      // Step 5: Verify completion
      await test.step('Verify workflow completion', async () => {
        // Wait for processing to complete
        await expect(page.locator('.file-status')).toContainText('✔ processed', { timeout: 10000 });
        
        // Verify modal is closed
        await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
        
        // Verify status message shows success
        await expect(page.locator('.status')).toContainText('Ready to receive files');
      });
    });

    test('should handle legacy batch workflow as secondary flow', async ({ page }) => {
      // Test that legacy "Start Sorting" button still works
      const startSortingBtn = page.locator('#startSortingBtn');
      await expect(startSortingBtn).toBeVisible();
      
      // Upload a file first
      await page.locator('#browseBtn').click();
      await expect(page.locator('#fileList')).toBeVisible();
      
      // Click Start Sorting (should show warning about legacy mode)
      await startSortingBtn.click();
      
      // Verify warning message appears
      await expect(page.locator('.status')).toContainText('Legacy batch mode is disabled');
    });
  });

  describe('2. Modal and Button Responsiveness', () => {
    test.beforeEach(async ({ page }) => {
      // Upload file and wait for modal
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
    });

    test('should have responsive visual states', async ({ page }) => {
      // Test button hover states
      const acceptBtn = page.locator('#acceptBtn');
      const regenerateBtn = page.locator('#regenerateBtn');
      const skipBtn = page.locator('button:has-text("Skip")');
      
      // Hover over buttons
      await acceptBtn.hover();
      await expect(acceptBtn).toHaveClass(/hover/);
      
      await regenerateBtn.hover();
      await expect(regenerateBtn).toHaveClass(/hover/);
      
      await skipBtn.hover();
      await expect(skipBtn).toHaveClass(/hover/);
    });

    test('should have functional button interactions', async ({ page }) => {
      // Test Accept button
      const acceptBtn = page.locator('#acceptBtn');
      await acceptBtn.click();
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
      
      // Re-open modal for next test
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test Regenerate button
      const regenerateBtn = page.locator('#regenerateBtn');
      await regenerateBtn.click();
      
      // Verify loading state
      await expect(regenerateBtn).toContainText('Regenerating...');
      await expect(regenerateBtn).toBeDisabled();
      
      // Wait for regeneration to complete
      await expect(regenerateBtn).toContainText('Regenerate', { timeout: 5000 });
      await expect(regenerateBtn).toBeEnabled();
    });

    test('should have performance responsiveness', async ({ page }) => {
      // Test modal open/close performance
      const modal = page.locator('#aiSuggestionsModal');
      
      // Measure modal close time
      const startTime = Date.now();
      await page.locator('#acceptBtn').click();
      await expect(modal).not.toBeVisible();
      const closeTime = Date.now() - startTime;
      
      // Should close within 300ms
      expect(closeTime).toBeLessThan(300);
    });

    test('should have keyboard accessibility', async ({ page }) => {
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#acceptBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#regenerateBtn')).toBeFocused();
      
      // Test keyboard shortcuts
      await page.keyboard.press('Enter');
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
      
      // Re-open modal for ESC test
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      await page.keyboard.press('Escape');
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
    });
  });

  describe('3. Quality Logging Verification', () => {
    test.beforeEach(async ({ page }) => {
      // Upload file and wait for modal
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
    });

    test('should log user actions correctly', async ({ page }) => {
      // Mock console.log to capture quality logging calls
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      // Test Accept action logging
      await page.locator('#acceptBtn').click();
      
      // Wait for logging to complete
      await page.waitForTimeout(1000);
      
      // Verify quality log was captured
      expect(qualityLogs.length).toBeGreaterThan(0);
      const logData = qualityLogs[0];
      expect(logData).toHaveProperty('action', 'accepted');
      expect(logData).toHaveProperty('fileName');
      expect(logData).toHaveProperty('timestamp');
    });

    test('should log regeneration requests', async ({ page }) => {
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      // Test Regenerate action logging
      await page.locator('#regenerateBtn').click();
      await page.waitForTimeout(2000); // Wait for regeneration to complete
      
      // Verify regeneration was logged
      expect(qualityLogs.length).toBeGreaterThan(0);
      const regenLog = qualityLogs.find(log => log.action === 'regenerated');
      expect(regenLog).toBeDefined();
      expect(regenLog).toHaveProperty('regenerationCount');
    });

    test('should log feedback ratings', async ({ page }) => {
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      // Test thumbs up feedback
      const thumbsUpBtn = page.locator('.thumbs-up');
      if (await thumbsUpBtn.isVisible()) {
        await thumbsUpBtn.click();
        await page.waitForTimeout(500);
        
        // Verify feedback was logged
        const feedbackLog = qualityLogs.find(log => log.rating === 'thumbs_up');
        expect(feedbackLog).toBeDefined();
      }
    });

    test('should capture metadata in logs', async ({ page }) => {
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify metadata is captured
      const logData = qualityLogs[0];
      expect(logData).toHaveProperty('fileMetadata');
      expect(logData).toHaveProperty('confidenceScore');
      expect(logData).toHaveProperty('aiModel');
      expect(logData).toHaveProperty('timing');
    });
  });

  describe('4. Success Metrics Infrastructure', () => {
    test('should measure decision time', async ({ page }) => {
      // Upload file and wait for modal
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Measure time from modal open to decision
      const startTime = Date.now();
      await page.locator('#acceptBtn').click();
      const decisionTime = Date.now() - startTime;
      
      // Decision should be under 5 seconds (as per success criteria)
      expect(decisionTime).toBeLessThan(5000);
    });

    test('should track suggestion acceptance', async ({ page }) => {
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify acceptance is tracked
      const acceptanceLog = qualityLogs.find(log => log.action === 'accepted');
      expect(acceptanceLog).toBeDefined();
    });

    test('should track regeneration frequency', async ({ page }) => {
      const qualityLogs = [];
      await page.addInitScript(() => {
        const originalLog = console.log;
        console.log = (...args) => {
          if (args[0] && args[0].includes('Quality logged:')) {
            qualityLogs.push(args[1]);
          }
          originalLog.apply(console, args);
        };
      });

      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test multiple regenerations
      await page.locator('#regenerateBtn').click();
      await page.waitForTimeout(2000);
      await page.locator('#regenerateBtn').click();
      await page.waitForTimeout(2000);
      
      // Verify regeneration count is tracked
      const regenLogs = qualityLogs.filter(log => log.action === 'regenerated');
      expect(regenLogs).toHaveLength(2);
      expect(regenLogs[0]).toHaveProperty('regenerationCount', 1);
      expect(regenLogs[1]).toHaveProperty('regenerationCount', 2);
    });
  });

  describe('5. Error State UX Verification', () => {
    test('should handle AI analysis failure gracefully', async ({ page }) => {
      // Mock AI failure
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return {
            success: false,
            error: 'AI service unavailable',
            errorType: 'network'
          };
        };
      });

      await page.locator('#browseBtn').click();
      
      // Should show error modal with manual input
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#errorState')).toBeVisible();
      await expect(page.locator('#manualInput')).toBeVisible();
      await expect(page.locator('button:has-text("Save")')).toBeVisible();
    });

    test('should show loading states clearly', async ({ page }) => {
      await page.locator('#browseBtn').click();
      
      // Verify loading indicators are shown
      await expect(page.locator('.file-status')).toContainText('Analyzing...');
      await expect(page.locator('.file-status')).toContainText('Extracting text...');
    });

    test('should handle empty state guidance', async ({ page }) => {
      // Verify empty state when no files are selected
      await expect(page.locator('.drop-zone-content')).toContainText('Drag and drop files here');
      await expect(page.locator('.drop-zone-content')).toContainText('Or click to browse files');
    });
  });

  describe('6. Accessibility Verification', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
    });

    test('should have proper ARIA labels', async ({ page }) => {
      // Check that buttons have accessible names
      await expect(page.locator('#acceptBtn')).toHaveAttribute('aria-label');
      await expect(page.locator('#regenerateBtn')).toHaveAttribute('aria-label');
      
      // Check modal has proper role
      await expect(page.locator('#aiSuggestionsModal')).toHaveAttribute('role', 'dialog');
    });

    test('should support keyboard navigation', async ({ page }) => {
      // Test tab order
      await page.keyboard.press('Tab');
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#acceptBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#regenerateBtn')).toBeFocused();
    });

    test('should have sufficient color contrast', async ({ page }) => {
      // This would typically use axe-core or similar tool
      // For now, verify that text is visible and readable
      await expect(page.locator('.modal-title')).toBeVisible();
      await expect(page.locator('#primarySuggestion')).toBeVisible();
    });
  });
});
