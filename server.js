const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "queue-state.json");
const CALENDAR_FILE = path.join(DATA_DIR, "business-calendar.json");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "line-up-admin";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function createInitialState() {
  return {
    completedNo: 0,
    currentTask: null,
    lastIssuedNo: 0,
    dailyCapacity: 4,
    queue: [],
  };
}

function createInitialCalendar() {
  return {
    holidays: [],
    workdays: [],
  };
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    writeJsonFile(filePath, fallbackValue);
    return fallbackValue;
  }
}

function normalizeTask(task) {
  if (!task || !Number.isInteger(task.number)) {
    return null;
  }

  return {
    number: task.number,
    priority: task.priority === "urgent" ? "urgent" : "normal",
    createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
    visitorId: typeof task.visitorId === "string" ? task.visitorId : "",
  };
}

function loadState() {
  const parsed = readJsonFile(STATE_FILE, createInitialState());

  return {
    completedNo: Number.isInteger(parsed.completedNo) && parsed.completedNo >= 0 ? parsed.completedNo : 0,
    currentTask: normalizeTask(parsed.currentTask),
    lastIssuedNo: Number.isInteger(parsed.lastIssuedNo) && parsed.lastIssuedNo >= 0 ? parsed.lastIssuedNo : 0,
    dailyCapacity: Number.isInteger(parsed.dailyCapacity) && parsed.dailyCapacity > 0 ? parsed.dailyCapacity : 4,
    queue: Array.isArray(parsed.queue) ? parsed.queue.map(normalizeTask).filter(Boolean) : [],
  };
}

function loadCalendar() {
  const parsed = readJsonFile(CALENDAR_FILE, createInitialCalendar());

  return {
    holidays: Array.isArray(parsed.holidays) ? parsed.holidays.filter((item) => typeof item === "string") : [],
    workdays: Array.isArray(parsed.workdays) ? parsed.workdays.filter((item) => typeof item === "string") : [],
  };
}

let queueState = loadState();

function saveState() {
  writeJsonFile(STATE_FILE, queueState);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWorkingDay(date) {
  const calendar = loadCalendar();
  const dateKey = formatDateKey(date);

  if (calendar.workdays.includes(dateKey)) {
    return true;
  }

  if (calendar.holidays.includes(dateKey)) {
    return false;
  }

  const weekDay = date.getDay();
  return weekDay >= 1 && weekDay <= 5;
}

function isBusinessHour(date) {
  const hour = date.getHours();
  return hour >= 9 && hour < 24;
}

function addWorkingDays(baseDate, daysToAdd) {
  const result = new Date(baseDate);
  let remaining = daysToAdd;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) {
      remaining -= 1;
    }
  }

  return result;
}

function getCurrentServingNo() {
  return queueState.currentTask ? queueState.currentTask.number : queueState.completedNo;
}

function buildBusinessStatus(date = new Date()) {
  if (!isWorkingDay(date)) {
    return {
      open: false,
      message: "今天是非工作日，暂不取号，请在工作日前来。",
    };
  }

  if (!isBusinessHour(date)) {
    return {
      open: false,
      message: "当前不在营业时间内，请在周一至周五 9:00-24:00 取号。",
    };
  }

  return {
    open: true,
    message: "",
  };
}

function serializeTask(task) {
  if (!task) {
    return null;
  }

  return {
    number: task.number,
    priority: task.priority,
    createdAt: task.createdAt,
  };
}

function findVisitorTask(visitorId) {
  if (!visitorId) {
    return null;
  }

  if (queueState.currentTask && queueState.currentTask.visitorId === visitorId) {
    return {
      task: queueState.currentTask,
      aheadCount: 0,
    };
  }

  const queueIndex = queueState.queue.findIndex((task) => task.visitorId === visitorId);

  if (queueIndex === -1) {
    return null;
  }

  return {
    task: queueState.queue[queueIndex],
    aheadCount: queueIndex + (queueState.currentTask ? 1 : 0),
  };
}

function buildTicketSnapshot(task, aheadCount) {
  const waitDays = aheadCount === 0 ? 0 : Math.ceil(aheadCount / queueState.dailyCapacity);
  const estimatedDate = addWorkingDays(new Date(task.createdAt), waitDays);

  return {
    number: task.number,
    priority: task.priority,
    currentServingNo: getCurrentServingNo(),
    aheadCount,
    waitDays,
    estimatedDate: estimatedDate.toISOString(),
    createdAt: task.createdAt,
  };
}

function getVisitorTicketSnapshot(visitorId) {
  const visitorTask = findVisitorTask(visitorId);
  return visitorTask ? buildTicketSnapshot(visitorTask.task, visitorTask.aheadCount) : null;
}

function buildPublicStatus(visitorId) {
  const businessStatus = buildBusinessStatus();
  const visitorTicket = getVisitorTicketSnapshot(visitorId);

  return {
    currentServingNo: getCurrentServingNo(),
    queueCount: queueState.queue.length + (queueState.currentTask ? 1 : 0),
    pendingCount: queueState.queue.length,
    dailyCapacity: queueState.dailyCapacity,
    businessOpen: businessStatus.open,
    businessMessage: businessStatus.message,
    visitorHasActiveTicket: Boolean(visitorTicket),
    visitorTicket,
  };
}

