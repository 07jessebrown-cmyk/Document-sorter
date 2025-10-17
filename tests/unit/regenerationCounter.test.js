/**
 * Unit Tests for Regeneration Counter Logic
 * Tests the regeneration limit and counter functionality used in edge cases
 */
describe('Regeneration Counter Unit Tests', () => {
  let regenerationCounters;

  beforeEach(() => {
    // Reset regeneration counters for each test
    regenerationCounters = new Map();
  });

  describe('Regeneration Counter Management', () => {
    test('should initialize counter at 0 for new file', () => {
      const filePath = '/test/file1.pdf';
      const counter = getRegenerationCount(filePath);
      
      expect(counter).toBe(0);
    });

    test('should increment counter correctly', () => {
      const filePath = '/test/file1.pdf';
      
      // First regeneration
      incrementRegenerationCount(filePath);
      expect(getRegenerationCount(filePath)).toBe(1);
      
      // Second regeneration
      incrementRegenerationCount(filePath);
      expect(getRegenerationCount(filePath)).toBe(2);
      
      // Third regeneration
      incrementRegenerationCount(filePath);
      expect(getRegenerationCount(filePath)).toBe(3);
    });

    test('should track counters independently per file', () => {
      const filePath1 = '/test/file1.pdf';
      const filePath2 = '/test/file2.pdf';
      
      // Increment counter for file1
      incrementRegenerationCount(filePath1);
      incrementRegenerationCount(filePath1);
      expect(getRegenerationCount(filePath1)).toBe(2);
      expect(getRegenerationCount(filePath2)).toBe(0);
      
      // Increment counter for file2
      incrementRegenerationCount(filePath2);
      expect(getRegenerationCount(filePath1)).toBe(2);
      expect(getRegenerationCount(filePath2)).toBe(1);
    });

    test('should reset counter for different files', () => {
      const filePath1 = '/test/file1.pdf';
      const filePath2 = '/test/file2.pdf';
      
      // File1 reaches limit
      incrementRegenerationCount(filePath1);
      incrementRegenerationCount(filePath1);
      incrementRegenerationCount(filePath1);
      expect(getRegenerationCount(filePath1)).toBe(3);
      
      // File2 should start fresh
      expect(getRegenerationCount(filePath2)).toBe(0);
      incrementRegenerationCount(filePath2);
      expect(getRegenerationCount(filePath2)).toBe(1);
    });
  });

  describe('Regeneration Limit Enforcement', () => {
    test('should allow regeneration within limit', () => {
      const filePath = '/test/file1.pdf';
      
      // Test all valid regeneration attempts
      for (let i = 0; i < 3; i++) {
        const canRegenerate = canRegenerateSuggestion(filePath);
        expect(canRegenerate).toBe(true);
        incrementRegenerationCount(filePath);
      }
    });

    test('should prevent regeneration after limit reached', () => {
      const filePath = '/test/file1.pdf';
      
      // Reach the limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      
      // Should not be able to regenerate anymore
      const canRegenerate = canRegenerateSuggestion(filePath);
      expect(canRegenerate).toBe(false);
    });

    test('should return correct limit status', () => {
      const filePath = '/test/file1.pdf';
      
      // Before limit
      expect(isRegenerationLimitReached(filePath)).toBe(false);
      
      // At limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      expect(isRegenerationLimitReached(filePath)).toBe(true);
    });

    test('should provide correct limit message', () => {
      const filePath = '/test/file1.pdf';
      
      // Before limit
      expect(getRegenerationLimitMessage(filePath)).toBe('');
      
      // At limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      expect(getRegenerationLimitMessage(filePath)).toContain('Regeneration limit reached');
      expect(getRegenerationLimitMessage(filePath)).toContain('3');
    });
  });

  describe('Regeneration Button State Management', () => {
    test('should enable button when under limit', () => {
      const filePath = '/test/file1.pdf';
      
      // Test button state at different counts
      expect(getRegenerateButtonState(filePath)).toEqual({
        disabled: false,
        text: 'Regenerate',
        showLimit: false
      });
      
      incrementRegenerationCount(filePath);
      expect(getRegenerateButtonState(filePath)).toEqual({
        disabled: false,
        text: 'Regenerate (1/3)',
        showLimit: true
      });
    });

    test('should disable button when limit reached', () => {
      const filePath = '/test/file1.pdf';
      
      // Reach the limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      
      expect(getRegenerateButtonState(filePath)).toEqual({
        disabled: true,
        text: 'Regenerate (3/3)',
        showLimit: true
      });
    });

    test('should show correct count in button text', () => {
      const filePath = '/test/file1.pdf';
      
      // Test button text at different counts
      incrementRegenerationCount(filePath);
      expect(getRegenerateButtonState(filePath).text).toBe('Regenerate (1/3)');
      
      incrementRegenerationCount(filePath);
      expect(getRegenerateButtonState(filePath).text).toBe('Regenerate (2/3)');
      
      incrementRegenerationCount(filePath);
      expect(getRegenerateButtonState(filePath).text).toBe('Regenerate (3/3)');
    });
  });

  describe('Regeneration Attempt Logging', () => {
    test('should log regeneration attempts correctly', () => {
      const filePath = '/test/file1.pdf';
      const logs = [];
      
      // Mock logging function
      const mockLog = (message) => logs.push(message);
      
      // Test logging for valid attempts
      for (let i = 0; i < 3; i++) {
        logRegenerationAttempt(filePath, mockLog);
        incrementRegenerationCount(filePath);
      }
      
      expect(logs).toHaveLength(3);
      expect(logs[0]).toContain('Regeneration attempt 1');
      expect(logs[1]).toContain('Regeneration attempt 2');
      expect(logs[2]).toContain('Regeneration attempt 3');
    });

    test('should log warning for attempts beyond limit', () => {
      const filePath = '/test/file1.pdf';
      const logs = [];
      
      // Mock logging function
      const mockLog = (message) => logs.push(message);
      
      // Reach the limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      
      // Attempt beyond limit
      logRegenerationAttempt(filePath, mockLog);
      
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('Regeneration limit reached');
      expect(logs[0]).toContain('attempt 4');
    });

    test('should not make API call when limit reached', () => {
      const filePath = '/test/file1.pdf';
      let apiCallMade = false;
      
      // Mock API call
      const mockAPICall = () => {
        apiCallMade = true;
        return Promise.resolve({ success: true });
      };
      
      // Reach the limit
      for (let i = 0; i < 3; i++) {
        incrementRegenerationCount(filePath);
      }
      
      // Attempt regeneration beyond limit
      const shouldMakeCall = canRegenerateSuggestion(filePath);
      if (shouldMakeCall) {
        mockAPICall();
      }
      
      expect(shouldMakeCall).toBe(false);
      expect(apiCallMade).toBe(false);
    });
  });

  describe('Edge Cases for Regeneration Counter', () => {
    test('should handle undefined file path gracefully', () => {
      expect(() => getRegenerationCount(undefined)).not.toThrow();
      expect(() => incrementRegenerationCount(undefined)).not.toThrow();
      expect(() => canRegenerateSuggestion(undefined)).not.toThrow();
    });

    test('should handle null file path gracefully', () => {
      expect(() => getRegenerationCount(null)).not.toThrow();
      expect(() => incrementRegenerationCount(null)).not.toThrow();
      expect(() => canRegenerateSuggestion(null)).not.toThrow();
    });

    test('should handle empty file path gracefully', () => {
      expect(() => getRegenerationCount('')).not.toThrow();
      expect(() => incrementRegenerationCount('')).not.toThrow();
      expect(() => canRegenerateSuggestion('')).not.toThrow();
    });

    test('should handle very long file paths', () => {
      const longPath = '/'.repeat(1000) + 'file.pdf';
      
      expect(() => getRegenerationCount(longPath)).not.toThrow();
      expect(() => incrementRegenerationCount(longPath)).not.toThrow();
      expect(() => canRegenerateSuggestion(longPath)).not.toThrow();
    });

    test('should handle special characters in file paths', () => {
      const specialPath = '/test/file with spaces & symbols.pdf';
      
      expect(() => getRegenerationCount(specialPath)).not.toThrow();
      expect(() => incrementRegenerationCount(specialPath)).not.toThrow();
      expect(() => canRegenerateSuggestion(specialPath)).not.toThrow();
    });
  });
});

