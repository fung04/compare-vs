# compare.vs: usage guide

F5 BIG-IP firmware upgrade assistant. Captures virtual server, pool, and pool member state before and after an upgrade, then diffs the two snapshots to surface regressions.

Everything runs client-side in the browser. No device credentials or snapshot data leave the machine.

- Stack: SvelteKit 3 (Svelte 5 runes), Tailwind 4 + Flowbite Svelte, TypeScript
- Build: static, prerendered, `ssr = false`, `adapter-static`
- Routes: `/` (mode selection), `/local` (wizard), `/compare` (results)

Live demo: <https://fung04.github.io/compare-vs/> · Short overview: [README.md](README.md)

---

## 1. Quick start

```sh
npm install
npm run dev          # dev server on https (self-signed cert via @vitejs/plugin-basic-ssl)
npm run build        # static output into build/
npm run preview      # serve the production build
npm run check        # svelte-check + tsc
npm run deploy       # build + push to gh-pages
```

Production builds get `paths.base = '/compare-vs'` (see `vite.config.ts`), matching a GitHub Pages project site. Dev builds are served from `/`.

---

## 2. Routes and features

### `/`: mode selection

Two cards, no navigation chrome beyond the navbar:

| Card | State | What it does |
|---|---|---|
| Online Mode | **Disabled** | Introduces "Enter device IP, username & password", "Test connectivity before capturing", "One-click snapshot". The button is a hard `disabled` Button with no handler. No `/online` route or fetch layer exists. |
| Local Mode | Working | "Upload JSON files", navigates to `/local` via `goto(resolve('local'))`. |

### `/local`: local mode wizard

Three-step `BreadcrumbStepper` (Setup, Capture, Upload).

**Step 1: initial setup** (`/local` step 1)

- **Number of Devices**: numeric `Input` plus `+` / `-` buttons. Drives how many before/after upload pairs are expected. Bound directly to the input, so an empty or non-numeric value is not guarded.
- **Mode radio**: `Guided` or `Manual`. Default is `Manual`.
  - `Guided` reveals the F5 Credentials card and the generated capture scripts (Step 2), and hides the per-device GTM toggle in the upload cards.
  - `Manual` skips the credentials card and capture scripts: you supply the JSON bundle yourself. It keeps one upload row per device, with the GTM toggle shown inline on the before card.
- **Device OS select**: `Linux (F5)`, `Windows (CMD)`, `Windows (PowerShell)`. Controls which capture script is rendered.

**Step 2: F5 credentials and capture scripts** (`Guided` mode only)

One credentials row per device: device IP, username, password, and a `BIG-IP GTM Device` toggle (`isGTM`). The values are interpolated straight into the generated capture script and into `appConfig.credentials`.

A copy-ready script block per device, with a macOS-style header and a `Clipboard` copy button (label flips to "Copied"). Three flavours:

| OS target | Collector | Output file |
|---|---|---|
| Linux (F5) | Bash brace group of `curl -sk -g -u user:pass ...` calls | `/var/tmp/<ip>_f5.json` |
| Windows (CMD) | `curl.exe -sk -u user:pass ...` inside a parenthesised `echo` block | `<ip>_cmd_f5.json` |
| Windows (PowerShell) | `curl.exe -sk -u user:pass ... \| Out-String`, assembled with string concat | `<ip>_f5.json` |

LTM endpoints hit by every flavour:

```
https://<ip>/mgmt/tm/ltm/virtual
https://<ip>/mgmt/tm/ltm/virtual/stats
https://<ip>/mgmt/tm/ltm/pool/stats
https://<ip>/mgmt/tm/ltm/pool?expandSubcollections=true
```

When `isGTM` is on, the script additionally loops over record types `a aaaa cname https mx naptr srv svcb` and appends:

```
https://<ip>/mgmt/tm/gtm/wideip/<type>?expandSubcollections=true
https://<ip>/mgmt/tm/gtm/wideip/<type>/stats?expandSubcollections=true
https://<ip>/mgmt/tm/gtm/pool/<type>/members/stats?expandSubcollections=true
```

**Step 3: upload**

Two side-by-side cards, "Snapshot Before Upgrade" and "Snapshot After Upgrade". Each renders one `Fileupload` (`.json` / `application/json`, clearable) per device.

After a file is picked it is parsed and validated, then a row of badges shows which payloads were found:

| Badge | Green when |
|---|---|
| Virtual Server | `virtual` present |
| Virtual Server Stats | `virtualStats` present |
| Pool | `pool` present |
| Pool Stats | `poolStats` present |
| GTM WideIp | `gtm.<type>.wideip` present (GTM devices only) |
| GTM WideIp Stats | `gtm.<type>.wideipStats` present (GTM devices only) |
| GTM Pool Member Stats | `gtm.<type>.poolMembersStats` present (GTM devices only) |

A parse failure sets the error string `Invalid JSON — could not parse file.`. A missing key sets `Missing required field: <key>`.

