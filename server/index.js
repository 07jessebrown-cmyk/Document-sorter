const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pdfParse = require('pdf-parse');
require('dotenv').config();

// ✅ fetch fixed for Node environment
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

// Helper function to ensure fetch is loaded
async function ensureFetch() {
  if (!fetch) {
    await new Promise(resolve => {
      const checkFetch = () => {
        if (fetch) {
          resolve();
        } else {
          setTimeout(checkFetch, 10);
        }
      };
      checkFetch();
    });
  }
  return fetch;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware for Electron app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Client-Token');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Authentication middleware
const authenticateClient = (req, res, next) => {
  const clientToken = req.headers['x-client-token'];
  const expectedToken = process.env.CLIENT_TOKEN;
  
  if (!clientToken || !expectedToken || clientToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid client token' });
  }
  
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// OpenAI proxy endpoint
app.post('/api/openai', authenticateClient, async (req, res) => {
  try {
    const { messages, model = 'gpt-3.5-turbo', max_tokens = 1000 } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    const fetchFn = await ensureFetch();
    const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      return res.status(response.status).json({ 
        error: 'OpenAI API error', 
        details: errorData 
      });
    }
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF text extraction and AI renaming endpoint
app.post('/api/rename-document', authenticateClient, async (req, res) => {
  try {
    const { pdfBuffer, originalFilename } = req.body;
    
    if (!pdfBuffer) {
      return res.status(400).json({ error: 'PDF buffer is required' });
    }
    
    console.log('📄 Processing PDF:', originalFilename || 'Unknown');
    console.log('📄 PDF buffer size:', pdfBuffer.length, 'bytes');
    
    // Extract text from PDF
    let extractedText;
    try {
      const pdfData = await pdfParse(Buffer.from(pdfBuffer, 'base64'));
      extractedText = pdfData.text;
      console.log('📄 Extracted text length:', extractedText.length);
      console.log('📄 First 200 chars:', extractedText.substring(0, 200));
    } catch (pdfError) {
      console.error('❌ PDF parsing error:', pdfError.message);
      return res.status(400).json({ 
        error: 'Failed to parse PDF', 
        details: pdfError.message,
        fallback: originalFilename ? originalFilename.replace('.pdf', '_AI.pdf') : 'Document_AI.pdf'
      });
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.log('⚠️ No text extracted from PDF');
      const fallbackName = originalFilename ? originalFilename.replace('.pdf', '_AI.pdf') : 'Document_AI.pdf';
      return res.json({
        success: true,
        filename: fallbackName,
        extractedText: '',
        aiResponse: 'No text found in PDF'
      });
    }
    
    // Send to OpenAI for intelligent naming
    const systemPrompt = "You are a professional document naming AI. RULES: 1) Identify document type (Invoice, Contract, Receipt, Statement, Report, Letter, Assignment, Essay, Notes) 2) Extract title/subject 3) Extract author/student name 4) Extract class/course if mentioned 5) Extract date (YYYY-MM-DD) 6) Format as DocumentType_Title_Author_Class_Date.pdf 7) Use underscores, no spaces 8) Keep under 60 chars 9) Use smart placeholders if missing info. EXAMPLES: Document: 'MATH 101 Assignment 3: Calculus Problems Due: March 15, 2024 Student: John Smith' Output: Assignment_CalculusProblems_JohnSmith_MATH101_2024-03-15.pdf | Document: 'INVOICE #12345 Bill To: Acme Corporation Date: January 15, 2024' Output: Invoice_AcmeCorporation_2024-01-15_12345.pdf | Document: 'History Essay: World War II Causes Student: Jane Doe Class: HIST 201' Output: Essay_WorldWarIICauses_JaneDoe_HIST201.pdf. Now analyze this document and respond with ONLY the filename, nothing else.";
    
    const userPrompt = "DOCUMENT CONTENT:\n" + extractedText.substring(0, 6000);
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];
    
    let aiResponse;
    try {
      const fetchFn = await ensureFetch();
      const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages,
          max_tokens: 100,
          temperature: 0.3
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ OpenAI API Error:', errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      aiResponse = data.choices?.[0]?.message?.content?.trim();
      console.log('🤖 AI raw response:', aiResponse);
      
    } catch (aiError) {
      console.error('❌ AI processing error:', aiError.message);
      const fallbackName = originalFilename ? originalFilename.replace('.pdf', '_AI.pdf') : 'Document_AI.pdf';
      return res.json({
        success: true,
        filename: fallbackName,
        extractedText: extractedText.substring(0, 500),
        aiResponse: 'AI processing failed',
        error: aiError.message
      });
    }
    
    // Clean and validate the AI response
    let suggestedFilename = aiResponse;
    
    if (!suggestedFilename) {
      console.log('⚠️ No filename suggestion from AI');
      const fallbackName = originalFilename ? originalFilename.replace('.pdf', '_AI.pdf') : 'Document_AI.pdf';
      return res.json({
        success: true,
        filename: fallbackName,
        extractedText: extractedText.substring(0, 500),
        aiResponse: 'No suggestion received'
      });
    }
    
    // Clean the filename
    suggestedFilename = suggestedFilename.replace(/['"]/g, '');
    if (!suggestedFilename.endsWith('.pdf')) {
      suggestedFilename += '.pdf';
    }
    
    console.log('✅ AI Suggestion:', suggestedFilename);
    
    res.json({
      success: true,
      filename: suggestedFilename,
      extractedText: extractedText.substring(0, 500), // First 500 chars for debugging
      aiResponse: aiResponse,
      originalFilename: originalFilename
    });
    
  } catch (error) {
    console.error('❌ Server Error:', error);
    const fallbackName = req.body.originalFilename ? 
      req.body.originalFilename.replace('.pdf', '_AI.pdf') : 
      'Document_AI.pdf';
    
    res.status(500).json({ 
      success: false, 
      filename: fallbackName,
      error: error.message 
    });
  }
});

// Document processing endpoint (for document sorting functionality)
app.post('/api/process-document', authenticateClient, async (req, res) => {
  try {
    const { text, instructions } = req.body;
    
    if (!text || !instructions) {
      return res.status(400).json({ error: 'Text and instructions are required' });
    }
    
    // Debug logging
    console.log('📄 Document text length:', text?.length || 0);
    console.log('📄 First 100 chars:', text?.substring(0, 100));
    
    const systemPrompt = "You are a professional document naming AI. RULES: 1) Identify document type (Invoice, Contract, Receipt, Statement, Report, Letter) 2) Extract company/client name 3) Extract date (YYYY-MM-DD) 4) Extract ID numbers 5) Format as DocumentType_CompanyName_Date_ID.pdf 6) Use underscores, no spaces 7) Keep under 60 chars 8) Use smart placeholders if missing info. EXAMPLES: Document: 'INVOICE #12345 Bill To: Acme Corporation Date: January 15, 2024' Output: Invoice_AcmeCorporation_2024-01-15_12345.pdf | Document: 'SERVICE AGREEMENT Between TechCorp and John Smith Effective Date: March 1, 2024' Output: ServiceAgreement_TechCorp_JohnSmith_2024-03-01.pdf | Document: 'RECEIPT Starbucks Coffee Date: 01/20/2024' Output: Receipt_Starbucks_2024-01-20.pdf. Now analyze this document and respond with ONLY the filename, nothing else.";

    const userPrompt = "DOCUMENT CONTENT:\n" + text.substring(0, 6000);

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];
    
    const fetchFn = await ensureFetch();
    const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 100,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      return res.status(response.status).json({ 
        error: 'OpenAI API error', 
        details: errorData 
      });
    }
    
    const data = await response.json();
    
    // Debug logging for AI response
    console.log('🤖 AI raw response:', data.choices?.[0]?.message?.content);
    
    // Clean and validate the AI response
    let suggestedFilename = data.choices?.[0]?.message?.content?.trim();
    
    if (!suggestedFilename) {
      return res.status(500).json({ 
        success: false, 
        filename: "Document_" + Date.now() + ".pdf", 
        error: 'No filename suggestion received from AI' 
      });
    }
    
    // Clean the filename
    suggestedFilename = suggestedFilename.replace(/['"]/g, '');
    if (!suggestedFilename.endsWith('.pdf')) {
      suggestedFilename += '.pdf';
    }
    
    console.log('✅ AI Suggestion:', suggestedFilename);
    
    res.json({
      success: true,
      choices: [{
        message: {
          content: suggestedFilename
        }
      }],
      usage: data.usage,
      model: data.model
    });
    
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ 
      success: false, 
      filename: "Document_" + Date.now() + ".pdf", 
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
