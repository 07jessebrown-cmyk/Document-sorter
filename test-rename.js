const aiService = require('./src/services/aiService');

async function testRenameFunctionality() {
  console.log('🧪 Testing Rename Functionality with Backend Proxy...\n');
  
  try {
    // Test suggestRename function
    console.log('Testing suggestRename function...');
    
    const testFilePath = './test-document.pdf';
    const testApiKey = 'test-key'; // This will be handled by backend
    
    const result = await aiService.suggestRename(testFilePath, testApiKey);
    
    console.log('Rename result:', result);
    
    if (result.success) {
      console.log('✅ Rename functionality working correctly');
      console.log('Suggestions:', result.suggestions);
    } else {
      console.log('❌ Rename functionality failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the backend server is running:');
    console.log('cd server && node index.js');
  }
}

// Run the test
testRenameFunctionality();
