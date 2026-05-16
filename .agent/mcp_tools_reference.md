# MCP Tools Quick Reference (Driftara Gallery / Vexlum Scoring)

This project interacts with the **Vexlum Scoring** MCP server (`image-scoring-backend`) for database debugging and system health checks.

## Key Diagnostic Tools

1. **`get_error_summary`**: Overview of job failures and missing scores.
2. **`check_database_health`**: Integrity check for PostgreSQL records.
3. **`get_model_status`**: GPU/Model status (useful for understanding why scores might be missing).

## Data Query Tools

- **`query_images`**: Advanced filtering (scores, ratings, labels).
- **`get_image_details`**: Full record for a specific file path.
- **`execute_sql`**: Direct SELECT queries for complex analysis.

## Workflows

1. **Investigate Filtering Issues**:
   - `query_images` to see what results the DB returns.
   - `get_image_details` to verify specific record values.

2. **System Health**:
   - `check_database_health`
   - `get_model_status`
