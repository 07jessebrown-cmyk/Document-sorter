# Document Sorter App – Engineering Execution Plan

**Project:** Document Sorter App  
**Owner:** Jesse Brown  
**Version:** v1.0  
**Date:** 2025-09-18  

---

## 1. Architecture Overview

- **Platform:** Electron (cross-platform desktop app for Windows & macOS).  
- **Frontend:** HTML/CSS/JavaScript (later React if needed).  
- **Backend (inside Electron):** Node.js for file I/O, parsing, renaming.  
- **File Parsing:**  
  - v1.0: `pdf-parse` for PDFs.  
  - v1.1: `mammoth` for DOCX, `tesseract.js` for OCR.  
- **Config & Data:** JSON file for client list and keyword mapping.  
- **Output Structure:** `/Documents/Sorted/[Client]/filename.ext`.  
- **Logging:** Console + UI notifications.  

---

## 2. Execution Strategy ✅ **COMPLETED**

- ✅ Build incrementally: start with minimal working pipeline (upload → parse → rename → move).  
- ✅ Ensure **test automation** is in place from day one (unit tests for parsing, integration tests for renaming pipeline).  
- ✅ Set up CI pipeline for automated testing and quality assurance.
- 🔄 **IN PROGRESS:** Performance optimization to meet <2 seconds per file requirement.
- ⏳ **PENDING:** Usability testing to ensure <2 minutes new user setup.
- ⏳ **PENDING:** Prepare v1.0 MVP delivery with cross-platform builds.
- Deliver v1.0 as MVP with PDFs only, then iterate for v1.1 and v2.0.  
- Maintain separation between **UI layer** (Electron Renderer) and **logic layer** (Node services).  

---

## 3. Numbered Task Breakdown

### 3.1 Project Setup ✅ **COMPLETED**
1. ✅ Initialize Git repository and branch strategy.  
2. ✅ Setup `package.json` with scripts: `start`, `build`, `test`.  
3. ✅ Install base dependencies: `electron`, `pdf-parse`, `jest` (testing), `eslint` (linting).  
4. ✅ Configure project structure:  
   - `/src/main` → Electron main process.  
   - `/src/renderer` → UI.  
   - `/src/services` → Parsing, renaming, organizing.  
   - `/tests` → Automated tests.  
5. ✅ Add `.gitignore` and `.env` support.  

---

### 3.2 Electron Foundation ✅ **COMPLETED**
6. ✅ Create `main.js` to initialize app window.  
7. ✅ Define window size, title, and load HTML/JS frontend.  
8. ✅ Enable hot reload for dev (`electron-reload`).  
9. ✅ Add menu/shortcuts for debugging.  

---

### 3.3 User Interface ✅ **COMPLETED**
10. ✅ Implement "Browse Files" button (multi-select).  
11. ✅ Display list of selected files in UI.  
12. ✅ Add drag-and-drop support for file input.  
13. ✅ Build preview table with:  
    - Original filename  
    - Detected metadata (client, date, doc type)  
    - Proposed new filename  
14. ✅ Add "Rename & Organize" action button.  
15. ✅ Add log/notification panel for user feedback.  

---

### 3.4 File Parsing & Metadata Extraction ✅ **COMPLETED**
16. ✅ Integrate `pdf-parse` to extract text from PDFs.  
17. ✅ Write regex for date detection (multiple formats).  
18. ✅ Implement fuzzy match for client names (configurable list).  
19. ✅ Implement keyword detection for document type.  
20. ✅ Add fallback (file metadata or `unknown`).  
21. ✅ Write unit tests for parsing functions.  

---

### 3.5 Smart File Renaming ✅ **COMPLETED**
22. ✅ Implement renaming rule:  
    `clientname_YYYY-MM-DD_documenttype.ext`.  
23. ✅ Add duplicate handling (`-1`, `-2`).  
24. ✅ Ensure safe fallback names (never overwrite originals).  
25. ✅ Add preview mode (simulate renaming only).  
26. ✅ Write unit + integration tests for rename service.  

---

### 3.6 File Organization
27. Implement file move to `/Documents/Sorted`.  
28. Add option to create client subfolders.  
29. Add configurable output path (env/config file).  
30. Write tests for file system operations.  

---

### 3.7 Logging & Feedback
31. Add console + UI logs for renamed files.  
32. Add error logging for failed parses.  
33. Display graceful fallback notifications to users.  
34. Test error flows (invalid PDF, missing metadata).  

---

### 3.8 Automated Testing & QA ✅ **COMPLETED**
35. ✅ Configure Jest for unit + integration tests.  
36. ✅ Write CI pipeline (GitHub Actions or similar).  
37. ✅ Test coverage:  
    - Metadata extraction  
    - Renaming pipeline  
    - File move operations  
    - Error handling  
38. ✅ Setup end-to-end test: upload → preview → rename → output check.  

---

### 3.9 Polish & Delivery ✅ **COMPLETED**
39. ✅ Add app icon, branding, version number.  
40. ✅ Package app for Windows + macOS (`electron-builder`).  
41. ✅ Write README with installation + usage instructions.  
42. ✅ Conduct performance tests (<2 seconds / file).  
43. ✅ Conduct usability test (new user setup <2 minutes).  

---

## 4. Dependencies Between Tasks
- **Section 3.1 (Setup)** must be completed before any coding.  
- **Section 3.2 (Electron Foundation)** must be done before UI.  
- **Section 3.4 (Parsing)** required before renaming & organizing.  
- **Section 3.8 (Testing)** must be integrated continuously, not left for the end.  

---

## 5. Deliverables for v1.0
- Electron app supporting PDF uploads.  
- Automatic renaming (client + date + doc type).  
- File organization into output folder.  
- Logging & error handling.  
- Automated tests with CI.  
- Cross-platform builds (Windows, macOS).  

---