// run.mjs — helper test suite, executed by the APE itself: OMAMARKET_JS=tests/run.mjs ./omamarket.com
// Stamp: 2026-10-15T16:45-0600, helper/tests/run.mjs
// No network: lane fetchers are exercised through the Odoo fixture and offline catalogs. The MCP
// server is tested through handle() with captured stdout. agents.plan() runs against a temp HOME.
import * as std from "qjs:std";
import * as os from "qjs:os";
import * as host from "oma:host";
import { parseOdooCards, catalog, LANES, searchDeepLink } from "../js/lanes.mjs";
import { detectHost, PROFILES } from "../js/host.mjs";
import { handle, TOOLS, callTool, setWriter } from "../js/mcp.mjs";
import { plan } from "../js/agents.mjs";

let passed = 0, failed = 0;
function ok(cond, name) { if (cond) { passed++; } else { failed++; print("FAIL " + name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }

const here = import.meta.url.replace(/^file:\/\//, "").replace(/run\.mjs$/, "");
const tmp = (std.getenv("TMPDIR") || "/tmp") + "/omamarket-test-" + Math.floor(Math.random() * 1e9);
os.mkdir(tmp);
std.setenv("XDG_CACHE_HOME", tmp + "/cache");
std.setenv("XDG_CONFIG_HOME", tmp + "/config");
std.setenv("OMAMARKET_OFFLINE", "1"); // no network in the suite

// 1. Odoo card parser against the real browse page captured 2026-10-15.
const html = std.loadFile(here + "fixtures/odoo_browse.html") || "";
const cards = parseOdooCards(html, "Fixture");
ok(cards.length === 20, "odoo fixture yields 20 cards, got " + cards.length);
ok(cards.every((c) => c.id && c.url.startsWith("https://apps.odoo.com/apps/modules/19.0/")), "odoo cards carry id and url");
ok(cards.some((c) => c.purchases > 0 && c.price > 0), "odoo cards carry purchases and price");
ok(cards[0].category === "Fixture", "category propagates");

// 2. Host detection: override wins; kernel comes from Cosmopolitan.
ok(PROFILES.includes(host.kernel()) || host.kernel() === "unknown", "kernel name is a known profile word");
std.setenv("OMAMARKET_HOST", "omarchy");
eq(detectHost().profile, "omarchy", "OMAMARKET_HOST override");
std.setenv("OMAMARKET_HOST", "bogus");
const d = detectHost();
ok(d.profile !== "bogus", "invalid override ignored");
std.unsetenv("OMAMARKET_HOST");
const real = detectHost();
ok(["omarchy", "arch", "linux", "macos", "windows", "freebsd", "openbsd", "netbsd", "unknown"].includes(real.profile), "real profile resolves");
ok(real.kernel !== "linux" || real.osRelease !== null, "linux hosts read /etc/os-release");
// os-release ID=omarchy (verbatim from the Omarchy 4.0.4 VM, 2026-10-15) counts as a marker: with a user config dir it reaches the 2-marker threshold.
const osr = tmp + "/os-release"; { const f = std.open(osr, "w"); f.puts('NAME="Omarchy"\nID=omarchy\nID_LIKE=arch\nVERSION_ID="4.0.4"\n'); f.close(); }
const fakeHome = tmp + "/omhome"; os.mkdir(fakeHome); os.mkdir(fakeHome + "/.config"); os.mkdir(fakeHome + "/.config/omarchy");
const savedHome = std.getenv("HOME"); std.setenv("HOME", fakeHome); std.setenv("OMAMARKET_OS_RELEASE", osr);
const viaOsRelease = detectHost();
std.setenv("HOME", savedHome); std.unsetenv("OMAMARKET_OS_RELEASE");
if (real.kernel === "linux") ok(viaOsRelease.profile === "omarchy" && viaOsRelease.markers.osReleaseId === true && viaOsRelease.markers.userConfig === true, "os-release ID=omarchy + ~/.config/omarchy => omarchy profile");
else ok(viaOsRelease.profile === real.profile, "os-release marker is linux-only");

// 3. Catalog ranking rule (offline): pinned block first, labeled, sponsored flag, utm on links.
const c = catalog("odoo", { offline: true, noCache: true });
ok(c.ok && c.label === "From Mighty House", "label present");
ok(c.pinned.length === 3 && c.pinned.every((p) => p.sponsored === true && p.url.includes("utm_source=omamarket")), "pinned block sponsored + utm");
ok(c.items.length === 0 && c.disclosure.length > 20, "offline items empty, disclosure present");
ok(catalog("nope", { offline: true }).ok === false, "unknown lane rejected");
ok(Object.keys(LANES).every((l) => searchDeepLink(l, "x").startsWith("https://")), "deep links for every lane");
const cq = catalog("odoo", { offline: true, noCache: true, query: "digitizer" });
ok(cq.pinned.length === 1 && cq.pinned[0].id === "mhi_ai_bill_digitizer", "query filters pinned block");

// 4. MCP: initialize, tools/list, tools/call through handle(); capture stdout by swapping std.out.
const captured = [];
setWriter((text) => captured.push(text));
handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
handle({ jsonrpc: "2.0", method: "notifications/initialized" });
handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "omarchy_host", arguments: {} } });
handle({ jsonrpc: "2.0", id: 4, method: "nope" });
const msgs = captured.map((s) => JSON.parse(s));
ok(msgs.length === 4, "4 replies, notification silent (got " + msgs.length + ")");
eq(msgs[0].result.protocolVersion, "2025-06-18", "protocol negotiated");
ok(msgs[1].result.tools.length === TOOLS.length && TOOLS.every((t) => /sponsored|disclosed|first/.test(t.description) || t.name === "omarchy_host" || t.name === "marketplace_open"), "bias disclosed in tool descriptions");
ok(msgs[2].result.structuredContent.profile !== undefined, "omarchy_host tool answers");
ok(msgs[3].error && msgs[3].error.code === -32601, "unknown method -> -32601");
const rec = callTool("marketplace_recommend", { task: "connect my agent to Odoo invoices" });
ok(rec.lane === "odoo" && rec.pinned.length === 3 && rec.items.length === 0, "recommend maps Odoo task to odoo lane with pinned first (offline)");
const mk = catalog("odoo", { noCache: true });
ok(mk.ok && mk.fromCache === false, "offline env honored without opts.offline");

