// serve.mjs — loopback HTTP JSON API for the T3 toolkit and other local front-ends.
// Stamp: 2026-10-15T16:40-0600, helper/js/serve.mjs
// Transport: native t3:net sockets + the qjs os.setReadHandler loop (proven 2026-10-13). GET only.
// Routes: /health, /host, /lanes, /catalog/<lane>?q=..&limit=N
import * as os from "qjs:os";
import * as net from "t3:net";
import { catalog, LANES } from "./lanes.mjs";
import { detectHost } from "./host.mjs";

function utf8Length(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
  }
  return n;
}

function json(fd, status, obj) {
  const body = JSON.stringify(obj);
  const head = "HTTP/1.1 " + status + "\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + utf8Length(body) + "\r\nConnection: close\r\nAccess-Control-Allow-Origin: http://127.0.0.1\r\n\r\n";
  net.send(fd, head + body);
  net.close(fd);
}

function route(path) {
  const [p, qs] = path.split("?");
  const q = {};
  for (const kv of (qs || "").split("&")) { if (!kv) continue; const [k, v] = kv.split("="); q[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " ")); }
  if (p === "/health") return [200, { ok: true, runtime: "omamarket-ape" }];
  if (p === "/host") return [200, detectHost()];
  if (p === "/lanes") return [200, { ok: true, lanes: LANES }];
  const m = /^\/catalog\/([a-z]+)$/.exec(p);
  if (m) { const c = catalog(m[1], { query: q.q || "", limit: parseInt(q.limit || "40", 10) }); return [c.ok ? 200 : 404, c]; }
  return [404, { ok: false, error: "not found" }];
}

export function serve(port) {
  const lfd = net.listen(port || 0);
  if (lfd < 0) throw new Error("listen failed: " + lfd);
  const bound = net.boundPort(lfd);
  print(JSON.stringify({ ok: true, listening: "http://127.0.0.1:" + bound }));
  os.setReadHandler(lfd, () => {
    const cfd = net.accept(lfd);
    if (cfd < 0) return;
    const req = net.recv(cfd, 65536) || "";
    const line = req.split("\r\n")[0] || "";
    const m = /^GET (\S+) HTTP\/1\.[01]$/.exec(line);
    if (!m) return json(cfd, 405, { ok: false, error: "GET only" });
    const host = (/\r\nHost: ([^\r]+)/i.exec(req) || [, ""])[1];
    if (host && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(cfd, 403, { ok: false, error: "loopback only" }); // DNS-rebinding guard (review 2026-10-14)
    try { const [s, o] = route(m[1]); json(cfd, s, o); } catch (e) { json(cfd, 500, { ok: false, error: String(e) }); }
  });
}