// Helper functions for regeneration counter management
function getRegenerationCount(filePath) {
  if (!filePath) return 0;
  return regenerationCounters.get(filePath) || 0;
}

function incrementRegenerationCount(filePath) {
  if (!filePath) return;
  const currentCount = getRegenerationCount(filePath);
  regenerationCounters.set(filePath, currentCount + 1);
}

function canRegenerateSuggestion(filePath) {
  if (!filePath) return false;
  return getRegenerationCount(filePath) < 3;
}

function isRegenerationLimitReached(filePath) {
  if (!filePath) return true;
  return getRegenerationCount(filePath) >= 3;
}

function getRegenerationLimitMessage(filePath) {
  if (!filePath) return '';
  const count = getRegenerationCount(filePath);
  if (count >= 3) {
    return `Regeneration limit reached (${count}/3)`;
  }
  return '';
}

function getRegenerateButtonState(filePath) {
  if (!filePath) {
    return { disabled: true, text: 'Regenerate', showLimit: false };
  }
  
  const count = getRegenerationCount(filePath);
  const isDisabled = count >= 3;
  const showLimit = count > 0;
  
  let text = 'Regenerate';
  if (showLimit) {
    text = `Regenerate (${count}/3)`;
  }
  
  return {
    disabled: isDisabled,
    text: text,
    showLimit: showLimit
  };
}

function logRegenerationAttempt(filePath, logFunction) {
  if (!filePath || !logFunction) return;
  
  const count = getRegenerationCount(filePath);
  
  if (count >= 3) {
    logFunction(`Warning: Regeneration limit reached for ${filePath} (attempt ${count + 1})`);
  } else {
    logFunction(`Regeneration attempt ${count + 1} for ${filePath}`);
  }
}
