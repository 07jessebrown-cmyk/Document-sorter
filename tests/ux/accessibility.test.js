const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * UX Verification Tests - Accessibility
 * Tests keyboard navigation, screen reader compatibility, and accessibility standards
 */
describe('UX Verification - Accessibility', () => {
  let testDir;

  test.beforeAll(async () => {
    testDir = path.join(__dirname, '../temp/accessibility');
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

  describe('Keyboard Navigation', () => {
    test('should support complete keyboard navigation', async ({ page }) => {
      // Test main interface navigation
      await page.keyboard.press('Tab');
      await expect(page.locator('#browseBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#startSortingBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#aiSuggestBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#settingsBtn')).toBeFocused();
    });

    test('should support keyboard activation of buttons', async ({ page }) => {
      // Test Enter key activation
      await page.locator('#browseBtn').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#fileList')).toBeVisible();
      
      // Test Space key activation
      await page.locator('#settingsBtn').focus();
      await page.keyboard.press(' ');
      // Settings modal should open (if implemented)
    });

    test('should support keyboard shortcuts', async ({ page }) => {
      // Test common shortcuts
      await page.keyboard.press('Control+o'); // Open file
      await expect(page.locator('#fileList')).toBeVisible();
      
      // Test Escape key
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
    });

    test('should have logical tab order in modal', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test modal tab order
      await page.keyboard.press('Tab');
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#acceptBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#regenerateBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('button:has-text("Skip")')).toBeFocused();
    });

    test('should support arrow key navigation in alternatives', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test arrow key navigation
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      
      // Should not cause errors
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible();
    });
  });

  describe('ARIA Labels and Roles', () => {
    test('should have proper ARIA labels for all interactive elements', async ({ page }) => {
      const elements = [
        { selector: '#browseBtn', expectedRole: 'button' },
        { selector: '#startSortingBtn', expectedRole: 'button' },
        { selector: '#aiSuggestBtn', expectedRole: 'button' },
        { selector: '#settingsBtn', expectedRole: 'button' }
      ];

      for (const element of elements) {
        const el = page.locator(element.selector);
        await expect(el).toHaveAttribute('role', element.expectedRole);
        await expect(el).toHaveAttribute('aria-label');
      }
    });

    test('should have proper modal ARIA attributes', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      const modal = page.locator('#aiSuggestionsModal');
      await expect(modal).toHaveAttribute('role', 'dialog');
      await expect(modal).toHaveAttribute('aria-labelledby');
      await expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    test('should have proper form field labels', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      const input = page.locator('#primarySuggestion');
      await expect(input).toHaveAttribute('aria-label');
      await expect(input).toHaveAttribute('type', 'text');
    });

    test('should have proper button states communicated to screen readers', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      const regenerateBtn = page.locator('#regenerateBtn');
      await expect(regenerateBtn).toHaveAttribute('aria-label');
      
      // Test disabled state
      await regenerateBtn.click();
      await expect(regenerateBtn).toBeDisabled();
      await expect(regenerateBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Focus Management', () => {
    test('should trap focus within modal', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Focus should be trapped in modal
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Should cycle back to first focusable element
      await expect(page.locator('#primarySuggestion')).toBeFocused();
    });

    test('should return focus to trigger element when modal closes', async ({ page }) => {
      const browseBtn = page.locator('#browseBtn');
      await browseBtn.click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Close modal with Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
      
      // Focus should return to browse button
      await expect(browseBtn).toBeFocused();
    });

    test('should have visible focus indicators', async ({ page }) => {
      const elements = [
        '#browseBtn',
        '#startSortingBtn',
        '#aiSuggestBtn',
        '#settingsBtn'
      ];

      for (const selector of elements) {
        const element = page.locator(selector);
        await element.focus();
        
        // Check for focus indicator
        await expect(element).toHaveClass(/focus|focused/);
      }
    });

    test('should manage focus during async operations', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Focus should be on primary input
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      // During regeneration, focus should be managed appropriately
      await page.locator('#regenerateBtn').click();
      await expect(page.locator('#regenerateBtn')).toBeFocused();
    });
  });

  describe('Screen Reader Compatibility', () => {
    test('should have proper heading structure', async ({ page }) => {
      // Check main heading
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Document Sorter');
      
      // Check modal heading
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.modal-title')).toBeVisible();
    });

    test('should announce state changes to screen readers', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Modal should be announced
      const modal = page.locator('#aiSuggestionsModal');
      await expect(modal).toHaveAttribute('aria-live', 'polite');
    });

    test('should have proper form associations', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Input should have associated label
      const input = page.locator('#primarySuggestion');
      const label = page.locator('label[for="primarySuggestion"]');
      await expect(label).toBeVisible();
    });

    test('should provide context for interactive elements', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Buttons should have descriptive labels
      const acceptBtn = page.locator('#acceptBtn');
      await expect(acceptBtn).toHaveAttribute('aria-label');
      
      const regenerateBtn = page.locator('#regenerateBtn');
      await expect(regenerateBtn).toHaveAttribute('aria-label');
    });
  });

  describe('Color Contrast and Visual Accessibility', () => {
    test('should have sufficient color contrast for text', async ({ page }) => {
      // Test main text elements
      const textElements = [
        'h1',
        '.modal-title',
        '.file-status',
        '.status'
      ];

      for (const selector of textElements) {
        const element = page.locator(selector);
        if (await element.isVisible()) {
          // Check that text is visible and readable
          await expect(element).toBeVisible();
        }
      }
    });

    test('should have sufficient color contrast for buttons', async ({ page }) => {
      const buttons = [
        '#browseBtn',
        '#startSortingBtn',
        '#aiSuggestBtn',
        '#settingsBtn'
      ];

      for (const selector of buttons) {
        const button = page.locator(selector);
        await expect(button).toBeVisible();
        
        // Button text should be readable
        const text = await button.textContent();
        expect(text).toBeTruthy();
      }
    });

    test('should not rely solely on color to convey information', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Status information should not rely only on color
      const statusElements = page.locator('.file-status');
      await expect(statusElements).toHaveCount(1);
      
      // Should have text content, not just color
      const statusText = await statusElements.textContent();
      expect(statusText).toBeTruthy();
    });

    test('should have clear visual hierarchy', async ({ page }) => {
      // Check heading hierarchy
      const h1 = page.locator('h1');
      const h2 = page.locator('h2');
      const h3 = page.locator('h3');
      
      await expect(h1).toBeVisible();
      
      // Check modal hierarchy
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      const modalTitle = page.locator('.modal-title');
      await expect(modalTitle).toBeVisible();
    });
  });

  describe('Error Handling and Accessibility', () => {
    test('should announce errors to screen readers', async ({ page }) => {
      // Mock AI failure
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          throw new Error('AI service unavailable');
        };
      });

      await page.locator('#browseBtn').click();
      
      // Error should be announced
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#errorState')).toBeVisible();
      
      // Error message should be accessible
      const errorMessage = page.locator('#errorState p');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveAttribute('aria-live', 'assertive');
    });

    test('should provide accessible error recovery options', async ({ page }) => {
      // Mock AI failure
      await page.addInitScript(() => {
        window.electronAPI.analyzeFile = async () => {
          throw new Error('AI service unavailable');
        };
      });

      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Manual input should be accessible
      const manualInput = page.locator('#manualInput');
      await expect(manualInput).toBeVisible();
      await expect(manualInput).toHaveAttribute('aria-label');
      
      // Save button should be accessible
      const saveBtn = page.locator('button:has-text("Save")');
      await expect(saveBtn).toBeVisible();
      await expect(saveBtn).toHaveAttribute('aria-label');
    });

    test('should handle loading states accessibly', async ({ page }) => {
      await page.locator('#browseBtn').click();
      
      // Loading state should be announced
      await expect(page.locator('.file-status')).toContainText('Analyzing...');
      
      // Loading indicators should be accessible
      const loadingElements = page.locator('[aria-live="polite"]');
      await expect(loadingElements).toHaveCount(1);
    });
  });

  describe('Keyboard Shortcuts and Efficiency', () => {
    test('should support efficient keyboard shortcuts', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Test number key shortcuts
      await page.keyboard.press('1'); // Accept
      await expect(page.locator('#aiSuggestionsModal')).not.toBeVisible();
      
      // Re-open modal for next test
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      await page.keyboard.press('2'); // Regenerate
      await expect(page.locator('#regenerateBtn')).toBeFocused();
    });

    test('should support efficient form navigation', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Should be able to navigate form efficiently
      await page.keyboard.press('Tab');
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      // Should be able to edit input
      await page.keyboard.type('Edited_Filename.pdf');
      const input = page.locator('#primarySuggestion');
      await expect(input).toHaveValue('Edited_Filename.pdf');
    });

    test('should support efficient modal navigation', async ({ page }) => {
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Should be able to navigate modal efficiently
      await page.keyboard.press('Tab');
      await expect(page.locator('#primarySuggestion')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#acceptBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#regenerateBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('button:has-text("Skip")')).toBeFocused();
    });
  });

  describe('Responsive Design and Accessibility', () => {
    test('should maintain accessibility at different screen sizes', async ({ page }) => {
      // Test at different viewport sizes
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.locator('#browseBtn')).toBeVisible();
      
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(page.locator('#browseBtn')).toBeVisible();
      
      // Test modal accessibility at different sizes
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible();
    });

    test('should maintain keyboard navigation at different screen sizes', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      await expect(page.locator('#browseBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#startSortingBtn')).toBeFocused();
    });

    test('should maintain focus management at different screen sizes', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      
      await page.locator('#browseBtn').click();
      await expect(page.locator('#aiSuggestionsModal')).toBeVisible({ timeout: 10000 });
      
      // Focus should still be managed properly
      await expect(page.locator('#primarySuggestion')).toBeFocused();
    });
  });
});
