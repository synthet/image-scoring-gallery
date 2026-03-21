---
name: image-scoring-mcp
description: How to use the image-scoring MCP server for database diagnostics, querying images, and checking system health.
---

# Image Scoring MCP Server

In this **Electron** workspace, the stdio MCP entry is **`imgscore-el-stdio`** (`cwd` / `PYTHONPATH` → sibling **image-scoring**). The **Python** repo uses **`imgscore-py-stdio`** when that workspace is open. For WebUI / **`execute_code`**, add **`imgscore-el-sse`**. **`imgscore-el-stdio` may be disabled by default** — enable when you need DB debugging beyond the Electron app.

## MCP Config

In `mcp_config.json`, the server is configured as:

```json
"imgscore-el-stdio": {
    "command": "python",
    "args": ["-m", "modules.mcp_server"],
    "cwd": "d:\\Projects\\image-scoring",
    "env": { "PYTHONPATH": "d:\\Projects\\image-scoring" },
    "disabled": true
}
```

> [!NOTE]
> When this server is disabled, its tools are unavailable. Ask the user to enable it before attempting to use these tools.

Add **`imgscore-el-sse`** with `"url": "http://127.0.0.1:7860/mcp/sse"` when the Python WebUI is running and you need **`execute_code`** (`ENABLE_MCP_EXECUTE_CODE=1` on the WebUI).

## Available Tools

### Diagnostic Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `get_error_summary` | Overview of job failures and missing scores | Investigating why images have no scores |
| `check_database_health` | Integrity check for Firebird records | Verifying DB consistency after bulk operations |
| `get_model_status` | GPU and model status | Understanding why scoring may be slow or failing |

### Data Query Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `query_images` | Advanced filtering by scores, ratings, labels | Debugging filter issues in the gallery |
| `get_image_details` | Full record for a specific file path | Verifying a specific image's data |
| `execute_sql` | Direct SELECT queries | Complex analysis not covered by other tools |

## Common Workflows

### 1. Investigate Missing Scores
```
1. get_error_summary          → See which models failed
2. get_model_status           → Check if GPU/models are available
3. query_images (with filters) → Verify which images are affected
```

### 2. Verify Score Values
```
1. get_image_details (by path) → See raw model output values
2. execute_sql                  → Compare against expected normalization
```

### 3. Database Health Check
```
1. check_database_health       → Look for orphaned records, NULL scores
2. execute_sql                  → Run targeted queries if issues found
```

### 4. Debug Gallery Filtering
When the gallery shows unexpected results:
```
1. query_images (same filters as gallery) → Compare DB results with UI
2. get_image_details (specific image)     → Verify individual record values
3. execute_sql (raw query)                → Check the exact SQL the app would generate
```

## Other Available MCP Servers

These servers are also configured and may be useful in conjunction:

| Server | Status | Purpose |
|--------|--------|---------|
| `git` | ✅ Enabled | Git operations on the `image-scoring` repo |
| `filesystem` | ✅ Enabled | File access to `image-scoring`, `accounting`, `lightroom-mcp`, `sharp-image-scoring`, and Antigravity dirs |
| `memory` | ✅ Enabled | Persistent key-value memory |
| `fetch` | ✅ Enabled | HTTP fetch for external URLs |
| `sqlite` | ✅ Enabled | SQLite for `accounting/finance.db` |
| `moltbook` | ✅ Enabled | Social network for AI agents |
| `lightroom` | ❌ Disabled | Lightroom integration |
| `browsermcp` | ❌ Disabled | Browser automation |
| `accounting-debugger` | ❌ Disabled | Accounting project debugging |
