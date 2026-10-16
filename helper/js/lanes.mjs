// lanes.mjs — per-marketplace catalog fetchers, cache and the disclosed ranking rule.
// Stamp: 2026-10-15T16:40-0600, helper/js/lanes.mjs
// Network goes through the host's curl (Omarchy ships it; macOS and Windows 10+ ship it) so the APE
// carries no TLS stack yet. Every fetch is paced per host and cached under cacheDir().
// Robots: https://apps.odoo.com/robots.txt (read 2026-10-15) disallows *?*search=*, *?*order=, *?*page=
// and */page/*/*; the Odoo lane therefore fetches only path-style browse pages and filters locally.
import * as std from "qjs:std";
import * as os from "qjs:os";
import { cacheDir } from "./host.mjs";

const UA = "omamarket/0.1 (+https://github.com/ludoplex/omamarket)";
const PACE_MS = { "apps.odoo.com": 1500, default: 400 };
const lastHit = {};

export const LANES = {
  odoo: { name: "Odoo Apps", store: "https://apps.odoo.com", ttl: 6 * 3600, native: "purchases" },
  mcp: { name: "MCP registry", store: "https://registry.modelcontextprotocol.io", ttl: 3600, native: "registry order" },
  atlassian: { name: "Atlassian Marketplace", store: "https://marketplace.atlassian.com", ttl: 6 * 3600, native: "installs" },
  jetbrains: { name: "JetBrains Marketplace", store: "https://plugins.jetbrains.com", ttl: 6 * 3600, native: "downloads" },
  shopify: { name: "Shopify App Store", store: "https://apps.shopify.com", ttl: 6 * 3600, native: "no public API" },
  claude: { name: "Claude plugin marketplace", store: "https://claude.com/docs/plugins", ttl: 6 * 3600, native: "no public API" },
};

export function loadPinned() {
  const txt = std.loadFile(import.meta.url.replace(/^file:\/\//, "").replace(/lanes\.mjs$/, "pinned.json"))
    || std.loadFile("/zip/js/pinned.json");
  return txt ? JSON.parse(txt) : { label: "", disclosure: "", lanes: {} };
}

function nowMs() { return Date.now(); }

export function mkdirp(dir) {
  const parts = dir.split("/"); let cur = "";
  for (const seg of parts) { if (!seg) { cur = cur || "/"; continue; } cur = cur === "/" ? "/" + seg : cur + "/" + seg; os.mkdir(cur); }
}
function sleepMs(ms) { os.sleep(ms); }

function hostOf(url) { return (/^https?:\/\/([^/]+)/.exec(url) || [,""])[1]; }

export function curlText(url, extra) {
  const h = hostOf(url);
  const gap = PACE_MS[h] || PACE_MS.default;
  const wait = (lastHit[h] || 0) + gap - nowMs();
  if (wait > 0) sleepMs(wait);
  const tmp = std.tmpfile ? null : null; // qjs std.tmpfile() returns a FILE without a path; use a cache temp instead
  const dir = cacheDir();
  mkdirp(dir);
  const out = dir + "/.fetch." + Math.floor(Math.random() * 1e9) + ".tmp";
  const args = ["curl", "-sS", "-L", "-m", "40", "--retry", "2", "-A", UA, "-o", out, "-w", "%{http_code}"].concat(extra || [], [url]);
  const codeFile = out + ".code";
  const cfd = os.open(codeFile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600);
  const rc = os.exec(args, { block: true, usePath: true, stdout: cfd });
  os.close(cfd);
  lastHit[h] = nowMs();
  const code = (std.loadFile(codeFile) || "").trim();
  const body = std.loadFile(out);
  os.remove(out); os.remove(codeFile);
  return { rc, code: parseInt(code, 10) || 0, body: body || "" };
}

export function headOk(url) {
  const r = curlText(url, ["-I", "-X", "HEAD"]);
  return r.code === 200;
}

function cachePath(lane, key) { return cacheDir() + "/" + lane + (key ? "." + key : "") + ".json"; }

function readCache(lane, key, ttl) {
  const p = cachePath(lane, key);
  const txt = std.loadFile(p);
  if (!txt) return null;
  try {
    const obj = JSON.parse(txt);
    if (obj.fetchedAt && (nowMs() - obj.fetchedAt) / 1000 < ttl) return obj;
  } catch (e) {}
  return null;
}

function writeCache(lane, key, obj) {
  mkdirp(cacheDir());
  const f = std.open(cachePath(lane, key), "w");
  f.puts(JSON.stringify(obj));
  f.close();
}

/* ---------------- Odoo Apps: path-style browse pages, parsed like collect.py (2026-10-13) ---------------- */
const ODOO_RX = {
  href: /<a href="\/apps\/modules\/([0-9.]+)\/([^"\/]+)\/?">/,
  summ: /loempia_panel_summary">([\s\S]*?)<\/p>/,
  title: /<h5 title="([\s\S]*?)">/,
  author: /loempia_panel_author">\s*<b>([\s\S]*?)<\/b>/,
  price: /oe_currency_value">([0-9.,]+)</,
  cur: /<span>\s*([^<\s]+)\s*<span class="oe_currency_value/,
  buys: /Total Purchases: (\d+), Last month: (\d+)/,
};

function unescapeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export function parseOdooCards(html, category) {
  const out = [];
  const chunks = html.split("loempia_app_entry loempia_app_card").slice(1);
  for (const c of chunks) {
    const h = ODOO_RX.href.exec(c);
    if (!h) continue;
    const g = {};
    for (const k of ["summ", "title", "author", "price", "cur", "buys"]) g[k] = ODOO_RX[k].exec(c);
    out.push({
      id: h[2], series: h[1], category: category || "",
      name: g.title ? unescapeHtml(g.title[1]) : h[2],
      summary: g.summ ? unescapeHtml(g.summ[1]) : "",
      author: g.author ? unescapeHtml(g.author[1]) : "",
      price: g.price ? parseFloat(g.price[1].replace(/,/g, "")) : null,
      currency: g.cur ? g.cur[1] : null,
      purchases: g.buys ? parseInt(g.buys[1], 10) : 0,
      lastMonth: g.buys ? parseInt(g.buys[2], 10) : 0,
      url: "https://apps.odoo.com/apps/modules/" + h[1] + "/" + h[2],
    });
  }
  return out;
}

function fetchOdoo(opts) {
  const pages = Math.max(1, Math.min(opts.pages || 3, 10));
  const cats = opts.categories || ["Productivity", "Accounting", "Sales", "eCommerce"];
  const items = []; const seen = {};
  const add = (rows) => { for (const r of rows) if (!seen[r.id]) { seen[r.id] = 1; items.push(r); } };
  for (let n = 1; n <= pages; n++) {
    const url = n === 1 ? "https://apps.odoo.com/apps/modules/browse?price=Paid&series=19.0"
      : "https://apps.odoo.com/apps/modules/browse/page/" + n + "?price=Paid&series=19.0";
    const r = curlText(url);
    if (r.code !== 200) break;
    add(parseOdooCards(r.body, ""));
  }
  for (const cat of cats) {
    const r = curlText("https://apps.odoo.com/apps/modules/category/" + encodeURIComponent(cat) + "/browse?price=Paid&series=19.0");
    if (r.code === 200) add(parseOdooCards(r.body, cat));
  }
  items.sort((a, b) => b.purchases - a.purchases);
  return items;
}

/* ---------------- MCP registry v0 (JSON) ---------------- */
function fetchMcp(opts) {
  const q = opts.query ? "&search=" + encodeURIComponent(opts.query) : "";
  const r = curlText("https://registry.modelcontextprotocol.io/v0/servers?limit=50" + q);
  if (r.code !== 200) return [];
  const d = JSON.parse(r.body);
  const seen = {};
  const latest = (d.servers || []).filter((e) => { const n = e.server && e.server.name; if (!n || seen[n]) return false; seen[n] = 1; return true; });
  return latest.map((e) => {
    const s = e.server || {};
    const remote = (s.remotes || [])[0];
    return { id: s.name, name: s.name, summary: s.description || "", author: (s.name || "").split("/")[0], version: s.version || "",
      url: s.websiteUrl || (s.repository && s.repository.url) || "", transport: remote ? remote.type : "stdio", remoteUrl: remote ? remote.url : "" };
  });
}

/* ---------------- Atlassian Marketplace REST 2 (JSON) ---------------- */
function fetchAtlassian(opts) {
  const q = opts.query ? "&text=" + encodeURIComponent(opts.query) : "";
  const r = curlText("https://marketplace.atlassian.com/rest/2/addons?limit=50&hosting=cloud" + q);
  if (r.code !== 200) return [];
  const d = JSON.parse(r.body);
  const list = (d._embedded && d._embedded.addons) || [];
  return list.map((a) => ({
    id: a.key || (a._links && a._links.self && a._links.self.href) || "", name: a.name || "", summary: a.summary || a.tagLine || "",
    author: (a._embedded && a._embedded.vendor && a._embedded.vendor.name) || "",
    installs: (a._embedded && a._embedded.distribution && a._embedded.distribution.totalInstalls) || null,
    url: "https://marketplace.atlassian.com" + ((a._links && a._links.alternate && a._links.alternate.href) || ""),
  }));
}

