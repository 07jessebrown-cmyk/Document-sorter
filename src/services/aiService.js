const ollama = require('ollama').default;
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

/**
 * Extract text from PDF file (first 3000 characters)
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdf = await pdfParse(dataBuffer);
    return pdf.text.substring(0, 3000);
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Suggest 3 descriptive filenames based on document content using Ollama
 * @param {string} filePath - Path to the file to analyze
 * @returns {Promise<Object>} Result object with success flag and suggestions or error
 */
async function suggestRename(filePath) {
  try {
    // Extract text from PDF
    const text = await extractTextFromPDF(filePath);
    const filename = path.basename(filePath);

    // Call Ollama with structured prompt
    const response = await ollama.chat({
      model: 'llama3.1',
      messages: [{
        role: 'user',
        content: `You are a document organization expert. Based on this document, suggest 3 descriptive filenames.

Current filename: ${filename}

Document content:
${text}

Return ONLY a JSON array of 3 filename strings under 50 chars.`
      }]
    });

    // Parse the response
    const suggestions = JSON.parse(response.message.content);
    
    return { 
      success: true, 
      suggestions,
      originalFilename: filename,
      extractedTextLength: text.length
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      originalFilename: path.basename(filePath)
    };
  }
}

module.exports = { 
  suggestRename,
  extractTextFromPDF 
};
