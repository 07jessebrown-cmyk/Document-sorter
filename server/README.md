# Document Sorter Backend Server

This is the backend proxy server for the Document Sorter Electron application. It provides secure API endpoints for OpenAI integration and document processing.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env` and update with your actual values:
     - `OPENAI_API_KEY`: Your OpenAI API key
     - `CLIENT_TOKEN`: A secure token for client authentication
     - `PORT`: Server port (default: 3000)

3. Start the server:
   ```bash
   npm start
   # or
   node index.js
   ```

## API Endpoints

### Health Check
- `GET /health` - Returns server status

### OpenAI Proxy
- `POST /api/openai` - Proxy for OpenAI Chat Completions API
  - Headers: `X-Client-Token` (required)
  - Body: `{ messages, model?, max_tokens? }`

### Document Processing
- `POST /api/process-document` - Process documents with AI
  - Headers: `X-Client-Token` (required)
  - Body: `{ text, instructions }`

## Security Features

- Rate limiting (100 requests per 15 minutes per IP)
- Helmet security headers
- Client token authentication
- Request size limits (10MB)
- CORS enabled for Electron app

## Development

The server runs on `http://localhost:3000` by default. Make sure to update your Electron app to use this endpoint instead of direct OpenAI API calls.
