const {
  clearAdminSession,
  isAdminAuthenticated,
  isPasswordValid,
  setAdminSession,
} = require("./auth");
const {
  advanceToNextTask,
  buildAdminDashboard,
  buildPublicStatus,
  issueTicketForVisitor,
  saveCalendar,
  saveSettings,
} = require("./queue-service");
const {
  getRequestUrl,
  parseJsonBody,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} = require("./http");

async function handleQueueStatus(request, response) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  const requestUrl = getRequestUrl(request);
  const visitorId = requestUrl.searchParams.get("visitorId") || "";
  sendJson(response, 200, await buildPublicStatus(visitorId));
}

async function handleCreateTicket(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  const payload = await parseJsonBody(request);
  const visitorId = typeof payload.visitorId === "string" ? payload.visitorId : "";
  const priority = payload.priority === "urgent" ? "urgent" : "normal";
  const taskName = typeof payload.taskName === "string" ? payload.taskName : "";
  sendJson(response, 201, await issueTicketForVisitor(visitorId, priority, taskName));
}

async function handleAdminLogin(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  const payload = await parseJsonBody(request);

  if (!isPasswordValid(payload.password)) {
    sendJson(response, 401, { error: "\u7ba1\u7406\u5458\u5bc6\u7801\u9519\u8bef\u3002" });
    return;
  }

  setAdminSession(response, request);
  sendJson(response, 200, {
    ok: true,
    dashboard: await buildAdminDashboard(),
  });
}

async function handleAdminLogout(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  clearAdminSession(response, request);
  sendJson(response, 200, { ok: true });
}

function requireAdmin(request, response) {
  if (!isAdminAuthenticated(request)) {
    sendUnauthorized(response);
    return false;
  }

  return true;
}

async function handleAdminDashboard(request, response) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  if (!requireAdmin(request, response)) {
    return;
  }

  sendJson(response, 200, await buildAdminDashboard());
}

async function handleAdminAdvance(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  if (!requireAdmin(request, response)) {
    return;
  }

  sendJson(response, 200, await advanceToNextTask());
}

async function handleAdminSettings(request, response) {
  if (request.method !== "PATCH") {
    sendMethodNotAllowed(response, ["PATCH"]);
    return;
  }

  if (!requireAdmin(request, response)) {
    return;
  }

  const payload = await parseJsonBody(request);
  sendJson(response, 200, await saveSettings(payload));
}

async function handleAdminCalendar(request, response) {
  if (request.method !== "PUT") {
    sendMethodNotAllowed(response, ["PUT"]);
    return;
  }

  if (!requireAdmin(request, response)) {
    return;
  }

  const payload = await parseJsonBody(request);
  sendJson(response, 200, await saveCalendar(payload));
}

module.exports = {
  handleAdminAdvance,
  handleAdminCalendar,
  handleAdminDashboard,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSettings,
  handleCreateTicket,
  handleQueueStatus,
};
