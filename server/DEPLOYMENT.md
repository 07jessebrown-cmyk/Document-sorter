# Backend Deployment Guide

## Render.com Deployment Steps

### 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub account
- Connect your GitHub repository

### 2. Create New Web Service
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Select the repository: `document-sorter1`
- Set the following:
  - **Name**: `document-sorter-backend`
  - **Environment**: `Node`
  - **Region**: Choose closest to your users
  - **Branch**: `main`
  - **Root Directory**: `server`
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`

### 3. Environment Variables
Set these in the Render dashboard under "Environment":
- `OPENAI_API_KEY`: Your OpenAI API key
- `CLIENT_TOKEN`: A secure random string (use: `openssl rand -hex 32`)
- `NODE_ENV`: `production`
- `PORT`: `10000` (Render will override this)

### 4. Deploy
- Click "Create Web Service"
- Wait for deployment to complete
- Note the service URL (e.g., `https://document-sorter-backend.onrender.com`)

### 5. Test Deployment
```bash
# Health check
curl https://your-service-url.onrender.com/health

# Test API (replace with your actual URL and token)
curl -X POST https://your-service-url.onrender.com/api/openai \
  -H "Content-Type: application/json" \
  -H "X-Client-Token: your-client-token" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Alternative: Railway Deployment

### 1. Create Railway Account
- Go to https://railway.app
- Sign up with GitHub

### 2. Deploy from GitHub
- Click "New Project" → "Deploy from GitHub repo"
- Select your repository
- Railway will auto-detect it's a Node.js project

### 3. Set Environment Variables
- Go to project settings → Variables
- Add: `OPENAI_API_KEY`, `CLIENT_TOKEN`, `NODE_ENV=production`

### 4. Deploy
- Railway will automatically deploy
- Get your service URL from the dashboard

## Security Notes
- Never commit `.env` files
- Use strong, random `CLIENT_TOKEN`
- Monitor usage in OpenAI dashboard
- Consider upgrading to paid plan for better performance
