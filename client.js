const VISITOR_ID_KEY = "line-up-visitor-id-v3";
const STATUS_REFRESH_INTERVAL_MS = 30000;

const appState = {
  visitorId: ensureVisitorId(),
  ticket: null,
  loading: false,
};

const currentServingInline = document.getElementById("current-serving-inline");
const queueCount = document.getElementById("queue-count");
const dailyCapacity = document.getElementById("daily-capacity");
const takeNumberButton = document.getElementById("take-number-btn");
const statusText = document.getElementById("status-text");
const qrImage = document.getElementById("qr-image");
const taskNameInput = document.getElementById("task-name-input");
const priorityInputs = Array.from(document.querySelectorAll('input[name="priority"]'));
const ticketSection = document.getElementById("ticket-section");
const ticketCard = document.getElementById("ticket-card");
const ticketAlert = document.getElementById("ticket-alert");
const ticketNumber = document.getElementById("ticket-number");
const ticketTaskName = document.getElementById("ticket-task-name");
const ticketPriorityBadge = document.getElementById("ticket-priority-badge");
const ticketCurrentServing = document.getElementById("ticket-current-serving");
const ticketRemainingTasks = document.getElementById("ticket-remaining-tasks");
const ticketWaitDays = document.getElementById("ticket-wait-days");
const ticketEstimatedDate = document.getElementById("ticket-estimated-date");
const ticketCreatedAt = document.getElementById("ticket-created-at");
const shareTicketButton = document.getElementById("share-ticket-btn");
const shareStatus = document.getElementById("share-status");

const QR_IMAGE_SOURCES = [
  "/assets/goodkids-wechat-qr-20260328.jpg?v=20260328b",
  "/assets/wechat-qr-full.jpg?v=20260328b",
  "/assets/wechat-qr.jpg?v=20260328b",
];

clearLegacyClientState();
initializeQrImage();

function clearLegacyClientState() {
  localStorage.removeItem("line-up-queue-state-v2");
  localStorage.removeItem("line-up-queue-state-v3");
  localStorage.removeItem("line-up-visitor-ticket-v1");
}

function initializeQrImage() {
  if (!qrImage) {
    return;
  }

  let qrIndex = 0;

  qrImage.addEventListener("error", () => {
    qrIndex += 1;

    if (qrIndex < QR_IMAGE_SOURCES.length) {
      qrImage.src = QR_IMAGE_SOURCES[qrIndex];
    }
  });

  qrImage.src = QR_IMAGE_SOURCES[qrIndex];
}

function ensureVisitorId() {
  const savedId = localStorage.getItem(VISITOR_ID_KEY);

  if (savedId) {
    return savedId;
  }

  const nextId = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(VISITOR_ID_KEY, nextId);
  return nextId;
}

function padTicketNumber(number) {
  return `A${String(Number(number) || 0).padStart(4, "0")}`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getSelectedPriority() {
  const selected = document.querySelector('input[name="priority"]:checked');
  return selected ? selected.value : "normal";
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
    throw new Error(payload.error || "请求失败。");
  }

  return payload;
}

function setInteractionState(disabled) {
  takeNumberButton.disabled = disabled;
  taskNameInput.disabled = disabled;
  priorityInputs.forEach((input) => {
    input.disabled = disabled;
  });
}

function hideTicket() {
  appState.ticket = null;
  ticketSection.hidden = true;
  ticketCard.classList.remove("urgent");
  ticketPriorityBadge.classList.remove("urgent");
  ticketTaskName.textContent = "--";
  shareTicketButton.disabled = true;
  shareStatus.textContent = "";
}

function renderTicket(ticket) {
  const isUrgent = ticket.priority === "urgent";

  appState.ticket = ticket;
  ticketNumber.textContent = padTicketNumber(ticket.number);
  ticketTaskName.textContent = ticket.taskName;
  ticketPriorityBadge.textContent = isUrgent ? "加急任务" : "普通任务";
  ticketPriorityBadge.classList.toggle("urgent", isUrgent);
  ticketCard.classList.toggle("urgent", isUrgent);
  ticketAlert.hidden = !isUrgent;
  ticketCurrentServing.textContent = padTicketNumber(ticket.currentServingNo);
  ticketRemainingTasks.textContent = `${ticket.aheadCount} 个任务`;
  ticketWaitDays.textContent = `${ticket.waitDays} 个工作日`;
  ticketEstimatedDate.textContent = formatDate(new Date(ticket.estimatedDate));
  ticketCreatedAt.textContent = formatDateTime(new Date(ticket.createdAt));
  ticketSection.hidden = false;
  shareTicketButton.disabled = false;
  shareStatus.textContent = "";
}

function applyStatus(status) {
  currentServingInline.textContent = padTicketNumber(status.currentServingNo);
  queueCount.textContent = String(status.queueCount);
  dailyCapacity.textContent = String(status.dailyCapacity);

  if (status.visitorTicket) {
    renderTicket(status.visitorTicket);
  } else {
    hideTicket();
  }

  if (appState.loading) {
    setInteractionState(true);
    return;
  }

  if (status.visitorHasActiveTicket) {
    setInteractionState(true);
    statusText.textContent = "当前设备已经取过号，不能重复取号。";
    return;
  }

  if (!status.businessOpen) {
    setInteractionState(true);
    statusText.textContent = status.businessMessage;
    return;
  }

  setInteractionState(false);
  statusText.textContent = "";
}

