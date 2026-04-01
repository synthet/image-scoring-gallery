---
description: Start the Electron app in development mode (Vite HMR + Electron)
---

1. **Prerequisites**:
   - Ensure `node_modules` is installed (`npm install` if not).
   - Ensure PostgreSQL Docker container is running on `localhost:5432`.

// turbo
2. **Launch dev mode**:
   ```pwsh
   npm run dev --prefix "d:\Projects\image-scoring-gallery"
   ```
   *Alternatively, use the batch launcher:*
   ```cmd
   d:\Projects\image-scoring-gallery\run.bat
   ```

3. **Wait for startup**:
   - Vite dev server starts on `http://localhost:5173`.
   - Electron launches automatically once Vite is ready via `wait-on`.

4. **Hot Reload**:
   - React component changes apply instantly via Vite HMR.
   - Electron main process changes require a restart (`Ctrl+C` then re-run).

5. **Stop**:
   Press `Ctrl+C` in the terminal to stop both Vite and Electron.
