# 📦 Go-Live Checklist – Document Sorter App

This checklist defines the minimum requirements for releasing a shippable, safe, and useful version of the **Document Sorter App** to real business users.

---

## 1 Core Functionality
- [ ] Users can upload PDFs via **browse button** and **drag-and-drop**.
- [ ] App extracts metadata (client name, date, document type) reliably using regex + AI fallback.
- [ ] Files are renamed in the format:  
  `clientname_YYYY-MM-DD_documenttype.ext`
- [ ] Renamed files are saved to a **separate "Sorted" folder** (non-destructive).
- [ ] Duplicate files handled safely with suffixes (`-1`, `-2`, etc.).
- [ ] Errors are shown in a clear, non-blocking way (UI notification or log).

---

## 2 Usability
- [ ] Clean UI with **3 main actions**: Upload, Sort, Settings.
- [ ] Show **preview of before/after filenames** before confirming rename.
- [ ] Option to configure **output directory**.
- [ ] Option to edit/add to the **client name list**.
- [ ] Progress/status indicator when sorting is in progress.
- [ ] Simple onboarding (tooltip or short README for users).

---

## 3 Safety & Reliability
- [ ] **All processing local by default** (no silent uploads to cloud).
- [ ] AI/LLM usage clearly marked as **opt-in**.
- [ ] Original files are never deleted or overwritten.
- [ ] App gracefully recovers from failed batch (no half-renamed state).
- [ ] Logging in place for debugging and audit trail.

---

## 4 Packaging & Distribution
- [ ] App packaged with **Electron Builder**.
- [ ] Installers generated for:
  - [ ] Windows (`.exe` or `.msi`)
  - [ ] macOS (`.dmg`)
- [ ] App is **code signed** for each platform to avoid unverified developer warnings.
- [ ] Version number incremented (`v1.0.0`) and visible in app.
- [ ] Release artifacts stored on GitHub Releases.

---

## 5 Testing
- [ ] Automated **unit tests** for:
  - Metadata extraction (regex, AI fallback).
  - File renaming logic (formats, suffix handling).
  - Output folder safety.
- [ ] Automated **end-to-end test**:
  - Upload → Extract → Rename → Save → Verify file exists in "Sorted" folder.
- [ ] Manual test:
  - Run on both Windows and macOS.
  - Verify installer works, app launches, and files are processed safely.

---

## 6 Business Readiness
- [ ] Short **user guide** (Markdown or PDF) explaining:
  - How to install.
  - How to sort files.
  - Where sorted files are stored.
- [ ] License & Terms (basic MIT or custom EULA).
- [ ] Support email or contact method for customers.

---

## 🚀 Ready to Ship When:
- [ ] Business users can install the app on Windows/macOS.
- [ ] They can drag in documents, and the app sorts them **accurately and safely**.
- [ ] App does not overwrite or lose files.
- [ ] App looks professional and trustworthy at first launch.