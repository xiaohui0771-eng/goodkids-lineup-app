const fs = require("fs");
const path = require("path");
const { normalizeCalendar } = require("./time");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "queue-state.json");
const CALENDAR_FILE = path.join(DATA_DIR, "business-calendar.json");

const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, "") : "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function useSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function assertCloudStoreReady() {
  if (!useSupabase() && process.env.VERCEL) {
    throw new Error("\u7ebf\u4e0a\u73af\u5883\u7f3a\u5c11 Supabase \u914d\u7f6e\uff0c\u8bf7\u5148\u8bbe\u7f6e SUPABASE_URL \u548c SUPABASE_SERVICE_ROLE_KEY\u3002");
  }
}

function createInitialState() {
  return {
    completedNo: 0,
    currentTask: null,
    lastIssuedNo: 0,
    settings: {
      dailyCapacity: 4,
      businessHoursStart: "09:00",
      businessHoursEnd: "24:00",
    },
    queue: [],
  };
}

function createInitialCalendar() {
  return {
    holidays: [],
    workdays: [],
  };
}

function normalizeTask(task, statusFallback = "queued") {
  if (!task || !Number.isInteger(Number(task.number ?? task.ticket_no))) {
    return null;
  }

  const priority = task.priority === "urgent" ? "urgent" : "normal";
  const status = task.status === "serving" || task.status === "completed" ? task.status : statusFallback;

  return {
    id: task.id ?? null,
    number: Number(task.number ?? task.ticket_no),
    visitorId: typeof task.visitorId === "string"
      ? task.visitorId
      : (typeof task.visitor_id === "string" ? task.visitor_id : ""),
    priority,
    taskName: typeof task.taskName === "string"
      ? task.taskName
      : (typeof task.task_name === "string" ? task.task_name : "\u672a\u547d\u540d\u4efb\u52a1"),
    status,
    createdAt: typeof task.createdAt === "string"
      ? task.createdAt
      : (typeof task.created_at === "string" ? task.created_at : new Date().toISOString()),
    startedAt: typeof task.startedAt === "string"
      ? task.startedAt
      : (typeof task.started_at === "string" ? task.started_at : null),
    completedAt: typeof task.completedAt === "string"
      ? task.completedAt
      : (typeof task.completed_at === "string" ? task.completed_at : null),
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
    return fallbackValue;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function normalizeLocalState(rawState) {
  const settings = {
    dailyCapacity: Number.isInteger(rawState?.settings?.dailyCapacity)
      ? rawState.settings.dailyCapacity
      : (Number.isInteger(rawState?.dailyCapacity) ? rawState.dailyCapacity : 4),
    businessHoursStart: typeof rawState?.settings?.businessHoursStart === "string"
      ? rawState.settings.businessHoursStart
      : "09:00",
    businessHoursEnd: typeof rawState?.settings?.businessHoursEnd === "string"
      ? rawState.settings.businessHoursEnd
      : "24:00",
  };

  const currentTask = normalizeTask(rawState?.currentTask, "serving");
  const queue = Array.isArray(rawState?.queue)
    ? rawState.queue.map((task) => normalizeTask(task, "queued")).filter(Boolean)
    : [];

  return {
    completedNo: Number.isInteger(rawState?.completedNo) ? rawState.completedNo : 0,
    currentTask,
    lastIssuedNo: Number.isInteger(rawState?.lastIssuedNo)
      ? rawState.lastIssuedNo
      : Math.max(
        currentTask ? currentTask.number : 0,
        ...queue.map((task) => task.number),
        0,
      ),
    settings,
    queue,
  };
}

function loadLocalState() {
  ensureDataDir();
  const rawState = readJsonFile(STATE_FILE, createInitialState());
  return normalizeLocalState(rawState);
}

function saveLocalState(state) {
  ensureDataDir();
  writeJsonFile(STATE_FILE, {
    completedNo: state.completedNo,
    currentTask: state.currentTask,
    lastIssuedNo: state.lastIssuedNo,
    settings: state.settings,
    queue: state.queue,
  });
}

function loadLocalCalendar() {
  ensureDataDir();
  return normalizeCalendar(readJsonFile(CALENDAR_FILE, createInitialCalendar()));
}

function saveLocalCalendar(calendar) {
  ensureDataDir();
  writeJsonFile(CALENDAR_FILE, normalizeCalendar(calendar));
}

function sortQueuedTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftRank = left.priority === "urgent" ? 0 : 1;
    const rightRank = right.priority === "urgent" ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

async function localGetState() {
  const state = loadLocalState();
  return {
    ...state,
    queue: sortQueuedTasks(state.queue),
  };
}

async function localGetCalendar() {
  return loadLocalCalendar();
}

async function localCreateTicket({ visitorId, priority, taskName }) {
  const state = loadLocalState();
  const hasActiveTicket = (state.currentTask && state.currentTask.visitorId === visitorId)
    || state.queue.some((task) => task.visitorId === visitorId);

  if (hasActiveTicket) {
    throw new Error("\u5f53\u524d\u8bbe\u5907\u5df2\u7ecf\u6709\u6709\u6548\u53d6\u53f7\uff0c\u4e0d\u80fd\u91cd\u590d\u53d6\u53f7\u3002");
  }

  state.lastIssuedNo += 1;

  const task = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    number: state.lastIssuedNo,
    visitorId,
    priority: priority === "urgent" ? "urgent" : "normal",
    taskName,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };

  state.queue.push(task);
  state.queue = sortQueuedTasks(state.queue);
  saveLocalState(state);

  return task;
}

async function localAdvanceQueue() {
  const state = loadLocalState();

  if (state.currentTask) {
    state.completedNo = state.currentTask.number;
  }

  const nextTask = state.queue.shift() || null;
  state.currentTask = nextTask
    ? {
      ...nextTask,
      status: "serving",
      startedAt: nextTask.startedAt || new Date().toISOString(),
    }
    : null;

  saveLocalState(state);
  return state.currentTask;
}

async function localUpdateSettings(partialSettings) {
  const state = loadLocalState();
  state.settings = {
    ...state.settings,
    ...partialSettings,
  };
  saveLocalState(state);
  return state.settings;
}

async function localReplaceCalendar(calendar) {
  saveLocalCalendar(calendar);
  return loadLocalCalendar();
}

function createSupabaseHeaders(extraHeaders = {}) {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

async function supabaseRequest(method, targetPath, { query, body, headers } = {}) {
  const requestUrl = new URL(`${SUPABASE_URL}/rest/v1/${targetPath}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        requestUrl.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(requestUrl, {
    method,
    headers: createSupabaseHeaders(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const responseText = await response.text();
  let payload = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch (_error) {
      payload = responseText;
    }
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.message
      ? payload.message
      : `Supabase request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeSupabaseState(settingsRows, activeTasks, completedRows) {
  const settingsRow = settingsRows?.[0] || {};
  const normalizedTasks = Array.isArray(activeTasks)
    ? activeTasks.map((task) => normalizeTask(task, task.status)).filter(Boolean)
    : [];
  const currentTask = normalizedTasks.find((task) => task.status === "serving") || null;
  const queue = sortQueuedTasks(normalizedTasks.filter((task) => task.status === "queued"));
  const completedNo = Array.isArray(completedRows) && completedRows[0]?.ticket_no
    ? Number(completedRows[0].ticket_no)
    : 0;
  const lastIssuedNo = Math.max(
    completedNo,
    currentTask ? currentTask.number : 0,
    ...queue.map((task) => task.number),
    0,
  );

  return {
    completedNo,
    currentTask,
    lastIssuedNo,
    settings: {
      dailyCapacity: Number.isInteger(settingsRow.daily_capacity) ? settingsRow.daily_capacity : 4,
      businessHoursStart: typeof settingsRow.business_hours_start === "string"
        ? settingsRow.business_hours_start
        : "09:00",
      businessHoursEnd: typeof settingsRow.business_hours_end === "string"
        ? settingsRow.business_hours_end
        : "24:00",
    },
    queue,
  };
}

async function supabaseGetState() {
  const [settingsRows, activeTasks, completedRows] = await Promise.all([
    supabaseRequest("GET", "queue_settings", {
      query: {
        select: "daily_capacity,business_hours_start,business_hours_end",
        singleton: "eq.true",
      },
    }),
    supabaseRequest("GET", "queue_tasks", {
      query: {
        select: "id,ticket_no,visitor_id,priority,task_name,status,created_at,started_at,completed_at",
        status: "in.(queued,serving)",
        order: "created_at.asc",
      },
    }),
    supabaseRequest("GET", "queue_tasks", {
      query: {
        select: "ticket_no",
        status: "eq.completed",
        order: "ticket_no.desc",
        limit: 1,
      },
    }),
  ]);

  return normalizeSupabaseState(settingsRows, activeTasks, completedRows);
}

async function supabaseGetCalendar() {
  const rows = await supabaseRequest("GET", "business_calendar", {
    query: {
      select: "date,kind",
      order: "date.asc",
    },
  });

  return normalizeCalendar({
    holidays: rows.filter((row) => row.kind === "holiday").map((row) => row.date),
    workdays: rows.filter((row) => row.kind === "workday").map((row) => row.date),
  });
}

async function supabaseCreateTicket({ visitorId, priority, taskName }) {
  const payload = await supabaseRequest("POST", "rpc/issue_queue_ticket", {
    body: {
      p_visitor_id: visitorId,
      p_priority: priority === "urgent" ? "urgent" : "normal",
      p_task_name: taskName,
    },
  });

  return {
    number: Number(payload?.ticket_no),
    priority: payload?.priority === "urgent" ? "urgent" : "normal",
    taskName: typeof payload?.task_name === "string" ? payload.task_name : taskName,
  };
}

async function supabaseAdvanceQueue() {
  await supabaseRequest("POST", "rpc/advance_queue_task", {
    body: {},
  });
}

async function supabaseUpdateSettings(partialSettings) {
  const payload = {};

  if (partialSettings.dailyCapacity !== undefined) {
    payload.daily_capacity = partialSettings.dailyCapacity;
  }

  if (partialSettings.businessHoursStart) {
    payload.business_hours_start = partialSettings.businessHoursStart;
  }

  if (partialSettings.businessHoursEnd) {
    payload.business_hours_end = partialSettings.businessHoursEnd;
  }

  await supabaseRequest("PATCH", "queue_settings", {
    query: {
      singleton: "eq.true",
    },
    body: payload,
    headers: {
      Prefer: "return=representation",
    },
  });
}

async function supabaseReplaceCalendar(calendar) {
  const normalizedCalendar = normalizeCalendar(calendar);

  await supabaseRequest("DELETE", "business_calendar", {
    query: {
      date: "gte.1900-01-01",
    },
  });

  const rows = [
    ...normalizedCalendar.holidays.map((date) => ({ date, kind: "holiday" })),
    ...normalizedCalendar.workdays.map((date) => ({ date, kind: "workday" })),
  ];

  if (rows.length > 0) {
    await supabaseRequest("POST", "business_calendar", {
      body: rows,
      headers: {
        Prefer: "return=minimal",
      },
    });
  }

  return normalizedCalendar;
}

async function getState() {
  assertCloudStoreReady();
  return useSupabase() ? supabaseGetState() : localGetState();
}

async function getCalendar() {
  assertCloudStoreReady();
  return useSupabase() ? supabaseGetCalendar() : localGetCalendar();
}

async function createTicket(payload) {
  assertCloudStoreReady();
  return useSupabase() ? supabaseCreateTicket(payload) : localCreateTicket(payload);
}

async function advanceQueue() {
  assertCloudStoreReady();
  return useSupabase() ? supabaseAdvanceQueue() : localAdvanceQueue();
}

async function updateSettings(partialSettings) {
  assertCloudStoreReady();
  if (useSupabase()) {
    await supabaseUpdateSettings(partialSettings);
  } else {
    await localUpdateSettings(partialSettings);
  }

  const state = await getState();
  return state.settings;
}

async function replaceCalendar(calendar) {
  assertCloudStoreReady();
  return useSupabase() ? supabaseReplaceCalendar(calendar) : localReplaceCalendar(calendar);
}

module.exports = {
  createInitialCalendar,
  createInitialState,
  getCalendar,
  getState,
  replaceCalendar,
  updateSettings,
  advanceQueue,
  createTicket,
};
