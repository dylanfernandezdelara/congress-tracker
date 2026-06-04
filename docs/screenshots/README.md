# UI screenshots (mobile, replay)

Committed PNGs for PR/review reference. **Not** used at runtime.

| File | Route |
|------|--------|
| `replay-homepage-mobile.png` | `/` |
| `replay-vote-detail-mobile.png` | `/votes/119/2/14` |

## Regenerate

With replay worker + web dev servers running:

```bash
./scripts/ensure-replay-dev-vars.sh
npm run dev:worker
VITE_API_URL=http://127.0.0.1:8787 npm run dev:web
npm run docs:snapshots
```

Uses iPhone 13 profile at `deviceScaleFactor=1` for smaller files. Ad-hoc captures go to gitignored `web/artifacts/`.
