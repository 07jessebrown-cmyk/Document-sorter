# Manual QA Test Scenarios for AI Workflow

## Test Environment Setup

### Prerequisites
- [ ] Electron app is running in development mode
- [ ] Test documents are available in `baseline_test_docs/`
- [ ] AI service is configured and accessible
- [ ] Test directories are clean: `/test_env/uploads/` and `/test_env/sorted/`

### Test Data
- [ ] Copy test documents to `/test_env/uploads/` for testing
- [ ] Ensure test documents include:
  - [ ] Invoice documents (with dates, amounts, client names)
  - [ ] Contract documents (multi-page, legal text)
  - [ ] Report documents (various formats)
  - [ ] Edge case documents (blank, corrupt, very large)

---

## 5.1 Functional Testing Scenarios

### Scenario 1: Single Document Upload → AI Suggestions Modal

**Objective**: Verify that uploading a single document triggers AI analysis and displays suggestions in a modal.

**Steps**:
1. [ ] Launch the Electron application
2. [ ] Click "Open Files" or use drag-and-drop to select a single PDF document
3. [ ] Observe the loading spinner/indicator appears
4. [ ] Wait for AI analysis to complete (should show "Analyzing document content..." status)
5. [ ] Verify the AI suggestions modal appears with:
   - [ ] Primary suggestion displayed prominently
   - [ ] 2-3 alternative suggestions shown
   - [ ] Original filename for reference
   - [ ] Document preview (first 200 characters)
   - [ ] Metadata display (document type, detected date, key entities)
   - [ ] Action buttons: Accept, Regenerate, Skip
   - [ ] Quality feedback buttons (thumbs up/down)

**Expected Results**:
- [ ] Modal appears within 5 seconds of file selection
- [ ] AI suggestions are relevant to document content
- [ ] All UI elements are properly displayed and functional
- [ ] Loading states are clear and responsive

**Test Files to Use**:
- `baseline_test_docs/Invoice_Client1_2024-12-04.pdf`
- `baseline_test_docs/Contract_Company1_2024-02-18.pdf`

---

### Scenario 2: Multiple Documents Upload → Sequential/Batch Processing

**Objective**: Verify that uploading multiple documents processes them correctly in sequence or batch.

**Steps**:
1. [ ] Select 3-5 different document types (invoices, contracts, reports)
2. [ ] Upload all documents at once
3. [ ] Observe the processing behavior:
   - [ ] **Sequential Mode**: Each document shows its own modal one at a time
   - [ ] **Batch Mode**: All documents show in a single modal with batch controls
4. [ ] Verify each document gets appropriate AI suggestions
5. [ ] Test both processing modes if available

**Expected Results**:
- [ ] All documents are processed without errors
- [ ] UI remains responsive during batch processing
- [ ] Each document gets relevant AI suggestions
- [ ] Progress indication is clear (e.g., "Processing file 2 of 5")

**Test Files to Use**:
- Multiple files from `baseline_test_docs/` with different types

---

### Scenario 3: Accept Suggestion → File Rename/Move

**Objective**: Verify that accepting an AI suggestion properly renames and/or moves the file.

**Steps**:
1. [ ] Upload a document and wait for AI suggestions
2. [ ] Review the primary suggestion
3. [ ] Click "Accept" button
4. [ ] Observe the file system changes:
   - [ ] Check if file is renamed in place, OR
   - [ ] Check if file is moved to sorted directory (e.g., `/sorted/Invoices/`)
5. [ ] Verify the original file no longer exists in upload directory
6. [ ] Check that the new filename matches the accepted suggestion

**Expected Results**:
- [ ] File is successfully renamed/moved
- [ ] New filename matches the accepted suggestion
- [ ] File is organized in appropriate directory (if sorting is enabled)
- [ ] Success message is displayed
- [ ] Modal closes or moves to next document

**Test Files to Use**:
- `baseline_test_docs/Invoice_Client1_2024-12-04.pdf`
- `baseline_test_docs/Contract_Company1_2024-02-18.pdf`

---

### Scenario 4: Skip or Edit Suggestion → Fallback Handling

