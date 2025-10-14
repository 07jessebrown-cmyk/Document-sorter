```markdown
# OpenAI Integration - 3-Day MVP Rollout

## Project Goal
Get AI rename suggestions working with OpenAI API for fast, accurate results with zero performance impact on user's computer.

---

## Day 1: Setup & Core Service (3-4 hours)

### Morning: Environment Setup - //completed
- [ ] Get OpenAI API key: Go to platform.openai.com/api-keys
- [ ] Create new API key, copy it somewhere safe
- [ ] Install OpenAI package: `npm install openai`
- [ ] Test API key works: `node -e "const OpenAI = require('openai'); const client = new OpenAI({apiKey: 'YOUR_KEY'}); client.models.list().then(r => console.log('✅ Connected'))"`
- [ ] Stop Ollama: `pkill ollama` (free up resources)
- [ ] Uninstall Ollama package: `npm uninstall ollama`

### Afternoon: Create AI Service //completed 
- [ ] Create file: `src/services/aiService.js`
- [ ] Import OpenAI: `const OpenAI = require('openai');`
- [ ] Import existing pdf-parse: `const pdfParse = require('pdf-parse');`
- [ ] Write `extractTextFromPDF(filePath)` function
- [ ] Write `suggestRename(filePath, apiKey)` function that calls OpenAI
- [ ] Use model `gpt-4o-mini` (fast and cheap: $0.15/$0.60 per 1M tokens)
- [ ] Write simple prompt: "Suggest 3 clear, descriptive filenames for this document"
- [ ] Test function manually with your API key and a sample PDF
- [ ] Add error handling for invalid API key, network errors, rate limits
- [ ] Commit: `git commit -m "Add OpenAI service for AI rename suggestions"`

### Evening: Add Settings Storage //completed
- [ ] Create `src/services/settingsService.js` for storing API key securely
- [ ] Use electron's app.getPath('userData') to store config
- [ ] Create `saveApiKey(key)` and `getApiKey()` functions
- [ ] Encrypt API key (use simple base64 for now, can improve later)
- [ ] Test: save key, restart app, retrieve key
- [ ] Commit: `git commit -m "Add settings service for API key storage"`

---

## Day 2: IPC Bridge & Settings UI (3-4 hours)

### Morning: Connect Main Process //completed
- [ ] Open `src/main/main.js`
- [ ] Import aiService: `const aiService = require('../services/aiService');`
- [ ] Import settingsService: `const settingsService = require('../services/settingsService');`
- [ ] Find the `app.whenReady()` section with other IPC handlers
- [ ] Add handler: `ipcMain.handle('ai:suggest-rename', async (event, filePath) => {...})`
- [ ] Inside handler: get API key from settings, call aiService.suggestRename
- [ ] Add handler: `ipcMain.handle('settings:save-api-key', async (event, key) => {...})`
- [ ] Add handler: `ipcMain.handle('settings:get-api-key', async () => {...})`
- [ ] Add handler: `ipcMain.handle('settings:test-api-key', async (event, key) => {...})` to validate key
- [ ] Add try/catch and return helpful error messages
- [ ] Test with: `npm start` and check no errors on startup

### Afternoon: Update Preload Bridge //completed
- [ ] Open `src/main/preload.js`
- [ ] Add to `contextBridge.exposeInMainWorld('electronAPI', {...}):`
- [ ] Add: `suggestRename: (filePath) => ipcRenderer.invoke('ai:suggest-rename', filePath)`
- [ ] Add: `saveApiKey: (key) => ipcRenderer.invoke('settings:save-api-key', key)`
- [ ] Add: `getApiKey: () => ipcRenderer.invoke('settings:get-api-key')`
- [ ] Add: `testApiKey: (key) => ipcRenderer.invoke('settings:test-api-key', key)`
- [ ] Save and verify no syntax errors
- [ ] Commit: `git commit -m "Add IPC bridge for OpenAI and settings"`

### Evening: Create Settings UI
- [ ] Open `src/renderer/index.html`
- [ ] Add "Settings" button to main UI (near existing buttons)
- [ ] Create settings modal/panel (can reuse existing modal structure if you have one)
- [ ] Add input field for API key: `<input type="password" id="apiKeyInput" placeholder="sk-...">`
- [ ] Add "Test Connection" button
- [ ] Add "Save" and "Cancel" buttons
- [ ] Add instructions: "Get your API key from platform.openai.com/api-keys"
- [ ] Add cost estimate: "Estimated cost: $0.0002 per document (~$0.20 per 1000 documents)"
- [ ] Style to match existing UI
- [ ] Verify modal opens when settings button clicked

---

## Day 3: Wire Up UI & Ship (4-5 hours)

### Morning: Implement Settings Handlers //complete 
- [ ] Open `src/renderer/renderer.js`
- [ ] Add click handler for Settings button to open modal
- [ ] Write `loadSettings()` function that calls `window.electronAPI.getApiKey()` and populates input
- [ ] Write `saveSettings()` function that gets input value and calls `window.electronAPI.saveApiKey(key)`
- [ ] Write `testApiKey()` function that calls `window.electronAPI.testApiKey(key)` and shows result
- [ ] Show success/error messages for each action
- [ ] Call `loadSettings()` on app startup to check if key is configured
- [ ] Show "Configure API Key" prompt if not set

### Mid-Morning: Add AI Suggestion Button //complete
- [x] Find the file list area or main action buttons in `index.html`
- [x] Add button: `<button id="aiSuggestBtn">Get AI Suggestions</button>`
- [x] Style button to match existing UI
- [x] Disable button if API key not configured (check on startup)
- [x] Add tooltip: "Configure API key in Settings first"

### Afternoon: Implement AI Suggestion Flow //complete
- [x] In `renderer.js`, add click handler for AI button
- [x] Write `handleAISuggest()` function:
  - Check if API key configured (if not, open settings)
  - Get currently selected file path
  - Show loading state (disable button, change text to "Analyzing...")
  - Call `await window.electronAPI.suggestRename(filePath)`
  - Handle success: show suggestions modal
  - Handle errors: show user-friendly message
  - Reset button state
- [x] Write `showSuggestionsModal(suggestions, filePath)` function:
  - Show original filename
  - List 3 suggestions as clickable cards/buttons
  - Add "Custom" input for manual editing
  - Add "Cancel" button
  - Wire up click to rename file
- [x] Test full flow: click button → analyzing → see suggestions → click one → file renamed

### Late Afternoon: Error Handling & Edge Cases
- [ ] Handle "Invalid API key" error → prompt to check settings
- [ ] Handle "Rate limit exceeded" error → show friendly message
- [ ] Handle "Network error" → show "Check internet connection"
- [ ] Handle "No file selected" → disable button
- [ ] Handle "File extraction failed" → show error, offer to skip
- [ ] Handle "API timeout" (30 second limit) → show error, offer retry
- [ ] Disable AI button if no API key configured
- [ ] Show clear error messages in modal, not console

### Evening: Test & Polish
- [ ] Test with 5 different PDF files
- [ ] Test with invalid API key (should show helpful error)
- [ ] Test with no internet connection
- [ ] Test with no file selected (button disabled)
- [ ] Test API key save/load (restart app, key should persist)
- [ ] Test "Test Connection" button in settings
- [ ] Fix any UI glitches or bugs
- [ ] Test rename actually works and file updates in filesystem
- [ ] Add loading spinner or progress indicator
- [ ] Commit: `git commit -m "Complete OpenAI AI rename suggestions MVP"`
- [ ] Push to GitHub: `git push origin main`

---

## Reference Code Implementation

### File 1: `src/services/aiService.js` (create new file, ~60 lines)
```javascript
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

