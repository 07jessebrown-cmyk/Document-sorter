const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * UX Verification Tests - Feedback Logging
 * Tests quality logging, user interaction tracking, and feedback collection
 */
describe('UX Verification - Feedback Logging', () => {
  let testDir;
  let qualityLogs = [];

  test.beforeAll(async () => {
    testDir = path.join(__dirname, '../temp/feedback-logging');
    await require('fs').promises.mkdir(testDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    // Reset logs for each test
    qualityLogs = [];

    // Mock console.log to capture quality logging calls
    await page.addInitScript(() => {
      const originalLog = console.log;
      console.log = (...args) => {
        if (args[0] && args[0].includes('Quality logged:')) {
          qualityLogs.push(args[1]);
        }
        originalLog.apply(console, args);
      };
    });

    // Mock Electron API with logging
    await page.addInitScript(() => {
      window.electronAPI = {
        analyzeFile: async (filePath) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return {
            success: true,
            analysis: {
              proposedFilename: 'Test_Document_2024-01-15.pdf',
              suggestions: [
                'Test_Document_2024-01-15.pdf',
                'Test_Doc_2024.pdf',
                'Document_Test_2024.pdf'
              ],
              confidence: 0.85,
              clientName: 'TestCorp',
              date: '2024-01-15',
              documentType: 'Invoice',
              source: 'ai',
              aiModel: 'gpt-4-turbo',
              processingTimeMs: 1200
            }
          };
        },
        regenerateSuggestion: async (filePath, previousSuggestion) => {
          await new Promise(resolve => setTimeout(resolve, 800));
          return {
            success: true,
            suggestion: 'Regenerated_Test_Document_2024-01-15.pdf',
            alternatives: ['Alt1.pdf', 'Alt2.pdf'],
            confidence: 0.82,
            regenerationAttempt: 1,
            temperature: 0.8
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
        openFileDialog: async () => [path.join(testDir, 'test.pdf')],
        onFileProcessed: (callback) => {
          setTimeout(() => callback({
            originalPath: path.join(testDir, 'test.pdf'),
            finalPath: path.join(testDir, 'sorted', 'Test_Document_2024-01-15.pdf'),
            success: true,
            message: 'File processed successfully'
          }), 2000);
        },
        onProcessingComplete: (callback) => {
          setTimeout(() => callback({
            totalFiles: 1,
            successful: 1,
            failed: 0,
            processingTime: 3000
          }), 3000);
        }
      };
    });

    await page.goto('file://' + path.join(__dirname, '../../src/renderer/index.html'));
  });

  describe('User Action Logging', () => {
    test('should log Accept action with complete metadata', async ({ page }) => {
      // Upload file and wait for modal
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Accept suggestion
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify logging
      expect(qualityLogs.length).toBeGreaterThan(0);
      const acceptLog = qualityLogs.find(log => log.action === 'accepted');
      expect(acceptLog).toBeDefined();
      
      // Verify metadata
      expect(acceptLog).toHaveProperty('timestamp');
      expect(acceptLog).toHaveProperty('fileName');
      expect(acceptLog).toHaveProperty('finalSuggestion');
      expect(acceptLog).toHaveProperty('confidenceScore');
      expect(acceptLog).toHaveProperty('fileMetadata');
      expect(acceptLog).toHaveProperty('timing');
      expect(acceptLog).toHaveProperty('aiModel');
      expect(acceptLog).toHaveProperty('source');
    });

    test('should log Reject action with context', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Skip suggestion (acts as reject)
      await page.locator('button:has-text("Skip")').click();
      await page.waitForTimeout(1000);
      
      // Verify logging
      const rejectLog = qualityLogs.find(log => log.action === 'rejected' || log.action === 'skipped');
      expect(rejectLog).toBeDefined();
      expect(rejectLog).toHaveProperty('timestamp');
      expect(rejectLog).toHaveProperty('fileName');
      expect(rejectLog).toHaveProperty('previousSuggestion');
    });

    test('should log Regenerate action with attempt count', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Regenerate suggestion
      await page.locator('#regenerateBtn').click();
      await page.waitForTimeout(2000);
      
      // Verify logging
      const regenLog = qualityLogs.find(log => log.action === 'regenerated');
      expect(regenLog).toBeDefined();
      expect(regenLog).toHaveProperty('regenerationCount');
      expect(regenLog).toHaveProperty('previousSuggestion');
      expect(regenLog).toHaveProperty('finalSuggestion');
      expect(regenLog.regenerationCount).toBe(1);
    });

    test('should log Edit action with before/after values', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Edit the suggestion
      const input = page.locator('#primarySuggestion');
      await input.clear();
      await input.fill('Edited_Document_2024-01-15.pdf');
      
      // Accept the edited suggestion
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify logging
      const editLog = qualityLogs.find(log => log.action === 'edited');
      expect(editLog).toBeDefined();
      expect(editLog).toHaveProperty('previousSuggestion');
      expect(editLog).toHaveProperty('finalSuggestion');
      expect(editLog.finalSuggestion).toBe('Edited_Document_2024-01-15.pdf');
    });
  });

  describe('Quality Feedback Logging', () => {
    test('should log thumbs up feedback', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Click thumbs up if available
      const thumbsUpBtn = page.locator('.thumbs-up');
      if (await thumbsUpBtn.isVisible()) {
        await thumbsUpBtn.click();
        await page.waitForTimeout(500);
        
        // Verify logging
        const feedbackLog = qualityLogs.find(log => log.rating === 'thumbs_up');
        expect(feedbackLog).toBeDefined();
        expect(feedbackLog).toHaveProperty('timestamp');
        expect(feedbackLog).toHaveProperty('fileName');
        expect(feedbackLog).toHaveProperty('action');
      }
    });

    test('should log thumbs down feedback', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Click thumbs down if available
      const thumbsDownBtn = page.locator('.thumbs-down');
      if (await thumbsDownBtn.isVisible()) {
        await thumbsDownBtn.click();
        await page.waitForTimeout(500);
        
        // Verify logging
        const feedbackLog = qualityLogs.find(log => log.rating === 'thumbs_down');
        expect(feedbackLog).toBeDefined();
        expect(feedbackLog).toHaveProperty('timestamp');
        expect(feedbackLog).toHaveProperty('fileName');
        expect(feedbackLog).toHaveProperty('action');
      }
    });

    test('should log feedback context and timing', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Give feedback
      const thumbsUpBtn = page.locator('.thumbs-up');
      if (await thumbsUpBtn.isVisible()) {
        await thumbsUpBtn.click();
        await page.waitForTimeout(500);
        
        // Verify detailed logging
        const feedbackLog = qualityLogs.find(log => log.rating === 'thumbs_up');
        expect(feedbackLog).toHaveProperty('feedbackContext');
        expect(feedbackLog).toHaveProperty('timing');
        expect(feedbackLog).toHaveProperty('confidenceScore');
        expect(feedbackLog).toHaveProperty('aiModel');
      }
    });
  });

  describe('System Event Logging', () => {
    test('should log AI analysis start and completion', async ({ page }) => {
      await page.locator('#browseBtn').click();
      
      // Wait for AI analysis to complete
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Check for system event logs
      const systemLogs = qualityLogs.filter(log => log.source === 'system');
      expect(systemLogs.length).toBeGreaterThan(0);
      
      // Should have analysis start and completion logs
      const startLog = systemLogs.find(log => log.event === 'ai_analysis_start');
      const completeLog = systemLogs.find(log => log.event === 'ai_analysis_complete');
      
      expect(startLog).toBeDefined();
      expect(completeLog).toBeDefined();
    });

    test('should log file operation events', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      
      // Wait for file operation to complete
      await page.waitForTimeout(3000);
      
      // Check for file operation logs
      const fileLogs = qualityLogs.filter(log => log.event === 'file_rename');
      expect(fileLogs.length).toBeGreaterThan(0);
      
      const fileLog = fileLogs[0];
      expect(fileLog).toHaveProperty('oldPath');
      expect(fileLog).toHaveProperty('newPath');
      expect(fileLog).toHaveProperty('success');
    });

    test('should log error events with context', async ({ page }) => {
      // Mock AI failure
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          throw new Error('AI service unavailable');
        };
      });

      await page.locator('#browseBtn').click();
      
      // Wait for error handling
      await page.waitForTimeout(2000);
      
      // Check for error logs
      const errorLogs = qualityLogs.filter(log => log.event === 'ai_analysis_error');
      expect(errorLogs.length).toBeGreaterThan(0);
      
      const errorLog = errorLogs[0];
      expect(errorLog).toHaveProperty('error');
      expect(errorLog).toHaveProperty('errorType');
      expect(errorLog).toHaveProperty('context');
    });
  });

  describe('Metadata Capture', () => {
    test('should capture document metadata in logs', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify metadata capture
      const log = qualityLogs.find(log => log.action === 'accepted');
      expect(log).toHaveProperty('fileMetadata');
      
      const metadata = log.fileMetadata;
      expect(metadata).toHaveProperty('fileSize');
      expect(metadata).toHaveProperty('fileType');
      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('modifiedAt');
    });

    test('should capture AI model information', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify AI model info
      const log = qualityLogs.find(log => log.action === 'accepted');
      expect(log).toHaveProperty('aiModel');
      expect(log).toHaveProperty('temperature');
      expect(log).toHaveProperty('promptVersion');
    });

    test('should capture timing information', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify timing data
      const log = qualityLogs.find(log => log.action === 'accepted');
      expect(log).toHaveProperty('timing');
      
      const timing = log.timing;
      expect(timing).toHaveProperty('analysisTime');
      expect(timing).toHaveProperty('decisionTime');
      expect(timing).toHaveProperty('totalTime');
    });
  });

  describe('Log Quality and Completeness', () => {
    test('should have consistent log structure across all actions', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test multiple actions
      await page.locator('#regenerateBtn').click();
      await page.waitForTimeout(2000);
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Verify all logs have consistent structure
      for (const log of qualityLogs) {
        expect(log).toHaveProperty('timestamp');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('source');
        expect(log).toHaveProperty('status');
      }
    });

    test('should not log sensitive information', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      await page.waitForTimeout(1000);
      
      // Check that no sensitive data is logged
      const logString = JSON.stringify(qualityLogs);
      expect(logString).not.toContain('password');
      expect(logString).not.toContain('secret');
      expect(logString).not.toContain('key');
    });

    test('should handle logging failures gracefully', async ({ page }) => {
      // Mock logging failure
      await page.addInitScript(() => {
        window.electronAPI.logSuggestionQuality = async () => {
          throw new Error('Logging service unavailable');
        };
      });

      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      
      // Should not crash the app
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
    });
  });

  describe('Performance and Reliability', () => {
    test('should log quickly without blocking UI', async ({ page }) => {
      const startTime = Date.now();
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.locator('#acceptBtn').click();
      const endTime = Date.now();
      
      // UI should remain responsive
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Logging should not block the UI
      await expect(page.locator('#browseBtn')).toBeEnabled();
    });

    test('should handle high-frequency logging', async ({ page }) => {
      // Simulate rapid user actions
      for (let i = 0; i < 5; i++) {
        await page.locator('#browseBtn').click();
        await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
        await page.locator('#regenerateBtn').click();
        await page.waitForTimeout(1000);
        await page.locator('#acceptBtn').click();
        await page.waitForTimeout(500);
      }
      
      // Should handle all logging without issues
      expect(qualityLogs.length).toBeGreaterThan(0);
    });

    test('should maintain log integrity under load', async ({ page }) => {
      // Perform multiple operations
      for (let i = 0; i < 3; i++) {
        await page.locator('#browseBtn').click();
        await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
        await page.locator('#acceptBtn').click();
        await page.waitForTimeout(1000);
      }
      
      // All logs should be valid JSON
      for (const log of qualityLogs) {
        expect(() => JSON.stringify(log)).not.toThrow();
        expect(log).toHaveProperty('timestamp');
        expect(log).toHaveProperty('action');
      }
    });
  });
});
