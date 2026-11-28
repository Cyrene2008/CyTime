# Upstream

This directory contains the distribution from `Cyrene2008/swarm-cursors-vue` 1.4.1 at Git commit `c5e16f1d00747056e8131ee9791c767610615819` (the upstream PR #1 merge). CyTime's Bun file dependency installs these files without contacting GitHub or relying on an npm release. The local manifest is private and omits upstream build and publishing configuration.

The pinned source includes live interaction updates during playback, alongside replay, live glyphs, viewport handoff and control alignment. CyTime opts into `liveInteractions` and keeps its existing worker-pointer, sound, and route preferences. There are no local source patches.

To rebuild the vendored distribution, check out the pinned commit with LF line endings in a separate checkout, then run:

```sh
bun install --frozen-lockfile
bun run build
```

Replace the distribution as a whole, including both generated JavaScript chunks, the ES module and CommonJS entries, and the type declarations. As upstream does, omit the generated source maps. Keep both license files and their copies in `public/licenses/swarm-cursors-vue/` in sync; refresh CyTime's Bun lockfile if the dependency manifest changes.
