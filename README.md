# compare.vs

F5 BIG-IP firmware upgrade assistant. Capture virtual server, pool, and pool member state before and after an upgrade, diff the two snapshots, and see exactly what regressed.

Runs entirely in the browser. Exports are parsed client-side and never leave the machine.

Live demo: **[fung04.github.io/compare-vs](https://fung04.github.io/compare-vs/)**

Full feature reference, input data contract, and known gaps: **[USAGE.md](USAGE.md)**

## How it works

1. Run the generated capture script on each BIG-IP. It `curl`s the LTM virtual/pool config and stats endpoints into one JSON bundle per device, plus GTM wide IP and pool member stats when the device is a GTM.
2. Upload the before bundle and the after bundle for each device in Local Mode.
3. The app joins config against stats by `fullPath`, classifies every virtual server, pool, and pool member as `degraded`, `improved`, `changed`, `missing_before`, `missing_after`, or `none`, and sorts degraded first.
4. Filter by health state and drill into per-device LTM, Pools, and GTM tabs.

## Features

- **Local Mode**: offline analysis of exported JSON, no device access needed.
- **Guided capture**: generates a ready-to-paste collector script per device for Linux bash, Windows CMD, or Windows PowerShell, with a copy button and credentials interpolated.
- **Multi-device**: N devices, each with a before and an after upload.
- **LTM view**: per virtual server, nested pool and member state, before and after badges for availability, enabled state, and `activeMemberCnt / memberCnt`.
- **GTM view**: wide IP cards with record-type badges, pool and member rollups, up-member counts, and collapsible unchanged members.
- **Regression-first ordering**: degraded, then improved, then changed, then missing, then unchanged.
- **Health filter**: All / Degraded / Improved / Unchanged across LTM, Pools, and GTM.
- **Status reason tooltips**: hover any object to see the F5 `statusReason`, shown as before and after when it changed.
- **Dark mode**: navbar toggle, applied before first paint.

## Development

```sh
npm install
npm run dev          # dev server over https (self-signed cert)
npm run build        # static output into build/
npm run preview      # serve the production build
npm run check        # svelte-check + tsc
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
```

SvelteKit 3 (Svelte 5 runes), Tailwind 4 with Flowbite Svelte, TypeScript. Stacked on `adapter-static` with `ssr = false` and `prerender = true`, so the whole app is a static client-side bundle.

## Deployment

```sh
npm run deploy       # build + push to gh-pages
```

Production builds set `paths.base = '/compare-vs'` in [vite.config.ts](vite.config.ts) for a GitHub Pages project site. Change or drop that if you host it at a root domain.

Live site: <https://fung04.github.io/compare-vs/>

## Status

- Local Mode is the working path. Online Mode on the landing page is a **disabled placeholder**: no route, no fetch layer, no connectivity test.
- One combined bundle per device per phase. The upload copy says "4 exported JSON files", but the parser reads a single file with `virtual`, `virtualStats`, `poolStats`, and `pool` keys.
- Snapshots live in browser memory only. Reloading discards them.
- Results cannot be exported, downloaded, or printed.
- No test suite. `npm run check` and `npm run lint` are the only automated gates.

## Layout

```
src/routes/            / (mode select), /local (wizard), /compare (results)
src/lib/f5parser.ts    raw F5 REST payloads -> F5Snapshot
src/lib/compare.ts     snapshot pair -> diff result
src/lib/types.ts       snapshot and diff type definitions
src/lib/components/    GtmCard.svelte
```

Scaffolded with `npx sv@0.17.0 create --template minimal --types ts --add prettier eslint --install npm .`

> Note: this README was fully drafted by an AI assistant (deepseek-v4-pro), not by the project owner.
