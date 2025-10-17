# Document Sorter - AI Suggestions Flow Refactor To-Do List

## Objective
Refactor the Electron app so that the AI suggestions workflow is fully linear and intuitive:  
**Upload document → Get AI suggestions → Popup with suggested names → Select one → Process complete and file is sorted.**  

This document is comprehensive and self-contained for reference in Cursor LLM agent.

---

## 1. AI Quality & Measurement (DO FIRST)

### 1.1 Establish Quality Logging
- [x] Add logging to track every AI suggestion with:
  - Document ID/path
  - AI suggested name
  - User action (accepted/edited/rejected/regenerated)
  - Final chosen name (if edited)
  - Time to decision
  - Model and prompt version used
  - Document type and size
- [x] Create a simple JSON log file or database table for tracking
- [x] Add endpoint or simple viewer to review recent suggestions and acceptance rates

### 1.2 Baseline Assessment
- [ ] Collect 50-100 examples of current AI suggestions
- [ ] Manually categorize them: Good / Mediocre / Bad / Terrible
- [ ] Identify patterns in failures (document types, content issues, etc.)
- [ ] Calculate current acceptance rate baseline

### 1.3 Prompt Engineering Improvements
- [x] Review and improve the AI prompt template in `analyzeDocument()` or `enhancedParsingService`
- [x] Add 5-10 few-shot examples of excellent renames to the system prompt
- [x] Specify explicit naming conventions:
  - Format requirements (date format, separators, casing)
  - Length constraints (max 100 characters)
  - Required elements (date, document type, key identifier)
- [x] Define what makes a "good" filename vs "bad" filename in the prompt
- [x] Add constraints (forbidden characters, patterns to avoid like "Document_1")
- [x] Include document type detection for context-aware naming

