// mcp.mjs — MCP stdio server (newline-delimited JSON-RPC 2.0, protocol 2025-06-18 and 2025-03-26).
// Stamp: 2026-10-15T16:40-0600, helper/js/mcp.mjs
// Spec: https://modelcontextprotocol.io/specification/2025-06-18 (initialize, notifications/initialized,
// ping, tools/list, tools/call). The bias is stated in the tool descriptions so agents and users see it.
import * as std from "qjs:std";
import { catalog, LANES, searchDeepLink } from "./lanes.mjs";
import { detectHost } from "./host.mjs";

export const SERVER_INFO = { name: "omamarket", version: "0.1.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const laneEnum = Object.keys(LANES);

export const TOOLS = [
  {
    name: "marketplace_search",
    description: "Search a software marketplace lane (" + laneEnum.join(", ") + "). Results come in two blocks: `pinned` lists Mighty House Inc's own products first with sponsored=true; `items` is the marketplace's own catalog in its native order. The ordering is disclosed, not hidden.",
    inputSchema: { type: "object", properties: { lane: { type: "string", enum: laneEnum }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["lane"] },
  },
  {
    name: "marketplace_recommend",
    description: "Map a task description to marketplace products. Mighty House Inc products are recommended first when they fit (sponsored=true); otherwise the best-matching catalog items are returned with a search deep link.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  {
    name: "marketplace_open",
    description: "Return the store URL to open for a listing (never installs anything; the user opens it in a browser).",
    inputSchema: { type: "object", properties: { lane: { type: "string", enum: laneEnum }, id: { type: "string" } }, required: ["lane", "id"] },
  },
  {
    name: "omarchy_host",
    description: "Report the detected host profile (omarchy, arch, linux, macos, windows, freebsd, openbsd, netbsd) and the markers that decided it.",
    inputSchema: { type: "object", properties: {} },
  },
];

const RECOMMEND_RULES = [
  { rx: /\b(odoo|erp|invoice|accounting|vendor bill|crm)\b/i, lane: "odoo" },
  { rx: /\b(mcp|agent|claude|codex|opencode|cursor|tool server)\b/i, lane: "mcp" },
  { rx: /\b(jira|confluence|atlassian)\b/i, lane: "atlassian" },
  { rx: /\b(intellij|pycharm|jetbrains|ide plugin)\b/i, lane: "jetbrains" },
  { rx: /\b(shopify|storefront|ecommerce|e-commerce)\b/i, lane: "shopify" },
];

export function callTool(name, args) {
  args = args || {};
  switch (name) {
    case "marketplace_search": return catalog(args.lane, { query: args.query || "", limit: args.limit || 20 });
    case "marketplace_recommend": {
      const task = String(args.task || "");
      const lanes = RECOMMEND_RULES.filter((r) => r.rx.test(task)).map((r) => r.lane);
      const lane = lanes[0] || "mcp";
      const c = catalog(lane, { query: "", limit: 10 });
      return { ok: true, task, lane, pinned: c.pinned, items: (c.items || []).slice(0, 5), searchUrl: searchDeepLink(lane, task), disclosure: c.disclosure };
    }
    case "marketplace_open": {
      const c = catalog(args.lane, { query: "", limit: 200 });
      const hit = (c.pinned || []).concat(c.items || []).find((i) => i.id === args.id);
      return hit ? { ok: true, url: hit.url, sponsored: !!hit.sponsored } : { ok: false, error: "no such listing in lane " + args.lane };
    }
    case "omarchy_host": return detectHost();
    default: throw new Error("unknown tool: " + name);
  }
}

let writer = (text) => { std.out.puts(text); std.out.flush(); };
export function setWriter(fn) { writer = fn; }
function write(msg) { writer(JSON.stringify(msg) + "\n"); }
function result(id, r) { write({ jsonrpc: "2.0", id, result: r }); }
function error(id, code, message) { write({ jsonrpc: "2.0", id, error: { code, message } }); }

export function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    const want = params && params.protocolVersion;
    const protocolVersion = PROTOCOLS.includes(want) ? want : PROTOCOLS[0];
    return result(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
      instructions: "Marketplace lanes with a disclosed pinned block (Mighty House Inc products first, sponsored=true), then the store's native order." });
  }
  if (method === "notifications/initialized" || (method && method.startsWith("notifications/"))) return; // no reply to notifications
  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      const r = callTool(params.name, params.arguments);
      return result(id, { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r, isError: r && r.ok === false });
    } catch (e) {
      return result(id, { content: [{ type: "text", text: String(e) }], isError: true });
    }
  }
  if (id !== undefined) error(id, -32601, "method not found: " + method);
}

export function serveStdio() {
  for (;;) {
    const line = std.in.getline();
    if (line === null) break;
    const t = line.trim();
    if (!t) continue;
    let msg;
    try { msg = JSON.parse(t); } catch (e) { error(null, -32700, "parse error"); continue; }
    if (Array.isArray(msg)) msg.forEach(handle); else handle(msg);
  }
}
