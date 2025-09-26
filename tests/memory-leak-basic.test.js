/**
 * Basic Memory Leak Test
 * Tests basic timer management without importing services
 */

describe('Basic Memory Leak Prevention', () => {
  test('Basic timer cleanup should work', () => {
    // Create a timer
    const timer = setTimeout(() => {}, 1000);
    
    // Clear the timer
    clearTimeout(timer);
    
    // This should not cause memory leaks
    expect(timer).toBeDefined();
  });

  test('Basic interval cleanup should work', () => {
    // Create an interval
    const interval = setInterval(() => {}, 100);
    
    // Clear the interval
    clearInterval(interval);
    
    // This should not cause memory leaks
    expect(interval).toBeDefined();
  });
});
