const { suggestRename } = require('./src/services/aiService');

async function quickTest() {
  console.log('🧪 Quick AI Service Test...\n');
  
  try {
    const result = await suggestRename('test-simple.txt');
    console.log('✅ Success!');
    console.log('📝 Original:', result.originalFilename);
    console.log('💡 Suggestions:', result.suggestions);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

quickTest();

