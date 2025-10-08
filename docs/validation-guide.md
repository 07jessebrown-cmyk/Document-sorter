# Sharp Module Validation Guide

This guide provides step-by-step instructions for validating that the `sharp` module works correctly in packaged Electron builds on both macOS and Windows.

## Prerequisites

- Node.js 18+ installed
- Access to both macOS and Windows machines (or CI runners)
- Built Electron applications (see build instructions below)

## Quick Validation

### Automated Validation Script

Run the included validation script to test sharp functionality:

```bash
# From the project root
node scripts/validate-sharp.js
```

This script will:
- ✅ Test that sharp can be required without errors
- ✅ Test basic image processing functionality  
- ✅ Test file I/O operations
- ✅ Report detailed results and any errors

## Manual Validation Steps

### 1. Build the Applications

#### macOS Build
```bash
# On macOS machine
npm run dist:mac
```

Expected output: `dist/Document Sorter-1.0.0.dmg` and `dist/Document Sorter-1.0.0-arm64.dmg`

#### Windows Build  
```bash
# On Windows machine
npm run dist:win
```

Expected output: `dist/Document Sorter Setup 1.0.0.exe`

### 2. Install and Test the Applications

#### macOS Testing
1. **Install the DMG:**
   ```bash
   # Mount the DMG
   hdiutil attach "dist/Document Sorter-1.0.0.dmg"
   
   # Copy to Applications
   cp -R "/Volumes/Document Sorter/Document Sorter.app" /Applications/
   
   # Unmount
   hdiutil detach "/Volumes/Document Sorter"
   ```

2. **Launch the Application:**
   ```bash
   open "/Applications/Document Sorter.app"
   ```

3. **Test Sharp Functionality:**
   - Open the app
   - Try to process an image file (PNG, JPEG, etc.)
   - Verify no "Cannot load sharp module" errors appear
   - Check that image processing works correctly

#### Windows Testing
1. **Install the EXE:**
   - Double-click `Document Sorter Setup 1.0.0.exe`
   - Follow the installation wizard
   - Complete the installation

2. **Launch the Application:**
   - Find "Document Sorter" in Start Menu
   - Click to launch

3. **Test Sharp Functionality:**
   - Open the app
   - Try to process an image file (PNG, JPEG, etc.)
   - Verify no "Cannot load sharp module" errors appear
   - Check that image processing works correctly

### 3. Detailed Testing Scenarios

#### Test Case 1: Basic Image Processing
1. Open the Document Sorter application
2. Drag and drop an image file (PNG, JPEG, etc.)
3. Verify the image is processed without errors
4. Check that the processed file is created successfully

#### Test Case 2: Multiple File Types
1. Test with various image formats:
   - PNG files
   - JPEG files
   - WebP files
   - TIFF files
2. Verify all formats are handled correctly

#### Test Case 3: Large Files
1. Test with large image files (>10MB)
2. Verify memory usage is reasonable
3. Check that processing completes without crashes

#### Test Case 4: Error Handling
1. Try to process corrupted image files
2. Verify graceful error handling
3. Check that the app doesn't crash

## CI/CD Validation

The GitHub Actions workflow automatically validates builds:

### macOS Validation
- Runs on `macos-latest` runner
- Installs dependencies with `npm ci`
- Rebuilds native modules with `npx electron-rebuild`
- Builds the application with `npm run dist:mac`
- Uploads artifacts for manual testing

### Windows Validation
- Runs on `windows-latest` runner
- Installs dependencies with `npm ci`
- Rebuilds native modules with `npx electron-rebuild`
- Builds the application with `npm run dist:win`
- Uploads artifacts for manual testing

## Troubleshooting

### Common Issues

#### "Cannot load sharp module" Error
**Symptoms:** Application crashes or shows error when trying to process images

**Causes:**
- Sharp module not rebuilt for Electron
- Sharp module not included in `asarUnpack`
- Platform-specific binaries missing

**Solutions:**
1. Run `npx electron-rebuild` before building
2. Verify `sharp` is in `asarUnpack` in `package.json`
3. Rebuild the application completely

#### Build Failures
**Symptoms:** Build process fails with native module errors

**Solutions:**
1. Clean install: `rm -rf node_modules && npm install`
2. Rebuild: `npx electron-rebuild`
3. Check platform compatibility

#### Runtime Crashes
**Symptoms:** Application crashes when processing images

**Solutions:**
1. Check system requirements
2. Verify all dependencies are installed
3. Test with smaller files first

### Debug Information

When reporting issues, include:
- Operating system and version
- Node.js version
- Electron version
- Sharp version
- Complete error messages
- Steps to reproduce

## Validation Checklist

### Pre-Build
- [ ] Dependencies installed with `npm ci`
- [ ] Native modules rebuilt with `npx electron-rebuild`
- [ ] Sharp module in `asarUnpack` configuration

### Build Process
- [ ] macOS build completes successfully
- [ ] Windows build completes successfully
- [ ] No build errors related to native modules
- [ ] Artifacts generated in `dist/` folder

### Post-Build Testing
- [ ] macOS app launches without errors
- [ ] Windows app launches without errors
- [ ] Image processing works in both apps
- [ ] No "Cannot load sharp module" errors
- [ ] File I/O operations work correctly

### CI/CD
- [ ] GitHub Actions builds pass
- [ ] Artifacts uploaded successfully
- [ ] Cross-platform builds work

## Success Criteria

✅ **Validation Passes When:**
- Both macOS and Windows packaged apps launch successfully
- Sharp module loads without errors
- Image processing functionality works correctly
- No runtime crashes occur
- File operations complete successfully

❌ **Validation Fails When:**
- Apps crash on launch
- "Cannot load sharp module" errors appear
- Image processing fails
- File operations don't work
- Any native module errors occur

## Next Steps

After successful validation:
1. Document any issues found and their solutions
2. Update the native modules guide if needed
3. Consider adding automated validation to CI/CD
4. Test with real-world document processing scenarios
