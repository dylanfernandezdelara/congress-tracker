# Docs agent guide

The app is in a product reset. Use the root `AGENTS.md` for commands and current behavior.

## Local preview

```bash
npm run dev:worker
npm run dev:web
```

Open `http://127.0.0.1:5173`. The placeholder page confirms worker connectivity via `/health`.

## Verification

```bash
npm test
```

Capture UI screenshots with Cursor Cloud browser tooling if needed. Do not commit PNGs to the repo.
