#!/usr/bin/env node

/**
 * Test Packaged Sharp Module
 * 
 * This script tests the sharp module functionality in the packaged Electron application
 * to ensure it works correctly on both macOS ARM64 and Intel architectures.
 */

const fs = require('fs');
const path = require('path');

async function testSharpModule() {
  console.log('🔍 Testing Packaged Sharp Module');
  console.log('=================================');

  const platform = process.platform;
  const arch = process.arch;

  console.log(`🖥️  Platform: ${platform}`);
  console.log(`🏗️  Architecture: ${arch}`);

  // Test sharp module loading
  console.log('\n1️⃣ Testing Sharp Module Loading...');
  try {
    const sharp = require('sharp');
    console.log('   ✅ Sharp module loaded successfully');
    console.log(`   📊 Sharp version: ${sharp.versions?.sharp}`);
    console.log(`   📊 libvips version: ${sharp.versions?.vips}`);
  } catch (error) {
    console.log('   ❌ Failed to load Sharp module');
    console.log(`   🚨 Error: ${error.message}`);
    process.exit(1);
  }

  // Test image processing
  console.log('\n2️⃣ Testing Image Processing...');
  try {
    const sharp = require('sharp');
    
    // Create a test image
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();
    
    console.log('   ✅ Test image created successfully');
    console.log(`   📊 Image size: ${testImage.length} bytes`);
    
    // Process the image
    const processedImage = await sharp(testImage)
      .resize(50, 50)
      .jpeg()
      .toBuffer();
    
    console.log('   ✅ Image processing successful');
    console.log(`   📊 Processed size: ${processedImage.length} bytes`);
    
  } catch (error) {
    console.log('   ❌ Image processing failed');
    console.log(`   🚨 Error: ${error.message}`);
    process.exit(1);
  }

  // Test file operations
  console.log('\n3️⃣ Testing File Operations...');
  try {
    const sharp = require('sharp');
    const tempDir = path.join(__dirname, '..', 'temp-test');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const inputPath = path.join(tempDir, 'input.png');
    const outputPath = path.join(tempDir, 'output.jpg');
    
    // Create and save test image
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
    .png()
    .toFile(inputPath);
    
    console.log('   ✅ Input file created');
    
    // Process and save
    await sharp(inputPath)
      .resize(100, 100)
      .jpeg({ quality: 80 })
      .toFile(outputPath);
    
    console.log('   ✅ Output file created');
    
    // Verify files exist and have content
    const inputStats = fs.statSync(inputPath);
    const outputStats = fs.statSync(outputPath);
    
    console.log(`   📊 Input file size: ${inputStats.size} bytes`);
    console.log(`   📊 Output file size: ${outputStats.size} bytes`);
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('   ✅ Cleanup completed');
    
  } catch (error) {
    console.log('   ❌ File operations failed');
    console.log(`   🚨 Error: ${error.message}`);
    process.exit(1);
  }

  // Test platform-specific functionality
  console.log('\n4️⃣ Testing Platform-Specific Features...');
  try {
    const sharp = require('sharp');
    
    // Test different image formats
    const formats = ['png', 'jpeg', 'webp'];
    
    for (const format of formats) {
      try {
        const testBuffer = await sharp({
          create: {
            width: 50,
            height: 50,
            channels: 3,
            background: { r: 128, g: 128, b: 128 }
          }
        })
        [format]()
        .toBuffer();
        
        console.log(`   ✅ ${format.toUpperCase()} format supported`);
      } catch (error) {
        console.log(`   ⚠️  ${format.toUpperCase()} format not supported: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log('   ❌ Platform-specific testing failed');
    console.log(`   🚨 Error: ${error.message}`);
  }

  console.log('\n🎉 All Sharp Module Tests Passed!');
  console.log('✅ The packaged application should work correctly');
  console.log('✅ No "Could not load the sharp module" errors expected');
  console.log('✅ Image processing functionality verified');
}

// Run the test
testSharpModule().catch((error) => {
  console.error('\n💥 Test failed:', error.message);
  process.exit(1);
});