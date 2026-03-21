---
description: Update CHANGELOG.md with recent changes, commit, and push
---

// turbo-all

Follow the `git-changelog` skill (`d:\Projects\image-scoring-gallery\.agent\skills\git-changelog\SKILL.md`).

1. **Check status & recent history**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" status
   git -C "d:\Projects\image-scoring-gallery" log --oneline -10
   ```

2. **Review unstaged changes**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" diff --stat
   ```
   Read `CHANGELOG.md` to find the current version.

3. **Update `CHANGELOG.md`**:
   - Bump the version (major/minor/patch as appropriate).
   - Use today's date.
   - Categorize under **Added / Changed / Fixed / Removed**.
   - Bold feature names, reference files/modules where helpful.

4. **Also bump `package.json`** version if applicable.

5. **Stage all changes**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" add -A
   ```

6. **Commit with a descriptive message**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" commit -m "<summary of changes>"
   ```

7. **Push**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" push
   ```

8. **Verify**:
   ```pwsh
   git -C "d:\Projects\image-scoring-gallery" log --oneline -1
   git -C "d:\Projects\image-scoring-gallery" status
   ```
