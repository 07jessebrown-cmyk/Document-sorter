# Native Modules Guide for Electron

This guide explains how to properly handle native modules in the Document Sorter Electron application to ensure they work correctly across all platforms.

## Overview

Native modules (like `sharp`, `puppeteer`, `tesseract.js`) contain platform-specific binaries that must be properly configured for Electron packaging.

## Required Steps for New Native Modules

### 1. Install the Module
```bash
npm install <module-name>
```

### 2. Rebuild for Electron
After installing any native module, always rebuild it for Electron:
```bash
npx electron-rebuild
```

### 3. Update electron-builder Configuration
Add the module to the `asarUnpack` array in `package.json`:

```json
{
  "build": {
    "asarUnpack": [
      "node_modules/sharp/**/*",
      "node_modules/puppeteer/**/*",
      "node_modules/tesseract.js/**/*",
      "node_modules/pdf-parse/**/*",
      "node_modules/mammoth/**/*",
      "node_modules/<new-module>/**/*"
    ]
  }
}
```

### 4. Platform-Specific Installation (if needed)
For modules that require platform-specific binaries:

```bash
# macOS ARM
npm install --arch=arm64 --platform=darwin <module-name>

# macOS Intel
npm install --arch=x64 --platform=darwin <module-name>

# Windows
npm install --arch=x64 --platform=win32 <module-name>
```

## Current Native Modules

The following native modules are currently configured:

- **sharp**: Image processing library
- **puppeteer**: Browser automation
- **tesseract.js**: OCR functionality
- **pdf-parse**: PDF text extraction
- **mammoth**: Word document processing

## Build Commands

### Local Development
```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:mac    # macOS (Intel + ARM)
npm run dist:win    # Windows (x64 + ia32)
npm run dist:linux  # Linux (x64)
```

### CI/CD
The GitHub Actions workflow automatically:
1. Installs dependencies with `npm ci`
2. Rebuilds native modules with `npx electron-rebuild`
3. Builds for the target platform
4. Uploads artifacts

## Troubleshooting

### "Cannot load sharp module" Error
This typically occurs when:
1. The module wasn't rebuilt for Electron
2. The module isn't in `asarUnpack`
3. Platform-specific binaries are missing

**Solution:**
1. Run `npx electron-rebuild`
2. Verify the module is in `asarUnpack`
3. Rebuild the application

### Cross-Platform Build Issues
- macOS builds must be run on macOS (or macOS CI runners)
- Windows builds must be run on Windows (or Windows CI runners)
- Linux builds can be run on Linux or macOS

### Testing Native Modules
Always test native modules in the packaged application, not just in development:
1. Build the application: `npm run dist`
2. Install the generated package
3. Test the functionality that uses the native module

## Best Practices

1. **Always rebuild**: Run `npx electron-rebuild` after any native module changes
2. **Test packaged builds**: Native modules behave differently in packaged vs development
3. **Use CI/CD**: Let GitHub Actions handle cross-platform builds
4. **Document changes**: Update this guide when adding new native modules
5. **Version pinning**: Pin native module versions to avoid compatibility issues

## Security Considerations

Native modules can introduce security risks:
- They execute native code
- They may have platform-specific vulnerabilities
- They should be regularly updated
- Consider the module's security track record before adding

Always review native modules for security implications before adding them to the project.
