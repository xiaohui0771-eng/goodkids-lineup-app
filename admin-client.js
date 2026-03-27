const DASHBOARD_REFRESH_INTERVAL_MS = 30000;

const state = {
  authenticated: false,
};

const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-btn");
const authStatus = document.getElementById("auth-status");
const logoutButton = document.getElementById("logout-btn");
const manageAuth = document.getElementById("manage-auth");
const managePanel = document.getElementById("manage-panel");

const businessStatusText = document.getElementById("business-status-text");
const adminCurrentTask = document.getElementById("admin-current-task");
const adminCurrentTaskName = document.getElementById("admin-current-task-name");
const adminPendingCount = document.getElementById("admin-pending-count");
const adminLastIssued = document.getElementById("admin-last-issued");
const adminCompletedNo = document.getElementById("admin-completed-no");
const advanceButton = document.getElementById("advance-btn");
const advanceStatus = document.getElementById("advance-status");

const settingsForm = document.getElementById("settings-form");
const dailyCapacityInput = document.getElementById("daily-capacity-input");
const hoursStartInput = document.getElementById("hours-start-input");
const hoursEndInput = document.getElementById("hours-end-input");
const settingsStatus = document.getElementById("settings-status");

const calendarForm = document.getElementById("calendar-form");
const holidaysInput = document.getElementById("holidays-input");
const workdaysInput = document.getElementById("workdays-input");
const calendarStatus = document.getElementById("calendar-status");
const queueTable = document.getElementById("queue-table");

function padTicketNumber(number) {
  return `A${String(Number(number) || 0).padStart(4, "0")}`;
}

function formatDateTime(dateLike) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateLike));
}

async function fetchJson(url, options = {}) {
  const requestOptions = {
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
    credentials: "same-origin",
    ...options,
  };

  if (options.body && !requestOptions.headers["Content-Type"]) {
    requestOptions.headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "\u8bf7\u6c42\u5931\u8d25\u3002");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setAuthView(authenticated) {
  state.authenticated = authenticated;
  manageAuth.hidden = authenticated;
  managePanel.hidden = !authenticated;
}

function renderQueue(queue) {
  if (!queue || queue.length === 0) {
    queueTable.innerHTML = '<div class="queue-empty">\u5f53\u524d\u6ca1\u6709\u7b49\u5f85\u4e2d\u7684\u4efb\u52a1\u3002</div>';
    return;
  }

  queueTable.innerHTML = queue.map((task) => `
    <article class="queue-row">
      <div class="queue-ticket">${padTicketNumber(task.number)}</div>
      <div class="queue-meta">
        <div class="queue-task-name">${task.taskName || "\u672a\u547d\u540d\u4efb\u52a1"}</div>
        <div>${task.priority === "urgent" ? "\u52a0\u6025\u4efb\u52a1" : "\u666e\u901a\u4efb\u52a1"}</div>
        <div>${formatDateTime(task.createdAt)}</div>
      </div>
      <span class="queue-badge ${task.priority === "urgent" ? "urgent" : ""}">${task.priority === "urgent" ? "\u52a0\u6025" : "\u666e\u901a"}</span>
    </article>
  `).join("");
}

function renderDashboard(dashboard) {
  setAuthView(true);
  businessStatusText.textContent = dashboard.businessStatus.open
    ? "\u5f53\u524d\u5904\u4e8e\u8425\u4e1a\u65f6\u95f4\u5185\u3002"
    : dashboard.businessStatus.message;
  adminCurrentTask.textContent = dashboard.currentTask
    ? `${padTicketNumber(dashboard.currentTask.number)} / ${dashboard.currentTask.priority === "urgent" ? "\u52a0\u6025\u4efb\u52a1" : "\u666e\u901a\u4efb\u52a1"}`
    : "\u6682\u65e0";
  adminCurrentTaskName.textContent = dashboard.currentTask?.taskName || "\u672a\u9009\u62e9\u4efb\u52a1";
  adminPendingCount.textContent = String(dashboard.summary.pendingCount);
  adminLastIssued.textContent = padTicketNumber(dashboard.lastIssuedNo);
  adminCompletedNo.textContent = padTicketNumber(dashboard.completedNo);
  dailyCapacityInput.value = String(dashboard.settings.dailyCapacity);
  hoursStartInput.value = dashboard.settings.businessHoursStart;
  hoursEndInput.value = dashboard.settings.businessHoursEnd === "24:00" ? "23:59" : dashboard.settings.businessHoursEnd;
  holidaysInput.value = dashboard.calendar.holidays.join("\n");
  workdaysInput.value = dashboard.calendar.workdays.join("\n");
  renderQueue(dashboard.queue);

  if (dashboard.currentTask) {
    advanceButton.textContent = "\u7ed3\u675f\u5f53\u524d\u4efb\u52a1\u5e76\u529e\u7406\u4e0b\u4e00\u4f4d";
    advanceButton.disabled = false;
    return;
  }

  if (dashboard.queue.length > 0) {
    advanceButton.textContent = "\u5f00\u59cb\u529e\u7406\u4e0b\u4e00\u4f4d";
    advanceButton.disabled = false;
    return;
  }

  advanceButton.textContent = "\u5f53\u524d\u6ca1\u6709\u53ef\u63a8\u8fdb\u7684\u4efb\u52a1";
  advanceButton.disabled = true;
}

async function loadDashboard({ silent = false } = {}) {
  try {
    const dashboard = await fetchJson("/api/admin/dashboard");
    renderDashboard(dashboard);
    authStatus.textContent = "";
  } catch (error) {
    if (error.status === 401) {
      setAuthView(false);
      if (!silent) {
        authStatus.textContent = "\u8bf7\u5148\u767b\u5f55\u540e\u53f0\u3002";
      }
      return;
    }

    if (!silent) {
      authStatus.textContent = error.message;
    }
  }
}

async function login(event) {
  event.preventDefault();

  loginButton.disabled = true;
  authStatus.textContent = "\u6b63\u5728\u767b\u5f55...";

  try {
    const payload = await fetchJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: passwordInput.value,
      }),
    });

    passwordInput.value = "";
    renderDashboard(payload.dashboard);
    authStatus.textContent = "";
  } catch (error) {
    authStatus.textContent = error.message;
  } finally {
    loginButton.disabled = false;
  }
}

