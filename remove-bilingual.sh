#!/bin/bash

echo "🧹 Removing bilingual/language detection feature..."

echo "📦 Creating backup commit..."
git add -A
git commit -m "Backup before removing bilingual feature" 2>/dev/null || echo "Nothing to commit"

echo "📦 Removing franc dependency..."
npm uninstall franc

echo "🗑️  Deleting langService.js..."
rm -f src/services/langService.js

echo "✏️  Cleaning up enhancedParsingService.js..."
if [ -f src/services/enhancedParsingService.js ]; then
  sed -i '' '/const LanguageService = require.*langService/d' src/services/enhancedParsingService.js
  sed -i '' '/const.*LanguageService.*=.*require/d' src/services/enhancedParsingService.js
  
  awk '
    /this\.languageService = new LanguageService/ { skip=1; brace_count=0 }
    skip && /{/ { brace_count++ }
    skip && /}/ { 
      brace_count--
      if (brace_count <= 0) { skip=0; next }
    }
    !skip { print }
  ' src/services/enhancedParsingService.js > src/services/enhancedParsingService.js.tmp
  mv src/services/enhancedParsingService.js.tmp src/services/enhancedParsingService.js
  
  awk '
    /async detectLanguage\(text\)/ { skip=1; brace_count=0 }
    skip && /{/ { brace_count++ }
    skip && /}/ { 
      brace_count--
      if (brace_count <= 0) { skip=0; next }
    }
    !skip { print }
  ' src/services/enhancedParsingService.js > src/services/enhancedParsingService.js.tmp
  mv src/services/enhancedParsingService.js.tmp src/services/enhancedParsingService.js
  
  sed -i '' '/const languageInfo = await this\.detectLanguage/d' src/services/enhancedParsingService.js
  sed -i '' '/detectedLanguage: languageInfo/d' src/services/enhancedParsingService.js
  sed -i '' '/languageName: languageInfo/d' src/services/enhancedParsingService.js
  
  sed -i '' 's/mergeResults(regexResult, aiResult, tableResult = null, languageInfo = null)/mergeResults(regexResult, aiResult, tableResult = null)/g' src/services/enhancedParsingService.js
  sed -i '' 's/this\.mergeResults([^,]*, [^,]*, [^,]*, languageInfo)/this.mergeResults(\1, \2, \3)/g' src/services/enhancedParsingService.js
  
  sed -i '' 's/, languageInfo = null//g' src/services/enhancedParsingService.js
  sed -i '' 's/, languageInfo//g' src/services/enhancedParsingService.js
  
  sed -i '' '/const isBilingualMode = languageInfo/,/languageInfo\.confidence > 0\.5;/d' src/services/enhancedParsingService.js
  
  sed -i '' '/if (this\.languageService)/,/this\.languageService = null;/d' src/services/enhancedParsingService.js
fi

echo "✏️  Cleaning up ai_prompts.js..."
if [ -f src/services/ai_prompts.js ]; then
  sed -i '' 's/detectedLanguage = null,//g' src/services/ai_prompts.js
  sed -i '' 's/languageName = null,//g' src/services/ai_prompts.js
  sed -i '' 's/, detectedLanguage//g' src/services/ai_prompts.js
  sed -i '' 's/, languageName//g' src/services/ai_prompts.js
  sed -i '' 's/detectedLanguage,//g' src/services/ai_prompts.js
  sed -i '' 's/languageName,//g' src/services/ai_prompts.js
  
  sed -i '' '/const languageContext = detectedLanguage/,/: \x27\x27;/d' src/services/ai_prompts.js
  sed -i '' '/const languageHint = detectedLanguage/,/: \x27\x27;/d' src/services/ai_prompts.js
  sed -i '' 's/\${languageContext}//g' src/services/ai_prompts.js
  sed -i '' 's/\${languageHint}//g' src/services/ai_prompts.js
  
  sed -i '' '/@param {string} options\.detectedLanguage/d' src/services/ai_prompts.js
  sed -i '' '/@param {string} options\.languageName/d' src/services/ai_prompts.js
  sed -i '' '/@param {string} detectedLanguage/d' src/services/ai_prompts.js
  sed -i '' '/@param {string} languageName/d' src/services/ai_prompts.js
fi

echo "✏️  Cleaning up config files..."
for config in config/*.json; do
  if [ -f "$config" ]; then
    sed -i '' '/"language":/d' "$config" 2>/dev/null
  fi
done

echo "🔍 Testing JavaScript syntax..."
node -c src/services/enhancedParsingService.js 2>/dev/null && echo "✅ enhancedParsingService.js syntax OK" || echo "❌ enhancedParsingService.js has syntax errors"
node -c src/services/ai_prompts.js 2>/dev/null && echo "✅ ai_prompts.js syntax OK" || echo "❌ ai_prompts.js has syntax errors"

echo "💾 Committing changes..."
git add -A
git commit -m "Remove bilingual/language detection feature - unnecessary complexity

- Removed franc dependency
- Deleted langService.js
- Removed language detection from enhancedParsingService
- Removed language parameters from AI prompts
- Cleaned up config files"

echo ""
echo "✅ Bilingual feature removed!"
echo ""
echo "Next steps:"
echo "1. Run 'npm start' to test the app"
echo "2. Process a test document to verify it still works"
echo "3. Run 'git push origin main' when ready"
echo ""
echo "Note: OCR language settings (English/Spanish) are kept - those are fine."

