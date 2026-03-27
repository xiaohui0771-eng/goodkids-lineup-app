const fs = require("fs");
const path = require("path");
const http = require("http");
const {
  handleAdminAdvance,
  handleAdminCalendar,
  handleAdminDashboard,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSettings,
  handleCreateTicket,
  handleQueueStatus,
} = require("./lib/api-handlers");
const { getRequestUrl, sendJson, sendNotFound } = require("./lib/http");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const API_ROUTES = new Map([
  ["/api/queue/status", handleQueueStatus],
  ["/api/tickets", handleCreateTicket],
  ["/api/admin/login", handleAdminLogin],
  ["/api/admin/logout", handleAdminLogout],
  ["/api/admin/dashboard", handleAdminDashboard],
  ["/api/admin/queue/advance", handleAdminAdvance],
  ["/api/admin/settings", handleAdminSettings],
  ["/api/admin/calendar", handleAdminCalendar],
]);

function resolveStaticPath(pathname) {
  if (pathname === "/") {
    return path.join(ROOT_DIR, "site", "front.html");
  }

  if (pathname === "/manage" || pathname === "/manage/") {
    return path.join(ROOT_DIR, "site", "manage", "dashboard.html");
  }

  if (pathname === "/app.css" || pathname === "/client.js" || pathname === "/admin-client.js") {
    return path.normalize(path.join(ROOT_DIR, pathname.slice(1)));
  }

  if (pathname.startsWith("/assets/")) {
    return path.normalize(path.join(ROOT_DIR, pathname.slice(1)));
  }

  return null;
}

function serveStaticFile(pathname, response) {
  const filePath = resolveStaticPath(pathname);

  if (!filePath || !filePath.startsWith(ROOT_DIR)) {
    sendNotFound(response);
    return;
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      sendNotFound(response);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".jpg" || extension === ".png" || extension === ".svg"
        ? "public, max-age=86400"
        : "no-store",
    });
    response.end(fileBuffer);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = getRequestUrl(request);
  const apiHandler = API_ROUTES.get(requestUrl.pathname);

  try {
    if (apiHandler) {
      await apiHandler(request, response);
      return;
    }

    serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "\u670d\u52a1\u5185\u90e8\u9519\u8bef\u3002",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Line UP local dev server running at http://localhost:${PORT}`);
});