**Objective**: Verify that skipping or editing suggestions works correctly with proper fallback.

**Steps**:
1. [ ] Upload a document and wait for AI suggestions
2. [ ] **Skip Test**:
   - [ ] Click "Skip" button
   - [ ] Verify modal closes or moves to next document
   - [ ] Check that file remains in original location with original name
3. [ ] **Edit Test**:
   - [ ] Click on the primary suggestion to edit it
   - [ ] Modify the filename
   - [ ] Click "Accept" or "Edit & Accept"
   - [ ] Verify file is renamed with the edited name

**Expected Results**:
- [ ] Skip functionality works without errors
- [ ] Edit functionality allows text modification
- [ ] Edited suggestions are properly applied
- [ ] Fallback behavior is graceful

**Test Files to Use**:
- Any document from `baseline_test_docs/`

---

### Scenario 5: Regenerate Suggestion → New Suggestion Generation

**Objective**: Verify that regenerating suggestions produces different and relevant alternatives.

**Steps**:
1. [ ] Upload a document and wait for AI suggestions
2. [ ] Note the primary suggestion
3. [ ] Click "Regenerate" button
4. [ ] Observe the loading state during regeneration
5. [ ] Verify new suggestion appears and is different from the original
6. [ ] Test multiple regenerations (up to 3 attempts)
7. [ ] Verify regeneration counter shows (e.g., "Regenerate (2/3)")

**Expected Results**:
- [ ] New suggestions are generated within 10 seconds
- [ ] New suggestions are different from previous ones
- [ ] Regeneration counter increments correctly
- [ ] After 3 attempts, regenerate button is disabled
- [ ] Quality of suggestions remains good across regenerations

**Test Files to Use**:
- `baseline_test_docs/Report_Org1_2024-01-25.pdf`
- `baseline_test_docs/legal_doc.pdf`

---

### Scenario 6: Quality Feedback → Logging Verification

**Objective**: Verify that quality feedback (thumbs up/down) is properly logged and tracked.

**Steps**:
1. [ ] Upload a document and wait for AI suggestions
2. [ ] Click thumbs up or thumbs down button
3. [ ] Accept or reject the suggestion
4. [ ] Check the quality logs to verify feedback was recorded
5. [ ] Test with different feedback combinations:
   - [ ] Thumbs up + Accept
   - [ ] Thumbs down + Reject
   - [ ] Thumbs up + Regenerate
   - [ ] No feedback + Accept

**Expected Results**:
- [ ] Feedback buttons are responsive
- [ ] Quality data is logged correctly
- [ ] Log entries include timestamp, document hash, action, rating
- [ ] No errors occur during logging

**Log Verification**:
- [ ] Check `/logs/quality.log` for new entries
- [ ] Verify log format matches expected schema
- [ ] Confirm all user actions are captured

---

## 5.2 Edge Cases and Error Handling

### CRITICAL (Must Test Before Launch)

#### Scenario 7: File Upload Cancellation → Silent Recovery

**7a. File Dialog Cancellation**
**Steps**:
1. [ ] Click "Open Files" button to open system file dialog
2. [ ] Click "Cancel" in the file dialog (do not select any files)
3. [ ] Observe UI state after cancellation

**Expected Results**:
- [ ] No upload state is triggered
- [ ] No AI analysis is called
- [ ] No error modal is displayed
- [ ] UI returns to idle state
- [ ] Status shows "Ready to receive files"

**7b. Drag-and-Drop Cancellation**
**Steps**:
1. [ ] Start dragging a file over the drop zone
2. [ ] Observe hover state appears
3. [ ] Release the file outside the drop zone (not over the drop area)
4. [ ] Observe UI state after cancellation

**Expected Results**:
- [ ] Hover state reverts to normal silently
- [ ] No upload is triggered
- [ ] UI returns to idle state
- [ ] No error messages or modals appear

---

#### Scenario 8: AI Analysis Failure → Graceful Fallback

**8a. Network/API Timeout**
**Steps**:
1. [ ] Disconnect from internet or block AI service requests
2. [ ] Upload a document
3. [ ] Wait for timeout to occur (should be ~10-15 seconds)
4. [ ] Observe error handling behavior

