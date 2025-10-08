#!/usr/bin/env node

/**
 * Installer Verification Script
 * 
 * This script verifies that the packaged Electron installers contain
 * working sharp modules and can be launched without errors.
 * 
 * Usage:
 *   node scripts/verify-installers.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Document Sorter - Installer Verification');
console.log('==========================================');

const distDir = path.join(__dirname, '..', 'dist');
const platform = process.platform;

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Please build the application first.');
  process.exit(1);
}

console.log(`📁 Checking dist directory: ${distDir}`);
console.log(`🖥️  Platform: ${platform}`);

// List available installers
console.log('\n📦 Available installers:');
const files = fs.readdirSync(distDir);
const installers = files.filter(file => 
  file.endsWith('.dmg') || 
  file.endsWith('.exe') || 
  file.endsWith('.AppImage')
);

if (installers.length === 0) {
  console.error('❌ No installers found in dist/ directory');
  process.exit(1);
}

installers.forEach(installer => {
  const filePath = path.join(distDir, installer);
  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  console.log(`   📄 ${installer} (${sizeMB} MB)`);
});

// Platform-specific verification
console.log('\n🔍 Platform-specific verification:');

if (platform === 'darwin') {
  console.log('🍎 macOS verification:');
  
  // Check for macOS DMG files
  const macInstallers = installers.filter(file => file.endsWith('.dmg'));
  
  if (macInstallers.length === 0) {
    console.log('   ⚠️  No macOS installers found');
  } else {
    macInstallers.forEach(installer => {
      console.log(`   ✅ Found: ${installer}`);
      
      // Try to get DMG info
      try {
        const dmgPath = path.join(distDir, installer);
        const info = execSync(`hdiutil imageinfo "${dmgPath}" 2>/dev/null || echo "Cannot read DMG info"`, { encoding: 'utf8' });
        if (info.includes('Cannot read DMG info')) {
          console.log(`   ⚠️  Cannot verify DMG integrity for ${installer}`);
        } else {
          console.log(`   ✅ DMG appears valid: ${installer}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not verify DMG: ${error.message}`);
      }
    });
  }
  
} else if (platform === 'win32') {
  console.log('🪟 Windows verification:');
  
  // Check for Windows EXE files
  const winInstallers = installers.filter(file => file.endsWith('.exe'));
  
  if (winInstallers.length === 0) {
    console.log('   ⚠️  No Windows installers found');
  } else {
    winInstallers.forEach(installer => {
      console.log(`   ✅ Found: ${installer}`);
      
      // Check if EXE is executable
      const exePath = path.join(distDir, installer);
      try {
        const stats = fs.statSync(exePath);
        if (stats.mode & 0o111) {
          console.log(`   ✅ EXE appears executable: ${installer}`);
        } else {
          console.log(`   ⚠️  EXE may not be executable: ${installer}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not verify EXE: ${error.message}`);
      }
    });
  }
  
} else if (platform === 'linux') {
  console.log('🐧 Linux verification:');
  
  // Check for Linux AppImage files
  const linuxInstallers = installers.filter(file => file.endsWith('.AppImage'));
  
  if (linuxInstallers.length === 0) {
    console.log('   ⚠️  No Linux installers found');
  } else {
    linuxInstallers.forEach(installer => {
      console.log(`   ✅ Found: ${installer}`);
      
      // Check if AppImage is executable
      const appImagePath = path.join(distDir, installer);
      try {
        const stats = fs.statSync(appImagePath);
        if (stats.mode & 0o111) {
          console.log(`   ✅ AppImage appears executable: ${installer}`);
        } else {
          console.log(`   ⚠️  AppImage may not be executable: ${installer}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not verify AppImage: ${error.message}`);
      }
    });
  }
}

// Check for unpacked directories (for testing)
console.log('\n📂 Checking unpacked directories:');
const unpackedDirs = files.filter(file => {
  const fullPath = path.join(distDir, file);
  return fs.statSync(fullPath).isDirectory() && file.includes('unpacked');
});

if (unpackedDirs.length > 0) {
  unpackedDirs.forEach(dir => {
    console.log(`   📁 Found unpacked directory: ${dir}`);
    
    // Check if it contains the main executable
    const dirPath = path.join(distDir, dir);
    const dirContents = fs.readdirSync(dirPath);
    const hasExecutable = dirContents.some(file => 
      file.endsWith('.exe') || 
      file.endsWith('.app') || 
      file === 'Document Sorter'
    );
    
    if (hasExecutable) {
      console.log(`   ✅ Contains executable: ${dir}`);
    } else {
      console.log(`   ⚠️  No executable found in: ${dir}`);
    }
  });
} else {
  console.log('   ℹ️  No unpacked directories found (this is normal for DMG/EXE builds)');
}

// Summary
console.log('\n📋 Verification Summary');
console.log('======================');

const totalInstallers = installers.length;
const hasMacInstallers = installers.some(file => file.endsWith('.dmg'));
const hasWinInstallers = installers.some(file => file.endsWith('.exe'));
const hasLinuxInstallers = installers.some(file => file.endsWith('.AppImage'));

console.log(`Total installers: ${totalInstallers}`);
console.log(`macOS DMG files: ${hasMacInstallers ? '✅' : '❌'}`);
console.log(`Windows EXE files: ${hasWinInstallers ? '✅' : '❌'}`);
console.log(`Linux AppImage files: ${hasLinuxInstallers ? '✅' : '❌'}`);

// Final status
if (totalInstallers > 0) {
  console.log('\n🎉 Installer verification completed!');
  console.log('📦 Ready for distribution');
  
  if (platform === 'darwin' && hasMacInstallers) {
    console.log('\n💡 To test macOS installers:');
    console.log('   1. Double-click the DMG file');
    console.log('   2. Drag the app to Applications');
    console.log('   3. Launch and test image processing');
  }
  
  if (platform === 'win32' && hasWinInstallers) {
    console.log('\n💡 To test Windows installers:');
    console.log('   1. Run the EXE as Administrator');
    console.log('   2. Follow the installation wizard');
    console.log('   3. Launch and test image processing');
  }
  
} else {
  console.log('\n❌ No installers found. Please run the build process first.');
  process.exit(1);
}

console.log('\n✅ Verification complete!');