### 1.4 Model Configuration Optimization
- [x] Verify model choice (GPT-4, Claude, etc.) is appropriate for task
- [x] Set temperature between 0.3-0.7 (balance creativity/consistency)
- [x] Ensure sufficient max_tokens for complete filenames (at least 100 tokens)
- [x] Configure timeout appropriately (don't rush the AI - allow 10-15 seconds)
- [x] Log full model request/response for quality analysis

### 1.5 Context Enhancement
- [x] Send MORE document content to AI (full text extraction vs just summary)
- [x] Include metadata in AI request: file type, creation date, file size
- [x] Extract key entities BEFORE AI call (dates, names, amounts, document type indicators)
- [x] Consider folder/workspace context for naming patterns
- [x] Add user naming preference history if available

### 1.6 Quality Validation
- [x] Test improved prompt on your 50-100 baseline examples
- [x] Achieve >70% acceptance rate before proceeding to UI work
- [x] Document winning prompt version and parameters
- [x] Set up A/B testing framework for future prompt iterations

---

## 2. Renderer Process (Frontend)

### 2.1 Upload & AI Trigger
- [x] Modify the file upload handler (`renderer.js`) to automatically call `window.electronAPI.analyzeFile(filePath)` immediately after a document is selected.
- [x] Ensure support for **multiple file uploads**, triggering analysis for each file in sequence or batch.

### 2.2 Loading / Feedback
- [x] Display a **loading spinner or progress indicator** while AI analysis is running.
- [x] Disable further actions for that file until suggestions are returned.

### 2.3 Popup Modal for Suggestions
- [x] Create a **modal component** to display AI-suggested names for uploaded files.
- [x] Include the following UI elements:
  - **Primary**: AI suggested file name (editable)
  - **Alternatives**: Show 2-3 alternative AI suggestions (if generated)
  - Original file name for reference
  - **Document preview**: First 200 characters of extracted content
  - **Metadata display**: Document type, detected date, key entities
  - Buttons: `Accept`, `Edit & Accept`, `Regenerate`, `Skip`
  - **Quality feedback**: Thumbs up/down buttons for suggestion quality
- [x] Populate modal dynamically when `analyze-file` IPC returns metadata.

### 2.4 Accept / Process Suggestion
- [x] When user clicks `Accept`, call `window.electronAPI.renameFile(oldPath, newName)` or existing `file:rename` handler.
- [x] Log acceptance with quality feedback (if provided)
- [x] Automatically close the modal or move to the next document.
- [x] Handle errors gracefully:
  - If AI fails, show fallback message.
  - Provide a way to manually rename and continue.

### 2.5 Regeneration Handler
- [x] When user clicks `Regenerate`, call `window.electronAPI.regenerateSuggestion(filePath, previousSuggestion)`
- [x] Show loading state during regeneration
- [x] Update modal with new suggestion when returned
- [x] Limit to 3 regeneration attempts per document (show counter)
- [x] Log regeneration requests (indicates prompt quality issues)

### 2.6 UX Enhancements
- [x] Support **batch accept** if multiple files are analyzed.
- [x] Ensure modal is **keyboard-accessible** (Enter to accept, Esc to skip).
- [x] Maintain clear status messages ("Analyzing...", "Ready to accept", "Processing complete").

---

## 3. Main Process (Backend)

### 3.1 IPC Handler
- [x] Ensure `ipcMain.handle('analyze-file', ...)` exists in `main.js`.
- [x] Reuse existing functions: `processFile()`, `extractText()`, `analyzeDocument()` or `enhancedParsingService`.
- [x] Return **metadata only**; do not perform file move operations during AI suggestion stage.
- [x] Return additional data for UI:
  - Primary suggestion
  - 2-3 alternative suggestions (optional)
  - Document preview text (first 200 chars)
  - Detected metadata (type, date, entities)
- [x] Handle errors gracefully and propagate error messages back to renderer.

### 3.2 AI Regeneration Handler
- [x] Implement `ipcMain.handle('regenerate-suggestion', ...)` 
- [x] On regenerate, modify prompt slightly:
  - Increase temperature by +0.1 (up to max 0.9)
  - Add "Previous suggestion was: X, please try a different approach"
  - Request more specific/creative alternative
- [x] Limit to 3 regeneration attempts per document
- [x] Log all regeneration requests with reason/context

### 3.3 Quality Logging Handler
- [x] Implement `ipcMain.handle('log-suggestion-quality', ...)` to receive feedback from UI
- [x] Store user actions and quality ratings in log file/database
- [x] Include timestamp, document hash, and full context

### 3.4 File Rename / Sorting
- [x] Ensure existing `file:rename` or sorting handler can accept chosen AI suggestion and move the file appropriately.
- [x] Maintain logging for success/failure for each file.

---

## 4. Preload Script

- [x] Expose new or updated methods in `preload.js`:
  ```js
  analyzeFile: (filePath) => ipcRenderer.invoke('analyze-file', filePath),
  regenerateSuggestion: (filePath, previousSuggestion) => ipcRenderer.invoke('regenerate-suggestion', filePath, previousSuggestion),
  logSuggestionQuality: (data) => ipcRenderer.invoke('log-suggestion-quality', data),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('file:rename', oldPath, newName)
  ```
- [x] Ensure renderer can call these functions safely and receive promises.

---

## 5. Testing & QA

### 5.1 Functional Testing
- [x] Upload single document → verify AI suggestions appear in modal.
- [x] Upload multiple documents → verify modal displays all suggestions sequentially or in batch.
- [x] Accept suggestion → verify file is renamed/moved correctly.
- [x] Skip or edit suggestion → verify fallback and manual rename work.
- [x] Regenerate suggestion → verify new suggestion appears and is different.
- [x] Quality feedback → verify thumbs up/down are logged correctly.

### 5.2 Edge Cases

#### CRITICAL (Must Test Before Launch)
- [x] File upload canceled → no modal displayed, no errors thrown.
- [x] AI analysis fails → modal shows error and allows manual input.
- [x] AI returns invalid characters → sanitize before showing (replace with underscores)
- [x] Regeneration limit reached → disable regenerate button, show message

#### IMPORTANT (Should Test Before Launch)
- [x] Long documents / large files → spinner remains until AI completes.
- [x] AI returns filename too long (>100 chars) → auto-truncate with ellipsis
- [x] Same document uploaded twice → detect via hash and reuse suggestion

#### NICE TO HAVE (Can Test Post-Launch)
- [x] Rapid multiple uploads → UI remains responsive, suggestions queue correctly.
- [x] AI returns generic name ("Document", "File") → flag as low quality in logs

### 5.3 UX Verification
- [x] Confirm flow is fully linear: Upload → AI → Modal → Accept → Sort.
- [x] Ensure all modals, buttons, and interactions are intuitive and responsive.
- [x] Verify quality logging is capturing all user interactions.

---

## 6. Success Metrics & Monitoring

### 6.1 Pre-Launch Criteria
- [ ] AI suggestion acceptance rate > 70% (without editing)
- [ ] AI suggestion acceptance rate + minor edits > 85%
- [ ] Regeneration request rate < 15%
- [ ] Average time-to-decision < 5 seconds
- [ ] Zero crashes on file upload
- [ ] Modal responds within 100ms of AI completion

### 6.2 Post-Launch Monitoring
- [ ] Weekly review of suggestion quality trends from logs
- [ ] Monthly prompt optimization based on rejection patterns
- [ ] User feedback score analysis (thumbs up/down ratio)
- [ ] Track quality by document type for targeted improvements
- [ ] A/B test prompt variations with subset of users

---

## 7. Optional Enhancements (Future)
- [ ] Add a history log UI showing previous AI suggestions and accepted names.
- [ ] Show confidence scores for AI suggestions in the modal.
- [ ] Allow auto-accept if confidence > threshold (and user opts in).
- [ ] Support drag-and-drop uploads with automatic AI analysis.
- [ ] Machine learning pipeline to learn from user corrections over time.

---

## 8. Notes / Constraints
- [ ] Do not move files during AI analysis stage. Only process them after user accepts suggestion.
- [ ] Ensure all IPC calls are properly awaited in renderer to prevent race conditions.
- [ ] Maintain current Electron security practices (no unsafe-eval, CSP warnings addressed).
- [ ] Changes should be incremental and testable; verify at each step before proceeding to the next.
- [ ] **PRIORITY**: Complete Section 1 (AI Quality) before building new UI in Section 2-3.
- [ ] All quality logs should be anonymized if containing sensitive document content.

---

## ✅ Goal

Achieve a clean, linear, user-friendly AI document sorting workflow with **high-quality AI suggestions** (>70% acceptance rate) and minimal friction, with full integration between renderer, preload, and main processes.