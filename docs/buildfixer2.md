# Task: Fix Sharp Module Packaging for Electron (macOS + Windows)

You are a staff-level engineer. Update the Electron app packaging so that the `sharp` native module loads correctly on both macOS (Intel/ARM) and Windows. Ensure that:

1. **Safe Cleanup**
   - If needed, safely clear only the `node_modules` folder (not project files).
   - Reinstall dependencies cleanly.

2. **Rebuild Sharp for Electron**
   - Detect the current platform (`darwin-arm64`, `darwin-x64`, `win32-x64`).
   - Run platform-aware installs, e.g.:
     - macOS ARM: `npm install --arch=arm64 --platform=darwin sharp`
     - macOS Intel: `npm install --arch=x64 --platform=darwin sharp`
     - Windows: `npm install --arch=x64 --platform=win32 sharp`
   - Ensure `npx electron-rebuild` runs after install so `sharp` is rebuilt against the Electron runtime.

3. **Update electron-builder Config**
   - In `package.json` or `electron-builder.yml`, configure:
     ```json
     "build": {
       "asarUnpack": [
         "node_modules/sharp/**"
       ]
     }
     ```
   - This ensures `sharp`’s native binaries are unpacked and not broken inside `app.asar`.

4. **Cross-Platform Builds**
   - macOS build: `npm run dist -- --mac`
   - Windows build: `npm run dist -- --win`
   - Document that builds must be run on their respective OS (or CI runners with matching targets).

5. **Validation**
   - Run a packaged build on macOS → confirm `sharp` loads and processes files.
   - Repeat on Windows.
   - Confirm no runtime “Cannot load sharp module” errors appear.

6. **Deliverable**
   - Working Electron installers for both macOS and Windows.
   - Document clear steps for adding new native modules (always rebuild with `electron-rebuild` and add to `asarUnpack`).

---

### Acceptance Criteria
- Packaged macOS app runs without the `sharp` error.
- Packaged Windows app runs without the `sharp` error.
- `electron-builder` config explicitly unpacks native modules.
- Documentation included for future native module handling

### Quick Fix Script
A safe rebuild script has been created at `scripts/rebuild-sharp-safe.sh` that:
- Safely cleans and rebuilds Sharp for Electron
- Includes user confirmations and verbose logging
- Handles macOS ARM64 architecture specifically
- Verifies the rebuild was successful

**Usage:**
```bash
npm run rebuild:sharp
# or directly:
bash scripts/rebuild-sharp-safe.sh
```