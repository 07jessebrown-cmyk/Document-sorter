# Document Sorter Backend Deployment Guide

## 🚀 Quick Start

### Prerequisites
- GitHub repository with your code
- OpenAI API key
- Render.com account (free tier available)

### Step 1: Deploy to Render.com

1. **Go to Render.com**
   - Visit https://render.com
   - Sign up/Login with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `document-sorter1`
   - Configure the service:
     - **Name**: `document-sorter-backend`
     - **Environment**: `Node`
     - **Region**: Choose closest to your users
     - **Branch**: `main`
     - **Root Directory**: `server`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`

3. **Set Environment Variables**
   In the Render dashboard, go to Environment tab and add:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   CLIENT_TOKEN=785e4defad269cdc65f10c9ee9d418a2bc1bc97cfbbdb01b76d3ded5d2cca6b8
   NODE_ENV=production
   PORT=10000
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)
   - Note your service URL (e.g., `https://document-sorter-backend.onrender.com`)

### Step 2: Update Electron App

1. **Create Environment File**
   Create `.env` in the project root:
   ```bash
   BACKEND_URL=https://your-service-name.onrender.com
   CLIENT_TOKEN=785e4defad269cdc65f10c9ee9d418a2bc1bc97cfbbdb01b76d3ded5d2cca6b8
   ```

2. **Test the Connection**
   ```bash
   # Test health endpoint
   curl https://your-service-name.onrender.com/health
   
   # Test API endpoint (replace with your actual URL and token)
   curl -X POST https://your-service-name.onrender.com/api/openai \
     -H "Content-Type: application/json" \
     -H "X-Client-Token: 785e4defad269cdc65f10c9ee9d418a2bc1bc97cfbbdb01b76d3ded5d2cca6b8" \
     -d '{"messages":[{"role":"user","content":"Hello"}]}'
   ```

### Step 3: Build and Test Electron App

1. **Build the App**
   ```bash
   npm run build
   ```

2. **Test Production Build**
   - Run the built app
   - Try the rename functionality
   - Verify it connects to the backend

## 🔧 Configuration Details

### Backend Server Features
- ✅ Express.js server with security middleware
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ CORS enabled for Electron app
- ✅ Client token authentication
- ✅ OpenAI API proxy endpoints
- ✅ Document processing endpoints
- ✅ Health check endpoint

### Security Features
- ✅ Helmet.js for security headers
- ✅ Request size limits (10MB)
- ✅ Input validation
- ✅ Client token authentication
- ✅ Rate limiting per IP

### Environment Variables

#### Backend (Render.com)
- `OPENAI_API_KEY`: Your OpenAI API key
- `CLIENT_TOKEN`: Secure token for client authentication
- `NODE_ENV`: Set to `production`
- `PORT`: Render will override this

#### Client (Electron App)
- `BACKEND_URL`: Your deployed backend URL
- `CLIENT_TOKEN`: Same token as backend

## 🐛 Troubleshooting

### Common Issues

1. **Backend not starting**
   - Check environment variables in Render dashboard
   - Verify `OPENAI_API_KEY` is set correctly
   - Check Render logs for errors

2. **Client can't connect**
   - Verify `BACKEND_URL` is correct
   - Check `CLIENT_TOKEN` matches backend
   - Ensure backend is deployed and running

3. **API errors**
   - Check OpenAI API key is valid
   - Verify rate limits aren't exceeded
   - Check Render logs for detailed errors

### Testing Commands

```bash
# Test backend health
curl https://your-backend-url.onrender.com/health

# Test API with authentication
curl -X POST https://your-backend-url.onrender.com/api/openai \
  -H "Content-Type: application/json" \
  -H "X-Client-Token: your-token" \
  -d '{"messages":[{"role":"user","content":"Test"}]}'
```

## 📊 Monitoring

- **Render Dashboard**: Monitor server status and logs
- **OpenAI Dashboard**: Monitor API usage and costs
- **Application Logs**: Check Electron app console for errors

## 🔄 Updates

To update the backend:
1. Push changes to GitHub
2. Render will automatically redeploy
3. No client changes needed (if API is compatible)

## 💰 Costs

- **Render Free Tier**: 750 hours/month (sufficient for development)
- **OpenAI API**: Pay per use (typically $0.002 per 1K tokens)
- **Total**: Usually under $5/month for moderate usage
