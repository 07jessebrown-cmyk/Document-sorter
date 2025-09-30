/**
 * Debug Handles Test
 * Test to identify what handles Jest is detecting
 */

describe('Debug Handles', () => {
  test('Check what handles exist', () => {
    // Check if there are any global timers
    const activeHandles = process._getActiveHandles();
    const activeRequests = process._getActiveRequests();
    
    console.log('Active handles:', activeHandles.length);
    console.log('Active requests:', activeRequests.length);
    
    // Log details about each handle
    activeHandles.forEach((handle, index) => {
      console.log(`Handle ${index}:`, handle.constructor.name, handle);
    });
    
    // Log details about each request
    activeRequests.forEach((request, index) => {
      console.log(`Request ${index}:`, request.constructor.name, request);
    });
    
    expect(activeHandles.length).toBe(0);
    expect(activeRequests.length).toBe(0);
  });
});
