const fs = require('fs');
const path = require('path');

/**
 * Rename file into a sharper, standardized name.
 * Rules:
 *  1. Normalize (lowercase, replace spaces/special chars with underscores).
 *  2. Append timestamp (YYYYMMDD_HHmm).
 *  3. Auto-increment version if name already exists.
 */
function renameFile(filePath, outputDir) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid filePath received');
  }

  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);

  // 1. Normalize name
  const cleanName = baseName
    .toLowerCase()
    .replace(/\s+/g, '_')         // spaces -> underscores
    .replace(/[^a-z0-9_-]/g, ''); // remove weird chars

  // 2. Add timestamp
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(
    now.getMonth() + 1
  ).padStart(2, '0')}${String(now.getDate()).padStart(
    2,
    '0'
  )}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  let newName = `${cleanName}_${timestamp}${ext}`;
  let newPath = path.join(outputDir || path.dirname(filePath), newName);

  // 3. Auto-increment version if file already exists
  let counter = 1;
  while (fs.existsSync(newPath)) {
    newName = `${cleanName}_${timestamp}_v${counter}${ext}`;
    newPath = path.join(outputDir || path.dirname(filePath), newName);
    counter++;
  }

  return newPath;
}

module.exports = { renameFile };