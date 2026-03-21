---
description: Set up the Node.js development environment
---

1. **Prerequisites**:
   - Node.js 18+ installed (check with `node --version`).
   - npm 9+ installed (check with `npm --version`).

2. **Install dependencies**:
   // turbo
   ```pwsh
   npm install --prefix "d:\Projects\image-scoring-gallery"
   ```

3. **Configure Firebird connection**:
   Edit `d:\Projects\image-scoring-gallery\config.json` with your Firebird credentials:
   ```json
   {
     "host": "localhost",
     "port": 3050,
     "database": "path/to/your.fdb",
     "user": "SYSDBA",
     "password": "masterkey"
   }
   ```

4. **Verify setup**:
   // turbo
   ```pwsh
   npm run lint --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: No ESLint errors.

5. **Start development**:
   Follow the [run_dev](run_dev.md) workflow.
