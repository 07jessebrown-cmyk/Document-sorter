const BackendProxyService = require('./src/services/backendProxyService');

async function testBackend() {
  console.log('🧪 Testing Backend Proxy Service...\n');
  
  // Initialize backend proxy
  const backendProxy = new BackendProxyService({
    baseURL: 'http://localhost:3000',
    clientToken: 'your_secure_client_token_here'
  });

  try {
    // Test 1: Health check
    console.log('1. Testing health check...');
    const healthResult = await backendProxy.testConnection();
    console.log('   Health check result:', healthResult);
    
    if (!healthResult.success) {
      console.log('❌ Backend server is not running. Please start it with:');
      console.log('   cd server && node index.js');
      return;
    }
    
    console.log('✅ Backend server is running\n');
    
    // Test 2: Test API key (backend connection)
    console.log('2. Testing API key validation...');
    const apiKeyResult = await backendProxy.testApiKey('test-key');
    console.log('   API key test result:', apiKeyResult);
    console.log('✅ API key test completed\n');
    
    // Test 3: Test LLM call
    console.log('3. Testing LLM call...');
    const llmResult = await backendProxy.callLLM({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'Say "Hello from backend proxy!"'
        }
      ],
      maxTokens: 50,
      temperature: 0.1
    });
    console.log('   LLM response:', llmResult.content);
    console.log('✅ LLM call completed\n');
    
    // Test 4: Test document processing
    console.log('4. Testing document processing...');
    const docResult = await backendProxy.processDocument(
      'This is a test invoice from Acme Corp dated 2024-01-15.',
      'Extract the company name and date from this document.'
    );
    console.log('   Document processing result:', docResult.content);
    console.log('✅ Document processing completed\n');
    
    // Test 5: Test suggest rename
    console.log('5. Testing suggest rename...');
    const renameResult = await backendProxy.suggestRename(
      'invoice.pdf',
      'This is a test invoice from Acme Corp dated 2024-01-15 for $1000.'
    );
    console.log('   Rename suggestions:', renameResult);
    console.log('✅ Suggest rename completed\n');
    
    console.log('🎉 All backend tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the backend server is running:');
    console.log('cd server && node index.js');
  }
}

// Run the test
testBackend();
