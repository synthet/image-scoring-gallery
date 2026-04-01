---
description: Set up the Node.js development environment
---

1. **Prerequisites**:
   - Node.js 18+ installed (check with `node --version`).
   - npm 9+ installed (check with `npm --version`).
   - Docker installed and running (for PostgreSQL).

2. **Install dependencies**:
   // turbo
   ```pwsh
   npm install --prefix "d:\Projects\image-scoring-gallery"
   ```

3. **Start PostgreSQL**:
   Ensure the PostgreSQL Docker container is running:
   ```pwsh
   docker compose -f "d:\Projects\image-scoring-backend\docker-compose.yml" up -d
   ```

4. **Configure database connection**:
   Edit `d:\Projects\image-scoring-gallery\config.json` with your PostgreSQL credentials:
   ```json
   {
     "database": {
       "engine": "postgres",
       "postgres": {
         "host": "127.0.0.1",
         "port": 5432,
         "database": "image_scoring",
         "user": "postgres",
         "password": "postgres"
       }
     }
   }
   ```

5. **Verify setup**:
   // turbo
   ```pwsh
   npm run lint --prefix "d:\Projects\image-scoring-gallery"
   ```
   **Success**: No ESLint errors.

6. **Start development**:
   Follow the [run_dev](run_dev.md) workflow.
