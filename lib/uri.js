"use strict";

// RFC 3986 URI resolution and JSON pointer helpers. Kept dependency-free so the
// replacement has the same install footprint as a single package.

const URI_RE = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;
const TRAILING_HASH = /#\/?$/;

function parse(uri) {
  const m = URI_RE.exec(uri);
  return {
    scheme: m[2],
    authority: m[4],
    path: m[5] || "",
    query: m[7],
    fragment: m[9],
  };
}

function serialize(p) {
  let out = "";
  if (p.scheme !== undefined) out += p.scheme + ":";
  if (p.authority !== undefined) out += "//" + p.authority;
  out += p.path || "";
  if (p.query !== undefined) out += "?" + p.query;
  if (p.fragment !== undefined && p.fragment !== "") out += "#" + p.fragment;
  return out;
}

function removeDotSegments(path) {
  if (!path) return path;
  const absolute = path[0] === "/";
  const trailing =
    path.endsWith("/") || path.endsWith("/.") || path.endsWith("/..");
  const segments = path.split("/");
  const out = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") {
      if (segment === "" && !absolute && out.length === 0) out.push(segment);
      continue;
    }
    if (segment === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(segment);
  }
  let result = out.join("/");
  if (absolute && result[0] !== "/") result = "/" + result;
  if (trailing && !result.endsWith("/")) result += "/";
  return result;
}

// ajv's normalizeId: strip a trailing empty fragment or fragment slash.
function normalizeId(id) {
  return id ? String(id).replace(TRAILING_HASH, "") : "";
}

function normalizeUri(uri) {
  const p = parse(uri);
  if (p.scheme !== undefined) p.scheme = p.scheme.toLowerCase();
  if (p.authority !== undefined) {
    const at = p.authority.lastIndexOf("@");
    const userinfo = at === -1 ? "" : p.authority.slice(0, at + 1);
    let hostport = at === -1 ? p.authority : p.authority.slice(at + 1);
    const colon = hostport.lastIndexOf(":");
    const hasPort = colon !== -1 && /^\d*$/.test(hostport.slice(colon + 1));
    const host = hasPort ? hostport.slice(0, colon) : hostport;
    const port = hasPort ? hostport.slice(colon) : "";
    p.authority = userinfo + host.toLowerCase() + port;
  }
  return serialize(p);
}

function resolveUri(base, ref) {
  ref = normalizeId(ref);
  if (ref === "") return normalizeId(base);
  const r = parse(ref);
  let out;
  if (r.scheme !== undefined) {
    out = {
      scheme: r.scheme,
      authority: r.authority,
      path: removeDotSegments(r.path),
      query: r.query,
      fragment: r.fragment,
    };
  } else {
    const b = parse(normalizeId(base));
    out = {
      scheme: b.scheme,
      authority: b.authority,
      path: b.path,
      query: b.query,
      fragment: r.fragment,
    };
    if (r.authority !== undefined) {
      out.authority = r.authority;
      out.path = removeDotSegments(r.path);
      out.query = r.query;
    } else if (r.path === "") {
      if (r.query !== undefined) out.query = r.query;
    } else {
      if (r.path[0] === "/") {
        out.path = removeDotSegments(r.path);
      } else {
        const basePath = b.authority !== undefined && b.path === "" ? "/" : b.path;
        const slash = basePath.lastIndexOf("/");
        out.path = removeDotSegments(
          (slash === -1 ? "" : basePath.slice(0, slash + 1)) + r.path,
        );
      }
      out.query = r.query;
    }
  }
  return normalizeUri(serialize(out));
}

function splitUri(uri) {
  const hash = uri.indexOf("#");
  if (hash === -1) return {uri, fragment: undefined};
  return {uri: uri.slice(0, hash), fragment: uri.slice(hash + 1)};
}

function decodeFragment(fragment) {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function unescapePointerToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function escapePointerToken(token) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

function resolvePointer(root, fragment) {
  if (fragment === undefined || fragment === "") return root;
  let decoded = decodeFragment(fragment);
  if (decoded === "") return root;
  if (decoded[0] !== "/") return undefined;
  const tokens = decoded.slice(1).split("/");
  let current = root;
  for (const token of tokens) {
    if (current === null || typeof current !== "object") return undefined;
    const key = unescapePointerToken(token);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

module.exports = {
  resolveUri,
  normalizeId,
  normalizeUri,
  splitUri,
  resolvePointer,
  escapePointerToken,
  decodeFragment,
};
