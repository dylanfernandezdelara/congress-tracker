# Theme

Theme lets a user switch the UI between light and dark. The choice is stored in `localStorage` key `theme` and on `document.documentElement.dataset.theme`.

## Sub-features

- `theme-toggle-dark` switches from light to dark via `Switch to dark theme`.
- `theme-toggle-light` switches from dark to light via `Switch to light theme`.
- `theme-persist` keeps the chosen theme after a reload of `/`.

## How to get to it (user POV)

- Choose the sun/moon control in the site header (right of `Track Congress`).
- Reload the page; the last choice should remain.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor is green. Home is `/`.
- Header theme button is visible (any viewport).

- **Start light.** Load home. Run `verify-congress-tracker browser goto --path /` and `verify-congress-tracker browser wait --role button --name "Switch to dark theme"`. The document theme is `light` (button name is the *next* theme).
- **Switch to dark.** Choose the control. Run `verify-congress-tracker browser click --role button --name "Switch to dark theme"`. The button accessible name becomes `Switch to light theme`. Screenshot background is dark; `Track Congress` remains readable.
- **Switch to light.** Choose the control again. Run `verify-congress-tracker browser click --role button --name "Switch to light theme"`. The button name returns to `Switch to dark theme`.
- **Persist.** Set dark, then reload. Run click `Switch to dark theme`, then `verify-congress-tracker browser goto --path /` and wait for `Switch to light theme`. Dark remains without clicking.
- **Proof.** Capture light and dark. After the light wait, `verify-congress-tracker browser screenshot --path artifacts/verify/theme/light.png` and snapshot `artifacts/verify/theme/light.aria.txt`. After switching to dark, screenshot/snapshot `dark.png` and `dark.aria.txt`. Both show `Track Congress`; the dark screenshot is visibly the dark canvas (`#0a0a0a` family), not a dim overlay.

## Gotchas

- The button name is the theme it will switch **to**, not the current theme.
- Verification Chromium uses a fresh profile under `artifacts/verify/.run/chrome-profile`. Do not expect the user's OS/browser theme.
- `qa:web` emulates color scheme independently. That is not this toggle.
- Proof of persist requires a second `goto` after the click, not only `dataset.theme` in memory.
