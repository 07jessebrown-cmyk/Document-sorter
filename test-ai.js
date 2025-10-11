const { suggestRename } = require('./src/services/aiService');
const path = require('path');

async function testAIService() {
  console.log('🧪 Testing AI Service...\n');
  
  // Test with sample PDF files from examples directory
  const testFiles = [
    'examples/handwriting-notes.pdf',
    'examples/multilingual-spanish.pdf',
    'examples/signature-contract.pdf',
    'examples/table-invoice.pdf',
    'examples/watermark-confidential.pdf'
  ];

  for (const filePath of testFiles) {
    const fullPath = path.resolve(filePath);
    
    console.log(`📄 Testing: ${path.basename(filePath)}`);
    console.log(`📍 Path: ${fullPath}`);
    
    try {
      const startTime = Date.now();
      const result = await suggestRename(fullPath);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Success! (${duration}ms)`);
        console.log(`📝 Original: ${result.originalFilename}`);
        console.log(`📊 Text extracted: ${result.extractedTextLength} chars`);
        console.log(`💡 Suggestions:`);
        result.suggestions.forEach((suggestion, index) => {
          console.log(`   ${index + 1}. ${suggestion}`);
        });
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`💥 Error: ${error.message}`);
    }
    
    console.log('─'.repeat(50));
  }
  
  console.log('\n🎯 Testing complete!');
}

// Run the test
testAIService().catch(console.error);
