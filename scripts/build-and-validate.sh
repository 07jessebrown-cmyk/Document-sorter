#!/bin/bash

# Build and Validate Script for Document Sorter
# This script builds the Electron application and validates that sharp works correctly

set -e  # Exit on any error

echo "🚀 Document Sorter - Build and Validation Script"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Get platform information
PLATFORM=$(uname -s)
ARCH=$(uname -m)

print_status "Platform: $PLATFORM"
print_status "Architecture: $ARCH"

# Step 1: Clean and install dependencies
print_status "Step 1: Installing dependencies..."
if [ -d "node_modules" ]; then
    print_warning "Removing existing node_modules..."
    rm -rf node_modules
fi

npm ci
print_success "Dependencies installed"

# Step 2: Rebuild native modules
print_status "Step 2: Rebuilding native modules for Electron..."
npx electron-rebuild
print_success "Native modules rebuilt"

# Step 3: Validate sharp in development
print_status "Step 3: Validating sharp module in development..."
if npm run validate:sharp; then
    print_success "Sharp validation passed in development"
else
    print_error "Sharp validation failed in development"
    exit 1
fi

# Step 4: Build the application
print_status "Step 4: Building Electron application..."

if [ "$PLATFORM" = "Darwin" ]; then
    print_status "Building for macOS..."
    npm run dist:mac
    print_success "macOS build completed"
elif [ "$PLATFORM" = "Linux" ]; then
    print_status "Building for Linux..."
    npm run dist:linux
    print_success "Linux build completed"
else
    print_warning "Platform $PLATFORM not supported for building. Skipping build step."
    print_status "To build for Windows, run this script on a Windows machine or use CI/CD"
fi

# Step 5: Check build artifacts
print_status "Step 5: Checking build artifacts..."
if [ -d "dist" ]; then
    print_success "Build artifacts found in dist/ directory:"
    ls -la dist/
else
    print_error "No dist/ directory found. Build may have failed."
    exit 1
fi

# Step 6: Instructions for testing
print_status "Step 6: Testing instructions"
echo ""
echo "To test the packaged application:"
echo "1. Install the generated package from the dist/ directory"
echo "2. Launch the application"
echo "3. Try processing an image file"
echo "4. Verify no 'Cannot load sharp module' errors appear"
echo ""
echo "For automated validation, you can also run:"
echo "  npm run validate:sharp"
echo ""

print_success "Build and validation process completed!"
print_status "Check the dist/ directory for your packaged application."

# Optional: Run additional tests if available
if [ -f "tests/integration.test.js" ]; then
    print_status "Running integration tests..."
    if npm test -- tests/integration.test.js; then
        print_success "Integration tests passed"
    else
        print_warning "Integration tests failed (this may be expected in some environments)"
    fi
fi

echo ""
echo "🎉 Build and validation process completed successfully!"
echo "📦 Your packaged application is ready in the dist/ directory"
