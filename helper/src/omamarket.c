// omamarket.c — Cosmopolitan APE host for the Omamarket helper.
// Stamp: 2026-10-15T16:40-0600, helper/src/omamarket.c
// Base: <local-path>
// (QuickJS-ng host + native t3:net loopback socket module, proven as an APE on 2026-10-13).
// Added here: the native `oma:host` module that exposes Cosmopolitan's kernel detection
// (libc/dce.h: IsLinux/IsWindows/IsXnu/IsFreebsd/IsOpenbsd/IsNetbsd/IsMetal, IsAarch64) to JS,
// and a default entry script inside the APE's own zip (/zip/js/main.mjs).
#define _COSMO_SOURCE 1
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <cosmo.h>
#include <libc/dce.h>
#include "quickjs.h"
#include "quickjs-libc.h"

#ifndef countof
#define countof(x) (sizeof(x) / sizeof((x)[0]))
#endif

/* ---------------- oma:host — kernel and architecture from Cosmopolitan ---------------- */

static const char *host_kernel_name(void) {
  if (IsWindows()) return "windows";
  if (IsXnu()) return "macos";
  if (IsLinux()) return "linux";
  if (IsFreebsd()) return "freebsd";
  if (IsOpenbsd()) return "openbsd";
  if (IsNetbsd()) return "netbsd";
  if (IsMetal()) return "metal";
  return "unknown";
}

static JSValue host_kernel(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewString(ctx, host_kernel_name());
}

static JSValue host_arch(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewString(ctx, IsAarch64() ? "aarch64" : "x86_64");
}

static JSValue host_hostos_bits(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewInt32(ctx, (int32_t)__hostos);
}

/* access(2) wrapper: true when the path is readable. Keeps the marker probes in JS cheap. */
static JSValue host_readable(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *p = JS_ToCString(ctx, argv[0]);
  if (!p) return JS_FALSE;
  int ok = access(p, R_OK) == 0;
  JS_FreeCString(ctx, p);
  return JS_NewBool(ctx, ok);
}

static const JSCFunctionListEntry host_funcs[] = {
  JS_CFUNC_DEF("kernel", 0, host_kernel),
  JS_CFUNC_DEF("arch", 0, host_arch),
  JS_CFUNC_DEF("hostosBits", 0, host_hostos_bits),
  JS_CFUNC_DEF("readable", 1, host_readable),
};

static int host_init(JSContext *ctx, JSModuleDef *m) {
  return JS_SetModuleExportList(ctx, m, host_funcs, countof(host_funcs));
}

static JSModuleDef *js_init_module_host(JSContext *ctx, const char *name) {
  JSModuleDef *m = JS_NewCModule(ctx, name, host_init);
  if (!m) return NULL;
  JS_AddModuleExportList(ctx, m, host_funcs, countof(host_funcs));
  return m;
}

/* ---------------- t3:net — loopback sockets (unchanged from t3rt.c) ---------------- */

static JSValue net_listen(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t port = 0;
  JS_ToInt32(ctx, &port, argv[0]);
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return JS_NewInt32(ctx, -1);
  int opt = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof opt);
  struct sockaddr_in a;
  memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons((unsigned short)port);
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(fd, (struct sockaddr *)&a, sizeof a) < 0) { close(fd); return JS_NewInt32(ctx, -2); }
  if (listen(fd, 16) < 0) { close(fd); return JS_NewInt32(ctx, -3); }
  return JS_NewInt32(ctx, fd);
}

static JSValue net_bound_port(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t fd = 0;
  JS_ToInt32(ctx, &fd, argv[0]);
  struct sockaddr_in a;
  socklen_t len = sizeof a;
  if (getsockname(fd, (struct sockaddr *)&a, &len) < 0) return JS_NewInt32(ctx, -1);
  return JS_NewInt32(ctx, ntohs(a.sin_port));
}

static JSValue net_accept(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t lfd = 0;
  JS_ToInt32(ctx, &lfd, argv[0]);
  return JS_NewInt32(ctx, accept(lfd, NULL, NULL));
}

