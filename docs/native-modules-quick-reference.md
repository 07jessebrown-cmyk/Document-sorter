# Native Modules Quick Reference

## 🚀 Quick Commands

```bash
# Add new native module
npm install <module-name>
npx electron-rebuild

# Validate sharp module
npm run validate:sharp

# Build applications
npm run dist:mac    # macOS
npm run dist:win    # Windows  
npm run dist:linux  # Linux

# Full build and validation
./scripts/build-and-validate.sh
```

## ⚙️ Configuration

### Add to package.json asarUnpack:
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

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot load sharp module" | Run `npx electron-rebuild` |
| Build fails | Clean install: `rm -rf node_modules && npm ci` |
| Validation fails | Check module in `asarUnpack` |
| Platform issues | Use correct platform-specific install |

## ✅ Checklist

- [ ] Module installed with `npm install`
- [ ] Rebuilt with `npx electron-rebuild`  
- [ ] Added to `asarUnpack` in package.json
- [ ] Validated with `npm run validate:sharp`
- [ ] Tested in packaged build
- [ ] No runtime errors

## 📞 Need Help?

- **Validation Guide**: `docs/validation-guide.md`
- **Native Modules Guide**: `docs/native-modules-guide.md`
- **Full Documentation**: `docs/deliverable-summary.md`