**Compare Before & After Snapshots** is enabled only when every device index has both a before and an after file with no error. It builds one `F5Snapshot` per device per phase into the `beforeSnapshot` / `afterSnapshot` stores and navigates to `/compare`.

### `/compare`: comparison results

- **Comparison Result** card: counts how many device pairs produced a comparison (`results.filter(Boolean).length`).
- **Filter by Health State**: `All` / `Degraded` / `Improved` / `Unchanged`, applied to LTM virtual servers, standalone pools, and GTM wide IPs simultaneously.
- One collapsible `AccordionItem` per configured device, headed by the device IP (or `#<n>` when no IP is set), open by default. A device with only one of the two snapshots shows a "No before/after snapshot pair for this device" notice instead of results.
- Three tabs inside each device: **LTM**, **Pools**, **GTM**.

**LTM tab**: one card per virtual server:

- Availability `Indicator` coloured from the after-state, plus the VS path with `/Common/` stripped.
- Hover tooltip on the VS name showing `statusReason_virtual` after the upgrade.
- Nested accordion for the pool (same indicator treatment, tooltip on `statusReason_pool`) listing each pool member with its own indicator.
- **Details** accordion with before → after badges for: VS enabled state, VS availability, pool availability, pool `activeMemberCnt / memberCnt`, and every pool member's state.

**Pools tab**: same card anatomy, but for standalone pool records (`poolRecords`) rather than pools reached through a virtual server.

**GTM tab**: `GtmCard.svelte`, one card per wide IP:

- Wide IP indicator, name, and a record-type badge colour-coded per type (A blue, AAAA indigo, CNAME purple, MX teal, SRV amber, NAPTR pink, anything else gray).
- Summary line: `<n> pools, <up>/<total> members up`, plus `(<n> changed)` in orange when applicable.
- Transition badges show a single state when unchanged, and `before → after` only when the value actually changed.
- Tooltips show `statusReason` for wide IP, pool, and members, rendering both the before and after reason when they differ.
- Per-pool rows carry availability and enabled-state transitions plus their members. Unchanged members are hidden by default behind a `Show N unchanged members` / `Hide unchanged members` toggle.

---

## 3. Input data contract

The wizard expects **one JSON file per device per phase**, produced by the generated script. It is not the raw output of a single F5 endpoint; it is a wrapper object:

```json
{
  "virtual":      { "items": [ ... ] },
  "virtualStats": { "entries": { ... } },
  "poolStats":    { "entries": { ... } },
  "pool":         { "items": [ ... ] },
  "gtm": {
    "a": {
      "wideip":            { "items": [ ... ] },
      "wideipStats":       { "entries": { ... } },
      "poolMembersStats":  { "entries": { ... } }
    }
  }
}
```

| Key | Source endpoint | Required |
|---|---|---|
| `virtual` | `/mgmt/tm/ltm/virtual` | Yes |
| `virtualStats` | `/mgmt/tm/ltm/virtual/stats` | Yes |
| `poolStats` | `/mgmt/tm/ltm/pool/stats` | Yes |
| `pool` | `/mgmt/tm/ltm/pool?expandSubcollections=true` | Yes |
| `gtm.<type>.wideip` | `/mgmt/tm/gtm/wideip/<type>?expandSubcollections=true` | GTM devices only |
| `gtm.<type>.wideipStats` | `/mgmt/tm/gtm/wideip/<type>/stats?expandSubcollections=true` | GTM devices only |
| `gtm.<type>.poolMembersStats` | `/mgmt/tm/gtm/pool/<type>/members/stats?expandSubcollections=true` | GTM devices only |

Parsing rules applied by `src/lib/f5parser.ts`:

- Virtual server and pool states come from `<endpoint>/stats` (`status.availabilityState`, `status.enabledState`, `status.statusReason`, `activeMemberCnt`, `memberCnt`), matched to config records by `fullPath`.
- Pool members come from the **pool config** file (`membersReference.items`), not from member stats. The member path is `fullPath`, the state is the config `state` field.
- Anything absent degrades to `unknown` / `enabled` / empty arrays rather than throwing, so a partial bundle still produces a snapshot.
- Snapshot records are sorted alphabetically by path. `timestamp` is set at parse time (build time in the browser).

---

## 4. How differences are classified

`calcChangeType(before, after)` in `src/lib/compare.ts`:

| Change type | Meaning |
|---|---|
| `degraded` | `available` → anything else |
| `improved` | anything else → `available` |
| `changed` | state changed but neither side was `available` |
| `missing_before` | item exists only in the after snapshot (new object) |
| `missing_after` | item exists only in the before snapshot (possible removal) |
| `none` | identical |

Additional rules:

- A pool is flagged `changed` when `availabilityState_pool` is unchanged but `activeMemberCnt` differs, so silent member loss is not missed.
- A VS or wide IP rolls up to `hasDegradation` / `hasImprovement` when its own state or any pool/member below it degraded or improved. `missing_after` counts as degradation.
- Cards (VS, pool, wide IP) sort degraded first, then improved, then any other change including missing objects, then unchanged, tie-broken alphabetically by path. Members sort degraded, `missing_after`, changed, `missing_before`, improved, unchanged.
- GTM comparison only runs when both snapshots carry `gtmRecords`; the standalone pool comparison only runs when both carry `poolRecords`.

