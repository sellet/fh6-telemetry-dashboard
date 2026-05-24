# Ideas backlog

Ideas brainstormed and parked for later. Not a roadmap — pick the ones that match what you want the dashboard to _be_.

## Analysis & coaching

- **Sector splits + theoretical best lap.** Auto-segment the track from the GPS trace, store per-sector times, render delta-vs-best per sector live on the dashboard.
- **Live delta-time bar vs PB** for the current car+track combo.
- **Per-corner annotations on the map**: entry speed, apex speed, gear, max brake-pressure point — drawn at each corner.
- **Heatmaps overlaid on the map**: speed, throttle, brake, slip — toggleable layers.
- **Tire wear / fuel-burn trends** plotted across a stint.

## Comparison & ghosts

- **PB ghost**: render your fastest lap's car as a faded marker on the live map.
- **Side-by-side replay** of two sessions with a shared scrub bar.
- **Lap-vs-lap diff**: throttle/brake/steering traces + a delta-time curve.

## Track intelligence

- **Auto-detect track** by matching the GPS trace against a fingerprint library. Auto-tag new sessions with the track name.
- **Lap-boundary derivation** from the GPS trace (fallback when the game doesn't report laps cleanly).
- **Ideal-line overlay** learned from your own fastest laps per track.

## Sharing & export

- **Public read-only share links** for individual sessions or laps.
- **Exports**: CSV, generic JSON, MoTeC i2.
- **OBS browser-source mode**: transparent background, only the widgets you choose, designed for streaming overlays.
- **Discord webhook** on PB / session finish.

## Mobile & layout

- **Portrait iPad/phone layout** (the compact desktop layout doesn't translate cleanly to portrait yet).
- **Drag-and-drop / preset dashboard layouts** ("race", "tune debugging", "stream HUD").
- **Light / high-contrast theme** alongside the cockpit-dark one.

## Reliability & ops

- **JSONL → zstd** compression at session finalize.
- **Background indexer** so the session browser stays snappy at 10k+ sessions.
- **Prometheus metrics endpoint** + deeper healthcheck (UDP listener alive, disk free, session-writer queue depth).
- **Retention auto-policy** (env-driven: keep races, prune oldest free-roam past N sessions or X GB).

## Engineering quality

- **Vitest snapshot tests** for the cockpit widget components.
- **Synthetic UDP-stream playback** fixture for end-to-end tests — the inverse of the existing `capturePacket` tool.
- **CI matrix** on Node 20 / 22, Linux + macOS.
