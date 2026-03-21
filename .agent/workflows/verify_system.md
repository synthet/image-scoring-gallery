---
description: Verify the Electron app environment and dependencies
---

// turbo
1. **Verify Node.js**:
   ```pwsh
   node --version
   ```
   **Success**: v18+ or later.

// turbo
2. **Verify npm packages**:
   ```pwsh
   npm ls --depth=0 --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: All direct dependencies resolved without errors.

// turbo
3. **Verify TypeScript**:
   ```pwsh
   npx tsc --noEmit --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: No type errors.

4. **Verify Firebird**:
   - Ensure Firebird server is running on `localhost:3050`.
   - The app will report a connection error in the Electron console if Firebird is unreachable.

// turbo
5. **Verify ESLint**:
   ```pwsh
   npm run lint --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: No errors.
