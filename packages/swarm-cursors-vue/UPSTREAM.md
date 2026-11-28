# Upstream

This directory contains the distribution from `Cyrene2008/swarm-cursors-vue` 1.4.1 at Git commit `c0775f5b21927c0b93c9029fa1923d17aa0daa1a` (upstream PR #1). CyTime's Bun file dependency installs these files without contacting GitHub or relying on an npm release. The local manifest is private and omits upstream build and publishing configuration.

The pinned source contains CyTime's earlier replay, live glyph, scaling, and worker-pointer changes, plus the upstream viewport handoff and native-control alignment fixes. CyTime calls the library's worker-pointer setter so its existing preference only hides drawing pointers. There are no local source patches.

To rebuild the vendored distribution, check out the pinned commit with LF line endings in a separate checkout, then run:

```sh
bun install --frozen-lockfile
bun run build
```

Replace the distribution as a whole, including both generated JavaScript chunks, the ES module and CommonJS entries, and the type declarations. As upstream does, omit the generated source maps. Keep both license files and their copies in `public/licenses/swarm-cursors-vue/` in sync; refresh CyTime's Bun lockfile if the dependency manifest changes.
