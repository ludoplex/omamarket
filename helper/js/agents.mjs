// agents.mjs — additive, keyed registration of the omamarket MCP server in agent configs.
// Stamp: 2026-10-15T16:40-0600, helper/js/agents.mjs
// Formats (read 2026-10-14):
//   Claude Code  ~/.claude.json                mcpServers.<name> = {type:"stdio",command,args,env}   https://code.claude.com/docs/en/mcp
//   Codex CLI    ~/.codex/config.toml          [mcp_servers.<name>] command = "..." args = [...]      https://learn.chatgpt.com/docs/extend/mcp?surface=cli
//   OpenCode     opencode.json  key "mcp"      {type:"local",command:[...],enabled:true}             https://opencode.ai/docs/mcp-servers/
//   Cursor       ~/.cursor/mcp.json            mcpServers.<name> = {command,args}                     https://cursor.com/docs/context/mcp
// Never written: Antigravity (T3 refuses text generation when its profile carries global MCP config,
// bin.mjs L169325) and Grok (config format not found). Default is a dry run; --yes writes with backups.
import * as std from "qjs:std";
import * as os from "qjs:os";
import { homeDir } from "./host.mjs";

export const SERVER_NAME = "omamarket";

function exists(p) { const s = os.stat(p); return s[1] === 0; }
function dirOf(p) { return p.replace(/[\\/][^\\/]*$/, ""); }
function readText(p) { return std.loadFile(p); }
function writeAtomic(p, text) {
  const tmp = p + ".omamarket.tmp";
  const f = std.open(tmp, "w"); f.puts(text); f.close();
  if (exists(p)) { const bak = p + ".omamarket-bak-" + new Date().toISOString().replace(/[:.]/g, "-"); os.rename(p, bak); }
  os.rename(tmp, p);
}

export function targets(helperPath, opts) {
  const h = homeDir();
  const opencode = (opts && opts.opencodeConfig) || ((std.getenv("XDG_CONFIG_HOME") || h + "/.config") + "/opencode/opencode.json");
  return [
    { agent: "claude", path: h + "/.claude.json", kind: "json", key: "mcpServers", entry: { type: "stdio", command: helperPath, args: ["mcp"], env: {} } },
    { agent: "cursor", path: h + "/.cursor/mcp.json", kind: "json", key: "mcpServers", entry: { command: helperPath, args: ["mcp"] } },
    { agent: "opencode", path: opencode, kind: "json", key: "mcp", entry: { type: "local", command: [helperPath, "mcp"], enabled: true } },
    { agent: "codex", path: h + "/.codex/config.toml", kind: "toml", key: "mcp_servers", entry: { command: helperPath, args: ["mcp"] } },
  ];
}

function planJson(t) {
  const txt = readText(t.path);
  let obj = {};
  if (txt) { try { obj = JSON.parse(txt); } catch (e) { return { agent: t.agent, path: t.path, action: "skip", reason: "existing file is not valid JSON" }; } }
  if (obj[t.key] && obj[t.key][SERVER_NAME]) return { agent: t.agent, path: t.path, action: "keep", reason: "entry already present" };
  if (!txt && !exists(dirOf(t.path))) return { agent: t.agent, path: t.path, action: "skip", reason: "agent not installed (no config directory)" };
  obj[t.key] = obj[t.key] || {};
  obj[t.key][SERVER_NAME] = t.entry;
  return { agent: t.agent, path: t.path, action: txt ? "add" : "create", text: JSON.stringify(obj, null, 2) + "\n" };
}

function tomlString(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

function planToml(t) {
  const txt = readText(t.path);
  if (!txt && !exists(dirOf(t.path))) return { agent: t.agent, path: t.path, action: "skip", reason: "agent not installed (no config directory)" };
  if (txt && new RegExp("^\\[" + t.key + "\\." + SERVER_NAME + "\\]", "m").test(txt)) return { agent: t.agent, path: t.path, action: "keep", reason: "section already present" };
  const section = "\n[" + t.key + "." + SERVER_NAME + "]\ncommand = " + tomlString(t.entry.command) + "\nargs = [" + t.entry.args.map(tomlString).join(", ") + "]\n";
  return { agent: t.agent, path: t.path, action: txt ? "add" : "create", text: (txt || "") + section };
}

export function plan(helperPath, opts) {
  return targets(helperPath, opts).map((t) => (t.kind === "json" ? planJson(t) : planToml(t)));
}

export function apply(plans) {
  const done = [];
  for (const p of plans) {
    if (p.action === "add" || p.action === "create") { writeAtomic(p.path, p.text); done.push({ agent: p.agent, path: p.path, written: true }); }
    else done.push({ agent: p.agent, path: p.path, written: false, reason: p.reason });
  }
  return done;
}
