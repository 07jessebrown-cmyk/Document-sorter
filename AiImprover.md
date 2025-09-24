# Bullet-Proof AI Text Extraction — Task Breakdown
**Project:** Document Sorter — AI Text Extraction Hardening  
**Owner:** Jesse Brown  
**Version:** v1.2 (AI Stability & Robustness)  
**Date:** 2025-09-24  

---

## Purpose
This document provides a step-by-step execution plan to make the Document Sorter’s text extraction pipeline bullet-proof, based on QA findings. Tasks are broken into numbered, completable items suitable for assignment to LLM coding agents.  

---

## Task Breakdown

### Phase 1 — Foundation
**1.1 Add Feature Flags & Config**
- [ ] Add new extraction flags (`useOCR`, `useTableExtraction`, `useLLMEnhancer`) to `config/default.json`.
- [ ] Update `enhancedParsingService` to read feature flags.
- [ ] Expose flags to renderer via IPC so UI can toggle them.

**1.2 Evaluate Table Extraction Libraries**
- [ ] Experiment with `pdf-table-extractor` and `camelot/tabula` on QA sample PDFs.
- [ ] Document findings in `docs/table-eval.md`.
//completed
---

### Phase 2 — Table Structure Preservation
**2.1 Implement Table Extractor Service**
- [ ] Create `src/services/tableExtractor.js`.
- [ ] Implement function that extracts table objects and returns structured JSON.
- [ ] Write unit tests in `tests/unit/tableExtractor.test.js`.
//completed
**2.2 Integrate Table Extractor into Pipeline**
- [ ] Update `enhancedParsingService` to call table extractor when enabled.
- [ ] Merge extracted table metadata into parsing results.
- [ ] Update preview UI (`PreviewTable.js`) to show tables.
- [ ] Write integration test verifying table preservation.
//completed
---

### Phase 3 — Robust OCR
**3.1 Add OCR Service**
- [ ] Create `src/services/ocrService.js` using Tesseract.js.
- [ ] Support `eng` as default language, allow expansion later.
- [ ] Write unit tests for OCR service (`tests/unit/ocrService.test.js`).
//completed
**3.2 Integrate OCR Fallback**
- [ ] Enhance pipeline: if pdf-parse returns empty text, call OCR service.
- [ ] Add feature flag `useOCR` to enable/disable OCR fallback.
- [ ] Write integration tests with image-only PDFs.
//completed
---

### Phase 4 — Multi-Language Support
**4.1 Add Language Detection Service**
- [x] Create `src/services/langService.js` using `franc`.
- [x] Implement function returning detected language codes with confidence.
- [x] Write unit tests with multilingual text samples.

**4.2 Integrate Language Awareness**
- [x] Pass detected language into AI prompts in `aiTextService.js`.
- [x] Update integration tests to validate bilingual document handling.
//completed
---

### Phase 5 — Signature & Handwriting
**5.1 Implement Signature Detection**
- [x] Create `src/services/signatureDetector.js`.
- [x] Detect typical "Signed by" or signature blocks.
- [x] Write unit tests on signature PDFs.

**5.2 Add Handwriting OCR**
- [x] Create `src/services/handwritingService.js`.
- [x] Use Tesseract handwriting mode or alternative library.
- [x] If confidence is low, mark snippet as "manual review required."
- [x] Add integration tests with handwritten notes.

---

### Phase 6 — Watermark Handling
**6.1 Implement Watermark Detector**
- [ ] Create `src/services/watermarkService.js`.
- [ ] Detect repeated overlay text across multiple pages.
- [ ] Write unit tests with watermark PDFs.

**6.2 Filter Watermarks from Extraction**
- [ ] Integrate watermark service into `enhancedParsingService`.
- [ ] Strip watermark snippets before AI/regex analysis.
- [ ] Add integration test confirming watermarks are excluded.

---

### Phase 7 — AI Enhancer Hardening
**7.1 Improve aiTextService**
- [ ] Enforce strict JSON schema for AI responses.
- [ ] Add retries with exponential backoff for malformed responses.
- [ ] Pass hints (language, table context) into LLM prompts.
- [ ] Write unit tests with mocked AI responses.

**7.2 Merge Hybrid Results**
- [ ] Implement merge logic: regex > table > AI fallback.
- [ ] Ensure confidence scores are averaged/weighted.
- [ ] Add integration test verifying merged results.

---

### Phase 8 — Cache, Rate Limit, Telemetry
**8.1 Implement Persistent AI Cache**
- [ ] Create `src/services/aiCache.js`.
- [ ] Add TTL + LRU logic for caching AI results.
- [ ] Write unit tests for cache hit/miss scenarios.

**8.2 Add LLM Throttling & Batching**
- [ ] Implement concurrency control in `src/services/llmClient.js`.
- [ ] Support batching of multiple document queries.
- [ ] Write tests verifying concurrency limits.

**8.3 Add Telemetry & Diagnostics**
- [ ] Implement `src/services/telemetry.js` to log AI calls, cache hits/misses.
- [ ] Create diagnostics UI to display telemetry in renderer.
- [ ] Write tests ensuring telemetry logs AI service usage.

---

### Phase 9 — Testing & CI
**9.1 Expand Unit Tests**
- [ ] Add tests for new services: `tableExtractor`, `ocrService`, `langService`, `signatureDetector`, `watermarkService`, `aiCache`.
- [ ] Target 80% coverage minimum.

**9.2 Add Integration Tests**
- [ ] Add QA scenario PDFs: tables, multilingual, signatures, watermarks.
- [ ] Write tests that simulate real-world extractions with mocks.

**9.3 Add End-to-End Tests**
- [ ] Use Playwright or Spectron for desktop UI.
- [ ] Test file upload → preview → rename flow with AI enabled.
- [ ] Confirm preview shows confidence and source.

**9.4 Configure CI Pipeline**
- [ ] Update GitHub Actions workflow to run unit, integration, and E2E tests.
- [ ] Mock AI calls in CI to avoid external API usage.
- [ ] Add coverage reporting.

---

### Phase 10 — Documentation & Rollout
**10.1 Write AI Extraction Guide**
- [ ] Create `docs/AI-Extraction-Guide.md`.
- [ ] Document feature flags, config options, and troubleshooting steps.
- [ ] Include examples of AI vs fallback outputs.

**10.2 Canary Rollout**
- [ ] Enable AI extraction features for beta testers.
- [ ] Monitor telemetry and error logs for stability.
- [ ] Incrementally roll out to wider users after validation.

---

## Acceptance Criteria
- Complex tables preserved in extraction.
- Mixed language documents parsed correctly.
- Handwritten signatures detected or flagged.
- Watermarks excluded from results.
- Standard PDFs processed in <2s.
- Tests pass in CI with no open handles.
- Preview UI shows field source and confidence.
- Documentation explains setup and troubleshooting.

---

## Developer Checklist
1. [ ] Phase 1 foundation completed.  
2. [ ] Phase 2 table extraction completed.  
3. [ ] Phase 3 OCR integration completed.  
4. [ ] Phase 4 language detection completed.  
5. [ ] Phase 5 signature/handwriting handling completed.  
6. [ ] Phase 6 watermark detection completed.  
7. [ ] Phase 7 AI enhancer hardened.  
8. [ ] Phase 8 cache, throttling, telemetry implemented.  
9. [ ] Phase 9 tests & CI green.  
10. [ ] Phase 10 documentation and rollout complete.  