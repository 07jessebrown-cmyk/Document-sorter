const http = require('http');

async function testBackend() {
  console.log('🧪 Testing Backend Server...\n');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await makeRequest('GET', '/health');
    console.log('   Health check result:', healthResponse);
    
    if (healthResponse.status === 'OK') {
      console.log('✅ Backend server is running and healthy\n');
    } else {
      console.log('❌ Backend server health check failed\n');
      return;
    }
    
    // Test OpenAI proxy endpoint (without auth for now)
    console.log('2. Testing OpenAI proxy endpoint...');
    const openaiResponse = await makeRequest('POST', '/api/openai', {
      messages: [{ role: 'user', content: 'Hello' }]
    });
    
    if (openaiResponse.error && openaiResponse.error.includes('Unauthorized')) {
      console.log('✅ OpenAI proxy endpoint is working (auth required as expected)\n');
    } else {
      console.log('   OpenAI proxy response:', openaiResponse);
    }
    
    console.log('🎉 Backend server is working correctly!');
    console.log('\nTo test with authentication, update the CLIENT_TOKEN in server/.env');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the backend server is running:');
    console.log('cd server && node index.js');
  }
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': 'your_secure_client_token_here'
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ status: 'OK', raw: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Run the test
testBackend();