### Colour legend

| Indicator colour | State |
|---|---|
| Green | `available`, `up`, `enabled` |
| Red | `unavailable`, `offline`, `down`, `disabled` |
| Blue | `unknown` |
| Fuchsia | unset / unrecognised |

---

## 5. Presentation and platform behaviour

- **Dark mode**: `DarkMode` toggle in the navbar. `app.html` applies the stored preference before first paint using the `THEME_PREFERENCE_KEY` localStorage entry, falling back to `prefers-color-scheme`.
- **Client-only**: `ssr = false` with `prerender = true`. Snapshots live in Svelte stores in memory only, so a page reload discards both snapshots and the compare result. Use the wizard in one session, `/` → `/local` → `/compare`.
- **No server**: no API layer, no auth, no analytics. `static/robots.txt` allows crawling.
- **Removed from the UI**: results cannot be exported, downloaded, or printed; the existing pool data is not editable.

---

## 6. Known gaps and rough edges

Flagged while reading the source; none of these are documented in the UI.

1. **Online Mode is advertised but not implemented.** The landing card promises live capture and connectivity testing, and the button is `disabled` with no route behind it.
2. **Member state classification gap (verify against a real export).** `calcChangeType` treats only `available` as healthy, but LTM pool members are populated from the pool config `state` field, which on BIG-IP returns values like `up` / `down` / `checking` / `unchecked`. If real exports come through that way, an `up` → `down` member is reported as `changed`, not `degraded`, even though `getAvailColor` renders it red. `AvailState` already lists `up` / `down`, so the types anticipate it; the comparison logic does not.
3. **The upload copy says "4 exported JSON files"; the parser takes one combined file.** `validateFileData` reads `data.virtual` / `data.virtualStats` / `data.poolStats` / `data.pool` from a single upload, so the label is misleading.
4. **GTM validation flags track only the last record type.** `validateFileData` assigns `requiredItem.gtm*` inside `Object.keys(data.gtm).forEach(...)`, so a missing `wideip` under a non-final type is not reported.
5. **`Unchanged` filter is broader than its label.** It matches `!hasDegradation && !hasImprovement`, which also includes genuinely `changed` records (for example `missing_before` or an enabled-state flip).
6. **Devices are paired by array index, not by identity.** `results[i] = compareSnapshots(before[i], after[i])` keyed on `appConfig.credentials` order, so uploading the after-upgrade files in a different order than the before files silently compares the wrong devices. The accordion label only shows an IP in Guided mode; in Manual mode it degrades to `#1`, `#2`, ...
7. **Compare results are computed once.** `results` uses a plain `get(beforeSnapshot)` at component init rather than a derived value, so the page does not recompute if the stores change while it is mounted.
8. **Residual debug code**: `$inspect.trace('Update appConfig')` in `/local` and `console.log('DEBUG: Snapshots Built', ...)` before navigation.
9. **Dead code**: `parseSnapshotJson()` in `src/lib/f5parser.ts` has no caller, so there is no path to import a previously exported snapshot; the `mode` writable in `src/lib/stores.ts` (`'online' | 'local' | null`) is unused, and `AppConfig.mode` is typed `'Automatic' | 'Manual' | 'Guided'` while the wizard only ever writes `'Manual'` or `'Guided'`, with the store defaulting to `'Automatic'`.
10. **Cosmetic**: the landing headline reads "Verify your upgrade didt break anything."
11. **Switching to Manual wipes Guided credentials.** The `/local` reset `$effect` clears `deviceInfo` whenever `mode` is not `Guided`; the growth effect then re-seeds the same number of blank rows, so any IP, username, or password entered in Guided mode is discarded. Row count is preserved.
12. **The GTM toggle is asymmetric in Manual mode.** The before-upload card renders the `BIG-IP GTM Device` toggle while the after card renders an empty spacer. Both read `deviceInfo[i].isGTM`, so the before-card toggle still affects both phases, but only one card exposes it.

---

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| "Invalid JSON — could not parse file." | The file is raw F5 API output or truncated. Re-run the generated capture script and upload its output file. |
| "Missing required field: pool" | The bundle lacks one of the four LTM payloads. Check the script actually wrote all four responses, and that the pool call returned data. |
| Badges stay gray | The corresponding key is missing or empty in the bundle. |
| No device accordion on `/compare` | The before or after snapshot for that index was never built, or the wizard was reloaded and the in-memory stores were lost. |
| Every member shows as `changed` | See gap 2 above: member states arriving as `up` / `down` rather than `available` / `unavailable`. |
| GTM tab is empty | The device was not marked `isGTM`, or the GTM payloads were not captured. Requires an `isGTM` device plus all three GTM payloads per record type. |

---

> Note: this document was fully drafted by an AI assistant (deepseek-v4-pro), not by the project owner.
