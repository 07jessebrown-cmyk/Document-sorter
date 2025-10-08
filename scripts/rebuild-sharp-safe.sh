#!/bin/bash

# 🧩 PURPOSE:
# Safely rebuild "sharp" for Electron (macOS ARM64) without crashing or hanging the terminal.
# This script runs step-by-step with confirmations and logs for debugging.

echo "🚀 Starting Sharp + Electron rebuild process (safe mode)..."

# 1️⃣ Move into project directory
cd /Users/jessebrown/Developer/document-sorter1 || {
  echo "❌ Could not enter project directory. Exiting."; exit 1;
}

# 2️⃣ Check Electron + Node versions for compatibility
echo "🧠 Checking versions..."
node -v
npm -v
npx electron --version || echo "⚠️ Electron not found (will install if needed)."

# 3️⃣ Confirm user wants to clean rebuild
read -p "⚠️ This will remove node_modules and rebuild native modules. Continue? (y/n): " confirm
if [[ $confirm != [yY] ]]; then
  echo "❌ Operation canceled."; exit 0;
fi

# 4️⃣ Safe cleanup
echo "🧹 Cleaning previous installs..."
rm -rf node_modules package-lock.json
npm cache clean --force

# 5️⃣ Reinstall all dependencies with verbose logging
echo "📦 Reinstalling dependencies..."
npm install --verbose

# 6️⃣ Ensure electron-rebuild is available
if ! command -v electron-rebuild &> /dev/null; then
  echo "🧰 Installing electron-rebuild..."
  npm install --save-dev electron-rebuild
fi

# 7️⃣ Rebuild sharp specifically for Electron (ARM64)
echo "🔧 Rebuilding sharp for Electron..."
npx electron-rebuild -f -w sharp --arch=arm64 --version=$(npx electron --version | tr -d 'v') || {
  echo "❌ electron-rebuild failed. Check logs above."; exit 1;
}

# 8️⃣ Verification test
echo "✅ Checking sharp module..."
node -p "require('sharp').versions" || {
  echo "❌ Sharp verification failed. Check build logs."; exit 1;
}

# 9️⃣ Launch Electron app
echo "🚀 Launching Electron app..."
npm start

echo "🎉 Done. Sharp rebuilt successfully and Electron launched!"
