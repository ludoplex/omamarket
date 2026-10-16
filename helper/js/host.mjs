// host.mjs — runtime host-profile detection (section 8 of the 2026-10-14 strategy).
// Stamp: 2026-10-15T16:40-0600, helper/js/host.mjs
// Kernel comes from Cosmopolitan (oma:host -> libc/dce.h __hostos). The distro layer is ours:
// Omarchy markers are the paths its own scripts use (omacom/omarchy master, read 2026-10-14):
//   OMARCHY_PATH env                                   bin/omarchy-version, default/bash/envs
//   /usr/share/omarchy/default/bash/env-bootstrap     default/bash/envs line 17
//   /var/lib/omarchy/image/target                     bin/omarchy-hw-platform (format=1, platform=...)
//   $HOME/.config/omarchy                             bin/omarchy-plugin-add PLUGINS_DIR
//   pacman -Q omarchy | omarchy-dev                   bin/omarchy-version
// Two markers are required so a leftover ~/.config/omarchy on plain Arch does not flip the profile.
import * as std from "qjs:std";
import * as os from "qjs:os";
import * as host from "oma:host";

export const PROFILES = ["omarchy", "arch", "linux", "macos", "windows", "freebsd", "openbsd", "netbsd", "unknown"];

export function homeDir() {
  return std.getenv("HOME") || std.getenv("USERPROFILE") || "";
}

function readOsRelease() {
  const out = { id: "", idLike: "", name: "" };
  const txt = std.loadFile("/etc/os-release");
  if (!txt) return out;
  for (const line of txt.split("\n")) {
    const m = /^([A-Z_]+)=("?)(.*)\2$/.exec(line.trim());
    if (!m) continue;
    if (m[1] === "ID") out.id = m[3];
    else if (m[1] === "ID_LIKE") out.idLike = m[3];
    else if (m[1] === "NAME") out.name = m[3];
  }
  return out;
}

function pacmanHas(pkg) {
  try {
    // block:true returns the exit status; stdout/stderr go to /dev/null.
    const devnull = os.open("/dev/null", os.O_WRONLY);
    const rc = os.exec(["pacman", "-Q", pkg], { block: true, usePath: true, stdout: devnull, stderr: devnull });
    os.close(devnull);
    return rc === 0;
  } catch (e) {
    return false;
  }
}

export function detectHost() {
  const override = std.getenv("OMAMARKET_HOST");
  const kernel = host.kernel();
  const result = { kernel, arch: host.arch(), hostosBits: host.hostosBits(), profile: "unknown", markers: {}, osRelease: null, override: override || null };
  if (override && PROFILES.includes(override)) { result.profile = override; return result; }
  if (kernel === "windows") { result.profile = "windows"; return result; }
  if (kernel === "macos") { result.profile = "macos"; return result; }
  if (kernel === "freebsd" || kernel === "openbsd" || kernel === "netbsd") { result.profile = kernel; return result; }
  if (kernel !== "linux") return result;

  const home = homeDir();
  const markers = {
    omarchyPathEnv: !!std.getenv("OMARCHY_PATH"),
    envBootstrap: host.readable("/usr/share/omarchy/default/bash/env-bootstrap"),
    imageTarget: host.readable("/var/lib/omarchy/image/target"),
    userConfig: home ? host.readable(home + "/.config/omarchy") : false,
    pacman: false,
  };
  let score = Object.values(markers).filter(Boolean).length;
  if (score < 2) { markers.pacman = pacmanHas("omarchy") || pacmanHas("omarchy-dev"); if (markers.pacman) score++; }
  result.markers = markers;
  result.osRelease = readOsRelease();
  if (score >= 2) result.profile = "omarchy";
  else if (result.osRelease.id === "arch" || result.osRelease.idLike.includes("arch")) result.profile = "arch";
  else result.profile = "linux";
  return result;
}

export function configDir() {
  const h = homeDir();
  if (host.kernel() === "windows") return (std.getenv("APPDATA") || h) + "/omamarket";
  return (std.getenv("XDG_CONFIG_HOME") || h + "/.config") + "/omamarket";
}

export function cacheDir() {
  const h = homeDir();
  if (host.kernel() === "windows") return (std.getenv("LOCALAPPDATA") || h) + "/omamarket/cache";
  return (std.getenv("XDG_CACHE_HOME") || h + "/.cache") + "/omamarket";
}
