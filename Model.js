// Model.js — pure functions for the Omamarket panel (testable without the shell).
// Stamp: 2026-10-15T16:45-0600, Model.js
.pragma library

var LANES = ["odoo", "mcp", "atlassian", "jetbrains", "shopify", "claude"]
var LANE_LABELS = { odoo: "Odoo", mcp: "MCP", atlassian: "Atlassian", jetbrains: "JetBrains", shopify: "Shopify", claude: "Claude" }

function localPath(url) {
  var value = String(url || "")
  if (value.indexOf("file://") === 0) value = value.slice(7)
  try { return decodeURIComponent(value) } catch (e) { return value }
}

// The helper lives outside the plugin folder: Omarchy reloads the shell on any write inside it.
function helperPath(env) {
  var home = env.HOME || ""
  var dataHome = env.XDG_DATA_HOME || (home + "/.local/share")
  return dataHome + "/omamarket/omamarket.com"
}

// QProcess execs directly (no /bin/sh fallback); an APE must be launched through sh.
function helperCommand(helper, args) {
  return ["/bin/sh", helper].concat(args || [])
}

function parseOutput(text) {
  try {
    var obj = JSON.parse(String(text || "").trim())
    return obj && typeof obj === "object" ? obj : { ok: false, error: "helper returned a non-object" }
  } catch (e) {
    return { ok: false, error: "helper output is not JSON: " + String(text || "").slice(0, 120) }
  }
}

function priceText(item) {
  if (item.price === null || item.price === undefined) return ""
  var cur = item.currency || ""
  return String(item.price) + (cur ? " " + cur : "")
}

function statText(item) {
  if (item.purchases !== undefined) return item.purchases + " sold"
  if (item.installs) return item.installs + " installs"
  if (item.downloads) return item.downloads + " downloads"
  return ""
}

// Rows for the list view: a labeled pinned section, then the store's native-order section.
function rows(result) {
  var out = []
  if (!result || !result.ok) return out
  var pinned = Array.isArray(result.pinned) ? result.pinned : []
  var items = Array.isArray(result.items) ? result.items : []
  out.push({ kind: "header", text: result.label || "Pinned", hint: result.disclosure || "" })
  if (pinned.length === 0) out.push({ kind: "empty", text: "No " + (result.publisher || "publisher") + " listing in this lane yet." })
  for (var i = 0; i < pinned.length; i++) out.push({ kind: "item", sponsored: true, item: pinned[i] })
  out.push({ kind: "header", text: (result.laneName || "Store") + " (" + (result.nativeOrder || "native order") + ")", hint: "" })
  if (items.length === 0) out.push({ kind: "empty", text: result.searchUrl ? "Open the store search in your browser." : "Nothing fetched." })
  for (var j = 0; j < items.length; j++) out.push({ kind: "item", sponsored: false, item: items[j] })
  return out
}