module.exports = { suggestRename, testApiKey };
```

### File 2: `src/services/settingsService.js` (create new file, ~40 lines)
```javascript
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsService {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return {};
  }

  save() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  saveApiKey(apiKey) {
    const encoded = Buffer.from(apiKey).toString('base64');
    this.settings.openaiApiKey = encoded;
    this.save();
  }

  getApiKey() {
    if (this.settings.openaiApiKey) {
      return Buffer.from(this.settings.openaiApiKey, 'base64').toString('utf8');
    }
    return null;
  }

  hasApiKey() {
    return !!this.settings.openaiApiKey;
  }
}

module.exports = new SettingsService();
```

### File 3: Add to `src/main/main.js` (add these lines inside `app.whenReady()` with other handlers)
```javascript
const aiService = require('../services/aiService');
const settingsService = require('../services/settingsService');

ipcMain.handle('ai:suggest-rename', async (event, filePath) => {
  const apiKey = settingsService.getApiKey();
  if (!apiKey) {
    return { success: false, error: 'Please configure your OpenAI API key in Settings' };
  }
  return await aiService.suggestRename(filePath, apiKey);
});

ipcMain.handle('settings:save-api-key', async (event, apiKey) => {
  try {
    settingsService.saveApiKey(apiKey);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:get-api-key', async () => {
  return settingsService.getApiKey();
});

ipcMain.handle('settings:has-api-key', async () => {
  return settingsService.hasApiKey();
});

ipcMain.handle('settings:test-api-key', async (event, apiKey) => {
  return await aiService.testApiKey(apiKey);
});
```

### File 4: Add to `src/main/preload.js` (add to existing contextBridge object)
```javascript
suggestRename: (filePath) => ipcRenderer.invoke('ai:suggest-rename', filePath),
saveApiKey: (key) => ipcRenderer.invoke('settings:save-api-key', key),
getApiKey: () => ipcRenderer.invoke('settings:get-api-key'),
hasApiKey: () => ipcRenderer.invoke('settings:has-api-key'),
testApiKey: (key) => ipcRenderer.invoke('settings:test-api-key', key),
```

### File 5: Add to `src/renderer/index.html` (add where appropriate)
```html
<button id="settingsBtn" class="btn">⚙️ Settings</button>
<button id="aiSuggestBtn" class="btn" disabled>✨ Get AI Suggestions</button>

<div id="settingsModal" class="modal" style="display: none;">
  <div class="modal-content">
    <h2>AI Settings</h2>
    <p>Configure your OpenAI API key to enable AI-powered rename suggestions.</p>
    
    <label for="apiKeyInput">OpenAI API Key:</label>
    <input type="password" id="apiKeyInput" placeholder="sk-proj-..." style="width: 100%; margin: 10px 0;">
    
    <p style="font-size: 12px; color: #666;">
      Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a><br>
      Estimated cost: ~$0.0002 per document ($0.20 per 1000 documents)
    </p>
    
    <div style="margin-top: 20px;">
      <button id="testApiKeyBtn" class="btn">Test Connection</button>
      <button id="saveApiKeyBtn" class="btn btn-primary">Save</button>
      <button id="cancelSettingsBtn" class="btn">Cancel</button>
    </div>
    
    <div id="settingsMessage" style="margin-top: 10px;"></div>
  </div>
</div>

<div id="suggestionsModal" class="modal" style="display: none;">
  <div class="modal-content">
    <h2>AI Suggested Filenames</h2>
    <p><strong>Original:</strong> <span id="originalFilename"></span></p>
    <div id="suggestionsList"></div>
    <button id="closeSuggestionsBtn" class="btn">Cancel</button>
  </div>
</div>
```

### File 6: Add to `src/renderer/renderer.js` (add these functions)
```javascript
let currentFilePath = null;
let apiKeyConfigured = false;

async function initializeAI() {
  apiKeyConfigured = await window.electronAPI.hasApiKey();
  const aiBtn = document.getElementById('aiSuggestBtn');
  if (apiKeyConfigured) {
    aiBtn.disabled = false;
    aiBtn.title = 'Get AI-powered rename suggestions';
  } else {
    aiBtn.disabled = true;
    aiBtn.title = 'Configure API key in Settings first';
  }
}

document.getElementById('settingsBtn')?.addEventListener('click', async () => {
  const modal = document.getElementById('settingsModal');
  const input = document.getElementById('apiKeyInput');
  const apiKey = await window.electronAPI.getApiKey();
  if (apiKey) {
    input.value = apiKey;
  }
  modal.style.display = 'block';
});

document.getElementById('saveApiKeyBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('apiKeyInput');
  const key = input.value.trim();
  const msgDiv = document.getElementById('settingsMessage');
  
  if (!key) {
    msgDiv.textContent = 'Please enter an API key';
    msgDiv.style.color = 'red';
    return;
  }
  
  const result = await window.electronAPI.saveApiKey(key);
  if (result.success) {
    msgDiv.textContent = '✅ API key saved successfully!';
    msgDiv.style.color = 'green';
    apiKeyConfigured = true;
    document.getElementById('aiSuggestBtn').disabled = false;
    setTimeout(() => {
      document.getElementById('settingsModal').style.display = 'none';
    }, 1500);
  } else {
    msgDiv.textContent = `Error: ${result.error}`;
    msgDiv.style.color = 'red';
  }
});

