# Browser verification: agent-browser vs verify-congress-tracker

Evaluated 2026-09-08 on the isolated verify stack
(`VERIFY_WEB_PORT=5197 VERIFY_WORKER_PORT=8811 VERIFY_CDP_PORT=9246`).
`agent-browser` 0.37.0 installed under `/tmp/agent-browser-eval` (`npm i agent-browser@latest`;
global `npm i -g` failed with `EACCES` on `/usr/lib/node_modules`). `agent-browser install`
downloaded Chrome 152. Node 22 warned `EBADENGINE` (package wants `>=24`); the CLI still ran.

Same 3-step flow on both: open home → expand
`House passes a broad energy permitting and production package` → open
`Rep. Sample Crossover (local)` from Members.

## Measured output sizes

| Step | verify-congress-tracker | agent-browser |
| --- | --- | --- |
| Open home (commands) | start + goto + 2× wait = **219 B** | `open` = **77 B** |
| Home snapshot | `--aria` **8700 B** / 1193 words / ~2175 tokens | `snapshot -i` **4958 B** / 645 words / ~1239 tokens; full `snapshot` **15000 B** |
| Expand energy row | click + wait = **88 B**; `--aria` **11740 B** | `click @e46` = **9 B**; `-i` **5433 B** |
| Open member profile | wait + click + wait = **149 B**; `--aria` **12379 B** | `click @e27` = **9 B**; `-i` **5771 B** |

`find --role button --name /energy/` was **144 B** and not ref-addressable. agent-browser
`snapshot -i` is compact and ref-addressable (`@e1`…); its full tree is *larger* than our
ARIA dump. Refs go stale after re-render (re-snapshot before the next `--ref` / `@eN`).

## Safety

Our helper: port ownership + doctor (sample-only feed), evidence paths sandboxed to
`artifacts/verify/`, CDP allowlist, eval navigation guard, isolated D1, refuses to attach
to a server this run did not start.

agent-browser: none of that. It launched its own Chrome daemon (CDP on an ephemeral port),
wrote a screenshot to `/tmp` with no path sandbox, and can `--cdp` / `--auto-connect` onto
another worktree’s Chrome. Useful as a generic driver; not a replacement for launch/doctor/cleanup.

## Recommendation

**(b) Keep the helper; borrow the compact interactive snapshot with stable refs.**

Do not adopt agent-browser as the driver (a): the token win is the `-i` snapshot, not the
CLI, and replacing the helper would drop ownership/doctor/evidence sandboxing. Do not
reject (c): `-i` was ~43% of our home ARIA dump and ~47% after the profile sheet opened.

Implemented here: `browser snapshot --interactive` prints `[ref] role "name" (state)` and
sets `data-verify-ref`; `browser click --ref e1` / `fill --ref e2 --value …` target those
nodes. Home `--interactive` is **2202 B** vs `--aria` **8700 B** (same page). Refs are
invalidated by re-render — snapshot again. `browser viewport` persists width/height
(and optional mobile/dsf) so later commands keep the size.
