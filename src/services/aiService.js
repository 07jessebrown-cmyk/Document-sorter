const OpenAI = require('openai');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pdf = await pdfParse(dataBuffer);
  return pdf.text.substring(0, 4000);
}

async function suggestRename(filePath, apiKey) {
  try {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return { 
        success: false, 
        error: 'Invalid API key. Please configure your OpenAI API key in Settings.' 
      };
    }

    const text = await extractTextFromPDF(filePath);
    const filename = path.basename(filePath);
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are a document organization expert. Suggest clear, descriptive filenames.'
      }, {
        role: 'user',
        content: `Current filename: ${filename}

Document content:
${text}

Suggest 3 improved filenames that:
- Are clear and descriptive
- Include key info (date, type, parties involved)
- Use standard naming conventions (Title_Case or snake_case)
- Keep under 50 characters
- Preserve the file extension

Return ONLY a JSON array of 3 strings. Example: ["Invoice_Acme_Corp_2024-01-15.pdf", "2024_Acme_Invoice.pdf", "Acme_Jan2024_Invoice.pdf"]`
      }],
      temperature: 0.3,
      max_tokens: 200
    });

    const suggestions = JSON.parse(response.choices[0].message.content);
    return { success: true, suggestions };

  } catch (error) {
    if (error.status === 401) {
      return { success: false, error: 'Invalid API key. Please check your OpenAI API key in Settings.' };
    }
    if (error.status === 429) {
      return { success: false, error: 'Rate limit exceeded. Please try again in a moment.' };
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Network error. Please check your internet connection.' };
    }
    return { success: false, error: `Error: ${error.message}` };
  }
}

async function testApiKey(apiKey) {
  try {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return { success: true, message: 'API key is valid!' };
  } catch (error) {
    if (error.status === 401) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: false, error: error.message };
  }
}

module.exports = { suggestRename, testApiKey, extractTextFromPDF };
