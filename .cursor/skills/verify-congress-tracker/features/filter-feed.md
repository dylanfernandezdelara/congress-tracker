# Filter feed

Filters let a user restrict the timeline by passage-vote chamber and by primary-sponsor facets (state, sponsor chamber, party, member, policy topic).

## Sub-features

- `filter-chamber` switches All / House / Senate radios.
- `filter-open` opens the Filters panel (inline ≥640px, sheet on smaller widths).
- `filter-state` keeps bills whose primary sponsor is in that USPS state.
- `filter-sponsor-chamber` restricts to the sponsor's House/Senate via `Sponsor chamber`.
- `filter-party` keeps bills whose primary sponsor party is Democrat / Republican / Independent (`D` / `R` / `I`).
- `filter-member` narrows to one primary sponsor via the `Member` combobox.
- `filter-topic` keeps bills whose digest policy area matches `Filter by policy topic`.
- `filter-clear` removes advanced filters from `Clear` / `Clear filters` / chip remove.

## How to get to it (user POV)

- Choose `House`, `Senate`, or `All` in `Filter by chamber`.
- Choose `Filters` in the toolbar, then set `Filter by sponsor state`, `Sponsor chamber` (legend `Proposed by`), `Filter by sponsor party`, `Member`, and `Filter by policy topic`.
- Choose an active-filter chip to remove one facet, or `Clear`.
- Empty-state `Show all chambers` / `Clear filters` when the combination matches nothing.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed with House energy (NY sponsor) and Senate public-lands (TX sponsor) bills.
- Viewport 1280×800 so Filters opens as an inline panel, not a sheet.
- Home is `/` with no `q`.

- **House chamber.** Load home. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`, then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role radio --name "House"`. `House` is `aria-checked=true`. The energy headline remains; `Senate passes a public lands conservation and access bill` is gone. URL has `chamber=House`.
- **Senate chamber.** Choose Senate. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role radio --name "Senate"`. The public-lands headline is visible; the energy House headline is not. URL has `chamber=Senate`.
- **All chambers.** Restore. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role radio --name "All"`. Both sample headlines return and `chamber` is absent from the URL.
- **Open filters.** Choose `Filters`. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Filters"`. The `Filter by sponsor state` control is visible (`aria-expanded=true` on `Filters`).
- **State NY.** Restrict to New York (energy bill sponsor). Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser select --name "Filter by sponsor state" --value NY`. The energy headline remains; the public-lands headline is gone. An `Active filters` chip for New York is shown. URL includes `state=NY`.
- **API state.** Confirm the same facet. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0&state=NY'`. Items are the NY-sponsored sample bill(s) only.
- **Clear advanced.** Choose `Clear`. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Clear" --exact`. Chips disappear, both sample headlines return, and `state` leaves the URL.
- **Sponsor chamber House.** Restrict to House sponsors. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role radio --name "House" --nth 1`. The energy and oversight House headlines remain; the public-lands Senate headline is gone from the timeline. URL includes `sponsor_chamber=House`.
- **Party Democrat.** Restrict to Democrat-sponsored bills. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Clear" --exact` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser select --name "Filter by sponsor party" --value D`. Then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "House passes a broad energy permitting and production package" --nth 0` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "House passes a federal spending oversight bill" --nth 0`. The public-lands Senate headline is gone from the timeline. URL includes `party=D`.
- **API party.** Confirm the same facet. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0&party=D'`. Items are the two Democrat-sponsored sample bills only.
- **Member Loyal.** Restrict to one sponsor. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Clear" --exact`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser fill --role combobox --name "Member" --value "Loyal"`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role option --name "/Rep\. Sample Loyal/"`, and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role option --name "/Rep\. Sample Loyal/"`. The energy headline remains; the public-lands and oversight headlines are gone from the timeline. URL includes `sponsor=LOCAL%3AH002` (the colon is percent-encoded). The public-lands title may still appear as a heading in `New laws`; assert the timeline, not the whole page.
- **Topic Energy.** Restrict to the Energy policy area. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Clear" --exact`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser select --name "Filter by policy topic" --value Energy`, and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "House passes a broad energy permitting and production package" --nth 0`. The public-lands and oversight headlines are gone from the timeline. URL includes `policy=Energy`.
- **API topic.** Confirm the same facet. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0&policy=Energy'`. Items are the energy sample bill only.
- **Proof.** Capture House-only. After the House step, run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/filter-feed/house.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/filter-feed/house.png`. Artifacts show `Track Congress`, selected `House`, and the energy headline without the Senate public-lands headline.

## Gotchas

- `Filter by chamber` is the **vote** chamber. `Proposed by` inside Filters is the **sponsor's** House/Senate. They are different.
- Below 640px, Filters is a dialog titled `Filters` with `Done` / `Close filters`. Inline `aria-controls` is desktop-only.
- Party options are labeled Democrat / Republican / Independent but submit `D` / `R` / `I`.
- `Member` typeahead `Loyal` returns both `Rep. Sample Loyal (local)` and `Sen. Sample Loyal (local)`; match the `Rep.` prefix or strict mode throws.
- Seeded NY sponsor is `Rep. Sample Loyal (local)` on the energy bill; TX is the Senate public-lands sponsor. Do not assume live Congress members.
- Combining chamber House with state TX can empty the list; use `Clear filters` / `Show all chambers` rather than reloading unless proving that empty state.
