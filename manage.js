const DASHBOARD_REFRESH_INTERVAL_MS = 30000;

const state = {
  authenticated: false,
  loading: false,
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
    const error = new Error(payload.error || "请求失败。");
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
    queueTable.innerHTML = '<div class="queue-empty">当前没有等待中的任务。</div>';
    return;
  }

  queueTable.innerHTML = queue.map((task) => `
    <article class="queue-row">
      <div class="queue-ticket">${padTicketNumber(task.number)}</div>
      <div class="queue-meta">
        <div>${task.priority === "urgent" ? "加急任务" : "普通任务"}</div>
        <div>${formatDateTime(task.createdAt)}</div>
      </div>
      <span class="queue-badge ${task.priority === "urgent" ? "urgent" : ""}">${task.priority === "urgent" ? "加急" : "普通"}</span>
    </article>
  `).join("");
}

function renderDashboard(dashboard) {
  setAuthView(true);
  businessStatusText.textContent = dashboard.businessStatus.open
    ? "当前处于营业时间内。"
    : dashboard.businessStatus.message;
  adminCurrentTask.textContent = dashboard.currentTask
    ? `${padTicketNumber(dashboard.currentTask.number)} / ${dashboard.currentTask.priority === "urgent" ? "加急任务" : "普通任务"}`
    : "暂无";
  adminPendingCount.textContent = String(dashboard.summary.pendingCount);
  adminLastIssued.textContent = padTicketNumber(dashboard.lastIssuedNo);
  adminCompletedNo.textContent = padTicketNumber(dashboard.completedNo);
  dailyCapacityInput.value = String(dashboard.settings.dailyCapacity);
  hoursStartInput.value = dashboard.settings.businessHoursStart;
  hoursEndInput.value = dashboard.settings.businessHoursEnd === "24:00"
    ? "23:59"
    : dashboard.settings.businessHoursEnd;
  holidaysInput.value = dashboard.calendar.holidays.join("\n");
  workdaysInput.value = dashboard.calendar.workdays.join("\n");
  renderQueue(dashboard.queue);

  if (dashboard.currentTask) {
    advanceButton.textContent = "结束当前任务并办理下一位";
    advanceButton.disabled = false;
    return;
  }

  if (dashboard.queue.length > 0) {
    advanceButton.textContent = "开始办理下一位";
    advanceButton.disabled = false;
    return;
  }

  advanceButton.textContent = "当前没有可推进的任务";
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
        authStatus.textContent = "请先登录后台。";
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
  authStatus.textContent = "正在登录...";

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
    authStatus.textContent = "已退出后台。";
  }
}

async function advanceQueue() {
  advanceButton.disabled = true;
  advanceStatus.textContent = "正在推进队列...";

  try {
    const dashboard = await fetchJson("/api/admin/queue/advance", {
      method: "POST",
    });
    renderDashboard(dashboard);
    advanceStatus.textContent = "队列已更新。";
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

  settingsStatus.textContent = "正在保存基础配置...";

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
    settingsStatus.textContent = "基础配置已保存。";
  } catch (error) {
    settingsStatus.textContent = error.message;
    if (error.status === 401) {
      setAuthView(false);
    }
  }
}

async function saveCalendar(event) {
  event.preventDefault();

  calendarStatus.textContent = "正在保存日历配置...";

  try {
    const dashboard = await fetchJson("/api/admin/calendar", {
      method: "PUT",
      body: JSON.stringify({
        holidaysText: holidaysInput.value,
        workdaysText: workdaysInput.value,
      }),
    });
    renderDashboard(dashboard);
    calendarStatus.textContent = "日历配置已保存。";
  } catch (error) {
    calendarStatus.textContent = error.message;
    if (error.status === 401) {
      setAuthView(false);
    }
  }
}

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
