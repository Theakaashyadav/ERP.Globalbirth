export function getTodayISODate() {
  const now = new Date();
  return formatDateISO(now);
}

export function formatDateISO(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

export function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function onlyDigits(value, max) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, max);
}

export function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

export function getDateRange(fromDate, toDate) {
  const dates = [];
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateISO(new Date(d)));
  }

  return dates;
}

export function getCurrentTime12() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}
