const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
require('dotenv').config();

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
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

// Document processing endpoint (for document sorting functionality)
app.post('/api/process-document', authenticateClient, async (req, res) => {
  try {
    const { text, instructions } = req.body;
    
    if (!text || !instructions) {
      return res.status(400).json({ error: 'Text and instructions are required' });
    }
    
    const messages = [
      {
        role: 'system',
        content: 'You are a document processing assistant. Analyze the provided text and follow the given instructions to categorize, rename, or process the document.'
      },
      {
        role: 'user',
        content: `Instructions: ${instructions}\n\nDocument text: ${text}`
      }
    ];
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 500,
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
    res.json(data);
    
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
