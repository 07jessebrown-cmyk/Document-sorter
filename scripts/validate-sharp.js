#!/usr/bin/env node

/**
 * Sharp Module Validation Script
 * 
 * This script validates that the sharp module loads correctly and can process images
 * in the packaged Electron application. It should be run after building the app.
 * 
 * Usage:
 *   node scripts/validate-sharp.js
 * 
 * The script will:
 * 1. Test that sharp can be required without errors
 * 2. Test basic image processing functionality
 * 3. Test file I/O operations
 * 4. Report any errors or success status
 */

const fs = require('fs');
const path = require('path');

// Test image data (1x1 pixel PNG) - properly formatted
const testImageData = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

const tempDir = path.join(__dirname, '..', 'temp-validation');
const testImagePath = path.join(tempDir, 'test-image.png');
const outputImagePath = path.join(tempDir, 'test-output.png');

async function validateSharp() {
  console.log('🔍 Starting Sharp module validation...\n');
  
  let sharp;
  let validationResults = {
    moduleLoad: false,
    basicProcessing: false,
    fileOperations: false,
    errors: []
  };

  // Test 1: Module Loading
  console.log('1️⃣ Testing Sharp module loading...');
  try {
    sharp = require('sharp');
    console.log('   ✅ Sharp module loaded successfully');
    console.log(`   📊 Sharp version: ${sharp.versions?.sharp || 'unknown'}`);
    validationResults.moduleLoad = true;
  } catch (error) {
    console.log('   ❌ Failed to load Sharp module');
    console.log(`   🚨 Error: ${error.message}`);
    validationResults.errors.push(`Module load error: ${error.message}`);
    return validationResults;
  }

  // Test 2: Basic Image Processing
  console.log('\n2️⃣ Testing basic image processing...');
  try {
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a simple test image using sharp itself
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();
    
    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('   📁 Created test image file');

    // Process the image
    const result = await sharp(testImagePath)
      .resize(50, 50)
      .png()
      .toBuffer();
    
    console.log('   ✅ Image processing successful');
    console.log(`   📊 Output size: ${result.length} bytes`);
    validationResults.basicProcessing = true;
  } catch (error) {
    console.log('   ❌ Image processing failed');
    console.log(`   🚨 Error: ${error.message}`);
    validationResults.errors.push(`Image processing error: ${error.message}`);
  }

  // Test 3: File Operations
  console.log('\n3️⃣ Testing file operations...');
  try {
    if (validationResults.basicProcessing) {
      // Write processed image to file
      fs.writeFileSync(outputImagePath, await sharp(testImagePath)
        .resize(50, 50)
        .jpeg()
        .toBuffer());
      
      console.log('   ✅ File write operation successful');
      
      // Verify file exists and has content
      const stats = fs.statSync(outputImagePath);
      if (stats.size > 0) {
        console.log(`   📊 Output file size: ${stats.size} bytes`);
        validationResults.fileOperations = true;
      } else {
        throw new Error('Output file is empty');
      }
    } else {
      console.log('   ⏭️ Skipping file operations (basic processing failed)');
    }
  } catch (error) {
    console.log('   ❌ File operations failed');
    console.log(`   🚨 Error: ${error.message}`);
    validationResults.errors.push(`File operations error: ${error.message}`);
  }

  // Test 4: Platform Information
  console.log('\n4️⃣ Platform information...');
  console.log(`   🖥️  Platform: ${process.platform}`);
  console.log(`   🏗️  Architecture: ${process.arch}`);
  console.log(`   📦 Node version: ${process.version}`);
  console.log(`   🔧 Electron: ${process.versions?.electron || 'Not in Electron'}`);

  // Cleanup
  console.log('\n🧹 Cleaning up temporary files...');
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('   ✅ Cleanup completed');
    }
  } catch (error) {
    console.log(`   ⚠️ Cleanup warning: ${error.message}`);
  }

  return validationResults;
}

async function main() {
  console.log('🚀 Sharp Module Validation for Document Sorter\n');
  console.log('=' .repeat(50));
  
  const results = await validateSharp();
  
  console.log('\n' + '=' .repeat(50));
  console.log('📋 VALIDATION SUMMARY');
  console.log('=' .repeat(50));
  
  const allTestsPassed = results.moduleLoad && results.basicProcessing && results.fileOperations;
  
  console.log(`Module Loading:     ${results.moduleLoad ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Image Processing:   ${results.basicProcessing ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`File Operations:    ${results.fileOperations ? '✅ PASS' : '❌ FAIL'}`);
  
  if (results.errors.length > 0) {
    console.log('\n🚨 ERRORS FOUND:');
    results.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  
  console.log('\n' + '=' .repeat(50));
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED - Sharp module is working correctly!');
    process.exit(0);
  } else {
    console.log('❌ VALIDATION FAILED - Sharp module has issues');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the validation
if (require.main === module) {
  main().catch((error) => {
    console.error('\n💥 Validation script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { validateSharp };
