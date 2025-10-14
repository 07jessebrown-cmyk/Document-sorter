# Backend Integration Guide

This document explains how the Document Sorter Electron app has been integrated with a backend proxy server for secure API handling.

## Architecture

```
Electron App (Renderer) 
    ↓ IPC
Electron App (Main Process)
    ↓ HTTP
Backend Proxy Server (localhost:3000)
    ↓ HTTPS
OpenAI API
```

## Changes Made

### 1. Backend Server (`/server/`)
- **Express server** with security middleware
- **Rate limiting** (100 requests per 15 minutes)
- **Client authentication** via X-Client-Token header
- **OpenAI proxy endpoints**:
  - `POST /api/openai` - Direct OpenAI API proxy
  - `POST /api/process-document` - Document processing
  - `GET /health` - Health check

### 2. Backend Proxy Service (`src/services/backendProxyService.js`)
- **HTTP client** for communicating with backend
- **Retry logic** with exponential backoff
- **Error handling** and connection testing
- **API compatibility** with existing LLMClient interface

### 3. Updated Services
- **aiService.js**: Now uses backend proxy instead of direct OpenAI calls
- **llmClientBackend.js**: New LLM client that uses backend proxy
- **enhancedParsingService.js**: Updated to use backend proxy client
- **main.js**: Added backend environment variables

## Environment Variables

The following environment variables are now used:

```bash
# Backend Configuration
BACKEND_URL=http://localhost:3000
CLIENT_TOKEN=your_secure_client_token_here

# OpenAI Configuration (set in backend .env)
OPENAI_API_KEY=your_openai_api_key_here
```

## Security Features

1. **No API keys in Electron app** - All secrets are on the backend
2. **Client token authentication** - Prevents unauthorized access
3. **Rate limiting** - Prevents abuse
4. **Request size limits** - Prevents large payload attacks
5. **CORS configuration** - Secure cross-origin requests

## Testing

### Start Backend Server
```bash
cd server
node index.js
```

### Test Backend Connection
```bash
node test-backend.js
```

### Test Integration
```bash
node test-integration.js
```

### Test Rename Functionality
```bash
node test-rename.js
```

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### OpenAI Proxy
```bash
curl -X POST http://localhost:3000/api/openai \
  -H "Content-Type: application/json" \
  -H "X-Client-Token: your_secure_client_token_here" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

### Document Processing
```bash
curl -X POST http://localhost:3000/api/process-document \
  -H "Content-Type: application/json" \
  -H "X-Client-Token: your_secure_client_token_here" \
  -d '{
    "text": "Invoice from Acme Corp",
    "instructions": "Extract company name"
  }'
```

## Next Steps (Day 3)

1. **Deploy backend to cloud** (Render/Railway)
2. **Update Electron app** to use deployed backend URL
3. **Test production integration**
4. **Configure environment variables** in production

## Troubleshooting

### Backend Server Won't Start
- Check if port 3000 is available
- Verify all dependencies are installed: `npm install`
- Check server logs for errors

### Connection Refused
- Ensure backend server is running
- Check BACKEND_URL environment variable
- Verify CLIENT_TOKEN matches between app and server

### API Key Errors
- Ensure OPENAI_API_KEY is set in server/.env
- Verify the API key is valid
- Check backend logs for authentication errors
