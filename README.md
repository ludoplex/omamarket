# Omamarket

Browse software marketplaces from the Omarchy bar: Odoo Apps, the MCP registry, Atlassian Marketplace, JetBrains Marketplace, Shopify App Store and the Claude plugin marketplace.

Every lane shows two blocks. The first block, labeled **From Mighty House**, lists the plugin publisher's own products (marked *sponsored*). The second block is the store's own catalog in the store's native order (Odoo: purchases; Atlassian: installs; JetBrains: downloads). Nothing is installed from the panel; clicking a listing opens the store page in your browser.

## Install

```sh
omarchy plugin add https://github.com/ludoplex/omamarket.git --enable
```

Then click **Market** in the bar and press **Install helper**. The helper (`omamarket.com`, one Cosmopolitan APE binary for x86_64 and aarch64) is downloaded from the tag-pinned release in `helper.lock`, its sha256 is verified before it is made executable, and it is stored outside the plugin folder at `$XDG_DATA_HOME/omamarket/omamarket.com` (default `~/.local/share/omamarket/`).

## Remove

```sh
omarchy plugin remove io.github.ludoplex.omamarket
rm -rf ~/.local/share/omamarket ~/.cache/omamarket
```

## External dependencies

- `curl`, `sha256sum`, `bash`, `xdg-open` (all shipped with Omarchy). The helper uses the system `curl` for every network request.
- No sudo or pkexec is required. No binfmt registration. The helper is launched as `/bin/sh <path>/omamarket.com` because an APE file is a valid shell script by specification and Quickshell's `Process` execs directly.
- Network targets: `apps.odoo.com` (path-style browse pages only; `robots.txt` honored), `registry.modelcontextprotocol.io`, `marketplace.atlassian.com`, `plugins.jetbrains.com`, and `github.com` for the helper download. Responses are cached under `~/.cache/omamarket/`.
- No telemetry. Store links carry `utm_source=omamarket` so the publisher can attribute visits on its own listings.

## MCP server (optional)

The same helper is an MCP server for coding agents:

```sh
~/.local/share/omamarket/omamarket.com configure-agents --helper ~/.local/share/omamarket/omamarket.com        # dry run
~/.local/share/omamarket/omamarket.com configure-agents --helper ~/.local/share/omamarket/omamarket.com --yes  # write, with backups
```

It adds one `omamarket` entry to Claude Code (`~/.claude.json`), Codex (`~/.codex/config.toml`), OpenCode (`~/.config/opencode/opencode.json`) and Cursor (`~/.cursor/mcp.json`) when those agents are installed, and never removes or reorders existing servers. Tool descriptions state the sponsored ordering.

## License

MIT. See `LICENSE`.

---

## Development

Marketplace front-ends for Omarchy Linux with a disclosed pinned block, one Cosmopolitan APE helper that is also an MCP server, and a host-profile detector for every operating system the APE runs on.

Stamp: 2026-10-15T17:05-0600.

| Path | What |
|---|---|
| repository root | The Omarchy plugin `io.github.ludoplex.omamarket` (`manifest.json`, `BarWidget.qml`, `Panel.qml`, `Model.js`, `bin/install-helper.sh`, `helper.lock`). Validated with `omarchy plugin validate` (omacom/omarchy `bin/omarchy-plugin-validate`). |
| `helper/src/omamarket.c` | APE host: QuickJS-ng + native `t3:net` (loopback sockets) + native `oma:host` (Cosmopolitan `libc/dce.h` kernel detection). |
| `helper/js/` | `main.mjs` CLI, `host.mjs` profile detector, `lanes.mjs` fetchers + ranking rule, `mcp.mjs` stdio MCP server, `agents.mjs` additive agent-config writer, `serve.mjs` loopback JSON API, `pinned.json` block A. |
| `helper/scripts/build.sh` | Fat x86_64+aarch64 build with the JS embedded at `/zip/js/` (`zipobj`). Toolchain: cosmocc 14.1.0 + quickjs-ng . |
| `helper/tests/run.mjs` | Test suite run inside the APE: `OMAMARKET_JS=tests/run.mjs sh dist/omamarket.com`. |
| `helper/tests/host.test.sh` | Host-level checks: failed scripts never exit 0. |

## Verified on 2026-10-15 (Ubuntu 24.04 x86_64 build host; macOS aarch64)

- Direct `execv` of the APE fails with `ENOEXEC` (errno 8, "Exec format error"); `execv("/bin/sh", apePath, ...)` runs it. `binfmt_misc` on that host registers only python3.12. This is why the plugin launches the helper as `/bin/sh <path>`.
- Live catalogs: Odoo (purchases), MCP registry, Atlassian (installs), JetBrains (downloads) return items; Shopify and Claude lanes are pinned-block plus deep link only.
- MCP stdio: initialize (2025-06-18), tools/list (4 tools), tools/call, ping.
- `configure-agents` adds a keyed entry to `~/.claude.json` and `~/.codex/config.toml` with backups, skips agents without a config directory, never touches Antigravity.

## Not done

- Not run on a real Omarchy box: the Quickshell `Process` launch and the panel rendering are untested there.
- `preview.png` for the marketplace listing is missing.
- The six per-lane bar-widget repos (portfolio lever) are not generated yet.
