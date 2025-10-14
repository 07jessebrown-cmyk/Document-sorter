#!/bin/bash

# Backend Deployment Script
# This script helps deploy the backend to Render.com

echo "🚀 Document Sorter Backend Deployment Script"
echo "============================================="

# Check if we're in the right directory
if [ ! -f "server/package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Generate a secure client token if not provided
if [ -z "$CLIENT_TOKEN" ]; then
    echo "🔑 Generating secure client token..."
    CLIENT_TOKEN=$(openssl rand -hex 32)
    echo "Generated CLIENT_TOKEN: $CLIENT_TOKEN"
    echo "⚠️  IMPORTANT: Save this token securely!"
    echo ""
fi

# Check if OpenAI API key is provided
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: Please set OPENAI_API_KEY environment variable"
    echo "Example: export OPENAI_API_KEY='your-key-here'"
    exit 1
fi

echo "📋 Deployment Checklist:"
echo "1. ✅ Server code is ready"
echo "2. ✅ Dependencies are installed"
echo "3. ✅ Environment variables prepared"
echo ""
echo "🌐 Next Steps:"
echo "1. Go to https://render.com"
echo "2. Create a new Web Service"
echo "3. Connect your GitHub repository"
echo "4. Set the following configuration:"
echo "   - Name: document-sorter-backend"
echo "   - Environment: Node"
echo "   - Root Directory: server"
echo "   - Build Command: npm install"
echo "   - Start Command: npm start"
echo ""
echo "5. Set these environment variables in Render:"
echo "   - OPENAI_API_KEY: $OPENAI_API_KEY"
echo "   - CLIENT_TOKEN: $CLIENT_TOKEN"
echo "   - NODE_ENV: production"
echo "   - PORT: 10000"
echo ""
echo "6. After deployment, update your Electron app with:"
echo "   - BACKEND_URL: https://your-service-name.onrender.com"
echo "   - CLIENT_TOKEN: $CLIENT_TOKEN"
echo ""
echo "📖 See server/DEPLOYMENT.md for detailed instructions"
