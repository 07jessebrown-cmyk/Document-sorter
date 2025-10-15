const fs = require('fs');
const path = require('path');

// Test script for the new PDF renaming endpoint
async function testPdfRename() {
  try {
    // Read a test PDF file (you can replace this with any PDF)
    const pdfPath = path.join(__dirname, 'examples', 'table-invoice.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ Test PDF not found. Please ensure examples/table-invoice.pdf exists');
      return;
    }
    
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64Buffer = pdfBuffer.toString('base64');
    
    console.log('📄 Testing PDF renaming with:', pdfPath);
    console.log('📄 PDF size:', pdfBuffer.length, 'bytes');
    
    // Call the new endpoint
    const response = await fetch('http://localhost:3000/api/rename-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': process.env.CLIENT_TOKEN || 'your-client-token'
      },
      body: JSON.stringify({
        pdfBuffer: base64Buffer,
        originalFilename: 'table-invoice.pdf'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Success!');
      console.log('📄 Suggested filename:', result.filename);
      console.log('📄 Extracted text preview:', result.extractedText);
      console.log('🤖 AI response:', result.aiResponse);
    } else {
      console.log('❌ Error:', result.error);
      console.log('📄 Fallback filename:', result.filename);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPdfRename();
}

module.exports = { testPdfRename };
