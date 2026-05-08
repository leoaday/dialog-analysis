function pad2(n) { return String(n).padStart(2, "0"); }

export function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDelta(ms) {
  if (ms === null || ms === undefined) return "";
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "−" : "+";
  if (abs < 1000) return `${sign}0s`;
  if (abs < 60_000) return `${sign}${Math.floor(abs / 1000)}s`;
  if (abs < 3_600_000) return `${sign}${Math.floor(abs / 60_000)}m`;
  if (abs < 86_400_000) return `${sign}${Math.floor(abs / 3_600_000)}h`;
  return `${sign}${Math.floor(abs / 86_400_000)}d`;
}

export function buildTimeline(events) {
  // Returns array of { kind: "tick" | "day-divider", ... } in event order.
  const out = [];
  let prev = null;
  let prevDateKey = "";
  for (const ev of events) {
    const ts = ev?.timestamp;
    if (!ts) { out.push({ kind: "tick", time: "—", delta: "", iso: "", date: "" }); prev = null; continue; }
    const d = new Date(ts);
    const dateKey = formatDate(d);
    if (dateKey !== prevDateKey) {
      out.push({ kind: "day-divider", date: dateKey });
      prevDateKey = dateKey;
    }
    const delta = prev ? formatDelta(d.getTime() - prev.getTime()) : "+前";
    out.push({
      kind: "tick",
      time: formatTime(d),
      delta,
      iso: d.toISOString(),
      kindOf: ev._kind || "",
    });
    prev = d;
  }
  return out;
}

export function renderTimelineColumn(timeline) {
  return timeline.map((t) => {
    if (t.kind === "day-divider") return `<div class="timeline-day">── ${t.date} ──</div>`;
    if (t.time === "—") return `<div class="timeline-tick"><span class="time">—</span></div>`;
    return `<div class="timeline-tick" data-kind="${t.kindOf}"><time class="time" title="${t.iso}">${t.time}</time><span class="delta">${t.delta}</span><span class="dot"></span></div>`;
  }).join("");
}