/* ---------------- JetBrains Marketplace searchPlugins (JSON) ---------------- */
function fetchJetbrains(opts) {
  const q = "search=" + encodeURIComponent(opts.query || "");
  const r = curlText("https://plugins.jetbrains.com/api/searchPlugins?" + q + "&max=20");
  if (r.code !== 200) return [];
  const d = JSON.parse(r.body);
  return (d.plugins || []).map((p) => ({ id: p.xmlId, name: p.name, summary: p.preview || "", author: p.vendor ? p.vendor.name : "",
    downloads: p.downloads || 0, rating: p.rating || null, pricing: p.pricingModel || "", url: "https://plugins.jetbrains.com" + (p.link || "") }));
}

/* ---------------- lanes without a public API: pinned block + deep link only ---------------- */
function fetchNone() { return []; }

const FETCHERS = { odoo: fetchOdoo, mcp: fetchMcp, atlassian: fetchAtlassian, jetbrains: fetchJetbrains, shopify: fetchNone, claude: fetchNone };

export function searchDeepLink(lane, query) {
  const q = encodeURIComponent(query || "");
  switch (lane) {
    case "odoo": return "https://apps.odoo.com/apps/modules/browse?search=" + q;   // a link for the user's browser, never fetched by us
    case "shopify": return "https://apps.shopify.com/search?q=" + q;
    case "atlassian": return "https://marketplace.atlassian.com/search?query=" + q;
    case "jetbrains": return "https://plugins.jetbrains.com/search?search=" + q;
    case "mcp": return "https://registry.modelcontextprotocol.io/?search=" + q;
    case "claude": return "https://claude.com/plugins?q=" + q;
    default: return "";
  }
}

/* Marketplace-controlled strings never reach the UI with markup or control characters
   (maintainer finding on omacom/omarchy-plugin-marketplace#11762, 2026-10-16). */
export function cleanText(value, max) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/<[^>]*>/g, " ")            // strip any tag, including <img src=...>
    .replace(/[<>]/g, " ")               // no stray angle brackets either
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max || 400);
}

const TEXT_FIELDS = ["id", "name", "summary", "author", "category", "version", "transport", "pricing"];
function sanitizeItem(item) {
  const out = Object.assign({}, item);
  for (const k of TEXT_FIELDS) if (k in out) out[k] = cleanText(out[k], k === "summary" ? 400 : 200);
  for (const k of ["url", "storeUrl", "remoteUrl"]) if (k in out && !/^https?:\/\/[^\s<>"']+$/i.test(String(out[k] || ""))) out[k] = "";
  return out;
}

function matches(item, query) {
  if (!query) return true;
  const n = query.toLowerCase();
  return ["id", "name", "summary", "author"].some((k) => String(item[k] || "").toLowerCase().includes(n));
}

function withUtm(url, utm) {
  if (!url) return url;
  return url + (url.includes("?") ? "&" : "?") + utm;
}

/* The ranking rule, in one place: block A (pinned, labeled, disclosed) then block B (native order). */
export function catalog(lane, opts) {
  opts = opts || {};
  const spec = LANES[lane];
  if (!spec) return { ok: false, error: "unknown lane: " + lane, lanes: Object.keys(LANES) };
  const pinned = loadPinned();
  const key = (opts.query && lane !== "odoo") ? encodeURIComponent(opts.query).slice(0, 40) : "";
  const offline = !!opts.offline || std.getenv("OMAMARKET_OFFLINE") === "1";
  let cached = opts.noCache ? null : readCache(lane, key, spec.ttl);
  let items, fetchedAt, fromCache = true;
  if (cached) { items = cached.items; fetchedAt = cached.fetchedAt; }
  else if (offline) { items = []; fetchedAt = 0; fromCache = false; }
  else {
    try { items = FETCHERS[lane](opts); } catch (e) { return { ok: false, error: String(e), lane }; }
    fetchedAt = nowMs(); fromCache = false;
    writeCache(lane, key, { items, fetchedAt });
  }
  const q = opts.query || "";
  const blockB = (lane === "odoo" ? items.filter((i) => matches(i, q)) : items).slice(0, opts.limit || 40).map(sanitizeItem);
  const blockA = (pinned.lanes[lane] || []).filter((i) => matches(i, q) || !q).map((i) => sanitizeItem(Object.assign({}, i, { sponsored: true, url: withUtm(i.storeUrl, pinned.utm) })));
  return {
    ok: true, lane, laneName: spec.name, nativeOrder: spec.native, fetchedAt, fromCache,
    publisher: pinned.publisher, label: pinned.label, disclosure: pinned.disclosure,
    pinned: blockA, items: blockB, searchUrl: searchDeepLink(lane, q),
  };
}

/* Refresh the `live` flag of pinned items by a HEAD request (store listing exists). */
export function checkPinnedLive(lane) {
  const pinned = loadPinned();
  return (pinned.lanes[lane] || []).map((i) => ({ id: i.id, storeUrl: i.storeUrl, live: headOk(i.storeUrl) }));
}
