const {
  advanceQueue,
  createTicket,
  getCalendar,
  getState,
  replaceCalendar,
  updateSettings,
} = require("./store");
const {
  addWorkingDays,
  buildBusinessStatus,
  normalizeCalendar,
  parseBusinessTime,
} = require("./time");

function getCurrentServingNo(state) {
  return state.currentTask ? state.currentTask.number : state.completedNo;
}

function serializeTask(task) {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    number: task.number,
    visitorId: task.visitorId,
    priority: task.priority,
    taskName: task.taskName,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

function buildTicketSnapshot(state, calendar, task, aheadCount) {
  const waitDays = aheadCount === 0 ? 0 : Math.ceil(aheadCount / state.settings.dailyCapacity);
  const estimatedDate = addWorkingDays(task.createdAt, waitDays, calendar);

  return {
    number: task.number,
    priority: task.priority,
    taskName: task.taskName,
    currentServingNo: getCurrentServingNo(state),
    aheadCount,
    waitDays,
    estimatedDate: estimatedDate.toISOString(),
    createdAt: task.createdAt,
  };
}

function findVisitorTask(state, visitorId) {
  if (!visitorId) {
    return null;
  }

  if (state.currentTask && state.currentTask.visitorId === visitorId) {
    return {
      task: state.currentTask,
      aheadCount: 0,
    };
  }

  const queueIndex = state.queue.findIndex((task) => task.visitorId === visitorId);

  if (queueIndex === -1) {
    return null;
  }

  return {
    task: state.queue[queueIndex],
    aheadCount: queueIndex + (state.currentTask ? 1 : 0),
  };
}

async function buildPublicStatus(visitorId) {
  const [state, calendar] = await Promise.all([getState(), getCalendar()]);
  const businessStatus = buildBusinessStatus(state.settings, calendar);
  const visitorTask = findVisitorTask(state, visitorId);
  const visitorTicket = visitorTask
    ? buildTicketSnapshot(state, calendar, visitorTask.task, visitorTask.aheadCount)
    : null;

  return {
    currentServingNo: getCurrentServingNo(state),
    queueCount: state.queue.length + (state.currentTask ? 1 : 0),
    pendingCount: state.queue.length,
    dailyCapacity: state.settings.dailyCapacity,
    businessHoursStart: state.settings.businessHoursStart,
    businessHoursEnd: state.settings.businessHoursEnd,
    businessOpen: businessStatus.open,
    businessMessage: businessStatus.message,
    visitorHasActiveTicket: Boolean(visitorTicket),
    visitorTicket,
  };
}

function parseCalendarTextInput(rawValue) {
  return String(rawValue || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateSettingsInput(payload) {
  const nextSettings = {};

  if (payload.dailyCapacity !== undefined) {
    const dailyCapacity = Number(payload.dailyCapacity);
    if (!Number.isInteger(dailyCapacity) || dailyCapacity <= 0) {
      throw new Error("\u6bcf\u65e5\u5904\u7406\u80fd\u529b\u5fc5\u987b\u662f\u5927\u4e8e 0 \u7684\u6574\u6570\u3002");
    }
    nextSettings.dailyCapacity = dailyCapacity;
  }

  if (payload.businessHoursStart !== undefined) {
    parseBusinessTime(payload.businessHoursStart, "09:00");
    nextSettings.businessHoursStart = String(payload.businessHoursStart);
  }

  if (payload.businessHoursEnd !== undefined) {
    parseBusinessTime(payload.businessHoursEnd, "24:00");
    nextSettings.businessHoursEnd = String(payload.businessHoursEnd);
  }

  const startMinutes = parseBusinessTime(nextSettings.businessHoursStart || payload.currentStart || "09:00", "09:00");
  const endMinutes = parseBusinessTime(nextSettings.businessHoursEnd || payload.currentEnd || "24:00", "24:00");

  if (startMinutes >= endMinutes) {
    throw new Error("\u8425\u4e1a\u5f00\u59cb\u65f6\u95f4\u5fc5\u987b\u65e9\u4e8e\u7ed3\u675f\u65f6\u95f4\u3002");
  }

  return nextSettings;
}

async function issueTicketForVisitor(visitorId, priority, taskName) {
  const trimmedVisitorId = typeof visitorId === "string" ? visitorId.trim() : "";
  const trimmedTaskName = typeof taskName === "string" ? taskName.trim() : "";

  if (!trimmedVisitorId) {
    throw new Error("\u7f3a\u5c11 visitorId\u3002");
  }

  if (!trimmedTaskName) {
    throw new Error("\u8bf7\u5148\u586b\u5199\u4efb\u52a1\u540d\u79f0\u3002");
  }

  if (trimmedTaskName.length > 50) {
    throw new Error("\u4efb\u52a1\u540d\u79f0\u4e0d\u80fd\u8d85\u8fc7 50 \u4e2a\u5b57\u7b26\u3002");
  }

  const [state, calendar] = await Promise.all([getState(), getCalendar()]);
  const businessStatus = buildBusinessStatus(state.settings, calendar);

  if (!businessStatus.open) {
    throw new Error(businessStatus.message);
  }

  await createTicket({
    visitorId: trimmedVisitorId,
    priority,
    taskName: trimmedTaskName,
  });

  const freshState = await getState();
  const visitorTask = findVisitorTask(freshState, trimmedVisitorId);

  if (!visitorTask) {
    throw new Error("\u53d6\u53f7\u6210\u529f\uff0c\u4f46\u672a\u80fd\u8bfb\u53d6\u6700\u65b0\u961f\u5217\u3002");
  }

  return {
    ticket: buildTicketSnapshot(freshState, calendar, visitorTask.task, visitorTask.aheadCount),
    status: await buildPublicStatus(trimmedVisitorId),
  };
}

async function buildAdminDashboard() {
  const [state, calendar] = await Promise.all([getState(), getCalendar()]);
  const businessStatus = buildBusinessStatus(state.settings, calendar);

  return {
    authenticated: true,
    businessStatus,
    currentTask: serializeTask(state.currentTask),
    queue: state.queue.map(serializeTask),
    lastIssuedNo: state.lastIssuedNo,
    completedNo: state.completedNo,
    settings: state.settings,
    calendar,
    summary: {
      queueCount: state.queue.length + (state.currentTask ? 1 : 0),
      pendingCount: state.queue.length,
    },
  };
}

async function advanceToNextTask() {
  await advanceQueue();
  return buildAdminDashboard();
}

async function saveSettings(payload) {
  const currentState = await getState();
  const nextSettings = validateSettingsInput({
    ...payload,
    currentStart: currentState.settings.businessHoursStart,
    currentEnd: currentState.settings.businessHoursEnd,
  });
  await updateSettings(nextSettings);
  return buildAdminDashboard();
}

async function saveCalendar(payload) {
  const normalizedCalendar = normalizeCalendar({
    holidays: Array.isArray(payload?.holidays) ? payload.holidays : parseCalendarTextInput(payload?.holidaysText),
    workdays: Array.isArray(payload?.workdays) ? payload.workdays : parseCalendarTextInput(payload?.workdaysText),
  });

  normalizedCalendar.holidays.forEach((dateKey) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error("\u8282\u5047\u65e5\u65e5\u671f\u683c\u5f0f\u5fc5\u987b\u662f YYYY-MM-DD\u3002");
    }
  });

  normalizedCalendar.workdays.forEach((dateKey) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error("\u8c03\u4f11\u65e5\u65e5\u671f\u683c\u5f0f\u5fc5\u987b\u662f YYYY-MM-DD\u3002");
    }
  });

  await replaceCalendar(normalizedCalendar);
  return buildAdminDashboard();
}

module.exports = {
  advanceToNextTask,
  buildAdminDashboard,
  buildPublicStatus,
  issueTicketForVisitor,
  saveCalendar,
  saveSettings,
};
