# Document Sorter App - AI Features Remediation Plan
**Role:** Principal-level Engineering Manager & CTO  
**Format:** Step-by-step numbered to-do list for LLM coding agent execution  
**Source:** Diagnostic Report (2025-01-27)  

---

## 1. OCR Fallback (CRITICAL - 0% Success Rate)
1.1. Open `tests/integration/ocr-integration.test.js` and inspect the configuration mocking setup.  
1.2. Fix config mocking so that required OCR config values are injected correctly.  
   - Ensure environment variables or mock config service provide defaults.  
   - Validate that `ocrService` can initialize without undefined configs.  
1.3. Update `src/services/ocrService.js` initialization to include default fallbacks for critical config values.  
1.4. Add defensive error handling during OCR service startup to catch misconfigured states.  
1.5. Rerun all 9 OCR integration tests and confirm ≥90% pass rate.  
1.6. If tests still fail, create a controlled test mock for `extractText()` and `extractTextBatch()` using realistic OCR response data.  

---

## 2. Table Extraction (HIGH - Partial Implementation)
2.1. Open `src/services/tableExtractor.js`.  
2.2. Implement **pdf2table** extraction method:  
   - Use `pdf2table` library (or equivalent) for parsing tables.  
   - Ensure method normalizes output into the shared internal table schema.  
2.3. Implement **regex-based extraction** method:  
   - Write regex patterns to detect rows/columns in plain text documents.  
   - Map regex matches to table schema (rows/columns).  
2.4. Update `extractTables(filePath, options)` to support method selection (`pdfplumber`, `pdf2table`, `regex`).  
2.5. Expand `tests/unit/tableExtractor.test.js`:  
   - Add test cases for pdf2table extraction.  
   - Add test cases for regex extraction.  
   - Validate combined statistics and error handling for all methods.  
2.6. Rerun all 23 tests plus new tests until 100% pass.  

---

## 3. Handwriting Detection (MEDIUM - 96% Success Rate)
3.1. Open `tests/integration/handwriting-integration.test.js` and identify the failing signature detection test.  
3.2. Review `handwritingService.detectHandwriting()` and `analyzeTextForHandwriting()`.  
3.3. Debug signature pattern recognition logic:  
   - Improve regex/pattern logic for realistic signature markers (loops, underlines, initials).  
   - Adjust tolerance thresholds for OCR noise.  
3.4. Fix Tesseract.js worker initialization in `handwritingService.js`:  
   - Ensure workers are properly terminated/reused.  
   - Add error recovery for DOMException.  
3.5. Rerun all 27 handwriting tests until 100% pass.  

---

## 4. Watermark Detection (MEDIUM - 95% Success Rate)
4.1. Open `src/services/watermarkService.js` and focus on `getStatistics()` method.  
4.2. Fix logic that counts detected watermarks:  
   - Ensure all detected watermarks are accumulated across pages.  
   - Prevent duplicate counts or dropped entries.  
4.3. Update `tests/unit/watermarkService.test.js` to validate edge cases where multiple watermarks exist on a single page.  
4.4. Rerun all 21 watermark detection tests until 100% pass.  

---

## 5. AI Extraction (LOW - 100% Success Rate, Maintain Stability)
5.1. No fixes required.  
5.2. Add ongoing regression protection:  
   - Keep `aiTextService.extractMetadataAI` and `extractMetadataAIBatch` tests up to date with new document types.  
   - Expand cache tests to simulate cache eviction + retry logic.  

---

## 6. General Test & Integration Validation
6.1. Run **full test suite** (`npm run test` or equivalent).  
6.2. Verify coverage ≥90% across all services.  
6.3. Conduct integration run of `enhancedParsingService.analyzeDocumentEnhanced()` with combinations of feature flags:  
   - Handwriting only  
   - Watermark only  
   - OCR fallback active  
   - Table extraction enabled  
   - AI extraction enabled  
   - Mixed combinations (2–3 features together)  
6.4. Validate outputs against mock documents to confirm multi-feature interoperability.  

---

## 7. Deployment & Monitoring
7.1. Add runtime logging in each service (`handwritingService`, `watermarkService`, `ocrService`, `tableExtractor`, `aiTextService`).  
7.2. Capture statistics: success/failure rates, latency, fallback triggers.  
7.3. Ensure monitoring alerts trigger if OCR fallback or AI extraction error rates exceed 10%.  
7.4. Package fixes into next release branch and deploy to staging environment.  
7.5. Validate real documents in staging pipeline before promoting to production.  

---