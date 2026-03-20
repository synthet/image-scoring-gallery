# AI Agents Configuration: Electron Gallery

This document describes the AI agent integration for the Electron Image Scoring Gallery.

## Overview
This project is optimized for AI-assisted development using Cursor IDE and Antigravity. It leverages MCP (Model Context Protocol) to provide agents with deep visibility into the shared scoring database.

## MCP Configuration
The `.cursor/mcp.json` file uses the **`imgscore-el-*`** prefix so server names stay unique when Cursor merges multiple project configs. Image Scoring stdio is **`imgscore-el-stdio`** (sibling **image-scoring** repo). SSE for the Python WebUI is **`imgscore-el-sse`**. The Python repo defines **`imgscore-py-stdio`** / **`imgscore-py-sse`** for the same processes when that workspace is open.

### Requirements
- Python environment with `mcp` and `firebird-driver` (typically inherited from the core `image-scoring` project).
- Access to the `SCORING_HISTORY.FDB` file.

## Tools for Agents
Agents have access to specialized tools via **`imgscore-el-stdio`** (stdio) and **`imgscore-el-sse`** (when the WebUI runs). Other entries: **`imgscore-el-firebird`**, **`imgscore-el-playwright`**, **`imgscore-el-chrome-devtools`**, **`imgscore-el-debug`**.
- **Database Analysis**: Query images, check health, run SQL.
- **System Monitoring**: Check GPU and model status.
- **Error Diagnosis**: Analyze failed jobs and missing data.

## Documentation References
- **[Agent Coordination](docs/technical/AGENT_COORDINATION.md)** - Cross-project integration and coordination guide
- **[.cursorrules](.cursorrules)**: Core project rules and architecture patterns.
- **[Project Guide](.agent/PROJECT_GUIDE.md)**: Navigation and maintenance guide.
- **[AI Edit Spec](.agent/ai_edit_spec.md)**: Coding guidelines for agents.
