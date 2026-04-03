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
   npm install
   ```
   (Run from the gallery repo root.)

3. **Start PostgreSQL**:
   Ensure the PostgreSQL Docker container is running:
   ```pwsh
   docker compose -f "../image-scoring-backend/docker-compose.yml" up -d
   ```
   (Adjust the path if your backend clone is not a sibling folder.)

4. **Configure database connection**:
   Edit `config.json` in the gallery repo root with your PostgreSQL credentials:
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
   npm run lint
   ```
   **Success**: No ESLint errors.

6. **Start development**:
   Follow the [run_dev](run_dev.md) workflow.
