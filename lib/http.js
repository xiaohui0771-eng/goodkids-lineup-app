const { URL } = require("url");

function getRequestUrl(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers.host || "localhost";
  return new URL(request.url, `${protocol}://${host}`);
}

function appendSetCookie(response, cookie) {
  const existing = response.getHeader("Set-Cookie");

  if (!existing) {
    response.setHeader("Set-Cookie", cookie);
    return;
  }

  if (Array.isArray(existing)) {
    response.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }

  response.setHeader("Set-Cookie", [existing, cookie]);
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(response, allowedMethods) {
  sendJson(response, 405, { error: "\u8bf7\u6c42\u65b9\u6cd5\u4e0d\u88ab\u5141\u8bb8\u3002" }, { Allow: allowedMethods.join(", ") });
}

function sendNotFound(response) {
  sendJson(response, 404, { error: "\u8d44\u6e90\u4e0d\u5b58\u5728\u3002" });
}

function sendUnauthorized(response) {
  sendJson(response, 401, { error: "\u7ba1\u7406\u5458\u672a\u767b\u5f55\u3002" });
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookieMap, item) => {
      const separatorIndex = item.indexOf("=");

      if (separatorIndex === -1) {
        return cookieMap;
      }

      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      cookieMap[key] = decodeURIComponent(value);
      return cookieMap;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

async function parseJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 1024 * 1024) {
        reject(new Error("\u8bf7\u6c42\u4f53\u8fc7\u5927\u3002"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (_error) {
        reject(new Error("\u8bf7\u6c42\u4f53\u4e0d\u662f\u6709\u6548\u7684 JSON\u3002"));
      }
    });

    request.on("error", reject);
  });
}

module.exports = {
  appendSetCookie,
  getRequestUrl,
  parseCookies,
  parseJsonBody,
  sendJson,
  sendMethodNotAllowed,
  sendNotFound,
  sendUnauthorized,
  serializeCookie,
};