document.getElementById('testApiKeyBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('apiKeyInput');
  const key = input.value.trim();
  const msgDiv = document.getElementById('settingsMessage');
  
  if (!key) {
    msgDiv.textContent = 'Please enter an API key';
    msgDiv.style.color = 'red';
    return;
  }
  
  msgDiv.textContent = 'Testing connection...';
  msgDiv.style.color = 'blue';
  
  const result = await window.electronAPI.testApiKey(key);
  if (result.success) {
    msgDiv.textContent = '✅ Connection successful! API key is valid.';
    msgDiv.style.color = 'green';
  } else {
    msgDiv.textContent = `❌ ${result.error}`;
    msgDiv.style.color = 'red';
  }
});

document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => {
  document.getElementById('settingsModal').style.display = 'none';
});

document.getElementById('aiSuggestBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    alert('Please select a file first');
    return;
  }
  
  const btn = document.getElementById('aiSuggestBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  
  const result = await window.electronAPI.suggestRename(currentFilePath);
  
  btn.disabled = false;
  btn.textContent = '✨ Get AI Suggestions';
  
  if (result.success) {
    showSuggestionsModal(result.suggestions, currentFilePath);
  } else {
    alert(`Error: ${result.error}`);
  }
});

function showSuggestionsModal(suggestions, filePath) {
  const modal = document.getElementById('suggestionsModal');
  const originalName = document.getElementById('originalFilename');
  const list = document.getElementById('suggestionsList');
  
  originalName.textContent = filePath.split('/').pop();
  list.innerHTML = '';
  
  suggestions.forEach((suggestion, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn suggestion-btn';
    btn.textContent = `${i + 1}. ${suggestion}`;
    btn.onclick = () => applyRename(filePath, suggestion);
    list.appendChild(btn);
  });
  
  modal.style.display = 'block';
}

