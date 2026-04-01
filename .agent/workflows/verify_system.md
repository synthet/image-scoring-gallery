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

4. **Verify PostgreSQL**:
   - Ensure PostgreSQL Docker container is running on `localhost:5432`.
   - Start with `docker compose up -d` in the `image-scoring-backend` project if needed.
   - The app will report a connection error in the Electron console if PostgreSQL is unreachable.

// turbo
5. **Verify ESLint**:
   ```pwsh
   npm run lint --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: No errors.
