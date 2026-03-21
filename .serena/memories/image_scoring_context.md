# Image Scoring Context

## Overview
The `image-scoring` project is the backend and core logic provider for the image scoring system.
It exposes an MCP server that the `image-scoring-gallery` app can interact with.

## Key Paths
- **Root**: `D:\Projects\image-scoring`
- **Database**: `D:\Projects\image-scoring\SCORING_HISTORY.FDB`
- **MCP Server**: `D:\Projects\image-scoring\modules\mcp_server.py`
- **Thumbnails**: `D:\Projects\image-scoring\thumbnails`

## Integration Points
- **Database**: Both projects share the same Firebird database.
- **IPC**: The Electron app communicates with the Python backend via MCP or direct DB access.
