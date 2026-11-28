# Upstream

This directory contains the distribution from `Cyrene2008/swarm-cursors-vue` 1.4.0 at Git commit `1881ecbb3f1ed4c6be25df5ff133e4af17f33e88`, with the [CyTime patch](./replay-and-live-regions.patch). CyTime's Bun file dependency installs these files without contacting GitHub or relying on an npm release. The local manifest is private and omits upstream build and publishing configuration.

The patch adds `core.replay({ sound, volume })`, which starts a fresh capture under the route cover. Replay sound defaults off and uses a gain of `0.1` when enabled; it does not change transition sound. A `data-swarm-live` marker excludes the marked region from every capture and keeps its real content visible through all covers and drawings. The established `data-swarm-persist` marker still applies only to route-mode captures.

The patch also preserves text size and wrapping when CyTime scales its layout for a larger display. It compensates for positive uniform scaling on the captured text's transform chain.

To reproduce the patched distribution from a separate checkout, check out the pinned commit with LF line endings (`git -c core.autocrlf=false checkout 1881ecbb3f1ed4c6be25df5ff133e4af17f33e88` in a fresh clone made with `--no-checkout`), then run:

```sh
git apply --check --unidiff-zero /path/to/replay-and-live-regions.patch
git apply --unidiff-zero /path/to/replay-and-live-regions.patch
bun install --frozen-lockfile
bun run build
```

Replace the distribution as a whole, including both generated JavaScript chunks, the ES module and CommonJS entries, and the type declarations. As upstream does, omit the generated source maps. Keep both license files and their copies in `public/licenses/swarm-cursors-vue/` in sync; refresh CyTime's Bun lockfile if the dependency manifest changes.
