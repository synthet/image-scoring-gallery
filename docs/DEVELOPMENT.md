# Development

Run commands from the gallery repo root.

## Setup

```bash
npm install
```

Keep **image-scoring-backend** and **image-scoring-gallery** as sibling directories unless you explicitly configure API URL/port in `config.json`.

## Health

```bash
npm run doctor
```

The gallery doctor checks local Node/config assumptions and sibling backend discovery such as `webui.lock` where supported.

## Development Server

```bash
npm run dev
```

This starts the local server, Vite, and Electron dev process according to [../package.json](../package.json).

## Type Checks

```bash
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
```

Known pre-existing TypeScript errors should only be mentioned when documented in repo docs or current task output. Do not introduce new errors.

## Lint

```bash
npm run lint
```

## Backend Companion Checks

Backend docs:

- [image-scoring-backend DEVELOPMENT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DEVELOPMENT.md)
- [image-scoring-backend DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md)
- [image-scoring-backend TESTING.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/TESTING.md)

When changing API/schema/phase integration, list checks for both repos in the final handoff.