**Expected Results**:
- [ ] "AI unavailable" error modal appears
- [ ] Manual rename input is enabled
- [ ] Error is logged with type "timeout"
- [ ] User can continue without AI

**8b. Missing/Invalid API Key**
**Steps**:
1. [ ] Open Settings and clear/enter invalid API key
2. [ ] Save settings and upload a document
3. [ ] Observe error handling behavior

**Expected Results**:
- [ ] Error modal shows "Configuration issue" message
- [ ] Manual rename input is enabled
- [ ] Error is logged with type "configuration"
- [ ] Settings button is highlighted for easy access

**8c. Corrupted/Unsupported File**
**Steps**:
1. [ ] Upload a corrupted PDF or unsupported file format
2. [ ] Observe error handling behavior

**Expected Results**:
- [ ] Error modal shows fallback message
- [ ] Manual rename input is enabled
- [ ] Error is logged with type "extraction"
- [ ] User can continue with manual input

---

#### Scenario 9: Invalid Filename Characters → Sanitization

**Steps**:
1. [ ] Upload a document that would generate invalid filename characters (e.g., `contract:2025?.pdf`)
2. [ ] Observe the AI suggestion in the modal
3. [ ] Accept the suggestion
4. [ ] Check the final renamed file

**Expected Results**:
- [ ] Invalid characters are replaced with underscores (`contract_2025_.pdf`)
- [ ] Sanitized name is displayed in modal preview
- [ ] Final file is saved with sanitized name
- [ ] No file system errors occur

**Test Cases**:
- [ ] `file<name>.pdf` → `file_name_.pdf`
- [ ] `doc|with|pipes.pdf` → `doc_with_pipes.pdf`
- [ ] `test"quotes".pdf` → `test_quotes_.pdf`

---

#### Scenario 10: Regeneration Limit → Button Disabled

**Steps**:
1. [ ] Upload a document and get AI suggestions
2. [ ] Click "Regenerate" button 3 times
3. [ ] Try to click "Regenerate" a 4th time
4. [ ] Observe button state and messages

**Expected Results**:
- [ ] After 3 regenerations, button becomes disabled
- [ ] Message shows "Regeneration limit reached (3/3)"
- [ ] No API call is made on 4th click
- [ ] Warning is logged for attempt beyond limit
- [ ] Counter resets for different files

---

### IMPORTANT (Should Test Before Launch)

#### Scenario 11: Long Documents / Large Files → Performance

**11a. Long Documents (>100 pages)**
**Steps**:
1. [ ] Upload a document with >100 pages
2. [ ] Observe processing time and UI responsiveness
3. [ ] Verify suggestions are still generated

**Expected Results**:
- [ ] Processing completes (may take longer)
- [ ] UI remains responsive during processing
- [ ] Progress indicators are clear
- [ ] Suggestions are generated successfully

**11b. Large Files (>10MB)**
**Steps**:
1. [ ] Upload a document >10MB
2. [ ] Observe processing time and UI responsiveness
3. [ ] Verify no crashes occur

**Expected Results**:
- [ ] No application crashes
- [ ] Progress feedback is shown
- [ ] Processing completes or fails gracefully
- [ ] UI remains responsive

**11c. Very Large Files (>50MB)**
**Steps**:
1. [ ] Upload a document >50MB
2. [ ] Observe error handling

**Expected Results**:
- [ ] Error modal appears with clear message
- [ ] Graceful failure (no crash)
- [ ] User feedback is provided
- [ ] Manual input option is available

---

#### Scenario 12: Filename Length → Auto-Truncation

**Steps**:
1. [ ] Upload a document that would generate a filename >100 characters
2. [ ] Observe the AI suggestion in the modal
3. [ ] Accept the suggestion
4. [ ] Check the final renamed file

**Expected Results**:
- [ ] Filename is auto-truncated with ellipsis ("...")
- [ ] Truncated version is displayed in modal
- [ ] Final file is saved with truncated version
- [ ] Truncation happens after sanitization

