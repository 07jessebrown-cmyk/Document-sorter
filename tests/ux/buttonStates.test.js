const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * UX Verification Tests - Button States and Interactions
 * Tests button responsiveness, states, and visual feedback
 */
describe('UX Verification - Button States', () => {
  let testDir;

  test.beforeAll(async () => {
    testDir = path.join(__dirname, '../temp/button-states');
    await require('fs').promises.mkdir(testDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    // Mock Electron API
    await page.addInitScript(() => {
      window.electronAPI = {
        analyzeFile: async () => ({
          success: true,
          analysis: {
            proposedFilename: 'Test_Document_2024-01-15.pdf',
            suggestions: ['Test_Document_2024-01-15.pdf', 'Test_Doc_2024.pdf'],
            confidence: 0.85
          }
        }),
        regenerateSuggestion: async () => ({
          success: true,
          suggestion: 'Regenerated_Test_Document_2024-01-15.pdf',
          alternatives: ['Alt1.pdf', 'Alt2.pdf']
        }),
        renameFile: async () => ({ success: true }),
        logSuggestionQuality: async () => ({ success: true }),
        openFileDialog: async () => [path.join(testDir, 'test.pdf')],
        onFileProcessed: () => {},
        onProcessingComplete: () => {}
      };
    });

    await page.goto('file://' + path.join(__dirname, '../../src/renderer/index.html'));
  });

  describe('Main Interface Buttons', () => {
    test('should have proper hover states for all buttons', async ({ page }) => {
      const buttons = [
        { selector: '#browseBtn', name: 'Browse' },
        { selector: '#startSortingBtn', name: 'Start Sorting' },
        { selector: '#aiSuggestBtn', name: 'AI Suggestions' },
        { selector: '#settingsBtn', name: 'Settings' }
      ];

      for (const button of buttons) {
        const element = page.locator(button.selector);
        await expect(element).toBeVisible();
        
        // Test hover state
        await element.hover();
        await expect(element).toHaveClass(/hover|btn-hover/);
        
        // Verify button remains functional after hover
        await expect(element).toBeEnabled();
      }
    });

    test('should have proper pressed states for all buttons', async ({ page }) => {
      const buttons = [
        { selector: '#browseBtn', name: 'Browse' },
        { selector: '#startSortingBtn', name: 'Start Sorting' },
        { selector: '#settingsBtn', name: 'Settings' }
      ];

      for (const button of buttons) {
        const element = page.locator(button.selector);
        
        // Test pressed state
        await element.click({ force: true });
        await expect(element).toHaveClass(/pressed|btn-pressed|active/);
        
        // Verify button returns to normal state
        await page.waitForTimeout(100);
        await expect(element).not.toHaveClass(/pressed|btn-pressed|active/);
      }
    });

    test('should show loading states during async operations', async ({ page }) => {
      // Mock slow AI analysis
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return {
            success: true,
            analysis: { proposedFilename: 'Test.pdf' }
          };
        };
      });

      // Upload file and check loading state
      await page.locator('#browseBtn').click();
      
      // Check that file status shows loading
      await expect(page.locator('.file-status')).toContainText('Analyzing...');
      
      // Check for loading indicators
      await expect(page.locator('.file-status')).toContainText('Extracting text...');
    });

    test('should disable buttons appropriately during operations', async ({ page }) => {
      // Mock slow operation
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: true, analysis: { proposedFilename: 'Test.pdf' } };
        };
      });

      await page.locator('#browseBtn').click();
      
      // Check that AI suggest button is disabled during analysis
      const aiBtn = page.locator('#aiSuggestBtn');
      await expect(aiBtn).toBeDisabled();
      
      // Wait for analysis to complete
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Check that AI suggest button is re-enabled
      await expect(aiBtn).toBeEnabled();
    });
  });

  describe('Modal Action Buttons', () => {
    test.beforeEach(async ({ page }) => {
      // Upload file and wait for modal
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
    });

    test('should have proper states for Accept button', async ({ page }) => {
      const acceptBtn = page.locator('#acceptBtn');
      
      // Test normal state
      await expect(acceptBtn).toBeVisible();
      await expect(acceptBtn).toBeEnabled();
      await expect(acceptBtn).toContainText('Accept');
      
      // Test hover state
      await acceptBtn.hover();
      await expect(acceptBtn).toHaveClass(/hover|btn-hover/);
      
      // Test click state
      await acceptBtn.click();
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
    });

    test('should have proper states for Regenerate button', async ({ page }) => {
      const regenerateBtn = page.locator('#regenerateBtn');
      
      // Test normal state
      await expect(regenerateBtn).toBeVisible();
      await expect(regenerateBtn).toBeEnabled();
      await expect(regenerateBtn).toContainText('Regenerate');
      
      // Test hover state
      await regenerateBtn.hover();
      await expect(regenerateBtn).toHaveClass(/hover|btn-hover/);
      
      // Test loading state during regeneration
      await regenerateBtn.click();
      await expect(regenerateBtn).toContainText('Regenerating...');
      await expect(regenerateBtn).toBeDisabled();
      
      // Wait for regeneration to complete
      await expect(regenerateBtn).toContainText('Regenerate', { timeout: 5000 });
      await expect(regenerateBtn).toBeEnabled();
    });

    test('should have proper states for Skip button', async ({ page }) => {
      const skipBtn = page.locator('button:has-text("Skip")');
      
      // Test normal state
      await expect(skipBtn).toBeVisible();
      await expect(skipBtn).toBeEnabled();
      await expect(skipBtn).toContainText('Skip');
      
      // Test hover state
      await skipBtn.hover();
      await expect(skipBtn).toHaveClass(/hover|btn-hover/);
      
      // Test click state
      await skipBtn.click();
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
    });

    test('should handle regeneration limit states', async ({ page }) => {
      const regenerateBtn = page.locator('#regenerateBtn');
      
      // Simulate reaching regeneration limit
      await page.addInitScript(() => {
        let regenCount = 0;
        window.electronAPI.regenerateSuggestion = async () => {
          regenCount++;
          if (regenCount >= 3) {
            return {
              success: false,
              error: 'Regeneration limit reached',
              limitReached: true
            };
          }
          return {
            success: true,
            suggestion: `Regenerated_${regenCount}.pdf`
          };
        };
      });

      // Trigger multiple regenerations
      for (let i = 0; i < 3; i++) {
        await regenerateBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Check that button is disabled after limit
      await expect(regenerateBtn).toBeDisabled();
      await expect(regenerateBtn).toContainText('Regenerate (3/3)');
    });
  });

  describe('Feedback Buttons', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
    });

    test('should have proper states for thumbs up button', async ({ page }) => {
      const thumbsUpBtn = page.locator('.thumbs-up');
      
      if (await thumbsUpBtn.isVisible()) {
        // Test normal state
        await expect(thumbsUpBtn).toBeVisible();
        await expect(thumbsUpBtn).toBeEnabled();
        
        // Test hover state
        await thumbsUpBtn.hover();
        await expect(thumbsUpBtn).toHaveClass(/hover|feedback-btn-hover/);
        
        // Test click state
        await thumbsUpBtn.click();
        await expect(thumbsUpBtn).toHaveClass(/selected|active|pressed/);
      }
    });

    test('should have proper states for thumbs down button', async ({ page }) => {
      const thumbsDownBtn = page.locator('.thumbs-down');
      
      if (await thumbsDownBtn.isVisible()) {
        // Test normal state
        await expect(thumbsDownBtn).toBeVisible();
        await expect(thumbsDownBtn).toBeEnabled();
        
        // Test hover state
        await thumbsDownBtn.hover();
        await expect(thumbsDownBtn).toHaveClass(/hover|feedback-btn-hover/);
        
        // Test click state
        await thumbsDownBtn.click();
        await expect(thumbsDownBtn).toHaveClass(/selected|active|pressed/);
      }
    });
  });

  describe('Button Accessibility', () => {
    test('should have proper ARIA labels and roles', async ({ page }) => {
      const buttons = [
        { selector: '#browseBtn', expectedRole: 'button' },
        { selector: '#startSortingBtn', expectedRole: 'button' },
        { selector: '#aiSuggestBtn', expectedRole: 'button' },
        { selector: '#settingsBtn', expectedRole: 'button' }
      ];

      for (const button of buttons) {
        const element = page.locator(button.selector);
        await expect(element).toHaveAttribute('role', button.expectedRole);
        await expect(element).toHaveAttribute('aria-label');
      }
    });

    test('should support keyboard activation', async ({ page }) => {
      // Test Enter key activation
      await page.locator('#browseBtn').focus();
      await page.keyboard.press('Enter');
      
      // Should trigger file dialog
      await expect(page.locator('#fileList')).toBeVisible();
    });

    test('should have proper focus indicators', async ({ page }) => {
      const buttons = [
        '#browseBtn',
        '#startSortingBtn',
        '#aiSuggestBtn',
        '#settingsBtn'
      ];

      for (const selector of buttons) {
        const element = page.locator(selector);
        await element.focus();
        await expect(element).toHaveClass(/focus|focused/);
      }
    });
  });

  describe('Button Performance', () => {
    test('should respond quickly to clicks', async ({ page }) => {
      const startTime = Date.now();
      await page.locator('#browseBtn').click();
      const responseTime = Date.now() - startTime;
      
      // Button should respond within 100ms
      expect(responseTime).toBeLessThan(100);
    });

    test('should not cause UI freezing during operations', async ({ page }) => {
      // Mock slow operation
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return { success: true, analysis: { proposedFilename: 'Test.pdf' } };
        };
      });

      // Start operation
      await page.locator('#browseBtn').click();
      
      // UI should remain responsive during operation
      const settingsBtn = page.locator('#settingsBtn');
      await expect(settingsBtn).toBeEnabled();
      await settingsBtn.hover();
      await expect(settingsBtn).toHaveClass(/hover/);
    });

    test('should handle rapid clicking gracefully', async ({ page }) => {
      const browseBtn = page.locator('#browseBtn');
      
      // Rapidly click the button
      for (let i = 0; i < 5; i++) {
        await browseBtn.click();
        await page.waitForTimeout(50);
      }
      
      // Should not cause errors or duplicate operations
      await expect(page.locator('#fileList')).toBeVisible();
    });
  });

  describe('Button State Consistency', () => {
    test('should maintain consistent styling across all buttons', async ({ page }) => {
      const buttons = [
        '#browseBtn',
        '#startSortingBtn',
        '#aiSuggestBtn',
        '#settingsBtn'
      ];

      for (const selector of buttons) {
        const element = page.locator(selector);
        await expect(element).toHaveClass(/btn/);
        await expect(element).toHaveCSS('border-radius');
        await expect(element).toHaveCSS('padding');
      }
    });

    test('should have consistent hover effects', async ({ page }) => {
      const buttons = [
        '#browseBtn',
        '#startSortingBtn',
        '#settingsBtn'
      ];

      for (const selector of buttons) {
        const element = page.locator(selector);
        await element.hover();
        await expect(element).toHaveClass(/hover/);
      }
    });

    test('should have consistent disabled states', async ({ page }) => {
      // Disable AI suggest button
      await page.evaluate(() => {
        document.getElementById('aiSuggestBtn').disabled = true;
      });

      const aiBtn = page.locator('#aiSuggestBtn');
      await expect(aiBtn).toBeDisabled();
      await expect(aiBtn).toHaveClass(/disabled/);
    });
  });
});
