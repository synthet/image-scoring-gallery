---
description: Run ESLint to check for code quality issues
---

// turbo
1. **Run lint**:
   ```pwsh
   npm run lint --prefix "d:\Projects\image-scoring-gallery"
   ```

2. **Interpret results**:
   - **Clean output**: No issues found.
   - **Warnings**: Non-blocking, but should be addressed.
   - **Errors**: Must be fixed before committing.

3. **Auto-fix** (optional):
   ```pwsh
   npx eslint --fix . --prefix "d:\Projects\image-scoring-gallery"
   ```
