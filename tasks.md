# Document Sorter App – AI Metadata Extraction Execution Plan

**Project:** Document Sorter App  
**Owner:** Jesse Brown  
**Version:** v1.1 (AI Integration)  
**Date:** 2025-09-23  

---

## 1. Architecture Overview

- **Extension of v1.0:** Keep existing regex + fuzzy pipeline. Add AI fallback/enhancer.  
- **AI Service Layer:** `aiTextService.js` consumes raw extracted text and returns `{ clientName, date, documentType }` with confidences.  
- **Provider Integration:** OpenAI (initial), wrapped by `llmClient.js` with retry and mock test mode.  
- **Config & Cache:** `.env` + config file flags (`USE_AI`, `AI_MODEL`, thresholds). Persistent local JSON cache keyed by text hash.  
- **Pipeline Change:** File parser first uses regex/fuzzy. If results are missing/low confidence → AI service invoked.  
- **UI:** Preview shows source (Regex/Fuzzy/AI) and confidence badge. Users can toggle AI in settings.  
- **Tests:** Unit (AI service, cache), Integration (pipeline with AI fallback), E2E (preview shows AI results).  

---

## 2. Execution Strategy

- Keep v1.0 stable pipeline as baseline.  
- Introduce AI services incrementally, behind config flags.  
- Ensure **mock mode** for tests/CI (no real API calls).  
- Add local cache to reduce redundant calls.  
- Provide transparency to users (confidence, source labels).  
- Deliver as **v1.1 AI-enhanced MVP**.  

---

## 3. Numbered Task Breakdown

### 3.10 AI Service Scaffold
44. Create `src/services/aiTextService.js` exporting:  
    - `extractMetadataAI(text)` → single document.  
    - `extractMetadataAIBatch(items)` → multiple docs.  
45. Return structured object: `{ clientName, clientConfidence, date, dateConfidence, docType, docTypeConfidence, snippets }` or `null` on failure.  
46. Add JSDoc typing.  
//tasks completed
---

### 3.11 LLM Client Wrapper
47. Create `src/services/llmClient.js`.  
48. Implement `callLLM({ model, messages, maxTokens, temperature })`.  
49. Features:  
    - Reads API key from `.env`.  
    - Retry + exponential backoff (configurable).  
    - Mock response if `NODE_ENV=test`.  
//completed
---

### 3.12 Prompt Template
50. Create `src/services/ai_prompts.js`.  
51. Export `buildMetadataPrompt(text)`.  
52. Must enforce **JSON-only output** with required keys: `clientName`, `clientConfidence`, `date`, `dateConfidence`, `docType`, `docTypeConfidence`, `snippets`.  

---

### 3.13 AI Cache Layer
53. Create `src/services/aiCache.js`.  
54. Implement:  
    - `get(hash)`  
    - `set(hash, result)`  
    - `has(hash)`  
55. Use JSON file in user data dir.  
56. Keys = SHA256(text), values = AI result.  

---

### 3.14 Integrate AI into Parser
57. Update `fileParserService.js`:  
    - Run regex + fuzzy first.  
    - Assign confidences.  
    - If below threshold or missing → call `extractMetadataAI`.  
    - Merge results, annotate `source`.  
58. Run AI calls with concurrency cap (`AI_BATCH_SIZE`).  
59. Send results back to renderer via IPC without blocking.  
//completed
---

### 3.15 UI Enhancements
60. Update `PreviewTable`:  
    - Add `Source` column (Regex/Fuzzy/AI).  
    - Add `Confidence` badge (0–100%).  
    - Highlight low confidence (<50%) in red.  
    - Tooltip with snippet evidence.  
61. Add `Use AI` toggle in Settings (IPC connected).  
//completed
---

### 3.16 Automated Testing
62. Unit tests:  
    - `aiTextService`: parses valid + malformed JSON.  
    - `llmClient`: retry/backoff, mock mode.  
    - `aiCache`: read/write, eviction.  
63. Integration tests: pipeline falls back to AI.  
64. E2E: upload doc with no regex matches → preview shows AI fields.  
//completed
---

### 3.17 Config & Docs
65. Add `.env` vars: `USE_AI`, `AI_MODEL`, `AI_CONFIDENCE_THRESHOLD`.  
66. Update `config/default.json`.  
67. Update README:  
    - Setup API key.  
    - How AI fallback works.  
    - Toggle instructions.  
//completed
---

### 3.18 Telemetry & Monitoring
68. Track:  
    - AI calls count.  
    - Latency.  
    - Cache hits/misses.  
69. Write to local telemetry log.  
70. Add simple Diagnostics tab in Settings.  
//completed
---

## 4. Dependencies Between Tasks
- **3.10 → 3.11 → 3.12:** Service, client, prompt must exist before integration.  
- **3.13 (Cache)** required before 3.14 integration.  
- **3.14 Parser integration** required before 3.15 UI.  
- **3.16 Testing** runs continuously as features added.  
- **3.17 Config & Docs** last step before shipping.  

---

## 5. Deliverables for v1.1
- AI service layer with provider wrapper and caching.  
- Parser pipeline using AI fallback when regex/fuzzy fail.  
- Preview UI shows AI source, confidence, snippets.  
- Configurable AI toggle and model options.  
- Unit, integration, and E2E tests in place (mocking network).  
- README updated with AI usage guide.  
- Telemetry logging of AI usage.  

---