async function logout() {
  logoutButton.disabled = true;

  try {
    await fetchJson("/api/admin/logout", {
      method: "POST",
    });
  } finally {
    logoutButton.disabled = false;
    setAuthView(false);
    authStatus.textContent = "\u5df2\u9000\u51fa\u540e\u53f0\u3002";
  }
}

async function advanceQueue() {
  advanceButton.disabled = true;
  advanceStatus.textContent = "\u6b63\u5728\u63a8\u8fdb\u961f\u5217...";

  try {
    const dashboard = await fetchJson("/api/admin/queue/advance", {
      method: "POST",
    });
    renderDashboard(dashboard);
    advanceStatus.textContent = "\u961f\u5217\u5df2\u66f4\u65b0\u3002";
  } catch (error) {
    advanceStatus.textContent = error.message;
    if (error.status === 401) {
      setAuthView(false);
    }
  } finally {
    advanceButton.disabled = false;
  }
}

async function saveSettings(event) {
  event.preventDefault();

  settingsStatus.textContent = "\u6b63\u5728\u4fdd\u5b58\u57fa\u7840\u914d\u7f6e...";

  try {
    const dashboard = await fetchJson("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        dailyCapacity: Number(dailyCapacityInput.value),
        businessHoursStart: hoursStartInput.value,
        businessHoursEnd: hoursEndInput.value === "23:59" ? "24:00" : hoursEndInput.value,
      }),
    });
    renderDashboard(dashboard);
    settingsStatus.textContent = "\u57fa\u7840\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002";
  } catch (error) {
    settingsStatus.textContent = error.message;
    if (error.status === 401) {
      setAuthView(false);
    }
  }
}

async function saveCalendar(event) {
  event.preventDefault();

  calendarStatus.textContent = "\u6b63\u5728\u4fdd\u5b58\u65e5\u5386\u914d\u7f6e...";

  try {
    const dashboard = await fetchJson("/api/admin/calendar", {
      method: "PUT",
      body: JSON.stringify({
        holidaysText: holidaysInput.value,
        workdaysText: workdaysInput.value,
      }),
    });
    renderDashboard(dashboard);
    calendarStatus.textContent = "\u65e5\u5386\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002";
  } catch (error) {
    calendarStatus.textContent = error.message;
    if (error.status === 401) {
      setAuthView(false);
    }
  }
}

if (window.location.protocol !== "file:") {
  loginForm.addEventListener("submit", login);
  logoutButton.addEventListener("click", logout);
  advanceButton.addEventListener("click", advanceQueue);
  settingsForm.addEventListener("submit", saveSettings);
  calendarForm.addEventListener("submit", saveCalendar);

  loadDashboard({ silent: true });
  window.addEventListener("focus", () => {
    if (state.authenticated) {
      loadDashboard({ silent: true });
    }
  });
  window.setInterval(() => {
    if (state.authenticated) {
      loadDashboard({ silent: true });
    }
  }, DASHBOARD_REFRESH_INTERVAL_MS);
}
