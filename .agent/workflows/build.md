---
description: Create a production build of the Electron app
---

1. **Prerequisites**:
   - Ensure `node_modules` is installed (`npm install` if not).

// turbo
2. **Run production build**:
   ```pwsh
   npm run build --prefix "d:\Projects\image-scoring-gallery"
   ```
   This runs in sequence:
   - TypeScript compilation for `electron/` (main process)
   - TypeScript compilation for `src/` (renderer)
   - Vite production bundle
   - `electron-builder` packaging

3. **Output**:
   - Compiled main process → `dist-electron/`
   - Vite bundle → `dist/`
   - Installer/package → `release/` (created by electron-builder)

4. **Verify**:
   Check that the build completed without errors. Inspect `dist-electron/main.js` and `dist/` for output files.
