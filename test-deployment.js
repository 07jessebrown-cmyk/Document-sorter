#!/usr/bin/env node

/**
 * Deployment Test Script
 * Tests the backend deployment configuration
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const CLIENT_TOKEN = process.env.CLIENT_TOKEN || '785e4defad269cdc65f10c9ee9d418a2bc1bc97cfbbdb01b76d3ded5d2cca6b8';

async function testHealthEndpoint() {
  console.log('🔍 Testing health endpoint...');
  
  try {
    const url = new URL('/health', BACKEND_URL);
    const client = url.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      const req = client.request(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => reject(new Error('Timeout')));
      req.end();
    });
    
    if (response.statusCode === 200) {
      console.log('✅ Health check passed');
      console.log('   Response:', JSON.parse(response.data));
      return true;
    } else {
      console.log('❌ Health check failed:', response.statusCode);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testAPIEndpoint() {
  console.log('🔍 Testing API endpoint...');
  
  try {
    const url = new URL('/api/openai', BACKEND_URL);
    const client = url.protocol === 'https:' ? https : http;
    
    const payload = JSON.stringify({
      messages: [{ role: 'user', content: 'Hello, this is a test.' }],
      model: 'gpt-3.5-turbo',
      max_tokens: 50
    });
    
    const response = await new Promise((resolve, reject) => {
      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Token': CLIENT_TOKEN,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => reject(new Error('Timeout')));
      req.write(payload);
      req.end();
    });
    
    if (response.statusCode === 200) {
      console.log('✅ API test passed');
      const data = JSON.parse(response.data);
      console.log('   Response preview:', data.choices?.[0]?.message?.content?.substring(0, 100) + '...');
      return true;
    } else {
      console.log('❌ API test failed:', response.statusCode);
      console.log('   Response:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ API test error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Backend Deployment Test');
  console.log('==========================');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Client Token: ${CLIENT_TOKEN.substring(0, 8)}...`);
  console.log('');
  
  const healthPassed = await testHealthEndpoint();
  console.log('');
  
  const apiPassed = await testAPIEndpoint();
  console.log('');
  
  console.log('📊 Test Results:');
  console.log(`Health Check: ${healthPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Test: ${apiPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (healthPassed && apiPassed) {
    console.log('');
    console.log('🎉 All tests passed! Backend is ready for production.');
  } else {
    console.log('');
    console.log('⚠️  Some tests failed. Check the backend configuration.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