function insertQueueTask(task) {
  if (task.priority === "urgent") {
    const firstNormalIndex = queueState.queue.findIndex((entry) => entry.priority !== "urgent");

    if (firstNormalIndex === -1) {
      queueState.queue.push(task);
      return;
    }

    queueState.queue.splice(firstNormalIndex, 0, task);
    return;
  }

  queueState.queue.push(task);
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 1024 * 1024) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (_error) {
        reject(new Error("请求体不是有效 JSON"));
      }
    });

    request.on("error", reject);
  });
}

function checkAdminAuth(request) {
  return request.headers["x-admin-key"] === ADMIN_API_KEY;
}

function handleGetStatus(requestUrl, response) {
  const visitorId = requestUrl.searchParams.get("visitorId") || "";
  respondJson(response, 200, buildPublicStatus(visitorId));
}

async function handleCreateTicket(request, response) {
  const body = await parseRequestBody(request);
  const priority = body.priority === "urgent" ? "urgent" : "normal";
  const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";

  if (!visitorId) {
    respondJson(response, 400, { error: "缺少 visitorId" });
    return;
  }

  if (findVisitorTask(visitorId)) {
    respondJson(response, 409, { error: "当前设备已经有有效取号，不能重复取号。" });
    return;
  }

  const businessStatus = buildBusinessStatus();

  if (!businessStatus.open) {
    respondJson(response, 409, { error: businessStatus.message });
    return;
  }

  queueState.lastIssuedNo += 1;

  const queueTask = {
    number: queueState.lastIssuedNo,
    priority,
    createdAt: new Date().toISOString(),
    visitorId,
  };

  insertQueueTask(queueTask);
  saveState();

  respondJson(response, 201, {
    ticket: getVisitorTicketSnapshot(visitorId),
    status: buildPublicStatus(visitorId),
  });
}

function handleAdminQueueStatus(request, response) {
  if (!checkAdminAuth(request)) {
    respondJson(response, 401, { error: "管理员鉴权失败" });
    return;
  }

  respondJson(response, 200, {
    completedNo: queueState.completedNo,
    currentTask: serializeTask(queueState.currentTask),
    queue: queueState.queue.map(serializeTask),
    dailyCapacity: queueState.dailyCapacity,
    lastIssuedNo: queueState.lastIssuedNo,
  });
}

function handleAdminAdvance(request, response) {
  if (!checkAdminAuth(request)) {
    respondJson(response, 401, { error: "管理员鉴权失败" });
    return;
  }

  const completedTask = queueState.currentTask ? { ...queueState.currentTask } : null;

  if (completedTask) {
    queueState.completedNo = completedTask.number;
  }

  const nextTask = queueState.queue.shift() || null;
  queueState.currentTask = nextTask;
  saveState();

  const message = completedTask
    ? (nextTask ? "当前任务已结束，已切换到下一位。" : "当前任务已结束，当前队列已空。")
    : (nextTask ? "已开始办理下一任务。" : "当前没有待办理任务。");

  respondJson(response, 200, {
    message,
    completedTask: serializeTask(completedTask),
    currentTask: serializeTask(nextTask),
    status: buildPublicStatus(""),
  });
}

function serveStaticFile(requestUrl, response) {
  const publicPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const isAllowedAsset = publicPath.startsWith("/assets/");
  const isAllowedFile = publicPath === "/index.html" || publicPath === "/styles.css" || publicPath === "/script.js";

  if (!isAllowedAsset && !isAllowedFile) {
    respondJson(response, 404, { error: "资源不存在" });
    return;
  }

  const safePath = requestUrl.pathname === "/"
    ? path.join(ROOT_DIR, "index.html")
    : path.normalize(path.join(ROOT_DIR, requestUrl.pathname));

  if (!safePath.startsWith(ROOT_DIR)) {
    respondJson(response, 403, { error: "禁止访问" });
    return;
  }

  fs.readFile(safePath, (error, fileBuffer) => {
    if (error) {
      respondJson(response, 404, { error: "资源不存在" });
      return;
    }

    const extension = path.extname(safePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".jpg" ? "public, max-age=86400" : "no-store",
    });
    response.end(fileBuffer);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/queue/status") {
      handleGetStatus(requestUrl, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/tickets") {
      await handleCreateTicket(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/admin/queue") {
      handleAdminQueueStatus(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/queue/advance") {
      handleAdminAdvance(request, response);
      return;
    }

    serveStaticFile(requestUrl, response);
  } catch (error) {
    respondJson(response, 500, {
      error: error instanceof Error ? error.message : "服务内部错误",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Line UP server running at http://localhost:${PORT}`);
  console.log(`Admin key: ${ADMIN_API_KEY}`);
});
