# Vexlum Scoring / Driftara Gallery — context

## Overview
**Vexlum Scoring** (`image-scoring-backend`) is the backend and core logic provider for the quality pipeline.
It exposes an MCP server that **Driftara Gallery** (`image-scoring-gallery`) can interact with.

## Key Paths
- **Backend root**: your local clone of **image-scoring-backend**
- **Database**: PostgreSQL (primary); legacy Firebird path depends on your config
- **MCP Server**: `modules/mcp_server.py` in the backend repo
- **Thumbnails**: typically under the backend or gallery repo per `config.json`

## Integration Points
- **Database**: Gallery connects via Postgres or API per configuration; schema is owned by the backend.
- **IPC**: The Electron app communicates with the Python backend via HTTP API and optional MCP.
