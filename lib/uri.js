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

// The resolver ajv uses when a project supplies none. It is the package's
// RFC 3986 implementation above, exposed through ajv's `UriResolver` shape so
// every resolution site can take a project-supplied strategy instead.
const defaultUriResolver = {
  parse,
  serialize,
  resolve: resolveUri,
};

function isUriResolver(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.parse === "function" &&
    typeof value.serialize === "function" &&
    typeof value.resolve === "function"
  );
}

// ajv's getFullPath: serialize the parsed identifier and keep only its
// resource part, terminated by a hash. The default resolver keeps the
// package's existing, already-normalized identifier, so nothing changes for a
// project that supplies no strategy.
function getFullPath(resolver, id = "", normalize = true) {
  if (normalize !== false) id = normalizeId(id);
  return resolver.serialize(resolver.parse(id)).split("#")[0] + "#";
}

// ajv's resolveUrl: strip a trailing hash and hand the pair to the strategy.
function resolveUrl(resolver, baseId, id) {
  if (resolver === defaultUriResolver) return normalizeId(resolveUri(baseId, id));
  return resolver.resolve(baseId, normalizeId(id));
}

// Splits an identifier into the resource a registry is keyed by and the
// fragment inside it, using the strategy's own parse. The default resolver
// keeps the package's existing split.
function splitResolved(resolver, uri) {
  if (resolver === defaultUriResolver) return splitUri(uri);
  const component = resolver.parse(uri);
  return {
    uri: normalizeId(resolver.serialize(component).split("#")[0]),
    fragment: component.fragment,
  };
}

// ajv's MissingRefError.missingSchema: the resource part of the missing
// reference, resolved and normalized by the same strategy.
function missingSchemaOf(resolver, missingRef) {
  if (resolver === defaultUriResolver) return splitUri(missingRef).uri;
  return normalizeId(getFullPath(resolver, missingRef));
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
  defaultUriResolver,
  isUriResolver,
  getFullPath,
  resolveUrl,
  splitResolved,
  missingSchemaOf,
};
