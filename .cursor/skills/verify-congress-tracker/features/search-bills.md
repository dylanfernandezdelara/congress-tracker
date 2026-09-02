# Search bills

Search lets a user narrow the chronological timeline by a substring of title, policy area, digest headline, or bill id, see an empty state when nothing matches, and clear the query.

## Sub-features

- `search-submit` filters the timeline after Enter (and after the 300ms debounce).
- `search-match` keeps matching sample bills and hides non-matches.
- `search-empty` shows `No matches for “…”` when the query hits nothing.
- `search-clear` restores the unfiltered timeline from the clear control or empty-state button.

## How to get to it (user POV)

- Type in the `Search bills` field in the home toolbar and press Enter.
- Wait ~300ms after typing (debounce writes `?q=` without Enter).
- Choose `Clear search` in the field, or `Clear search` in the empty state.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible topics are `House passes a broad energy permitting and production package` and `Senate passes a public lands conservation and access bill`.
- Home is `/` with chamber `All`.

- **Focus search.** Load home. Run `verify-congress-tracker browser goto --path /` and `verify-congress-tracker browser wait --role searchbox --name "Search bills"`.
- **Match energy.** Type a token from the energy headline. Run `verify-congress-tracker browser fill --role searchbox --name "Search bills" --value "energy"` and `verify-congress-tracker browser press --key Enter`. Wait until the heading `House passes a broad energy permitting and production package` is visible and `Senate passes a public lands conservation and access bill` is not. The count line includes `“energy”`. URL contains `q=energy`.
- **API match.** Confirm the Worker filter. Run `verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0&q=energy'`. Every returned item mentions energy in title, headline, policy area, or bill id.
- **Empty state.** Search a nonsense token. Run `verify-congress-tracker browser fill --role searchbox --name "Search bills" --value "volcanozzz"` and `verify-congress-tracker browser press --key Enter`. Status text includes `No matches for “volcanozzz”` and a `Clear search` button is shown.
- **Clear from empty state.** Choose the empty-state control (the field clear is also named `Clear search`). Run `verify-congress-tracker browser click --role button --name "Clear search" --exact --nth 1`. The energy and public-lands headlines both return and `?q=` is gone.
- **Clear from field.** Search `energy` again, then clear with the field control. Run fill `energy`, press Enter, wait for the match, then `verify-congress-tracker browser click --role button --name "Clear search" --nth 0`. The searchbox is empty and all sample bills return.
- **Proof.** Capture the energy match. After the match step, run `verify-congress-tracker browser snapshot --aria --path artifacts/verify/search-bills/match.aria.txt` and `verify-congress-tracker browser screenshot --path artifacts/verify/search-bills/match.png`. Artifacts show `Track Congress`, `“energy”`, and the energy headline without the public-lands headline.

## Gotchas

- Fill alone is not proof: wait for the timeline count/URL (`?q=`) or press Enter, then wait for headings. Debounce is 300ms.
- Escape in the searchbox also clears when it has a value.
- Chamber and advanced filters AND with search. Clear those first or empty-state copy will mention them.
- Substring is case-insensitive. Assert the visible headline, not the draft input value.