**Test Cases**:
- [ ] Very long filename → truncated to 100 chars with "..."
- [ ] Truncation preserves file extension
- [ ] Ellipsis appears in appropriate position

---

#### Scenario 13: Duplicate Documents → Independent Processing

**Steps**:
1. [ ] Upload the same document twice (copy the file)
2. [ ] Process both files
3. [ ] Observe that both are processed independently

**Expected Results**:
- [ ] Both files are processed without errors
- [ ] Each file gets its own AI analysis
- [ ] No duplicate detection or skipping occurs
- [ ] Both files can be renamed independently

---

### NICE TO HAVE (Can Test Post-Launch)

#### Scenario 14: Rapid Multiple Uploads → Queue Management

**14a. Multi-File Selection**
**Steps**:
1. [ ] Select multiple files in one file dialog (3-5 files)
2. [ ] Observe how files are queued and processed
3. [ ] Verify all files get AI suggestions

**Expected Results**:
- [ ] All files are queued correctly
- [ ] Modal shows suggestions for each file
- [ ] No UI freezing occurs
- [ ] Files are processed in order

**14b. Back-to-Back Drag-and-Drop**
**Steps**:
1. [ ] Drag and drop one file
2. [ ] Immediately drag and drop another file (within 2 seconds)
3. [ ] Observe queue management

**Expected Results**:
- [ ] Both files are queued correctly
- [ ] No UI freezing occurs
- [ ] Correct processing order is maintained
- [ ] No files are lost

---

#### Scenario 15: Generic Name Detection → Quality Flags

**Steps**:
1. [ ] Upload documents that would generate generic names like "Document.pdf" or "File.pdf"
2. [ ] Observe quality feedback in the modal
3. [ ] Check quality logs

**Expected Results**:
- [ ] Generic names are detected and flagged
- [ ] Warning icon or alert appears in modal
- [ ] "Generic name detected" warning is logged
- [ ] Additional patterns are detected ("New Document", "Scan001", etc.)

**Test Cases**:
- [ ] "Document.pdf" → flagged as generic
- [ ] "File.pdf" → flagged as generic
- [ ] "New Document.pdf" → flagged as generic
- [ ] "Scan001.pdf" → flagged as generic

---

## Performance and UX Verification

### Scenario 10: Large Files → Performance Testing

**Steps**:
1. [ ] Upload a large document (>10MB)
2. [ ] Observe processing time and UI responsiveness
3. [ ] Verify suggestions are still generated

**Expected Results**:
- [ ] UI remains responsive during processing
- [ ] Loading indicators are clear
- [ ] Processing completes within reasonable time

### Scenario 11: Rapid Multiple Uploads → Queue Management

**Steps**:
1. [ ] Upload multiple documents rapidly
2. [ ] Observe how the system handles the queue
3. [ ] Verify all documents are processed

**Expected Results**:
- [ ] All documents are processed without loss
- [ ] UI remains responsive
- [ ] Processing order is maintained

---

## Test Results Documentation

### For Each Test Scenario:
- [ ] **Status**: ✅ Pass / ❌ Fail / ⚠️ Partial
- [ ] **Notes**: Any observations or issues
- [ ] **Screenshots**: If applicable
- [ ] **Logs**: Relevant log entries
- [ ] **Performance**: Response times, memory usage

### Overall Test Summary:
- [ ] **Total Scenarios**: ___ / 11
- [ ] **Passed**: ___
- [ ] **Failed**: ___
- [ ] **Critical Issues**: ___
- [ ] **Recommendations**: ___

---

## Test Environment Cleanup

After testing:
- [ ] Clear test directories (`/test_env/uploads/`, `/test_env/sorted/`)
- [ ] Reset any configuration changes
- [ ] Clear test logs if needed
- [ ] Document any persistent issues

---

## Notes

- Test with both AI enabled and disabled configurations
- Verify all IPC communication works correctly
- Check that logging captures all user interactions
- Ensure error handling is graceful and informative
- Test keyboard accessibility (Enter to accept, Esc to skip)
- Verify batch operations work correctly
