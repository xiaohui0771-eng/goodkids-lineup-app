const SERVICE_TIME_ZONE = process.env.SERVICE_TIME_ZONE || "Asia/Shanghai";
const SERVICE_OFFSET = "+08:00";

function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday],
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function parseBusinessTime(value, fallbackValue) {
  const candidate = typeof value === "string" ? value.trim() : "";
  const normalized = candidate || fallbackValue;
  const match = normalized.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error("\u8425\u4e1a\u65f6\u95f4\u683c\u5f0f\u5fc5\u987b\u662f HH:MM\u3002");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours === 24 && minutes === 0) {
    return 24 * 60;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("\u8425\u4e1a\u65f6\u95f4\u8d85\u51fa\u6709\u6548\u8303\u56f4\u3002");
  }

  return hours * 60 + minutes;
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00${SERVICE_OFFSET}`);
}

function shiftDateKey(dateKey, offsetDays) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return getZonedParts(date).dateKey;
}

function normalizeCalendar(calendar) {
  const holidays = Array.isArray(calendar?.holidays)
    ? calendar.holidays.filter((item) => typeof item === "string")
    : [];
  const workdays = Array.isArray(calendar?.workdays)
    ? calendar.workdays.filter((item) => typeof item === "string")
    : [];

  return {
    holidays: [...new Set(holidays)].sort(),
    workdays: [...new Set(workdays)].sort(),
  };
}

function isWorkingDateKey(dateKey, calendar) {
  const normalizedCalendar = normalizeCalendar(calendar);

  if (normalizedCalendar.workdays.includes(dateKey)) {
    return true;
  }

  if (normalizedCalendar.holidays.includes(dateKey)) {
    return false;
  }

  const weekday = getZonedParts(dateFromKey(dateKey)).weekday;
  return weekday >= 1 && weekday <= 5;
}

function buildBusinessStatus(settings, calendar, date = new Date()) {
  const zoned = getZonedParts(date);
  const startMinutes = parseBusinessTime(settings.businessHoursStart, "09:00");
  const endMinutes = parseBusinessTime(settings.businessHoursEnd, "24:00");

  if (!isWorkingDateKey(zoned.dateKey, calendar)) {
    return {
      open: false,
      message: "\u4eca\u5929\u662f\u975e\u5de5\u4f5c\u65e5\uff0c\u6682\u4e0d\u53d6\u53f7\uff0c\u8bf7\u5728\u5de5\u4f5c\u65e5\u524d\u6765\u3002",
      dateKey: zoned.dateKey,
    };
  }

  const currentMinutes = zoned.hour * 60 + zoned.minute;

  if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
    return {
      open: false,
      message: `\u5f53\u524d\u4e0d\u5728\u8425\u4e1a\u65f6\u95f4\u5185\uff0c\u8bf7\u5728\u5468\u4e00\u81f3\u5468\u4e94\uff08${settings.businessHoursStart}-${settings.businessHoursEnd}\uff09\u53d6\u53f7\u3002`,
      dateKey: zoned.dateKey,
    };
  }

  return {
    open: true,
    message: "",
    dateKey: zoned.dateKey,
  };
}

function addWorkingDays(baseDateLike, daysToAdd, calendar) {
  const baseDate = typeof baseDateLike === "string" ? new Date(baseDateLike) : baseDateLike;
  let currentDateKey = getZonedParts(baseDate).dateKey;
  let remainingDays = Math.max(0, Number(daysToAdd) || 0);

  while (remainingDays > 0) {
    currentDateKey = shiftDateKey(currentDateKey, 1);
    if (isWorkingDateKey(currentDateKey, calendar)) {
      remainingDays -= 1;
    }
  }

  return new Date(`${currentDateKey}T00:00:00${SERVICE_OFFSET}`);
}

module.exports = {
  SERVICE_TIME_ZONE,
  addWorkingDays,
  buildBusinessStatus,
  getZonedParts,
  isWorkingDateKey,
  normalizeCalendar,
  parseBusinessTime,
};