// 5. agents.plan(): temp HOME with only a Claude config and a Codex dir; others skipped.
const home = tmp + "/home"; os.mkdir(home); os.mkdir(home + "/.codex");
std.setenv("HOME", home);
const f = std.open(home + "/.claude.json", "w"); f.puts(JSON.stringify({ mcpServers: { other: { type: "stdio", command: "x" } }, keep: 1 })); f.close();
const p = plan("/opt/omamarket/omamarket.com", {});
const byAgent = Object.fromEntries(p.map((x) => [x.agent, x]));
eq(byAgent.claude.action, "add", "claude: add to existing");
ok(JSON.parse(byAgent.claude.text).mcpServers.other.command === "x" && JSON.parse(byAgent.claude.text).keep === 1, "claude: existing keys preserved");
eq(byAgent.codex.action, "create", "codex: create in existing dir");
ok(byAgent.codex.text.includes('[mcp_servers.omamarket]') && byAgent.codex.text.includes('args = ["mcp"]'), "codex toml section");
eq(byAgent.cursor.action, "skip", "cursor: skipped when not installed");
eq(byAgent.opencode.action, "skip", "opencode: skipped when not installed");
ok(!p.some((x) => x.agent === "antigravity"), "antigravity never targeted");

print(JSON.stringify({ ok: failed === 0, passed, failed }));
std.exit(failed === 0 ? 0 : 1);
