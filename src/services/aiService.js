const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');
const BackendProxyService = require('./backendProxyService');

async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pdf = await pdfParse(dataBuffer);
  return pdf.text.substring(0, 4000);
}

async function suggestRename(filePath, apiKey) {
  try {
    // Initialize backend proxy service
    const backendProxy = new BackendProxyService({
      baseURL: process.env.BACKEND_URL || 'http://localhost:3000',
      clientToken: process.env.CLIENT_TOKEN || 'your_secure_client_token_here'
    });

    // Test backend connection first
    const connectionTest = await backendProxy.testConnection();
    if (!connectionTest.success) {
      return { 
        success: false, 
        error: `Backend connection failed: ${connectionTest.error}` 
      };
    }

    const text = await extractTextFromPDF(filePath);
    const result = await backendProxy.suggestRename(filePath, text);
    
    return result;

  } catch (error) {
    console.error('Backend proxy suggestRename error:', error);
    return { 
      success: false, 
      error: `Backend error: ${error.message}` 
    };
  }
}

async function testApiKey(apiKey) {
  try {
    // Initialize backend proxy service
    const backendProxy = new BackendProxyService({
      baseURL: process.env.BACKEND_URL || 'http://localhost:3000',
      clientToken: process.env.CLIENT_TOKEN || 'your_secure_client_token_here'
    });

    // Test backend connection (API key validation is handled by backend)
    const result = await backendProxy.testApiKey(apiKey);
    return result;

  } catch (error) {
    console.error('Backend proxy testApiKey error:', error);
    return { 
      success: false, 
      error: `Backend error: ${error.message}` 
    };
  }
}

module.exports = { suggestRename, testApiKey, extractTextFromPDF };