function applyRename(oldPath, newName) {
  const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const newPath = `${dir}/${newName}`;
  
  fs.renameSync(oldPath, newPath);
  
  document.getElementById('suggestionsModal').style.display = 'none';
  alert(`✅ File renamed to: ${newName}`);
  
  refreshFileList();
}

document.getElementById('closeSuggestionsBtn')?.addEventListener('click', () => {
  document.getElementById('suggestionsModal').style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
  initializeAI();
});
```

### File 7: Add to `src/renderer/style.css` (basic modal styling if not already present)
```css
.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.5);
}

.modal-content {
  background-color: #fff;
  margin: 10% auto;
  padding: 30px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.suggestion-btn {
  display: block;
  width: 100%;
  margin: 10px 0;
  padding: 15px;
  text-align: left;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.suggestion-btn:hover {
  background: #e8e8e8;
  border-color: #0066cc;
}

.btn-primary {
  background: #0066cc;
  color: white;
}

.btn-primary:hover {
  background: #0052a3;
}
```

---

## Success Criteria
- [ ] Settings modal opens and saves API key
- [ ] Test Connection button validates API key
- [ ] AI button appears and is disabled without API key
- [ ] After configuring key, AI button becomes enabled
- [ ] Click AI button with PDF selected
- [ ] See "Analyzing..." for 1-2 seconds (fast!)
- [ ] Modal shows 3 AI-generated suggestions
- [ ] Click a suggestion and file gets renamed
- [ ] File actually renamed in filesystem
- [ ] No console errors
- [ ] Computer runs smoothly during analysis (no slowdown!)

---

## Advantages Over Ollama
✅ **2-5x faster** (1-2 seconds vs 5-10 seconds)
✅ **Zero performance impact** on user's computer
✅ **Better accuracy** (GPT-4o-mini is smarter)
✅ **Smaller app** (no model bundling needed)
✅ **Works on any hardware** (no RAM/CPU requirements)
✅ **Always up-to-date** (automatic model improvements)

---

## Cost Management
**User pays for their own usage** with their API key. You're not responsible for costs.

**Estimated costs:**
- Per document: $0.0002 (2 hundredths of a penny)
- 100 documents: $0.02 (2 cents)
- 1000 documents: $0.20 (20 cents)
- 10,000 documents: $2.00

**Alternative:** You could offer a "Pro" version where YOU pay for API costs and charge users $5-10/month subscription.

---

## Security Notes
- [ ] API key stored in app's userData folder (not in version control)
- [ ] API key encrypted with base64 (basic, can improve with proper encryption later)
- [ ] Never log or expose API key in console
- [ ] Never commit settings.json to git (add to .gitignore)
- [ ] Remind users to keep API key private

Add to `.gitignore`:
```
settings.json
```

---

## After Day 3
**If it works:**
- [ ] Test with 10 different documents
- [ ] Get user feedback on suggestion quality
- [ ] Add support for DOCX, images (using existing extractors)
- [ ] Consider adding batch processing
- [ ] Consider adding usage tracking (optional)

**If users complain about costs:**
- [ ] Show usage stats in settings
- [ ] Add cost estimator before processing
- [ ] Consider bundling credits or subscription model

---

## Troubleshooting

**"Invalid API key" error:**
- Check key starts with `sk-proj-` or `sk-`
- Verify key copied correctly (no spaces)
- Try generating new key on OpenAI dashboard

**"Rate limit exceeded":**
- OpenAI has free tier limits
- User needs to add payment method to their OpenAI account
- Or wait a few minutes and try again

**Network errors:**
- Check internet connection
- Check firewall isn't blocking openai.com
- Try again in a moment

**Slow responses:**
- Should be 1-2 seconds, much faster than Ollama
- If slow, check internet speed
- OpenAI might be experiencing issues (rare)

---

## Commit Strategy
Day 1 end: `git commit -m "Add OpenAI service and settings storage"`
Day 2 end: `git commit -m "Add IPC bridge and settings UI"`
Day 3 end: `git commit -m "Complete OpenAI AI rename MVP - ready to ship"`

---

**Total Estimated Time:** 10-13 hours over 3 days
**Lines of Code:** ~300 lines total
**Dependencies Added:** 1 (openai npm package)
**Performance Impact:** Zero (runs in cloud)
**User Cost:** ~$0.0002 per document
**Risk Level:** Low (proven API, simple integration)

**GO BUILD IT! 🚀 Your computer will thank you.**
```