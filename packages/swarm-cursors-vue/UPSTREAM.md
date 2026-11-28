# Upstream

This directory contains the distribution from `Cyrene2008/swarm-cursors-vue` 1.4.1 at Git commit `1cac10e8470f93d64cbabc4af7882cad1cf3f764`, with the [CyTime source patch](./replay-and-dynamic-text.patch). CyTime's Bun file dependency installs these files without contacting GitHub or relying on an npm release. The local manifest is private and omits upstream build and publishing configuration.

The patch adds `core.replay({ sound, volume })`, which starts a fresh capture under the route cover. Replay sound defaults off and uses a gain of `0.1` when enabled; it does not change transition sound. The clock glyphs participate in reconstruction and read their displayed values from the original clock. The established `data-swarm-persist` marker still applies only to route-mode captures.

The patch also preserves text size and wrapping when CyTime scales its layout for a larger display. The `worker-pointers` shadow part exposes only the decorative pointer layer, so CyTime can hide it independently of drawing guides and the user's cursor.

To recreate the exact source, check out the pinned commit with LF line endings (`git -c core.autocrlf=false checkout 1cac10e8470f93d64cbabc4af7882cad1cf3f764` in a separate clone made with `--no-checkout`), then apply the patch:

```sh
git apply --check --unidiff-zero /path/to/replay-and-dynamic-text.patch
git apply --unidiff-zero /path/to/replay-and-dynamic-text.patch
```

The patched sources are now in that checkout's `src/` and `types/` directories. To rebuild the vendored distribution, run:

```sh
bun install --frozen-lockfile
bun run build
```

Replace the distribution as a whole, including both generated JavaScript chunks, the ES module and CommonJS entries, and the type declarations. As upstream does, omit the generated source maps. Keep both license files and their copies in `public/licenses/swarm-cursors-vue/` in sync; refresh CyTime's Bun lockfile if the dependency manifest changes.
