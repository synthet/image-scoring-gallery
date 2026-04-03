# Electron Image Scoring Gallery

An AI-powered image gallery application built with Electron, React, and Vite.

### Documentation
For detailed technical info, architecture, and feature plans, see the **[Documentation Index](./docs/README.md)**.

This application provides a high-performance interface for browsing and filtering images scored by the **[image-scoring-backend](https://github.com/synthet/image-scoring-backend)** core engine.

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
