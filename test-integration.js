const { spawn } = require('child_process');
const BackendProxyService = require('./src/services/backendProxyService');
const aiService = require('./src/services/aiService');

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function testIntegration() {
  console.log('🚀 Starting Integration Test...\n');
  
  let serverProcess = null;
  
  try {
    // Start backend server
    console.log('1. Starting backend server...');
    serverProcess = spawn('node', ['index.js'], {
      cwd: './server',
      stdio: 'pipe'
    });
    
    // Wait for server to start
    console.log('2. Waiting for server to start...');
    const serverReady = await waitForServer('http://localhost:3000/health');
    
    if (!serverReady) {
      throw new Error('Server failed to start within 30 seconds');
    }
    
    console.log('✅ Backend server is running\n');
    
    // Test backend proxy service
    console.log('3. Testing Backend Proxy Service...');
    const backendProxy = new BackendProxyService({
      baseURL: 'http://localhost:3000',
      clientToken: 'your_secure_client_token_here'
    });
    
    const healthResult = await backendProxy.testConnection();
    console.log('   Health check:', healthResult.success ? '✅' : '❌');
    
    // Test AI service with backend proxy
    console.log('4. Testing AI Service with Backend Proxy...');
    const renameResult = await aiService.suggestRename('./test-document.pdf', 'test-key');
    console.log('   Rename test:', renameResult.success ? '✅' : '❌');
    if (renameResult.success) {
      console.log('   Suggestions:', renameResult.suggestions);
    } else {
      console.log('   Error:', renameResult.error);
    }
    
    console.log('\n🎉 Integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  } finally {
    // Clean up server process
    if (serverProcess) {
      console.log('\n5. Stopping backend server...');
      serverProcess.kill();
      console.log('✅ Backend server stopped');
    }
  }
}

// Run the integration test
testIntegration();
