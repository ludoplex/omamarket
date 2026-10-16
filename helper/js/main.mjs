// main.mjs — omamarket helper CLI (runs inside the omamarket.com APE; qjs for development).
// Stamp: 2026-10-15T16:40-0600, helper/js/main.mjs
// Every command writes exactly one JSON value to stdout (the Okomart helper convention), so the
// Quickshell Process in the plugin can parse it with one StdioCollector.
import * as std from "qjs:std";
import { detectHost } from "./host.mjs";
import { catalog, LANES, checkPinnedLive } from "./lanes.mjs";
import { serveStdio, TOOLS } from "./mcp.mjs";
import { serve } from "./serve.mjs";
import { plan, apply } from "./agents.mjs";

const VERSION = "0.1.0";

function out(obj) { std.out.puts(JSON.stringify(obj) + "\n"); std.out.flush(); }

function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { opt[k] = next; i++; } else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

function usage() {
  out({ ok: true, version: VERSION, usage: [
    "omamarket.com host",
    "omamarket.com lanes",
    "omamarket.com catalog <lane> [--query q] [--limit n] [--no-cache] [--offline]",
    "omamarket.com pinned-live <lane>",
    "omamarket.com mcp                      (stdio MCP server)",
    "omamarket.com tools                    (list MCP tools)",
    "omamarket.com serve [--port N]         (loopback HTTP JSON API)",
    "omamarket.com configure-agents --helper /abs/path/omamarket.com [--yes] [--opencode-config PATH]",
  ] });
}

// scriptArgs[0] is the program name when the host passes argv whole.
const argv = (typeof scriptArgs !== "undefined" ? scriptArgs : []).slice(1);
const { pos, opt } = parseArgs(argv);
const cmd = pos[0];

try {
  switch (cmd) {
    case "host": out(detectHost()); break;
    case "lanes": out({ ok: true, lanes: LANES }); break;
    case "catalog": out(catalog(pos[1], { query: opt.query || "", limit: parseInt(opt.limit || "40", 10), noCache: !!opt["no-cache"], offline: !!opt.offline })); break;
    case "pinned-live": out({ ok: true, lane: pos[1], pinned: checkPinnedLive(pos[1]) }); break;
    case "tools": out({ ok: true, tools: TOOLS }); break;
    case "mcp": serveStdio(); break;
    case "serve": serve(parseInt(opt.port || "0", 10)); break;
    case "configure-agents": {
      if (!opt.helper) { out({ ok: false, error: "--helper /abs/path/omamarket.com is required" }); break; }
      const p = plan(String(opt.helper), { opencodeConfig: opt["opencode-config"] });
      if (opt.yes) out({ ok: true, applied: apply(p) });
      else out({ ok: true, dryRun: true, plan: p.map((x) => ({ agent: x.agent, path: x.path, action: x.action, reason: x.reason || null })) });
      break;
    }
    case "version": out({ ok: true, version: VERSION }); break;
    default: usage();
  }
} catch (e) {
  out({ ok: false, error: String(e), stack: e && e.stack ? String(e.stack) : undefined });
  std.exit(1);
}
