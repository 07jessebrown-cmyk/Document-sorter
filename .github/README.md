# Document Sorter CI/CD

This directory contains GitHub Actions workflows for automated building and testing of the Document Sorter application.

## Workflows

### 1. `build.yml` - Continuous Integration
- **Triggers**: Push to main/develop, pull requests, releases
- **Platforms**: macOS, Windows, Linux
- **Actions**: 
  - Installs dependencies
  - Builds application for each platform
  - Uploads artifacts for manual download

### 2. `release.yml` - Automated Releases
- **Triggers**: Git tags (e.g., `v1.0.0`)
- **Platforms**: macOS, Windows, Linux
- **Actions**:
  - Builds application for all platforms
  - Creates GitHub release
  - Uploads platform-specific installers as release assets

### 3. `test.yml` - Testing & Validation
- **Triggers**: Push to main/develop, pull requests
- **Platforms**: macOS, Windows, Linux
- **Actions**:
  - Runs test suite
  - Performs linting
  - Builds and validates artifacts

## Usage

### Creating a Release
1. Update version in `package.json`
2. Commit changes
3. Create and push a tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. GitHub Actions will automatically build and create a release

### Manual Build
- Push to `main` or `develop` branch
- Check the Actions tab for build status
- Download artifacts from the completed workflow

## Artifacts

- **macOS**: `.dmg` installer
- **Windows**: `.exe` installer (NSIS)
- **Linux**: `.AppImage` portable executable

## Requirements

- Node.js 18+
- npm dependencies installed
- Electron Builder configured in `package.json`