async function refreshStatus({ silent = false } = {}) {
  try {
    const status = await fetchJson(`/api/queue/status?visitorId=${encodeURIComponent(appState.visitorId)}`);
    applyStatus(status);
  } catch (_error) {
    setInteractionState(true);
    if (!silent) {
      statusText.textContent = "后端服务不可用，请稍后重试。";
    }
  }
}

async function issueTicket() {
  const taskName = taskNameInput.value.trim();

  if (!taskName) {
    statusText.textContent = "请先填写任务名称。";
    taskNameInput.focus();
    return;
  }

  appState.loading = true;
  setInteractionState(true);
  statusText.textContent = "正在取号...";
  let nextStatus = null;

  try {
    const payload = await fetchJson("/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        priority: getSelectedPriority(),
        visitorId: appState.visitorId,
        taskName,
      }),
    });

    renderTicket(payload.ticket);
    nextStatus = payload.status;
  } catch (error) {
    statusText.textContent = error.message;
    await refreshStatus({ silent: true });
  } finally {
    appState.loading = false;
    if (nextStatus) {
      applyStatus(nextStatus);
    }
  }
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function createShareCanvas(ticket) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = 1080;
  const height = 1400;
  const urgent = ticket.priority === "urgent";

  if (!context) {
    throw new Error("当前浏览器不支持分享图生成。");
  }

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#eef4ff";
  context.fillRect(0, 0, width, height);

  drawRoundedRect(context, 72, 72, width - 144, height - 144, 40);
  context.fillStyle = "#ffffff";
  context.fill();

  if (urgent) {
    drawRoundedRect(context, 110, 128, width - 220, 120, 28);
    context.fillStyle = "#fff0ee";
    context.fill();
    context.fillStyle = "#b42318";
    context.font = '700 34px "Microsoft YaHei", "Segoe UI", sans-serif';
    context.fillText("加急任务已标记，优先插队处理。", 150, 204);
  }

  context.fillStyle = "#667085";
  context.font = '600 28px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText("取号单", 110, urgent ? 310 : 180);

  context.fillStyle = "#1f2937";
  context.font = '700 64px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText("号码已生成", 110, urgent ? 388 : 258);

  drawRoundedRect(context, 110, urgent ? 440 : 320, width - 220, 240, 30);
  context.fillStyle = urgent ? "#fff3f2" : "#eff5ff";
  context.fill();

  context.fillStyle = "#667085";
  context.font = '600 32px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText("我的号码", 150, urgent ? 520 : 400);

  context.fillStyle = urgent ? "#b42318" : "#2f6fed";
  context.font = '700 110px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText(padTicketNumber(ticket.number), 150, urgent ? 628 : 508);

  const gridTop = urgent ? 730 : 610;
  const cardWidth = 408;
  const cardHeight = 150;
  const gap = 24;
  const left = 110;

  const rows = [
    ["任务名称", ticket.taskName],
    ["目前办理到", padTicketNumber(ticket.currentServingNo)],
    ["前方待处理", `${ticket.aheadCount} 个任务`],
    ["预计等待时间", `${ticket.waitDays} 个工作日`],
    ["预计办理日期", formatDate(new Date(ticket.estimatedDate))],
    ["取号时间", formatDateTime(new Date(ticket.createdAt))],
  ];

  rows.forEach((row, index) => {
    const rowIndex = Math.floor(index / 2);
    const columnIndex = index % 2;
    const x = left + columnIndex * (cardWidth + gap);
    const y = gridTop + rowIndex * (cardHeight + gap);

    drawRoundedRect(context, x, y, cardWidth, cardHeight, 24);
    context.fillStyle = "#f8fafc";
    context.fill();

    context.fillStyle = "#667085";
    context.font = '600 24px "Microsoft YaHei", "Segoe UI", sans-serif';
    context.fillText(row[0], x + 28, y + 50);

    context.fillStyle = "#1f2937";
    context.font = '700 34px "Microsoft YaHei", "Segoe UI", sans-serif';
    context.fillText(row[1], x + 28, y + 106, cardWidth - 56);
  });

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法生成分享图片。"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

async function shareTicket() {
  if (!appState.ticket) {
    return;
  }

  shareTicketButton.disabled = true;
  shareStatus.textContent = "正在生成分享图片...";

  try {
    const canvas = createShareCanvas(appState.ticket);
    const blob = await canvasToBlob(canvas);
    const fileName = `ticket-${padTicketNumber(appState.ticket.number)}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "取号单",
        files: [file],
      });
      shareStatus.textContent = "已调起系统分享。";
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    shareStatus.textContent = "分享图已下载，可以直接发给别人。";
  } catch (_error) {
    shareStatus.textContent = "分享失败，请稍后重试。";
  } finally {
    shareTicketButton.disabled = false;
  }
}

if (window.location.protocol !== "file:") {
  hideTicket();
  refreshStatus();
  takeNumberButton.addEventListener("click", issueTicket);
  shareTicketButton.addEventListener("click", shareTicket);
  window.addEventListener("focus", () => {
    refreshStatus({ silent: true });
  });
  window.setInterval(() => {
    refreshStatus({ silent: true });
  }, STATUS_REFRESH_INTERVAL_MS);
}
