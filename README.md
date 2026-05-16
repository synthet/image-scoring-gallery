# Driftara Gallery

An AI-powered desktop image gallery built with Electron, React, and Vite. (Repository: `image-scoring-gallery`.)

### Documentation
For detailed technical info, architecture, and feature plans, see the **[Documentation Index](./docs/README.md)**, **[Shipped feature catalog](./docs/features/implemented/INDEX.md)**, and **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** (includes `npm run doctor`).

**Sibling backend** ([image-scoring-backend](https://github.com/synthet/image-scoring-backend)): infra hubs such as [docs/DEVELOPMENT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DEVELOPMENT.md), [docs/DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md), and `python scripts/doctor.py` for config/DB/pgvector checks.

This application provides a high-performance interface for browsing and filtering libraries processed by **[Vexlum Scoring](https://github.com/synthet/image-scoring-backend)** (`image-scoring-backend`).

## Features

- 🖼️ **High-Performance Gallery**: Smooth scrolling and instant previews.
- 📂 **Folder Tree**: Intuitive navigation of your image library.
- 🔍 **Advanced Filtering**: Filter by quality scores (MUSIQ, LIQE), keywords, and more.
- 📸 **RAW Support**: Integrated NEF/RAW viewing capability.
- 🗄️ **Database**: Connects to PostgreSQL locally and/or SQL via the **image-scoring-backend** API (`database.engine` in `config.json`).

## Prerequisites

- **Node.js**: (v18 or higher recommended)
- **Database**: Production uses PostgreSQL and/or backend API SQL mode (see `docs/architecture/02-database-design.md`).
- **Project layout**: For automatic API port discovery, keep **image-scoring-backend** and **image-scoring-gallery** as sibling directories. Override via `config.json` (`api.url` or `api.port`) if your layout differs.
- **Environment overrides:** Copy `environment.example.json` to `environment.json` (gitignored) for machine-specific paths, ports, and URLs; `environment.json` overrides overlapping keys in `config.json`.
- **Migration note:** Legacy Firebird keys (for example `database.host`, `database.path`, and `firebird.path`) are historical compatibility artifacts and are no longer first-class config fields; use `database.engine` (`postgres` or `api`) plus `database.postgres.*` / `database.api.*` instead.

## Getting Started

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone git@github.com:synthet/image-scoring-gallery.git image-scoring-gallery
    cd image-scoring-gallery
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the application**:
    ```bash
    ./run.bat
    ```
    *Or via npm:*
    ```bash
    npm run dev
    ```

## Development

- `npm run dev`: Launch the app in development mode with HMR.
- `npm run build`: Build the production application for Windows.
- `npm run lint`: Run ESLint to check for code quality issues.
