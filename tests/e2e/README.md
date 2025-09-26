# End-to-End Tests for Document Sorter

This directory contains comprehensive end-to-end tests for the Document Sorter application using Playwright.

## Test Structure

### Test Files

- **`document-sorter-e2e.spec.js`** - Main E2E test suite covering UI functionality
- **`file-processing-flow.spec.js`** - Focused tests for file processing workflows
- **`preview-ui.spec.js`** - Tests specifically for preview UI functionality
- **`complete-flow.spec.js`** - Comprehensive tests for the complete file upload → preview → rename flow
- **`helpers/test-helpers.js`** - Utility functions for E2E tests

### Test Categories

1. **File Upload Flow**
   - Drag and drop file upload
   - Browse button file upload
   - Multiple file upload
   - File validation

2. **Preview UI**
   - Preview table display
   - Confidence and source information
   - AI-extracted metadata display
   - Table extraction results
   - Snippets display

3. **Settings and Configuration**
   - Settings modal functionality
   - AI feature toggles
   - Diagnostics display
   - Settings persistence

4. **Complete Processing Flow**
   - File upload → preview → rename workflow
   - AI processing with all features enabled
   - Error handling and recovery
   - Status updates throughout processing

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Playwright** installed (`npm install @playwright/test`)
3. **Document Sorter** application running on `http://127.0.0.1:3000`

## Running Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Tests with UI
```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (see browser)
```bash
npm run test:e2e:headed
```

### Debug Tests
```bash
npm run test:e2e:debug
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/complete-flow.spec.js
```

### Run Tests for Specific Browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Configuration

The tests are configured in `playwright.config.js` with the following settings:

- **Test Directory**: `./tests/e2e`
- **Browsers**: Chromium, Firefox, WebKit
- **Parallel Execution**: Enabled
- **Retries**: 2 on CI, 0 locally
- **Screenshots**: On failure
- **Videos**: On failure
- **Traces**: On first retry

## Test Data

The tests use sample PDF files from the `examples/` directory:

- `table-invoice.pdf` - Document with tables for table extraction testing
- `signature-contract.pdf` - Document with signatures for signature detection
- `watermark-confidential.pdf` - Document with watermarks for watermark filtering
- `multilingual-spanish.pdf` - Spanish document for multilingual processing
- `handwriting-notes.pdf` - Document with handwriting for handwriting detection

## Key Test Scenarios

### 1. Complete File Processing Flow
Tests the entire workflow from file upload to final processing:
- File upload (drag & drop or browse)
- AI processing with all features enabled
- Preview table with confidence and source information
- Table extraction and modal display
- Error handling and recovery

### 2. Preview UI Verification
Ensures the preview interface displays correctly:
- Confidence percentages (0-100%)
- Source information (AI, Hybrid, Regex)
- AI-extracted metadata (client, date, document type)
- Table extraction results
- Snippets and proposed filenames

### 3. Multi-Feature Processing
Tests processing with different document types:
- Table extraction
- Signature detection
- Watermark filtering
- Multilingual processing
- Handwriting detection

### 4. Settings and Configuration
Verifies settings functionality:
- AI feature toggles
- Confidence threshold adjustment
- Model selection
- Diagnostics display
- Settings persistence

## Test Helpers

The `TestHelpers` class provides utility functions:

- `getTestFile(filename)` - Get path to test files
- `createTempFile(content, extension)` - Create temporary test files
- `cleanupTempFiles(filePaths)` - Clean up temporary files
- `enableAllAIFeatures(page)` - Enable all AI features in settings
- `waitForPreviewTable(page)` - Wait for preview table to appear
- `getPreviewTableData(page)` - Extract preview table data
- `verifyPreviewRowData(rowData)` - Verify preview row has required data

## Debugging

### View Test Results
After running tests, view the HTML report:
```bash
npx playwright show-report
```

### Debug Specific Test
```bash
npx playwright test tests/e2e/complete-flow.spec.js --debug
```

### Run Tests in Headed Mode
```bash
npx playwright test --headed
```

### Generate Trace
```bash
npx playwright test --trace on
```

## CI Integration

The E2E tests are designed to run in CI environments:

- Tests run in headless mode by default
- Screenshots and videos are captured on failure
- Traces are generated for debugging
- Tests are configured to retry on failure
- Parallel execution is optimized for CI

## Troubleshooting

### Common Issues

1. **Application not running**: Ensure Document Sorter is running on `http://127.0.0.1:3000`
2. **Test files missing**: Ensure sample PDFs exist in the `examples/` directory
3. **Timeout errors**: Increase timeout values in test configuration
4. **Browser not found**: Run `npx playwright install` to install browsers

### Debug Mode
Run tests in debug mode to step through test execution:
```bash
npx playwright test --debug
```

### Verbose Output
Get detailed test output:
```bash
npx playwright test --reporter=list
```

## Contributing

When adding new E2E tests:

1. Follow the existing test structure
2. Use the `TestHelpers` class for common operations
3. Add appropriate test descriptions
4. Include both positive and negative test cases
5. Ensure tests are independent and can run in parallel
6. Add proper cleanup for temporary files
7. Update this README if adding new test categories