static JSValue net_recv(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t fd = 0, max = 0;
  JS_ToInt32(ctx, &fd, argv[0]);
  JS_ToInt32(ctx, &max, argv[1]);
  if (max <= 0 || max > (1 << 20)) max = 65536;
  char *buf = malloc(max);
  if (!buf) return JS_NULL;
  ssize_t n = recv(fd, buf, max, 0);
  JSValue r = (n <= 0) ? JS_NULL : JS_NewStringLen(ctx, buf, (size_t)n);
  free(buf);
  return r;
}

static JSValue net_send(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t fd = 0;
  JS_ToInt32(ctx, &fd, argv[0]);
  size_t len = 0;
  const char *s = JS_ToCStringLen(ctx, &len, argv[1]);
  if (!s) return JS_NewInt32(ctx, -1);
  size_t off = 0;
  while (off < len) {
#ifdef MSG_NOSIGNAL
    ssize_t n = send(fd, s + off, len - off, MSG_NOSIGNAL);
#else
    ssize_t n = send(fd, s + off, len - off, 0);
#endif
    if (n <= 0) break;
    off += (size_t)n;
  }
  JS_FreeCString(ctx, s);
  return JS_NewInt32(ctx, (int)off);
}

static JSValue net_close(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int32_t fd = 0;
  JS_ToInt32(ctx, &fd, argv[0]);
  close(fd);
  return JS_UNDEFINED;
}

static const JSCFunctionListEntry net_funcs[] = {
  JS_CFUNC_DEF("listen", 1, net_listen),
  JS_CFUNC_DEF("boundPort", 1, net_bound_port),
  JS_CFUNC_DEF("accept", 1, net_accept),
  JS_CFUNC_DEF("recv", 2, net_recv),
  JS_CFUNC_DEF("send", 2, net_send),
  JS_CFUNC_DEF("close", 1, net_close),
};

static int net_init(JSContext *ctx, JSModuleDef *m) {
  return JS_SetModuleExportList(ctx, m, net_funcs, countof(net_funcs));
}

static JSModuleDef *js_init_module_net(JSContext *ctx, const char *name) {
  JSModuleDef *m = JS_NewCModule(ctx, name, net_init);
  if (!m) return NULL;
  JS_AddModuleExportList(ctx, m, net_funcs, countof(net_funcs));
  return m;
}

/* ---------------- entry ---------------- */

/* Module evaluation per quickjs-ng qjs.c eval_buf: compile, set import.meta, evaluate, then AWAIT the
   module promise so a top-level throw or rejection is reported and exits non-zero (never a silent 0). */
static int eval_module_file(JSContext *ctx, const char *filename) {
  size_t len;
  uint8_t *buf = js_load_file(ctx, &len, filename);
  if (!buf) { fprintf(stderr, "omamarket: cannot load %s\n", filename); return -1; }
  JSValue v = JS_Eval(ctx, (char *)buf, len, filename, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_STRICT | JS_EVAL_FLAG_COMPILE_ONLY);
  js_free(ctx, buf);
  if (!JS_IsException(v)) {
    if (js_module_set_import_meta(ctx, v, true, true) < 0) { js_std_dump_error(ctx); JS_FreeValue(ctx, v); return -1; }
    v = JS_EvalFunction(ctx, v);
  }
  v = js_std_await(ctx, v);
  if (JS_IsException(v)) { js_std_dump_error(ctx); JS_FreeValue(ctx, v); return -1; }
  JS_FreeValue(ctx, v);
  return 0;
}

int main(int argc, char **argv) {
  /* OMAMARKET_JS overrides the embedded entry (development). Default: the APE's own zip. */
  const char *entry = getenv("OMAMARKET_JS");
  if (!entry) entry = "/zip/js/main.mjs";
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  js_std_init_handlers(rt);
  JS_SetHostPromiseRejectionTracker(rt, js_std_promise_rejection_tracker, NULL);
  JS_SetModuleLoaderFunc2(rt, NULL, js_module_loader, js_module_check_attributes, NULL);
  js_init_module_std(ctx, "qjs:std");
  js_init_module_os(ctx, "qjs:os");
  js_init_module_net(ctx, "t3:net");
  js_init_module_host(ctx, "oma:host");
  js_std_add_helpers(ctx, argc, argv);
  int r = eval_module_file(ctx, entry);
  if (r == 0) {
    r = js_std_loop(ctx) ? -1 : 0;
    if (r) js_std_dump_error(ctx);
  }
  js_std_free_handlers(rt);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return r ? 1 : 0;
}
