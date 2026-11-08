/**
 * SSRF guards for server-side fetches that use user-supplied URLs.
 * Blocks non-http(s) schemes and private / link-local / loopback / metadata hosts.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // Strip brackets if URL.hostname kept them
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local fc00::/7
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("::ffff:")) {
    // IPv4-mapped
    return isPrivateIPv4(h.slice(7));
  }
  return false;
}

export function assertSafeExternalUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = u.hostname.toLowerCase();
  if (!host) throw new Error("Invalid URL host");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Host is not allowed");
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Host is not allowed");
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error("Private or link-local addresses are not allowed");
  }
  return u;
}
