(() => {
  "use strict";

  const PALETTE = ["#7c3aed", "#ea580c", "#0f766e", "#be123c", "#2563eb", "#15803d", "#c026d3", "#0369a1", "#b45309", "#4338ca"];
  const SCHOOL_START = "2026-08-01";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const CAT_COLORS = {
    "Daily Work": "#38bdf8",
    Quizzes: "#f59e0b",
    Tests: "#8b5cf6",
    Weekly: "#34d399",
    "Room to 100": "#d6d3d1"
  };

  const state = {
    search: "",
    className: "all",
    term: "all",
    category: "all",
    flag: "all",
    sort: "newest",
    date: "",
    show: 40,
    expanded: new Set(),
    timeFilter: "all",
    termName: "",
    catView: "bars",
    attDate: "",
    robloxSubject: "all",
    charts: {}
  };

  let MODEL = null;
  let tableSeq = 0;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function richText(value) {
    return esc(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function numOrNull(value) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  function mean(values) {
    const xs = values.filter((n) => n != null && Number.isFinite(n));
    if (!xs.length) return null;
    return xs.reduce((sum, n) => sum + n, 0) / xs.length;
  }

  function fmtGrade(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const rounded = Math.round(Number(value) * 100) / 100;
    const text = rounded.toFixed(2);
    if (text.endsWith("00")) return String(Math.round(rounded));
    if (text.endsWith("0")) return text.slice(0, -1);
    return text;
  }

  function fmtDelta(value) {
    if (value == null || !Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded) < 0.005) return "0";
    return (rounded > 0 ? "+" : "−") + fmtGrade(Math.abs(rounded));
  }

  function fmtGPA(value) {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function plural(count, word) {
    if (count === 1) return `${count} ${word}`;
    const irregular = { class: "classes", tardy: "tardies" };
    return `${count} ${irregular[word] || `${word}s`}`;
  }

  function joinAnd(items) {
    const list = items.filter(Boolean);
    if (list.length <= 1) return list[0] || "";
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
  }

  function letterOf(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (value >= 90) return "A";
    if (value >= 80) return "B";
    if (value >= 70) return "C";
    if (value >= 60) return "D";
    return "F";
  }

  function letterColor(letter) {
    return { A: "#15803d", B: "#1d4ed8", C: "#b45309", D: "#c2410c", F: "#be123c" }[letter] || "#44403c";
  }

  function gpaPoint(value) {
    if (value >= 90) return 4;
    if (value >= 80) return 3;
    if (value >= 70) return 2;
    if (value >= 60) return 1;
    return 0;
  }

  function shortTerm(name) {
    const match = /quarter\s*(\d+)/i.exec(name || "");
    return match ? `Q${match[1]}` : (name || "");
  }

  function prettyYear(value) {
    const match = String(value || "").match(/(\d{4})\D+(\d{2,4})/);
    if (!match) return value || "";
    const end = match[2].length === 4 ? match[2].slice(-2) : match[2];
    return `${match[1]}–${end}`;
  }

  function possessive(name) {
    return /s$/i.test(name) ? `${name}'` : `${name}'s`;
  }

  function isISODate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
  }

  function formatMed(iso) {
    const [, m, d] = iso.split("-").map(Number);
    return `${MON[m - 1]} ${d}`;
  }

  function formatLong(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }

  function addDays(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  function weekdayName(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return WDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  function weekdayMondayIndex(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  }

  function isoWeek(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const isoYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { isoYear, week, key: `${isoYear}-W${String(week).padStart(2, "0")}` };
  }

  function mondayOf(key) {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    const isoYear = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }

  function nextWeek(key) {
    return isoWeek(addDays(mondayOf(key), 7)).key;
  }

  function majorityWeek(start, end) {
    const counts = new Map();
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 40) {
      const key = isoWeek(cursor).key;
      counts.set(key, (counts.get(key) || 0) + 1);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    let best = null;
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (count > bestCount || (count === bestCount && key > best)) {
        best = key;
        bestCount = count;
      }
    }
    return best;
  }

  function spanWeeks(keys) {
    const sorted = [...keys].filter(Boolean).toSorted();
    if (!sorted.length) return [];
    const all = [];
    let cursor = sorted[0];
    const last = sorted[sorted.length - 1];
    while (cursor <= last && all.length < 80) {
      all.push(cursor);
      cursor = nextWeek(cursor);
    }
    return all;
  }

  function parseCSV(text) {
    const src = text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : (text || "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 1;
          } else inQuotes = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i += 1;
        row.push(field);
        field = "";
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      field += ch;
    }
    if (field.length || row.length) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1).map((cells) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = (cells[index] ?? "").trim();
      });
      return obj;
    });
  }

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2 || n !== ys.length) return null;
    const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i += 1) {
      const a = xs[i] - meanX;
      const b = ys[i] - meanY;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    if (dx <= 1e-12 || dy <= 1e-12) return null;
    return num / Math.sqrt(dx * dy);
  }

  function selfCheck() {
    if (isoWeek("2026-08-10").key !== "2026-W33") throw new Error("ISO week mismatch for Aug 10");
    if (isoWeek("2026-11-06").key !== "2026-W45") throw new Error("ISO week mismatch for Nov 6");
    if (isoWeek("2026-11-09").key !== "2026-W46") throw new Error("ISO week mismatch for Nov 9");
    if (isoWeek("2026-11-16").key !== "2026-W47") throw new Error("ISO week mismatch for Nov 16");
    if (mondayOf("2026-W46") !== "2026-11-09") throw new Error("Monday mismatch");
    if (majorityWeek("2026-11-06", "2026-11-12") !== "2026-W46") throw new Error("Majority week mismatch");
    if (majorityWeek("2026-11-10", "2026-11-16") !== "2026-W46") throw new Error("Inferred week mismatch");
    if (Math.abs(pearson([1, 2, 3, 4], [1, 2, 3, 4]) - 1) > 1e-9) throw new Error("Pearson mismatch");
    if (Math.abs(pearson([1, 2, 3, 4], [4, 3, 2, 1]) + 1) > 1e-9) throw new Error("Pearson mismatch");
    if (pearson([1, 1, 1, 1], [2, 3, 4, 5]) !== null) throw new Error("Flat Pearson should be empty");
  }

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function normName(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function normCode(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function splitTitle(name) {
    const text = name || "";
    const index = text.indexOf(":");
    if (index > 0 && index <= 90) {
      return { title: text.slice(0, index).trim(), detail: text.slice(index + 1).trim() };
    }
    return { title: text.trim(), detail: "" };
  }

  function formatMinutes(mins) {
    if (mins == null || !Number.isFinite(Number(mins))) return "";
    const total = Math.round(Number(mins));
    const hours = Math.floor(total / 60);
    const rem = Math.abs(total % 60);
    if (hours <= 0) return `${rem}m`;
    return `${hours}h ${String(rem).padStart(2, "0")}m`;
  }

  function scrubId(text) {
    return String(text || "")
      .replace(/roblox account\s*,?\s*/gi, "")
      .replace(/ThunderFinn\w*/gi, "")
      .replace(/DESKTOP-[A-Z0-9-]+/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim();
  }

  function bucketColor(pct) {
    if (pct == null) return "#e7e5e4";
    if (pct >= 93) return "#bbf7d0";
    if (pct >= 85) return "#d9f99d";
    if (pct >= 75) return "#fde68a";
    if (pct >= 65) return "#fed7aa";
    return "#fecdd3";
  }

  function scoreColors(pct) {
    if (pct == null) return { bg: "#e7e5e4", fg: "#44403c" };
    if (pct >= 93) return { bg: "#bbf7d0", fg: "#14532d" };
    if (pct >= 85) return { bg: "#d9f99d", fg: "#365314" };
    if (pct >= 75) return { bg: "#fde68a", fg: "#713f12" };
    if (pct >= 65) return { bg: "#fed7aa", fg: "#9a3412" };
    return { bg: "#fecdd3", fg: "#9f1239" };
  }

  function arrow(dir) {
    if (dir === "up") return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2.5 13 8H9.5v5.5h-3V8H3L8 2.5z"/></svg>';
    if (dir === "down") return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 13.5 3 8h3.5V2.5h3V8H13L8 13.5z"/></svg>';
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.5 7h11v2h-11z"/></svg>';
  }

  function trendOf(delta) {
    if (delta == null || !Number.isFinite(delta)) return null;
    const rounded = Math.round(delta * 100) / 100;
    const dir = Math.abs(rounded) < 0.005 ? "flat" : rounded > 0 ? "up" : "down";
    const word = dir === "up" ? "Up" : dir === "down" ? "Down" : "Flat";
    return { dir, word };
  }

  function trendHTML(delta, comparison) {
    const trend = trendOf(delta);
    if (!trend) return "";
    return `<span class="trend ${trend.dir}"><span class="sr-only">${trend.word}</span>${arrow(trend.dir)} ${esc(fmtDelta(delta))} ${esc(comparison)}</span>`;
  }

  function hasGrade(cls) {
    return Object.values(cls.terms || {}).some((term) => term?.term_average?.numeric != null);
  }

  function latestTermName(summary, classes) {
    const order = summary.terms_available_in_gradebook || [];
    for (let i = order.length - 1; i >= 0; i -= 1) {
      if (classes.some((cls) => cls.terms?.[order[i]]?.term_average?.numeric != null)) return order[i];
    }
    return order[order.length - 1] || "";
  }

  function previousTermName(summary, cls, current) {
    const order = summary.terms_available_in_gradebook || Object.keys(cls.terms || {});
    const index = order.indexOf(current);
    for (let i = index - 1; i >= 0; i -= 1) {
      if (cls.terms?.[order[i]]?.term_average?.numeric != null) return order[i];
    }
    return "";
  }

  function weightFor(cls, term, category) {
    const cats = cls?.terms?.[term]?.category_weights_and_averages || [];
    const hit = cats.find((cat) => cat.category === category);
    return hit && hit.weight_percent != null ? Number(hit.weight_percent) : null;
  }

  function weightedAverage(items, weightFn) {
    const groups = new Map();
    items.forEach((item) => {
      if (item.percent == null) return;
      const weight = weightFn(item);
      if (!groups.has(item.category)) groups.set(item.category, { sum: 0, n: 0, weight });
      const group = groups.get(item.category);
      group.sum += item.percent;
      group.n += 1;
      if (weight != null) group.weight = weight;
    });
    const cats = [...groups.values()].filter((group) => group.n);
    if (!cats.length) return null;
    const known = cats.filter((group) => group.weight != null);
    if (!known.length) {
      const total = cats.reduce((sum, group) => sum + group.sum, 0);
      const count = cats.reduce((sum, group) => sum + group.n, 0);
      return count ? total / count : null;
    }
    let acc = 0;
    let weightSum = 0;
    known.forEach((group) => {
      acc += group.weight * (group.sum / group.n);
      weightSum += group.weight;
    });
    return weightSum ? acc / weightSum : null;
  }

  function isMissing(row) {
    return row.flags.includes("missing") || /missing/i.test(row.status || "");
  }

  function kindOf(record) {
    const code = String(record.code || "").toUpperCase();
    const desc = String(record.description || "").toLowerCase();
    if (code.startsWith("A") || desc.includes("absent")) return "absence";
    if (code.startsWith("T") || desc.includes("tardy")) return "tardy";
    return "other";
  }

  function excusedOf(record) {
    const code = String(record.code || "").toUpperCase();
    const desc = String(record.description || "").toLowerCase();
    if (desc.includes("unexcused") || /U$/.test(code)) return false;
    if (desc.includes("excused") || /E$/.test(code)) return true;
    return null;
  }

  function attendanceTitle(kind, excused) {
    const what = kind === "absence" ? "Absent" : kind === "tardy" ? "Tardy" : "Attendance";
    if (excused === true) return `${what}, excused`;
    if (excused === false) return `${what}, unexcused`;
    return what;
  }

  function describeSource(row) {
    const src = row.source || "";
    const blob = `${src} ${row.notes || ""}`;
    if (src === "microsoft_family_safety" || /family_safety/i.test(src)) {
      return {
        name: "Windows PC (Family Safety)",
        scope: /more than one/i.test(row.notes || "") ? "More than one Windows PC" : "Windows PC only",
        rank: 1,
        color: "#ea580c",
        source: src,
        primary: true
      };
    }
    if (src === "roblox" || src === "roblox_parent_email" || /all devices/i.test(blob)) {
      return {
        name: "All devices (Roblox email)",
        scope: "All devices",
        rank: 2,
        color: "#7c3aed",
        source: src || "roblox",
        primary: false
      };
    }
    return {
      name: src.replace(/_/g, " ").replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) || "Report",
      scope: "Scope not specified",
      rank: 0,
      color: "#0284c7",
      source: src || "report",
      primary: false
    };
  }

  function scopeVerb(scope) {
    if (scope === "All devices") return "covers all devices";
    if (scope === "Windows PC only") return "covers the Windows PC only";
    return `is listed as ${scope}`;
  }

  function hexAlpha(hex, alpha) {
    const raw = hex.replace("#", "");
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function catColor(name) {
    return CAT_COLORS[name] || "#94a3b8";
  }

  function gradeBounds(values) {
    const nums = values.filter((value) => value != null && Number.isFinite(value));
    if (!nums.length) return { min: 0, max: 100 };
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const min = lo >= 75 ? 70 : Math.max(0, Math.floor((lo - 5) / 5) * 5);
    const max = Math.max(100, Math.ceil((hi + 2) / 5) * 5);
    return { min, max };
  }

  function categoryParts(cls, termName) {
    const term = cls.terms?.[termName];
    if (!term) return [];
    const all = term.category_weights_and_averages || [];
    const scored = all.filter((cat) => cat.category_average != null && cat.weight_percent != null);
    const weightSum = scored.reduce((sum, cat) => sum + Number(cat.weight_percent), 0);
    return all.map((cat) => {
      const ok = cat.category_average != null && cat.weight_percent != null && weightSum > 0;
      const effective = ok ? (Number(cat.weight_percent) / weightSum) * 100 : 0;
      const loss = ok ? (effective / 100) * (100 - Number(cat.category_average)) : null;
      const contribution = ok ? (effective / 100) * Number(cat.category_average) : null;
      return {
        category: cat.category,
        weight_percent: cat.weight_percent,
        category_average: cat.category_average,
        effective,
        loss,
        contribution,
        scored: ok,
        wsum: weightSum
      };
    });
  }

  function normalizeAssignment(raw, index) {
    return {
      index,
      class: raw.class || "",
      term: raw.term || "",
      category: raw.category || "Work",
      assignment_name: raw.assignment_name || "Assignment",
      due_date: isISODate(raw.due_date) ? raw.due_date : "",
      points_earned: numOrNull(raw.points_earned),
      points_possible: numOrNull(raw.points_possible),
      percent: numOrNull(raw.percent),
      status: raw.status || "",
      flags: String(raw.status_flags || "").split(";").map((flag) => flag.trim().toLowerCase()).filter(Boolean),
      teacher_note: (raw.teacher_note || "").trim()
    };
  }

  function normalizeRoblox(raw) {
    return {
      source: raw.source || "",
      week_label: raw.week_label || "",
      period_start: isISODate(raw.period_start) ? raw.period_start : "",
      period_end: isISODate(raw.period_end) ? raw.period_end : "",
      report_received_et: raw.report_received_et || "",
      roblox_total_min: numOrNull(raw.roblox_total_min),
      roblox_daily_avg_min: numOrNull(raw.roblox_daily_avg_min),
      roblox_max_day_min: numOrNull(raw.roblox_max_day_min),
      peak_days: raw.peak_days || "",
      top_games: raw.top_games || "",
      notes: raw.notes || ""
    };
  }

  function isSchoolWeek(key) {
    return Boolean(key) && mondayOf(key) >= SCHOOL_START;
  }

  function placeReport(row) {
    const described = describeSource(row);
    const minutes = row.roblox_total_min;
    let start = row.period_start;
    let end = row.period_end;
    let inferred = false;
    if (!(start && end)) {
      if (described.primary || minutes == null) return null;
      const received = (row.report_received_et || "").match(/\d{4}-\d{2}-\d{2}/);
      if (!received) return null;
      end = addDays(received[0], -1);
      start = addDays(end, -6);
      inferred = true;
    }
    return {
      ...row,
      ...described,
      hours: minutes == null ? null : minutes / 60,
      unknown: minutes == null,
      start,
      end,
      inferred,
      weekKey: majorityWeek(start, end),
      received: ((row.report_received_et || "").match(/\d{4}-\d{2}-\d{2}/) || [""])[0]
    };
  }

  function buildHistory(robloxRows) {
    const dated = robloxRows
      .filter((row) => row.source === "microsoft_family_safety" && row.period_start && row.period_end)
      .toSorted((a, b) => a.period_start.localeCompare(b.period_start));
    const points = [];
    let prevEnd = "";
    dated.forEach((row) => {
      if (prevEnd && row.period_start > addDays(prevEnd, 3)) {
        points.push({ x: `${addDays(prevEnd, 1)}T12:00:00`, y: null });
      }
      points.push({
        x: `${row.period_start}T12:00:00`,
        y: row.roblox_total_min == null ? null : row.roblox_total_min / 60,
        start: row.period_start,
        end: row.period_end,
        minutes: row.roblox_total_min,
        label: row.week_label || ""
      });
      prevEnd = row.period_end;
    });
    const known = dated.filter((row) => row.roblox_total_min != null);
    const multi = dated.filter((row) => /more than one/i.test(row.notes || ""));
    const peak = known.toSorted((a, b) => b.roblox_total_min - a.roblox_total_min)[0] || null;
    return {
      points,
      known: known.length,
      blank: dated.length - known.length,
      undated: robloxRows.filter((row) => row.source === "microsoft_family_safety" && !row.period_start).length,
      multiLast: multi.length ? multi[multi.length - 1].period_end : "",
      multiCount: multi.length,
      peak,
      first: dated[0] || null,
      last: dated[dated.length - 1] || null
    };
  }

  function friendlyClass(summary, code) {
    const target = normCode(code);
    const hit = (summary.classes || []).find((cls) => normCode(cls.course_code) === target);
    return hit ? hit.class : code;
  }

  function resolveUpdated(text, latestDue) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    const joined = lines.join(" ").trim();
    if (!joined || /^auto$/i.test(joined)) return { iso: latestDue };
    const iso = joined.match(/\d{4}-\d{2}-\d{2}/);
    if (iso && joined.length <= 40) {
      if (latestDue && iso[0] < latestDue) return { iso: latestDue };
      return { iso: iso[0] };
    }
    return { text: joined, iso: latestDue };
  }

  function buildModel(summary, assignmentRows, robloxRows, updatedText) {
    const hiddenNames = (summary.classes || []).filter((cls) => !hasGrade(cls)).map((cls) => cls.class);
    const hidden = new Set(hiddenNames);
    const assignments = assignmentRows.filter((row) => row.class && !hidden.has(row.class));
    const summaryClasses = (summary.classes || []).filter((cls) => hasGrade(cls));
    const termName = latestTermName(summary, summaryClasses);
    const classes = summaryClasses.map((cls, index) => {
      const currentTerm = cls.terms?.[termName]?.term_average?.numeric != null
        ? termName
        : latestTermName(summary, [cls]);
      const prevTerm = previousTermName(summary, cls, currentTerm);
      const currentAvg = cls.terms?.[currentTerm]?.term_average?.numeric ?? null;
      const prevAvg = prevTerm ? cls.terms?.[prevTerm]?.term_average?.numeric ?? null : null;
      return {
        name: cls.class,
        color: PALETTE[index % PALETTE.length],
        course: cls.course_code || "",
        terms: cls.terms || {},
        currentTerm,
        prevTerm,
        currentAvg,
        prevAvg,
        delta: currentAvg != null && prevAvg != null ? currentAvg - prevAvg : null,
        letter: letterOf(currentAvg),
        raw: cls.terms?.[currentTerm]?.term_average?.raw || ""
      };
    });
    const classByName = new Map(classes.map((cls) => [cls.name, cls]));
    const both = classes.filter((cls) => cls.currentAvg != null && cls.prevAvg != null);
    const overallAvg = mean(classes.map((cls) => cls.currentAvg));
    const prevNames = [...new Set(both.map((cls) => cls.prevTerm))];
    const overall = {
      avg: overallAvg,
      letter: letterOf(overallAvg),
      gpa: classes.length ? mean(classes.map((cls) => gpaPoint(cls.currentAvg))) : null,
      delta: both.length ? mean(both.map((cls) => cls.currentAvg)) - mean(both.map((cls) => cls.prevAvg)) : null,
      prevTerm: prevNames.length === 1 ? prevNames[0] : "",
      count: classes.length
    };

    const weightFn = (row) => weightFor(classByName.get(row.class), row.term, row.category);
    const placedAll = [];
    const seenPlacement = new Map();
    robloxRows.forEach((row) => {
      const report = placeReport(row);
      if (!report) return;
      const key = `${report.source}|${report.weekKey}`;
      const prev = seenPlacement.get(key);
      if (!prev) {
        seenPlacement.set(key, report);
        placedAll.push(report);
        return;
      }
      if (prev.unknown && !report.unknown) {
        const index = placedAll.indexOf(prev);
        if (index >= 0) placedAll.splice(index, 1, report);
        seenPlacement.set(key, report);
        return;
      }
      if (!report.unknown && prev.hours != null && report.hours != null && (report.end < prev.start || prev.end < report.start)) {
        prev.hours += report.hours;
        prev.roblox_total_min += report.roblox_total_min;
      } else if (!prev.unknown && (report.received || "") > (prev.received || "")) {
        const index = placedAll.indexOf(prev);
        if (index >= 0) placedAll.splice(index, 1, report);
        seenPlacement.set(key, report);
      }
    });
    const placed = placedAll.filter((report) => isSchoolWeek(report.weekKey));

    const weekKeys = new Set(assignments
      .filter((row) => row.due_date && isSchoolWeek(isoWeek(row.due_date).key))
      .map((row) => isoWeek(row.due_date).key));
    placed.forEach((report) => weekKeys.add(report.weekKey));
    const weekKeyList = spanWeeks(weekKeys);
    const weeks = weekKeyList.map((key) => {
      const monday = mondayOf(key);
      const items = assignments.filter((row) => row.due_date && row.percent != null && isoWeek(row.due_date).key === key);
      const byClass = {};
      const grouped = new Map();
      items.forEach((row) => {
        if (!grouped.has(row.class)) grouped.set(row.class, []);
        grouped.get(row.class).push(row);
      });
      const classScores = [];
      grouped.forEach((list, name) => {
        const avg = weightedAverage(list, weightFn);
        byClass[name] = { avg, n: list.length };
        if (avg != null) classScores.push(avg);
      });
      return {
        key,
        monday,
        label: formatMed(monday),
        title: `Week of ${formatLong(monday)}`,
        overall: mean(classScores),
        overallN: items.length,
        byClass
      };
    });

    const overlap = [];
    weeks.forEach((week) => {
      const windows = placed.filter((report) => report.primary && report.weekKey === week.key && report.hours != null);
      if (!windows.length || week.overall == null) return;
      const emails = placed.filter((report) => !report.primary && report.weekKey === week.key && report.hours != null);
      overlap.push({ week, hours: windows[0].hours, chosen: windows[0], emails });
    });
    const correlationN = overlap.length;
    const correlationR = correlationN >= 4
      ? pearson(overlap.map((item) => item.hours), overlap.map((item) => item.week.overall))
      : null;

    const running = new Map();
    classes.forEach((cls) => {
      const graded = assignments
        .filter((row) => row.class === cls.name && row.percent != null && row.due_date)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.index - b.index);
      const points = [];
      const accum = [];
      let lastDate = "";
      graded.forEach((row) => {
        accum.push(row);
        if (row.due_date === lastDate) {
          points.pop();
        }
        lastDate = row.due_date;
        const y = weightedAverage(accum, weightFn);
        points.push({ x: `${row.due_date}T12:00:00`, y, date: row.due_date, n: accum.length });
      });
      running.set(cls.name, points);
    });

    const dayMap = new Map();
    const byDate = new Map();
    assignments.forEach((row) => {
      if (!row.due_date) return;
      if (!byDate.has(row.due_date)) byDate.set(row.due_date, []);
      byDate.get(row.due_date).push(row);
    });
    byDate.forEach((items, iso) => {
      const graded = items.filter((row) => row.percent != null);
      const grouped = new Map();
      graded.forEach((row) => {
        if (!grouped.has(row.class)) grouped.set(row.class, []);
        grouped.get(row.class).push(row);
      });
      const scores = [];
      grouped.forEach((list) => {
        const score = weightedAverage(list, weightFn);
        if (score != null) scores.push(score);
      });
      dayMap.set(iso, {
        avg: mean(scores),
        n: items.length,
        graded: graded.length,
        low: graded.filter((row) => row.percent < 70).length,
        min: graded.length ? Math.min(...graded.map((row) => row.percent)) : null
      });
    });

    const dated = assignments.map((row) => row.due_date).filter(Boolean).sort();
    const records = summary.attendance?.records || [];
    const groups = [];
    const groupMap = new Map();
    records.forEach((record) => {
      const kind = kindOf(record);
      const excused = excusedOf(record);
      const key = `${record.date}|${kind}|${excused}`;
      if (!groupMap.has(key)) {
        const group = {
          date: record.date,
          kind,
          excused,
          classes: [],
          comments: [],
          title: attendanceTitle(kind, excused)
        };
        groupMap.set(key, group);
        groups.push(group);
      }
      const group = groupMap.get(key);
      group.classes.push(friendlyClass(summary, record.class));
      if (record.comment) group.comments.push(record.comment.trim());
    });
    groups.sort((a, b) => b.date.localeCompare(a.date));

    const events = buildEvents(summary, assignments, groups);
    const latestDue = dated[dated.length - 1] || summary.coverage?.assignment_due_dates?.through || "";

    return {
      summary,
      first: String(summary.student || "Finn").trim().split(/\s+/)[0],
      yearLabel: prettyYear(summary.academic_year),
      termName,
      termNames: summary.terms_available_in_gradebook || [],
      hiddenNames,
      classes,
      classByName,
      overall,
      assignments,
      missing: assignments.filter(isMissing),
      late: assignments.filter((row) => row.flags.includes("late")),
      zeros: assignments.filter((row) => row.flags.includes("zero") || row.percent === 0),
      ungraded: assignments.filter((row) => row.percent == null && !isMissing(row)),
      under70: assignments.filter((row) => row.percent != null && row.percent < 70),
      weeks,
      placed,
      overlap,
      correlationN,
      correlationR,
      history: buildHistory(robloxRows),
      robloxCount: robloxRows.length,
      running,
      dayMap,
      minDue: dated[0] || "",
      maxDue: dated[dated.length - 1] || "",
      attendanceGroups: groups,
      events,
      updated: resolveUpdated(updatedText, latestDue),
      weightFn
    };
  }

  function buildEvents(summary, assignments, groups) {
    const events = [];
    const seenNotes = new Set();
    const summaryNotes = summary.teacher_comments?.gradebook_row_notes || [];
    const rowNotes = assignments.filter((row) => row.teacher_note).map((row) => ({
      class: row.class,
      term: row.term,
      category: row.category,
      assignment: row.assignment_name,
      comment: row.teacher_note
    }));
    [...summaryNotes, ...rowNotes].forEach((note) => {
      const key = `${normName(note.class)}|${normName(note.assignment)}|${normName(note.comment)}`;
      if (seenNotes.has(key)) return;
      seenNotes.add(key);
      const match = matchNote(note, assignments);
      const parts = splitTitle(note.assignment || match?.assignment_name || "Assignment");
      events.push({
        kind: "note",
        date: match?.due_date || "",
        title: parts.title,
        kicker: [note.class, note.category].filter(Boolean).join(" · "),
        comment: note.comment || "",
        detail: parts.detail,
        score: match?.percent,
        color: "#7c3aed"
      });
    });
    (summary.behavior?.records || []).forEach((record) => {
      events.push({
        kind: "behavior",
        date: record.date || "",
        title: record.event || "Behavior note",
        kicker: "Behavior",
        comment: record.comment || "",
        outcome: record.outcome || "",
        demerits: Number(record.demerits) || 0,
        color: "#be123c"
      });
    });
    groups.forEach((group) => {
      events.push({
        kind: "attendance",
        date: group.date,
        title: group.title,
        kicker: "Attendance",
        classes: [...new Set(group.classes)],
        comment: [...new Set(group.comments)].join(" "),
        color: group.kind === "absence" ? "#ea580c" : group.excused === false ? "#c2410c" : "#0284c7"
      });
    });
    events.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    return events;
  }

  function matchNote(note, assignments) {
    const name = normName(note.assignment);
    let same = assignments.filter((row) => row.class === note.class && normName(row.assignment_name) === name);
    if (!same.length) {
      same = assignments.filter((row) => row.class === note.class && (normName(row.assignment_name).includes(name) || name.includes(normName(row.assignment_name))));
    }
    if (same.length <= 1) return same[0] || null;
    const comment = normName(note.comment);
    return same.find((row) => normName(row.teacher_note) === comment) || same[0];
  }

  function buildInsights(model) {
    const cards = [];
    const term = shortTerm(model.termName);
    const ranked = model.classes.filter((cls) => cls.currentAvg != null).toSorted((a, b) => b.currentAvg - a.currentAvg);
    if (ranked.length) {
      const high = ranked[0];
      const low = ranked[ranked.length - 1];
      const paragraphs = [
        `${high.name} is the highest ${term} average at ${fmtGrade(high.currentAvg)} (${high.letter})${changeClause(high)}.`,
        high.name === low.name ? "" : `${low.name} is the lowest at ${fmtGrade(low.currentAvg)} (${low.letter})${changeClause(low)}.`
      ].filter(Boolean);
      const letters = ranked.map((cls) => cls.letter);
      if (letters.every((item) => item === "A")) paragraphs.push(`Every graded class is an A in ${term}.`);
      else if (letters.every((item) => item === "A" || item === "B")) paragraphs.push(`Every graded class is a B or higher in ${term}.`);
      cards.push({ tone: letters.every((item) => item === "A" || item === "B") ? "good" : "watch", kicker: "Classes", title: "Highest and lowest", paragraphs });
    }

    const movers = model.classes.filter((cls) => cls.delta != null).toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (movers.length) {
      const top = movers[0];
      const opposite = movers.find((cls) => Math.sign(cls.delta) !== Math.sign(top.delta) && Math.abs(cls.delta) >= 0.5);
      let up = 0;
      let down = 0;
      let flat = 0;
      model.classes.forEach((cls) => {
        if (cls.delta == null) return;
        const rounded = Math.round(cls.delta * 100) / 100;
        if (Math.abs(rounded) < 0.005) flat += 1;
        else if (rounded > 0) up += 1;
        else down += 1;
      });
      const total = up + down + flat;
      const paragraphs = [
        `${top.name} ${top.delta < 0 ? "dropped" : "rose"} the most, from ${fmtGrade(top.prevAvg)} in ${shortTerm(top.prevTerm)} to ${fmtGrade(top.currentAvg)} in ${shortTerm(top.currentTerm)} (${fmtDelta(top.delta)}).`
      ];
      if (opposite) {
        paragraphs.push(`The largest move the other way is ${opposite.name}, from ${fmtGrade(opposite.prevAvg)} to ${fmtGrade(opposite.currentAvg)} (${fmtDelta(opposite.delta)}).`);
      }
      paragraphs.push(`${down} of ${total} classes are down from the prior term, ${up} ${up === 1 ? "is" : "are"} up${flat ? `, and ${flat} ${flat === 1 ? "is" : "are"} flat` : ""}.`);
      cards.push({ tone: top.delta < -1 ? "watch" : "info", kicker: "Quarters", title: "Biggest change", paragraphs });
    }

    const soft = [];
    model.classes.forEach((cls) => {
      categoryParts(cls, model.termName).forEach((part) => {
        if (part.scored && part.loss != null) soft.push({ cls, part });
      });
    });
    soft.sort((a, b) => b.part.loss - a.part.loss);
    if (soft.length && soft[0].part.loss >= 2.5) {
      const best = soft[0];
      const paragraphs = [
        `${best.cls.name} ${best.part.category.toLowerCase()} averages ${fmtGrade(best.part.category_average)} and is weighted at ${fmtGrade(best.part.weight_percent)}%. That leaves about ${fmtGrade(best.part.loss)} points out of the ${term} grade.`
      ];
      if (best.part.wsum < 99.5) {
        const missing = categoryParts(best.cls, model.termName).filter((part) => !part.scored).map((part) => part.category.toLowerCase());
        if (missing.length) paragraphs.push(`${joinAnd(missing)} ${missing.length === 1 ? "is" : "are"} not scored yet, so the graded weights are stretched to fill the average.`);
      }
      const peers = categoryParts(best.cls, model.termName).filter((part) => part.scored && part.category !== best.part.category);
      const stronger = peers.toSorted((a, b) => b.category_average - a.category_average)[0];
      if (stronger && stronger.category_average - best.part.category_average >= 8) {
        paragraphs.push(`${stronger.category} in the same class ${stronger.category.endsWith("s") ? "are" : "is"} ${fmtGrade(stronger.category_average)}.`);
      }
      cards.push({ tone: "watch", kicker: "Categories", title: "Where points slip", paragraphs });
    }

    const typeBuckets = new Map();
    model.classes.forEach((cls) => {
      categoryParts(cls, model.termName).forEach((part) => {
        if (!part.scored) return;
        if (!typeBuckets.has(part.category)) typeBuckets.set(part.category, []);
        typeBuckets.get(part.category).push(part.category_average);
      });
    });
    const typeStats = [...typeBuckets.entries()]
      .map(([name, values]) => ({ name, n: values.length, avg: mean(values) }))
      .filter((item) => item.n >= 3 && item.avg != null)
      .sort((a, b) => a.avg - b.avg);
    if (typeStats.length >= 2 && typeStats[typeStats.length - 1].avg - typeStats[0].avg >= 4) {
      const low = typeStats[0];
      const high = typeStats[typeStats.length - 1];
      cards.push({
        tone: "info",
        kicker: "Categories",
        title: "Across classes",
        paragraphs: [`In ${term}, ${low.name.toLowerCase()} averages ${fmtGrade(low.avg)} across ${plural(low.n, "class")} and ${high.name.toLowerCase()} averages ${fmtGrade(high.avg)}.`]
      });
    }

    const flagBits = [];
    if (model.missing.length) {
      flagBits.push(model.missing.map((row) => `${row.class} ${splitTitle(row.assignment_name).title} (due ${formatMed(row.due_date)})`).join("; "));
    }
    if (model.late.length) {
      flagBits.push(`${plural(model.late.length, "assignment")} ${model.late.length === 1 ? "was" : "were"} late, in ${joinAnd([...new Set(model.late.map((row) => row.class))])}.`);
    }
    const lateIncomplete = model.late.filter((row) => row.flags.includes("incomplete"));
    if (lateIncomplete.length) flagBits.push(`${lateIncomplete.length} of those late scores ${lateIncomplete.length === 1 ? "is" : "are"} also marked incomplete.`);
    if (model.zeros.length) {
      flagBits.push(`${plural(model.zeros.length, "zero")}: ${model.zeros.map((row) => `${splitTitle(row.assignment_name).title} in ${row.class}`).join("; ")}.`);
    }
    if (flagBits.length) {
      const titleBits = [];
      if (model.missing.length) titleBits.push(plural(model.missing.length, "missing assignment"));
      cards.push({
        tone: "watch",
        kicker: "Flags",
        title: model.missing.length ? plural(model.missing.length, "missing assignment") : "Late work and zeros",
        paragraphs: flagBits,
        action: model.missing.length ? { flag: "missing", label: "Show missing work" } : null
      });
    }

    if (!model.under70.length) {
      cards.push({ tone: "good", kicker: "Scores", title: "Under 70", paragraphs: ["No graded assignment is under 70."] });
    } else {
      const counts = new Map();
      model.under70.forEach((row) => counts.set(row.class, (counts.get(row.class) || 0) + 1));
      const countText = [...counts.entries()].toSorted((a, b) => b[1] - a[1]).map(([name, count]) => `${name} has ${count}`);
      const lowest = [];
      const seen = new Set();
      model.under70.toSorted((a, b) => a.percent - b.percent || a.due_date.localeCompare(b.due_date)).forEach((row) => {
        const key = `${row.class}|${splitTitle(row.assignment_name).title}|${row.percent}`;
        if (seen.has(key) || lowest.length >= 3) return;
        seen.add(key);
        lowest.push(`${fmtGrade(row.percent)} on ${splitTitle(row.assignment_name).title} (${row.class}, ${formatMed(row.due_date)})`);
      });
      cards.push({
        tone: "watch",
        kicker: "Scores",
        title: "Under 70",
        paragraphs: [
          `${plural(model.under70.length, "graded assignment")} ${model.under70.length === 1 ? "is" : "are"} under 70. ${joinAnd(countText)}.`,
          `The lowest ${lowest.length === 1 ? "is" : "are"} ${joinAnd(lowest)}.`
        ],
        action: { flag: "under70", label: "Show scores under 70" }
      });
    }

    const streaks = model.classes.map((cls) => ({ cls, streak: streakInfo(model.assignments.filter((row) => row.class === cls.name)) }))
      .filter((item) => item.streak.best > 0)
      .sort((a, b) => b.streak.best - a.streak.best || b.streak.current - a.streak.current);
    if (streaks.length) {
      const best = streaks[0];
      const paragraphs = [];
      if (best.streak.current === best.streak.best && best.streak.best === best.streak.total) {
        paragraphs.push(`${best.cls.name} is at 90 or above on all ${plural(best.streak.total, "graded assignment")}.`);
      } else {
        const from = best.streak.bestStart ? formatMed(best.streak.bestStart.due_date) : "";
        const to = best.streak.bestEnd ? formatMed(best.streak.bestEnd.due_date) : "";
        paragraphs.push(`${best.cls.name} has the longest run at 90 or above: ${plural(best.streak.best, "graded assignment")} in a row${from ? ` (${from} to ${to})` : ""}.`);
      }
      streaks.filter((item) => item !== best && item.streak.current >= 5).forEach((item) => {
        const all = item.streak.current === item.streak.total;
        paragraphs.push(`${item.cls.name} is on a current run of ${item.streak.current}${all ? ", every graded score so far" : ""}.`);
      });
      if (best.streak.current >= 5 && !(best.streak.current === best.streak.best && best.streak.best === best.streak.total)) {
        paragraphs.push(`That run is still going: ${plural(best.streak.current, "score")} at the end of the list.`);
      }
      cards.push({ tone: "good", kicker: "Streaks", title: "Scores at 90 or above", paragraphs });
    }

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => {
      const values = model.assignments.filter((row) => row.percent != null && row.due_date && weekdayName(row.due_date) === day).map((row) => row.percent);
      return { day, n: values.length, avg: mean(values) };
    }).filter((day) => day.n >= 15 && day.avg != null);
    if (days.length >= 3) {
      const hi = days.toSorted((a, b) => b.avg - a.avg)[0];
      const lo = days.toSorted((a, b) => a.avg - b.avg)[0];
      if (hi.avg - lo.avg >= 4) {
        cards.push({
          tone: "info",
          kicker: "Calendar",
          title: "Due-date pattern",
          paragraphs: [`Work due on ${lo.day} averages ${fmtGrade(lo.avg)} across ${plural(lo.n, "assignment")}. ${hi.day} is the highest weekday at ${fmtGrade(hi.avg)} (${plural(hi.n, "assignment")}). A due date is not the day the work was done, so this can just be which tasks landed where.`]
        });
      }
    }

    const recent = recentForm(model);
    if (recent) cards.push(recent);

    const attendance = summaryAttendanceInsight(model);
    if (attendance) cards.push(attendance);
    const conduct = conductInsight(model);
    if (conduct) cards.push(conduct);
    if (model.ungraded.length) {
      const dates = model.ungraded.map((row) => row.due_date).filter(Boolean).sort();
      const when = dates.length ? ` due from ${formatMed(dates[0])} to ${formatMed(dates[dates.length - 1])}` : "";
      cards.push({
        tone: "note",
        kicker: "Open",
        title: "Not graded yet",
        paragraphs: [`${plural(model.ungraded.length, "assignment")} ${model.ungraded.length === 1 ? "is" : "are"} still ungraded${when}.`],
        action: { flag: "ungraded", label: "Show ungraded work" }
      });
    }
    return cards;
  }

  function changeClause(cls) {
    if (cls.delta == null) return "";
    const rounded = Math.round(cls.delta * 100) / 100;
    if (Math.abs(rounded) < 0.005) return `, flat from ${fmtGrade(cls.prevAvg)} in ${shortTerm(cls.prevTerm)}`;
    const dir = rounded > 0 ? "up" : "down";
    return `, ${dir} ${fmtGrade(Math.abs(rounded))} from ${fmtGrade(cls.prevAvg)} in ${shortTerm(cls.prevTerm)}`;
  }

  function streakInfo(items) {
    const graded = items.filter((row) => row.percent != null && row.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.index - b.index);
    let current = 0;
    let best = 0;
    let currentStart = null;
    let bestStart = null;
    let bestEnd = null;
    graded.forEach((row) => {
      if (row.percent >= 90) {
        if (current === 0) currentStart = row;
        current += 1;
        if (current > best) {
          best = current;
          bestStart = currentStart;
          bestEnd = row;
        }
      } else current = 0;
    });
    let tail = 0;
    for (let i = graded.length - 1; i >= 0; i -= 1) {
      if (graded[i].percent >= 90) tail += 1;
      else break;
    }
    return { best, current: tail, total: graded.length, bestStart, bestEnd };
  }

  function recentForm(model) {
    if (!model.maxDue) return null;
    const start = addDays(model.maxDue, -21);
    const graded = model.assignments.filter((row) => row.percent != null && row.due_date);
    const recent = graded.filter((row) => row.due_date >= start);
    const earlier = graded.filter((row) => row.due_date < start);
    if (recent.length < 12 || earlier.length < 12) return null;
    const recentAvg = mean(recent.map((row) => row.percent));
    const earlierAvg = mean(earlier.map((row) => row.percent));
    const delta = recentAvg - earlierAvg;
    if (Math.abs(delta) < 3) return null;
    return {
      tone: delta < 0 ? "watch" : "good",
      kicker: "Lately",
      title: delta < 0 ? "Recent scores are lower" : "Recent scores are higher",
      paragraphs: [`Since ${formatMed(start)}, the plain average of assignment scores is ${fmtGrade(recentAvg)} (${plural(recent.length, "score")}). Before that it was ${fmtGrade(earlierAvg)}. This is not the weighted gradebook average.`]
    };
  }

  function summaryAttendanceInsight(model) {
    const summary = model.summary.attendance?.summary || {};
    const records = model.summary.attendance?.records || [];
    if (summary.tardies == null && !records.length) return null;
    const tardyRecords = records.filter((record) => kindOf(record) === "tardy");
    const absences = records.filter((record) => kindOf(record) === "absence");
    const excused = tardyRecords.filter((record) => excusedOf(record) === true).length;
    const unexcused = tardyRecords.filter((record) => excusedOf(record) === false).length;
    const mornings = new Set(tardyRecords.map((record) => record.date)).size;
    const tardyTotal = summary.tardies != null ? summary.tardies : tardyRecords.length;
    const absenceTotal = summary.absences != null ? summary.absences : absences.length;
    const paragraphs = [`The portal counts ${plural(tardyTotal, "tardy")} and ${plural(absenceTotal, "absence")}.`];
    if (tardyRecords.length === tardyTotal) {
      paragraphs[0] = `The portal counts ${plural(tardyTotal, "tardy")} (${excused} excused, ${unexcused} unexcused) and ${plural(absenceTotal, "absence")}.`;
    }
    if (mornings && mornings < tardyRecords.length) {
      paragraphs.push(`A check-in can be marked in more than one class, so those tardy marks fall on ${plural(mornings, "morning")}.`);
    }
    if (absences.length) {
      paragraphs.push(absences.map((record) => {
        const when = isISODate(record.date) ? formatLong(record.date) : record.date;
        const tone = excusedOf(record) === false ? "unexcused" : excusedOf(record) === true ? "excused" : "recorded";
        return `The absence on ${when} is ${tone}, in ${friendlyClass(model.summary, record.class)}.`;
      }).join(" "));
    }
    return { tone: unexcused > 0 || absenceTotal > 0 ? "info" : "good", kicker: "Attendance", title: "Tardies and absences", paragraphs };
  }

  function conductInsight(model) {
    const records = model.summary.behavior?.records || [];
    if (!records.length && !model.summary.behavior) return null;
    if (!records.length) return null;
    const paragraphs = records.map((record) => {
      const demerits = Number(record.demerits) || 0;
      const mark = demerits ? plural(demerits, "demerit") : "no demerit";
      const when = isISODate(record.date) ? formatMed(record.date) : record.date;
      return `${when}: ${record.event} (${mark}).`;
    });
    const total = model.summary.behavior?.total_demerits;
    if (total != null) paragraphs.unshift(`${plural(total, "demerit")} in the portal this year.`);
    return { tone: (total || 0) > 0 ? "watch" : "info", kicker: "Conduct", title: "Behavior", paragraphs };
  }

  async function fetchText(url, required) {
    const response = await fetch(url, { priority: "high" });
    if (!response.ok) {
      if (required) throw new Error(`Could not load ${url} (${response.status}).`);
      return "";
    }
    return response.text();
  }

  function configureCharts() {
    if (typeof Chart === "undefined") return false;
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = "#44403c";
    Chart.defaults.animation = reduceMotion() ? false : { duration: 800, easing: "easeOutQuart" };
    Chart.defaults.plugins.tooltip.backgroundColor = "#1c1917";
    Chart.defaults.plugins.tooltip.titleColor = "#fff";
    Chart.defaults.plugins.tooltip.bodyColor = "#f5f5f4";
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    return true;
  }

  function mountChart(canvas, config) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    return new Chart(canvas, config);
  }

  function applyGradeScale(chart, scaleId) {
    const values = [];
    chart.data.datasets.forEach((dataset) => {
      if (dataset.yAxisID && dataset.yAxisID !== scaleId && scaleId !== "y") return;
      if (scaleId === "yGrade" && dataset.yAxisID !== "yGrade") return;
      if (dataset.hidden) return;
      dataset.data.forEach((value) => {
        const y = value != null && typeof value === "object" ? value.y : value;
        if (y != null && Number.isFinite(y)) values.push(y);
      });
    });
    const bounds = gradeBounds(values);
    chart.options.scales[scaleId].min = bounds.min;
    chart.options.scales[scaleId].max = bounds.max;
  }

  function renderAll(model) {
    state.termName = model.termName;
    renderHero(model);
    renderRoblox(model);
    renderHistory(model);
    renderTrends(model);
    renderInsights(model);
    renderCategories(model);
    renderExplorer(model);
    renderTimeline(model);
    renderAttendance(model);
    renderFooter(model);
    setupReveal();
    setupNav();
    document.body.addEventListener("click", (event) => {
      const flagEl = event.target.closest("[data-flag]");
      if (!flagEl) return;
      event.preventDefault();
      applyExplorerFilter(flagEl.getAttribute("data-flag"));
    });
  }

  function renderHero(model) {
    const name = possessive(model.first);
    document.title = `${name} School Year`;
    document.getElementById("page-title").textContent = `${name} School Year`;
    document.getElementById("year-label").textContent = model.yearLabel || "";
    const term = model.termName || "this term";
    document.getElementById("lede").textContent = model.overall.avg == null
      ? "No graded classes are in the file yet."
      : `${model.first} is in ${term}. The unweighted average across ${plural(model.overall.count, "class")} is ${fmtGrade(model.overall.avg)} (${model.overall.letter}).`;
    document.getElementById("range-line").textContent = model.minDue
      ? `Assignments due ${formatLong(model.minDue)} through ${formatLong(model.maxDue)}.`
      : "";

    const comparison = model.overall.prevTerm ? `vs ${shortTerm(model.overall.prevTerm)}` : "vs prior term";
    const missingSub = model.missing.length
      ? model.missing.slice(0, 2).map((row) => `${row.class}`).filter((value, index, list) => list.indexOf(value) === index).join(", ")
      : "Nothing marked missing";
    const tardySummary = model.summary.attendance?.summary?.tardies;
    const tardyRecords = (model.summary.attendance?.records || []).filter((record) => kindOf(record) === "tardy");
    let tardySub = "Portal total";
    if (tardySummary == null || tardyRecords.length === tardySummary) {
      const excused = tardyRecords.filter((record) => excusedOf(record) === true).length;
      const unexcused = tardyRecords.filter((record) => excusedOf(record) === false).length;
      tardySub = `${excused} excused · ${unexcused} unexcused`;
    }
    const gpa = model.overall.gpa == null ? "" : `${fmtGPA(model.overall.gpa)} unweighted GPA · `;
    document.getElementById("kpis").innerHTML = `
      <article class="kpi">
        <p class="kpi-label">Overall average</p>
        <p class="kpi-value"><span class="kpi-letter" style="--grade:${letterColor(model.overall.letter)}">${esc(model.overall.letter)}</span>${esc(fmtGrade(model.overall.avg))}</p>
        <p class="kpi-sub">${gpa}${trendHTML(model.overall.delta, comparison)}</p>
      </article>
      <a class="kpi kpi-link${model.missing.length ? " warn" : ""}" href="#assignments" data-flag="missing">
        <p class="kpi-label">Missing</p>
        <p class="kpi-value">${model.missing.length}</p>
        <p class="kpi-sub">${esc(missingSub)}</p>
      </a>
      <a class="kpi kpi-link" href="#attendance">
        <p class="kpi-label">Tardies</p>
        <p class="kpi-value">${esc(tardySummary ?? tardyRecords.length)}</p>
        <p class="kpi-sub">${esc(tardySub)}</p>
      </a>`;

    document.getElementById("class-cards").innerHTML = model.classes.map((cls) => `
      <article class="class-card" style="--c:${cls.color}">
        <div class="class-top">
          <h3>${esc(cls.name)}</h3>
          <span class="term-pill">${esc(shortTerm(cls.currentTerm))}</span>
        </div>
        <div class="class-score">
          <span class="letter" style="--grade:${letterColor(cls.letter)}">${esc(cls.letter)}</span>
          <span class="numeric" title="${esc(cls.raw)}">${esc(fmtGrade(cls.currentAvg))}</span>
        </div>
        ${trendHTML(cls.delta, cls.prevTerm ? `vs ${shortTerm(cls.prevTerm)}` : "")}
      </article>`).join("");
  }

  function subjectGrade(week, subject) {
    if (subject === "all") {
      return week.overall == null ? null : { avg: week.overall, n: week.overallN };
    }
    const hit = week.byClass[subject];
    if (!hit || hit.avg == null) return null;
    return { avg: hit.avg, n: hit.n };
  }

  function emailReports(model) {
    return model.placed.filter((report) => !report.primary && report.hours != null);
  }

  function correlationFor(model, subject) {
    const overlap = [];
    model.weeks.forEach((week) => {
      const grade = subjectGrade(week, subject);
      const emails = emailReports(model).filter((report) => report.weekKey === week.key);
      if (!grade || !emails.length) return;
      overlap.push({ week, grade, hours: emails[0].hours, chosen: emails[0] });
    });
    const n = overlap.length;
    const r = n >= 4 ? pearson(overlap.map((item) => item.hours), overlap.map((item) => item.grade.avg)) : null;
    return { n, r, overlap };
  }

  function renderRoblox(model) {
    state.robloxSubject = "all";
    document.getElementById("roblox-sub").textContent = "This school year only, August 2026 on. One grade line at a time: all classes, or a single subject. Bars are Roblox parent emails, all devices.";
    document.getElementById("roblox-method").textContent = "Each email is the 7 days ending the day before it arrived, placed on the Monday–Sunday week that contains most of those days. Roblox only sends a report in weeks with play, and the emails start mid-September. A week with no email has no bar, not a zero. Dates are ET.";
    renderRobloxChart(model);
    renderRobloxSelector(model);
    renderRobloxAside(model, "all");
    renderRobloxReports(model);
    renderRobloxTable(model, "all");
    syncRobloxAria(model, "all");
  }

  function renderRobloxChart(model) {
    const box = document.getElementById("roblox-box");
    const canvas = document.getElementById("roblox-chart");
    if (typeof Chart === "undefined") {
      box.dataset.state = "fallback";
      box.insertAdjacentHTML("beforeend", '<p class="fine chart-fallback">Charts could not load. The weekly table below still has the numbers.</p>');
      return;
    }
    const labels = model.weeks.map((week) => week.label);
    const datasets = [];
    const sources = emailReports(model).filter((report, index, list) => list.findIndex((item) => item.source === report.source) === index);
    sources.forEach((source) => {
      datasets.push({
        type: "bar",
        label: "Roblox email",
        data: model.weeks.map((week) => {
          const hit = model.placed.find((report) => report.source === source.source && report.weekKey === week.key);
          return hit && hit.hours != null ? Math.round(hit.hours * 100) / 100 : null;
        }),
        minutes: model.weeks.map((week) => {
          const hit = model.placed.find((report) => report.source === source.source && report.weekKey === week.key);
          return hit && hit.hours != null ? hit.roblox_total_min : null;
        }),
        yAxisID: "yHours",
        backgroundColor: hexAlpha(source.color, 0.8),
        borderRadius: 8,
        maxBarThickness: 26,
        order: 3
      });
    });
    datasets.push({
      type: "line",
      label: "All classes",
      data: model.weeks.map((week) => subjectGrade(week, "all")?.avg ?? null),
      counts: model.weeks.map((week) => subjectGrade(week, "all")?.n || 0),
      yAxisID: "yGrade",
      borderColor: "#1c1917",
      backgroundColor: "#ffffff",
      pointBackgroundColor: "#ffffff",
      pointBorderColor: "#1c1917",
      pointBorderWidth: 2,
      pointRadius: 3.5,
      pointHoverRadius: 6,
      tension: 0.28,
      spanGaps: false,
      borderWidth: 3,
      order: 0
    });
    const bounds = gradeBounds(model.weeks.map((week) => week.overall));
    const hourValues = emailReports(model).map((report) => report.hours);
    const maxHours = Math.max(5, ...hourValues, 0);
    try {
      state.charts.roblox = mountChart(canvas, {
        type: "bar",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items) {
                  const week = model.weeks[items[0].dataIndex];
                  return week ? week.title : "";
                },
                label(context) {
                  const value = context.parsed.y;
                  if (value == null || Number.isNaN(value)) return null;
                  if (context.dataset.yAxisID === "yHours") {
                    const minutes = context.dataset.minutes?.[context.dataIndex];
                    return `${context.dataset.label}: ${minutes != null ? formatMinutes(minutes) : `${fmtGrade(value)} h`}`;
                  }
                  const count = context.dataset.counts?.[context.dataIndex] || 0;
                  const countText = count ? ` · ${plural(count, "assignment")}` : "";
                  return `${context.dataset.label}: ${fmtGrade(value)}${countText}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
              title: { display: true, text: "Week of (ET)", color: "#57534e" }
            },
            yGrade: {
              position: "left",
              min: bounds.min,
              max: bounds.max,
              title: { display: true, text: "Average score", color: "#57534e" },
              grid: { color: "rgba(28,25,23,0.06)" }
            },
            yHours: {
              position: "right",
              beginAtZero: true,
              suggestedMax: Math.ceil(maxHours / 5) * 5 + 5,
              title: { display: true, text: "Roblox hours", color: "#57534e" },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });
      box.dataset.state = "ok";
    } catch (error) {
      box.dataset.state = "error";
      box.dataset.error = error.message;
      box.insertAdjacentHTML("beforeend", `<p class="fine">This chart could not be drawn (${esc(error.message)}).</p>`);
    }
  }

  function renderRobloxSelector(model) {
    const row = document.getElementById("roblox-chips");
    const options = [{ name: "All classes", value: "all", color: "#1c1917" }].concat(
      model.classes.map((cls) => ({ name: cls.name, value: cls.name, color: cls.color }))
    );
    row.innerHTML = options.map((option) => `
      <button type="button" class="chip" data-roblox-class="${esc(option.value)}" aria-pressed="${option.value === "all" ? "true" : "false"}">
        <span class="swatch" style="--c:${option.color}"></span>${esc(option.name)}
      </button>`).join("");
    row.addEventListener("click", (event) => {
      const button = event.target.closest("[data-roblox-class]");
      if (!button || button.dataset.robloxClass === state.robloxSubject) return;
      applyRobloxSubject(button.dataset.robloxClass);
    });
    renderRobloxLegend(model, "all");
  }

  function renderRobloxLegend(model, subject) {
    const cls = model.classes.find((item) => item.name === subject);
    const gradeColor = cls ? cls.color : "#1c1917";
    const gradeLabel = subject === "all" ? "All classes" : subject;
    const bars = `<span><i class="swatch" style="--c:#7c3aed"></i>Roblox email</span>`;
    document.getElementById("roblox-legend").innerHTML = `<span><i class="swatch" style="--c:${gradeColor}"></i>${esc(gradeLabel)}</span>${bars}`;
  }

  function applyRobloxSubject(subject) {
    const model = MODEL;
    state.robloxSubject = subject;
    const cls = model.classes.find((item) => item.name === subject);
    const chart = state.charts.roblox;
    if (chart) {
      const line = chart.data.datasets.find((dataset) => dataset.yAxisID === "yGrade");
      const color = cls ? cls.color : "#1c1917";
      line.label = subject === "all" ? "All classes" : subject;
      line.borderColor = color;
      line.pointBorderColor = color;
      line.data = model.weeks.map((week) => subjectGrade(week, subject)?.avg ?? null);
      line.counts = model.weeks.map((week) => subjectGrade(week, subject)?.n || 0);
      applyGradeScale(chart, "yGrade");
      chart.stop();
      chart.update("none");
    }
    document.querySelectorAll("#roblox-chips [data-roblox-class]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.robloxClass === subject ? "true" : "false");
    });
    renderRobloxLegend(model, subject);
    renderRobloxAside(model, subject);
    renderRobloxTable(model, subject);
    syncRobloxAria(model, subject);
  }

  function syncRobloxAria(model, subject) {
    const stats = correlationFor(model, subject);
    const who = subject === "all" ? "the weekly average across classes" : `${subject}'s weekly average`;
    const canvas = document.getElementById("roblox-chart");
    canvas.dataset.overlap = String(stats.n);
    canvas.dataset.subject = subject;
    document.body.dataset.overlap = String(stats.n);
    document.body.dataset.pearson = stats.r == null ? "" : String(stats.r);
    canvas.setAttribute("aria-label", stats.n < 4
      ? `Roblox email hours and ${who} for this school year. Correlation is hidden because only ${stats.n} of 4 overlapping weeks are available.`
      : `Roblox email hours and ${who} for this school year. Correlation r is ${stats.r.toFixed(2)} across ${stats.n} weeks.`);
  }

  function renderRobloxAside(model, subject) {
    const stats = correlationFor(model, subject || "all");
    const n = stats.n;
    const who = subject === "all" ? "the weekly average across classes" : `${subject}'s weekly average`;
    const paragraphs = [];
    let heading;
    if (n < 4) {
      heading = `Not enough weeks yet: ${n} of 4 needed; the chart fills in as weekly Roblox reports arrive`;
    } else if (stats.r == null) {
      heading = "These weeks do not vary enough to describe a correlation.";
    } else {
      const r = stats.r;
      heading = `r = ${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(2)} · n = ${n} weeks`;
      const mag = Math.abs(r);
      const strength = mag < 0.2 ? "little linear relationship" : mag < 0.4 ? "a weak link" : mag < 0.7 ? "a moderate link" : "a strong link";
      if (mag < 0.2) {
        paragraphs.push(`There is little linear relationship between Roblox email hours and ${who}.`);
      } else {
        const direction = r < 0
          ? `More Roblox hours line up with a lower ${subject === "all" ? "weekly average" : subject + " average"}`
          : `More Roblox hours line up with a higher ${subject === "all" ? "weekly average" : subject + " average"}`;
        paragraphs.push(`${direction} (${strength}).`);
      }
      paragraphs.push("Correlation is not causation, and this is a small sample.");
      paragraphs.push(`r uses only weeks that have both a Roblox email and a grade for ${subject === "all" ? "all classes" : subject}. Weeks with no email are skipped, not counted as zero.`);
    }
    paragraphs.push("Roblox only sends a report in weeks with play, and the emails start mid-September.");
    const meter = n < 4 ? `<div class="meter" role="img" aria-label="${n} of 4 weeks with both a grade and a Roblox email"><span style="width:${Math.max(6, (n / 4) * 100)}%"></span></div>` : "";
    const table = overlapTable(stats, subject || "all");
    document.getElementById("correlation").innerHTML = `
      <h3>${esc(heading)}</h3>
      ${meter}
      ${paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
      ${table}
      <details class="fold"><summary>How correlation is calculated</summary>
        <p class="fine">Pearson r compares ${esc(who)} with Roblox email hours on this school year’s weeks that have both. It runs from −1 to 1. Weeks with no grade for this selection, or no email, are skipped. A missing email is not a zero.</p>
      </details>`;
    document.getElementById("correlation").dataset.overlap = String(n);
  }

  function overlapTable(stats, subject) {
    if (!stats.overlap.length) return "";
    const gradeHeader = subject === "all" ? "All classes" : subject;
    const rows = stats.overlap.map((item) => [
      item.week.title,
      fmtGrade(item.grade.avg),
      formatMinutes(item.chosen.roblox_total_min)
    ]);
    tableSeq += 1;
    const captionId = `table-caption-${tableSeq}`;
    return `<div class="table-wrap" tabindex="0" role="region" aria-labelledby="${captionId}">${tableHTML("School weeks in the correlation", ["Week", gradeHeader, "Roblox hours"], rows, captionId)}</div>`;
  }

  function tableHTML(caption, headers, rows, captionId) {
    const idAttr = captionId ? ` id="${esc(captionId)}"` : "";
    const body = rows.map((row) => `<tr>${row.map((cell, index) => {
      if (index === 0) return `<th scope="row">${esc(cell)}</th>`;
      return `<td>${esc(cell)}</td>`;
    }).join("")}</tr>`).join("");
    return `<table><caption${idAttr} class="sr-only">${esc(caption)}</caption><thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function mountTable(el, caption, headers, rows) {
    tableSeq += 1;
    const captionId = `table-caption-${tableSeq}`;
    el.innerHTML = tableHTML(caption, headers, rows, captionId);
    el.tabIndex = 0;
    el.setAttribute("role", "region");
    el.setAttribute("aria-labelledby", captionId);
  }

  function renderRobloxReports(model) {
    const reports = emailReports(model);
    const sharedCaution = reports.some((report) => /shifted|verified/i.test(report.notes || ""));
    const intro = `<p class="fine" style="grid-column:1/-1">Roblox parent emails for this school year. Each total is all devices for the 7 days ending the day before the email arrived.${sharedCaution ? " Some day-of-week labels in the emails have looked shifted, so the totals here follow the hours column." : ""}</p>`;
    document.getElementById("roblox-reports").innerHTML = intro + reports.map((report) => {
      const caution = !sharedCaution && /shifted|verified/i.test(report.notes || "");
      const note = caution || sharedCaution ? "" : scrubId(report.notes || "");
      const games = String(report.top_games || "").split(";").map((item) => item.trim()).filter(Boolean);
      const period = report.inferred
        ? `7-day total ending ${formatLong(report.end)}`
        : `${formatLong(report.start)} – ${formatLong(report.end)}`;
      const extra = !caution && report.roblox_daily_avg_min != null
        ? `<p class="fine">Daily average ${esc(formatMinutes(report.roblox_daily_avg_min))}${report.roblox_max_day_min != null ? ` · busiest day ${esc(formatMinutes(report.roblox_max_day_min))}` : ""}</p>`
        : "";
      const peak = !caution && report.peak_days ? `<p class="fine">Busiest days: ${esc(report.peak_days)}</p>` : "";
      return `<article class="report">
        <p class="meta">${esc(report.name)}</p>
        <p><span class="scope-pill${report.rank === 1 ? " pc" : ""}">${esc(report.scope)}</span></p>
        <p class="hours">${esc(formatMinutes(report.roblox_total_min))}</p>
        <p>${esc(period)}</p>
        ${report.report_received_et ? `<p class="fine">Report arrived ${esc(report.report_received_et)}</p>` : ""}
        ${extra}
        ${peak}
        ${games.length ? `<div class="games">${games.map((game) => `<span>${esc(scrubId(game))}</span>`).join("")}</div>` : ""}
        ${note ? `<p class="fine">${esc(note)}</p>` : ""}
        ${caution ? '<p class="fine">The source note says the email labels may be shifted. The total above follows the hours column.</p>' : ""}
      </article>`;
    }).join("");
  }

  function renderRobloxTable(model, subject) {
    const gradeHeader = subject === "all" ? "All classes" : subject;
    const headers = ["Week", gradeHeader, "Assignments", "Roblox hours"];
    const rows = model.weeks.map((week) => {
      const grade = subjectGrade(week, subject);
      const hit = emailReports(model).find((report) => report.weekKey === week.key);
      return [
        week.title,
        grade ? fmtGrade(grade.avg) : "—",
        grade ? String(grade.n) : "0",
        hit ? formatMinutes(hit.roblox_total_min) : "—"
      ];
    });
    const host = document.getElementById("roblox-table");
    if (!rows.length) {
      host.replaceChildren();
      const empty = document.createElement("p");
      empty.textContent = "No dated assignments yet.";
      host.append(empty);
      host.removeAttribute("role");
      host.removeAttribute("aria-labelledby");
      host.removeAttribute("tabindex");
      return;
    }
    mountTable(host, `Weekly ${gradeHeader} average and Roblox hours`, headers, rows);
  }

  function uniqueSources(model) {
    const sources = [];
    model.placed.forEach((report) => {
      if (!sources.some((item) => item.source === report.source)) sources.push(report);
    });
    sources.sort((a, b) => Number(b.primary) - Number(a.primary));
    return sources;
  }

  function renderHistory(model) {
    const history = model.history;
    const sub = document.getElementById("history-sub");
    const note = document.getElementById("history-note");
    if (!history || !history.first) {
      sub.textContent = "No dated Windows reports yet.";
      return;
    }
    sub.textContent = `Family Safety on the Windows PC, from ${formatLong(history.first.period_start)} through ${formatLong(history.last.period_end)}. Gaps are weeks with no report, or weeks where Roblox was not in the top apps.`;
    const bits = [`${plural(history.known, "week")} have a Roblox total and ${plural(history.blank, "week")} are blank, which is not the same as zero.`];
    if (history.undated) bits.push(`${plural(history.undated, "no-activity email")} had no dates, so ${history.undated === 1 ? "it is" : "they are"} not plotted.`);
    if (history.multiCount) bits.push(`Through ${formatLong(history.multiLast)}, some totals add more than one Windows PC. Later notes say Windows PC only.`);
    if (history.peak) bits.push(`The highest week on file is ${history.peak.week_label || formatMed(history.peak.period_start)} at ${formatMinutes(history.peak.roblox_total_min)}.`);
    bits.push("The shaded band is the 2026–27 school year.");
    note.textContent = bits.join(" ");
    const box = document.getElementById("history-box");
    const canvas = document.getElementById("history-chart");
    canvas.setAttribute("aria-label", `Windows PC Roblox hours from ${formatLong(history.first.period_start)} to ${formatLong(history.last.period_end)}. Blank stretches mean the hours are unknown.`);
    if (typeof Chart === "undefined") {
      box.dataset.state = "fallback";
      box.insertAdjacentHTML("beforeend", '<p class="fine">This chart could not load.</p>');
      return;
    }
    const hours = history.points.map((point) => point.y).filter((value) => value != null);
    try {
      state.charts.history = mountChart(canvas, {
        type: "line",
        data: {
          datasets: [{
            label: "Windows PC (Family Safety)",
            data: history.points,
            spanGaps: false,
            borderColor: "#ea580c",
            backgroundColor: "#ea580c",
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            tension: 0.12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items) {
                  const raw = items[0].raw || {};
                  if (!raw.start) return "";
                  return raw.label || `${formatMed(raw.start)} – ${formatMed(raw.end)}`;
                },
                label(context) {
                  const raw = context.raw || {};
                  if (raw.y == null) return "Not in the top apps";
                  return `Windows PC: ${formatMinutes(raw.minutes)}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "time",
              time: { unit: "year", tooltipFormat: "MMM d, yyyy", displayFormats: { year: "yyyy", month: "MMM yyyy" } },
              title: { display: true, text: "Week starting (ET)", color: "#57534e" },
              ticks: { maxRotation: 0 }
            },
            y: {
              beginAtZero: true,
              suggestedMax: Math.ceil((Math.max(...hours, 5) + 5) / 10) * 10,
              title: { display: true, text: "Roblox hours", color: "#57534e" },
              grid: { color: "rgba(28,25,23,0.06)" }
            }
          }
        },
        plugins: [{
          id: "schoolBand",
          beforeDatasetsDraw(chart) {
            const scale = chart.scales.x;
            const area = chart.chartArea;
            if (!scale || !area) return;
            const start = scale.getPixelForValue(new Date("2026-08-01T12:00:00"));
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = "rgba(124, 58, 237, 0.10)";
            ctx.fillRect(Math.max(start, area.left), area.top, area.right - Math.max(start, area.left), area.bottom - area.top);
            ctx.restore();
          }
        }]
      });
      box.dataset.state = "ok";
    } catch (error) {
      box.dataset.state = "error";
      box.dataset.error = error.message;
      box.insertAdjacentHTML("beforeend", `<p class="fine">This chart could not be drawn (${esc(error.message)}).</p>`);
    }
  }

  function renderTrends(model) {
    document.getElementById("trends-sub").textContent = "Each line is that class’s year-to-date average, using category weights, after every due date. It will not match the quarter card exactly, because each quarter is averaged on its own.";
    const chips = ['<button type="button" class="chip" id="trend-all">Show all</button>'];
    model.classes.forEach((cls) => {
      chips.push(`<button type="button" class="chip" data-series="${esc(cls.name)}" aria-pressed="true"><span class="swatch" style="--c:${cls.color}"></span>${esc(cls.name)}</button>`);
    });
    const chipRow = document.getElementById("trend-chips");
    chipRow.innerHTML = chips.join("");
    renderTrendChart(model);
    renderSparks(model);
    renderTrendTable(model);
    chipRow.addEventListener("click", (event) => {
      const chart = state.charts.trend;
      if (!chart) return;
      if (event.target.closest("#trend-all")) {
        chart.data.datasets.forEach((dataset) => { dataset.hidden = false; });
        syncTrendUI();
        return;
      }
      const button = event.target.closest("[data-series]");
      if (!button) return;
      const dataset = chart.data.datasets.find((item) => item.label === button.dataset.series);
      if (!dataset) return;
      dataset.hidden = !dataset.hidden;
      if (chart.data.datasets.every((item) => item.hidden)) {
        chart.data.datasets.forEach((item) => { item.hidden = false; });
      }
      syncTrendUI();
    });
    document.getElementById("sparks").addEventListener("click", (event) => {
      const card = event.target.closest(".spark-card");
      if (!card || !state.charts.trend) return;
      focusClass(card.dataset.series);
    });
  }

  function renderTrendChart(model) {
    const box = document.getElementById("trend-box");
    const canvas = document.getElementById("trend-chart");
    if (typeof Chart === "undefined") {
      box.dataset.state = "fallback";
      box.insertAdjacentHTML("beforeend", '<p class="fine">Charts could not load. The class cards still show the official averages.</p>');
      return;
    }
    const dates = model.assignments.map((row) => row.due_date).filter(Boolean).toSorted();
    const datasets = model.classes.map((cls) => ({
      label: cls.name,
      data: model.running.get(cls.name) || [],
      borderColor: cls.color,
      backgroundColor: cls.color,
      tension: 0.25,
      spanGaps: true,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2.5
    }));
    const values = datasets.flatMap((dataset) => dataset.data.map((point) => point.y));
    const bounds = gradeBounds(values);
    const options = {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const raw = context.raw || {};
                return `${context.dataset.label}: ${fmtGrade(raw.y)} after ${plural(raw.n || 0, "graded assignment")}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: "time",
            min: dates[0] ? `${dates[0]}T00:00:00` : undefined,
            max: dates[dates.length - 1] ? `${dates[dates.length - 1]}T23:59:59` : undefined,
            time: {
              unit: "week",
              tooltipFormat: "MMM d, yyyy",
              displayFormats: { week: "MMM d", day: "MMM d", month: "MMM" }
            },
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            title: { display: true, text: "Due date (ET)", color: "#57534e" },
            grid: { color: "rgba(28,25,23,0.06)" }
          },
          y: {
            min: bounds.min,
            max: bounds.max,
            title: { display: true, text: "Year-to-date average", color: "#57534e" },
            grid: { color: "rgba(28,25,23,0.06)" }
          }
        }
      }
    };
    try {
      state.charts.trend = mountChart(canvas, options);
      box.dataset.state = "ok";
      canvas.setAttribute("aria-label", "Year-to-date category-weighted average by due date for each class.");
    } catch (error) {
      box.dataset.state = "error";
      box.dataset.error = error.message;
      try {
        options.options.scales.x = {
          type: "category",
          title: { display: true, text: "Due date (ET)", color: "#57534e" }
        };
        datasets.forEach((dataset) => {
          dataset.data = (model.running.get(dataset.label) || []).map((point) => point.y);
        });
        options.data.labels = model.running.get(model.classes[0]?.name)?.map((point) => formatMed(point.date)) || [];
        state.charts.trend = mountChart(canvas, options);
        box.dataset.state = "fallback";
      } catch (second) {
        box.insertAdjacentHTML("beforeend", `<p class="fine">This chart could not be drawn (${esc(second.message)}).</p>`);
      }
    }
  }

  function syncTrendUI() {
    const chart = state.charts.trend;
    if (!chart) return;
    document.querySelectorAll("#trend-chips [data-series]").forEach((button) => {
      const dataset = chart.data.datasets.find((item) => item.label === button.dataset.series);
      button.setAttribute("aria-pressed", dataset && !dataset.hidden ? "true" : "false");
    });
    document.querySelectorAll(".spark-card").forEach((button) => {
      const dataset = chart.data.datasets.find((item) => item.label === button.dataset.series);
      button.setAttribute("aria-pressed", dataset && !dataset.hidden ? "true" : "false");
    });
    applyGradeScale(chart, "y");
    chart.update();
  }

  function focusClass(name) {
    const chart = state.charts.trend;
    const visible = chart.data.datasets.filter((dataset) => !dataset.hidden).map((dataset) => dataset.label);
    const solo = visible.length === 1 && visible[0] === name;
    chart.data.datasets.forEach((dataset) => {
      dataset.hidden = solo ? false : dataset.label !== name;
    });
    syncTrendUI();
    if (!solo) document.getElementById("trend-box").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
  }

  function sparkSVG(points, color) {
    if (!points.length) return "";
    const ys = points.map((point) => point.y).filter((value) => value != null);
    if (!ys.length) return "";
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (max - min < 4) {
      min -= 2;
      max += 2;
    } else {
      const pad = (max - min) * 0.18;
      min -= pad;
      max += pad;
    }
    const width = 160;
    const height = 48;
    const coords = points.map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 4) + 2;
      const y = height - ((point.y - min) / (max - min)) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const last = coords[coords.length - 1].split(",");
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(" ")}"></polyline>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.8" fill="${color}"></circle>
    </svg>`;
  }

  function renderSparks(model) {
    document.getElementById("sparks").innerHTML = model.classes.map((cls) => {
      const points = model.running.get(cls.name) || [];
      const end = points.length ? points[points.length - 1] : null;
      return `<button type="button" class="spark-card" style="--c:${cls.color}" data-series="${esc(cls.name)}" aria-pressed="true">
        <div class="spark-top"><h3>${esc(cls.name)}</h3><span class="letter" style="--grade:${letterColor(cls.letter)};font-size:1.8rem">${esc(cls.letter)}</span></div>
        <p><strong>${esc(fmtGrade(cls.currentAvg))}</strong> ${esc(shortTerm(cls.currentTerm))} ${trendHTML(cls.delta, cls.prevTerm ? `vs ${shortTerm(cls.prevTerm)}` : "")}</p>
        ${sparkSVG(points, cls.color)}
        <p class="fine">${end ? `Year-to-date line ends at ${esc(fmtGrade(end.y))} · ${plural(end.n, "graded assignment")}` : "No graded assignments yet."}</p>
      </button>`;
    }).join("");
  }

  function renderTrendTable(model) {
    const rows = model.classes.map((cls) => {
      const points = model.running.get(cls.name) || [];
      const end = points.length ? fmtGrade(points[points.length - 1].y) : "—";
      const ys = points.map((point) => point.y);
      return [
        cls.name,
        cls.prevTerm ? `${shortTerm(cls.prevTerm)} ${fmtGrade(cls.prevAvg)}` : "—",
        `${shortTerm(cls.currentTerm)} ${fmtGrade(cls.currentAvg)}`,
        fmtDelta(cls.delta) || "—",
        end,
        ys.length ? fmtGrade(Math.min(...ys)) : "—",
        ys.length ? fmtGrade(Math.max(...ys)) : "—"
      ];
    });
    mountTable(
      document.getElementById("trend-table"),
      "Official term averages and year-to-date lines",
      ["Class", "Prior term", "Current", "Change", "Line ends", "Lowest line", "Highest line"],
      rows
    );
  }

  function renderInsights(model) {
    const cards = buildInsights(model);
    document.getElementById("insight-grid").innerHTML = cards.map((card) => {
      const action = card.action
        ? `<p><button type="button" class="linkish" data-flag="${esc(card.action.flag)}">${esc(card.action.label)}</button></p>`
        : "";
      return `<article class="insight ${card.tone}"><p class="kicker-inline">${esc(card.kicker)}</p><h3>${esc(card.title)}</h3>${card.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}${action}</article>`;
    }).join("");
  }

  function renderCategories(model) {
    const toolbar = document.getElementById("cat-toolbar");
    const terms = model.termNames.filter((term) => model.classes.some((cls) => cls.terms?.[term]?.term_average?.numeric != null));
    toolbar.innerHTML = `
      <div class="seg" role="group" aria-label="Term">${terms.map((term) => `<button type="button" data-term="${esc(term)}" aria-pressed="${term === state.termName}" aria-label="${esc(term)}">${esc(shortTerm(term))}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Chart style">
        <button type="button" data-view="bars" aria-pressed="${state.catView === "bars"}">Stacked bars</button>
        <button type="button" data-view="radar" aria-pressed="${state.catView === "radar"}">Radar</button>
      </div>`;
    toolbar.addEventListener("click", (event) => {
      const termButton = event.target.closest("[data-term]");
      const viewButton = event.target.closest("[data-view]");
      if (termButton) state.termName = termButton.dataset.term;
      if (viewButton) state.catView = viewButton.dataset.view;
      if (!termButton && !viewButton) return;
      toolbar.querySelectorAll("[data-term]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.term === state.termName ? "true" : "false"));
      toolbar.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.view === state.catView ? "true" : "false"));
      renderCategoryBody();
    });
    renderCategoryBody();
  }

  function renderCategoryBody() {
    const model = MODEL;
    const term = state.termName;
    const rows = model.classes
      .filter((cls) => cls.terms?.[term]?.term_average?.numeric != null)
      .toSorted((a, b) => a.terms[term].term_average.numeric - b.terms[term].term_average.numeric);
    const lead = categoryLead(rows, term);
    document.getElementById("cat-lead").textContent = lead;
    document.getElementById("cat-note").textContent = state.catView === "bars"
      ? "Colored pieces are each category’s weight times its average, with empty categories left out and the remaining weights stretched. Gray is the distance from that average to 100."
      : "The radar compares classes that have a score in every shared category. Classes with a missing category are listed under the chart and still appear in the cards.";
    if (state.catView === "radar") renderRadar(rows, term);
    else renderStacked(rows, term);
    renderCategoryCards(model.classes, term);
  }

  function categoryLead(rows, term) {
    const losses = [];
    rows.forEach((cls) => {
      categoryParts(cls, term).forEach((part) => {
        if (part.scored && part.loss != null) losses.push({ cls, part });
      });
    });
    losses.sort((a, b) => b.part.loss - a.part.loss);
    if (!losses.length) return `Category weights for ${term}.`;
    const top = losses[0];
    return `${top.cls.name} ${top.part.category.toLowerCase()} is the widest gap in ${shortTerm(term)}: average ${fmtGrade(top.part.category_average)} at ${fmtGrade(top.part.weight_percent)}% of the grade, about ${fmtGrade(top.part.loss)} points below 100.`;
  }

  function renderStacked(rows, term) {
    const box = document.getElementById("cat-box");
    const canvas = document.getElementById("cat-chart");
    box.style.height = `${Math.max(320, rows.length * 56 + 80)}px`;
    if (typeof Chart === "undefined") {
      box.dataset.state = "fallback";
      return;
    }
    const names = [];
    rows.forEach((cls) => {
      categoryParts(cls, term).forEach((part) => {
        if (part.scored && !names.includes(part.category)) names.push(part.category);
      });
    });
    const labels = rows.map((cls) => `${cls.name} · ${fmtGrade(cls.terms[term].term_average.numeric)}`);
    const datasets = names.map((name) => ({
      label: name,
      data: rows.map((cls) => {
        const part = categoryParts(cls, term).find((item) => item.category === name);
        return part && part.scored ? Math.round(part.contribution * 100) / 100 : null;
      }),
      partMeta: rows.map((cls) => categoryParts(cls, term).find((item) => item.category === name) || null),
      backgroundColor: catColor(name),
      stack: "grade",
      borderWidth: 0
    }));
    const gaps = rows.map((cls) => {
      const parts = categoryParts(cls, term).filter((part) => part.scored);
      const total = parts.reduce((sum, part) => sum + part.contribution, 0);
      return Math.max(0, Math.round((100 - total) * 100) / 100);
    });
    datasets.push({
      label: "Room to 100",
      data: gaps,
      isGap: true,
      backgroundColor: catColor("Room to 100"),
      stack: "grade",
      borderWidth: 0
    });
    const maxStack = Math.max(100, ...rows.map((cls, index) => {
      const parts = categoryParts(cls, term).filter((part) => part.scored);
      return parts.reduce((sum, part) => sum + part.contribution, 0) + (gaps[index] || 0);
    }));
    try {
      state.charts.category = mountChart(canvas, {
        type: "bar",
        data: { labels, datasets },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label(context) {
                  if (context.dataset.isGap) return `Room to 100: ${fmtGrade(context.parsed.x)} points`;
                  const meta = context.dataset.partMeta?.[context.dataIndex];
                  if (!meta || !meta.scored) return null;
                  return `${context.dataset.label}: average ${fmtGrade(meta.category_average)}, weight ${fmtGrade(meta.weight_percent)}%, adds ${fmtGrade(meta.contribution)} points`;
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              min: 0,
              max: Math.ceil(maxStack),
              title: { display: true, text: "Points in the term average", color: "#57534e" },
              grid: { color: "rgba(28,25,23,0.06)" }
            },
            y: { stacked: true, reverse: true, grid: { display: false } }
          }
        }
      });
      box.dataset.state = "ok";
      canvas.setAttribute("aria-label", `Stacked bars of category contributions for ${term}.`);
    } catch (error) {
      box.dataset.state = "error";
      box.dataset.error = error.message;
    }
  }

  function renderRadar(rows, term) {
    const box = document.getElementById("cat-box");
    const canvas = document.getElementById("cat-chart");
    box.style.height = "480px";
    if (typeof Chart === "undefined") {
      box.dataset.state = "fallback";
      return;
    }
    const counts = new Map();
    rows.forEach((cls) => {
      categoryParts(cls, term).forEach((part) => {
        if (part.scored) counts.set(part.category, (counts.get(part.category) || 0) + 1);
      });
    });
    const axes = [...counts.entries()].filter((entry) => entry[1] >= 3).map((entry) => entry[0]);
    const included = rows.filter((cls) => axes.every((axis) => {
      const part = categoryParts(cls, term).find((item) => item.category === axis);
      return part && part.scored;
    }));
    const leftOff = rows.filter((cls) => !included.includes(cls)).map((cls) => cls.name);
    if (leftOff.length) {
      document.getElementById("cat-note").textContent += ` Left off this radar: ${leftOff.join(", ")}.`;
    }
    const values = [];
    const datasets = included.map((cls) => {
      const data = axes.map((axis) => {
        const part = categoryParts(cls, term).find((item) => item.category === axis);
        values.push(part.category_average);
        return part.category_average;
      });
      return {
        label: cls.name,
        data,
        borderColor: cls.color,
        backgroundColor: hexAlpha(cls.color, 0.16),
        pointBackgroundColor: cls.color,
        borderWidth: 2
      };
    });
    const bounds = gradeBounds(values);
    try {
      state.charts.category = mountChart(canvas, {
        type: "radar",
        data: { labels: axes, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            r: {
              min: Math.min(bounds.min, 70),
              max: Math.max(bounds.max, 100),
              ticks: { stepSize: 10, backdropColor: "transparent", color: "#57534e" },
              pointLabels: { color: "#1c1917", font: { size: 12, weight: 600 } },
              grid: { color: "rgba(28,25,23,0.12)" },
              angleLines: { color: "rgba(28,25,23,0.12)" }
            }
          }
        }
      });
      box.dataset.state = "ok";
      canvas.setAttribute("aria-label", `Radar of category averages for ${term}.`);
    } catch (error) {
      box.dataset.state = "error";
      box.dataset.error = error.message;
    }
  }

  function renderCategoryCards(classes, term) {
    document.getElementById("cat-cards").innerHTML = classes.map((cls) => {
      const avg = cls.terms?.[term]?.term_average?.numeric;
      if (avg == null) return "";
      const prevName = previousTermName(MODEL.summary, { terms: cls.terms }, term);
      const prev = prevName ? cls.terms?.[prevName]?.term_average?.numeric : null;
      const delta = prev != null ? avg - prev : null;
      const parts = categoryParts(cls, term);
      const lines = parts.map((part) => {
        if (!part.scored) {
          return `<p class="unscored">${esc(part.category)} · ${esc(fmtGrade(part.weight_percent))}% weight · no score yet</p>`;
        }
        const width = Math.max(0, Math.min(100, part.category_average));
        const loss = part.loss > 0.4
          ? `Leaves ${fmtGrade(part.loss)} points on the table`
          : part.loss < -0.4
            ? `Adds ${fmtGrade(Math.abs(part.loss))} points above the weight`
            : "Holding at a full score";
        return `<div class="cat-line">
          <div class="cat-row"><span>${esc(part.category)}</span><span>${esc(fmtGrade(part.weight_percent))}% · avg ${esc(fmtGrade(part.category_average))}</span></div>
          <div class="track" aria-hidden="true"><span style="width:${width}%;background:${catColor(part.category)}"></span></div>
          <p class="loss">${esc(loss)}</p>
        </div>`;
      }).join("");
      return `<article class="cat-card" style="--c:${cls.color}">
        <div class="cat-head"><h3><span class="dot"></span>${esc(cls.name)}</h3><span class="letter" style="--grade:${letterColor(letterOf(avg))};font-size:1.6rem">${esc(letterOf(avg))}</span></div>
        <p><strong>${esc(fmtGrade(avg))}</strong> ${esc(shortTerm(term))} ${trendHTML(delta, prevName ? `vs ${shortTerm(prevName)}` : "")}</p>
        ${lines}
      </article>`;
    }).join("");
  }

  function renderExplorer(model) {
    const count = model.assignments.length;
    document.getElementById("assign-sub").textContent = count
      ? `${plural(count, "assignment")} from ${formatLong(model.minDue)} to ${formatLong(model.maxDue)}. Open a row for the description and any teacher note.`
      : "No assignments in the file.";
    document.getElementById("assign-scale").innerHTML = scoreScale();
    fillSelect("f-class", model.classes.map((cls) => cls.name), "All classes");
    const terms = model.termNames.filter((term) => model.assignments.some((row) => row.term === term));
    fillSelect("f-term", terms, "All terms");
    const preferred = ["Daily Work", "Quizzes", "Tests", "Weekly"];
    const present = [...new Set(model.assignments.map((row) => row.category))];
    const categories = [...preferred.filter((item) => present.includes(item)), ...present.filter((item) => !preferred.includes(item)).toSorted()];
    fillSelect("f-cat", categories, "All categories");
    document.getElementById("heat").innerHTML = calendarHTML(model, "grades");
    document.getElementById("heat").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-date]");
      if (!button) return;
      state.date = state.date === button.dataset.date ? "" : button.dataset.date;
      state.show = 40;
      syncHeatSelection();
      renderAssignList();
    });
    ["f-class", "f-term", "f-cat", "f-flag", "f-sort"].forEach((id) => {
      document.getElementById(id).addEventListener("change", (event) => {
        const map = { "f-class": "className", "f-term": "term", "f-cat": "category", "f-flag": "flag", "f-sort": "sort" };
        state[map[id]] = event.target.value;
        state.show = 40;
        renderAssignList();
      });
    });
    document.getElementById("q").addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      state.show = 40;
      renderAssignList();
    });
    document.getElementById("assign-count").addEventListener("click", (event) => {
      if (!event.target.closest("#clear-date")) return;
      state.date = "";
      syncHeatSelection();
      renderAssignList();
    });
    document.getElementById("assign-list").addEventListener("click", (event) => {
      if (event.target.closest("#show-more")) {
        state.show += 40;
        renderAssignList();
        document.getElementById("show-more")?.focus();
        return;
      }
      const button = event.target.closest(".assign-main");
      if (!button) return;
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      if (panel) panel.hidden = open;
      if (open) state.expanded.delete(button.dataset.key);
      else state.expanded.add(button.dataset.key);
    });
    renderAssignList();
  }

  function fillSelect(id, values, allLabel) {
    const select = document.getElementById(id);
    select.innerHTML = `<option value="all">${esc(allLabel)}</option>${values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
  }

  function scoreScale() {
    return [
      ["#bbf7d0", "93+"],
      ["#d9f99d", "85–92"],
      ["#fde68a", "75–84"],
      ["#fed7aa", "65–74"],
      ["#fecdd3", "Under 65"],
      ["#e7e5e4", "Not graded"]
    ].map(([color, label]) => `<span><i style="background:${color}"></i>${label}</span>`).join("");
  }

  function calendarHTML(model, mode) {
    if (!model.minDue || !model.maxDue) return "";
    const [y1, m1] = model.minDue.split("-").map(Number);
    const [y2, m2] = model.maxDue.split("-").map(Number);
    const months = [];
    let year = y1;
    let month = m1;
    while (year < y2 || (year === y2 && month <= m2)) {
      months.push({ year, month });
      month += 1;
      if (month === 13) {
        month = 1;
        year += 1;
      }
    }
    return `<div class="months">${months.map((item) => monthHTML(model, item.year, item.month, mode)).join("")}</div>`;
  }

  function monthHTML(model, year, month, mode) {
    const first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells = Array.from({ length: first }, () => "<td></td>");
    for (let day = 1; day <= days; day += 1) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (mode === "grades") cells.push(gradeCell(model, iso, day));
      else cells.push(attendanceCell(model, iso, day));
    }
    while (cells.length % 7) cells.push("<td></td>");
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    const heads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<th scope="col">${day}</th>`).join("");
    return `<div class="month"><h3>${MONTHS[month - 1]} ${year}</h3><table class="cal"><caption class="sr-only">${MONTHS[month - 1]} ${year}</caption><thead><tr>${heads}</tr></thead><tbody>${weeks.join("")}</tbody></table></div>`;
  }

  function gradeCell(model, iso, day) {
    const stats = model.dayMap.get(iso);
    if (!stats) return `<td><span class="empty"><span class="d">${day}</span></span></td>`;
    const label = stats.avg == null ? "not graded" : `average ${fmtGrade(stats.avg)} percent`;
    const low = stats.low ? `, lowest ${fmtGrade(stats.min)}` : "";
    const pressed = state.date === iso;
    return `<td><button type="button" data-date="${iso}" class="${stats.low ? "has-low" : ""}${pressed ? " selected" : ""}" style="background:${bucketColor(stats.avg)}" aria-pressed="${pressed}" aria-label="${formatLong(iso)}, ${label}${low}, ${plural(stats.n, "assignment")}"><span class="d">${day}</span><span class="p">${stats.avg == null ? "·" : fmtGrade(stats.avg)}</span></button></td>`;
  }

  function attendanceCell(model, iso, day) {
    const weekend = weekdayMondayIndex(iso) >= 5;
    const groups = model.attendanceGroups.filter((group) => group.date === iso);
    if (!groups.length) {
      return `<td><span class="empty"><span class="d"${weekend ? ' style="opacity:.35"' : ""}>${day}</span></span></td>`;
    }
    const absence = groups.some((group) => group.kind === "absence");
    const unexcused = groups.some((group) => group.kind === "tardy" && group.excused === false);
    const color = absence ? "#fecdd3" : unexcused ? "#fed7aa" : "#bae6fd";
    const mark = absence ? "A" : "T";
    const label = groups.map((group) => `${group.title} in ${joinAnd([...new Set(group.classes)])}`).join("; ");
    const pressed = state.attDate === iso;
    return `<td><button type="button" data-date="${iso}" class="${pressed ? "selected" : ""}" style="background:${color}" aria-pressed="${pressed}" aria-label="${formatLong(iso)}, ${esc(label)}"><span class="d">${day}</span><span class="p">${mark}</span></button></td>`;
  }

  function syncHeatSelection() {
    document.querySelectorAll("#heat button[data-date]").forEach((button) => {
      const on = button.dataset.date === state.date;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function filteredAssignments() {
    const query = state.search.toLowerCase().split(/\s+/).filter(Boolean);
    return MODEL.assignments.filter((row) => {
      if (state.className !== "all" && row.class !== state.className) return false;
      if (state.term !== "all" && row.term !== state.term) return false;
      if (state.category !== "all" && row.category !== state.category) return false;
      if (state.date && row.due_date !== state.date) return false;
      if (!matchesFlag(row, state.flag)) return false;
      if (!query.length) return true;
      const hay = [row.class, row.term, row.category, row.assignment_name, row.teacher_note, row.status, row.flags.join(" ")].join(" ").toLowerCase();
      return query.every((word) => hay.includes(word));
    });
  }

  function matchesFlag(row, flag) {
    if (flag === "all") return true;
    if (flag === "missing") return isMissing(row);
    if (flag === "late") return row.flags.includes("late");
    if (flag === "incomplete") return row.flags.includes("incomplete");
    if (flag === "zero") return row.flags.includes("zero") || row.percent === 0;
    if (flag === "under70") return row.percent != null && row.percent < 70;
    if (flag === "ungraded") return row.percent == null && !isMissing(row);
    if (flag === "noted") return Boolean(row.teacher_note);
    return true;
  }

  function sortAssignments(list) {
    return list.toSorted((a, b) => {
      if (state.sort === "oldest") return a.due_date.localeCompare(b.due_date) || a.index - b.index;
      if (state.sort === "low") return (a.percent ?? 9999) - (b.percent ?? 9999) || a.index - b.index;
      if (state.sort === "high") return (b.percent ?? -1) - (a.percent ?? -1) || a.index - b.index;
      if (state.sort === "class") return a.class.localeCompare(b.class) || b.due_date.localeCompare(a.due_date);
      return b.due_date.localeCompare(a.due_date) || b.index - a.index;
    });
  }

  function renderAssignList() {
    const matches = sortAssignments(filteredAssignments());
    const narrowed = Boolean(state.search || state.className !== "all" || state.term !== "all" || state.category !== "all" || state.flag !== "all" || state.date);
    const limit = narrowed ? matches.length : Math.min(matches.length, state.show);
    const slice = matches.slice(0, limit);
    const dateChip = state.date ? ` <button type="button" class="chip" id="clear-date">Clear ${esc(formatMed(state.date))}</button>` : "";
    document.getElementById("assign-count").innerHTML = `Showing ${slice.length} of ${matches.length}${matches.length !== MODEL.assignments.length ? ` matches (${MODEL.assignments.length} total)` : ""}.${dateChip}`;
    const cards = slice.map((row) => assignmentCard(row)).join("");
    const more = !narrowed && limit < matches.length ? `<button type="button" class="more" id="show-more">Show more</button>` : "";
    document.getElementById("assign-list").innerHTML = cards
      ? `${cards}${more}`
      : '<p class="card" style="padding:16px">No assignments match.</p>';
  }

  function assignmentCard(row) {
    const parts = splitTitle(row.assignment_name);
    const colors = scoreColors(row.percent);
    const open = state.expanded.has(String(row.index));
    const badges = [];
    if (isMissing(row)) badges.push(["missing", "Missing"]);
    if (row.flags.includes("late")) badges.push(["late", "Late"]);
    if (row.flags.includes("incomplete")) badges.push(["incomplete", "Incomplete"]);
    if (row.flags.includes("zero") || row.percent === 0) badges.push(["zero", "Zero"]);
    if (row.percent == null && !isMissing(row)) badges.push(["open", "Not graded"]);
    const points = pointsLine(row);
    return `<article class="assign">
      <button type="button" class="assign-main" data-key="${row.index}" aria-expanded="${open}" aria-controls="panel-${row.index}">
        <span class="bar" style="--bar:${colors.bg}"></span>
        <span>
          <span class="meta">${esc(row.class)} · ${esc(row.category)} · ${esc(shortTerm(row.term))}${row.due_date ? ` · <time datetime="${row.due_date}">${esc(formatMed(row.due_date))}</time>` : ""}</span>
          <span class="assign-title">${esc(parts.title)}</span>
          ${badges.length ? `<span class="badges">${badges.map(([kind, label]) => `<span class="badge ${kind}">${label}</span>`).join("")}</span>` : ""}
        </span>
        <span class="pct" style="--fg:${colors.fg}">${row.percent == null ? "—" : esc(fmtGrade(row.percent))}</span>
      </button>
      <div class="assign-panel" id="panel-${row.index}" ${open ? "" : "hidden"}>
        ${parts.detail ? `<p>${esc(parts.detail)}</p>` : ""}
        <p>${esc(points)}</p>
        ${row.teacher_note ? `<p class="teacher-note"><strong>Teacher note.</strong> ${richText(row.teacher_note)}</p>` : ""}
      </div>
    </article>`;
  }

  function pointsLine(row) {
    const earned = row.points_earned;
    const possible = row.points_possible;
    const status = row.status ? ` · ${row.status}` : "";
    if (earned == null && possible == null) return row.status || "No points recorded";
    if (earned == null) return `— / ${fmtGrade(possible)} points${status}`;
    if (possible == null || possible === 0) return `${fmtGrade(earned)} points${status}`;
    return `${fmtGrade(earned)} / ${fmtGrade(possible)} points${status}`;
  }

  function applyExplorerFilter(flag) {
    state.flag = flag;
    state.date = "";
    state.show = 40;
    const select = document.getElementById("f-flag");
    if (select) select.value = flag;
    syncHeatSelection();
    renderAssignList();
    document.getElementById("assign-count").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  function renderTimeline(model) {
    const counts = { all: model.events.length, note: 0, behavior: 0, attendance: 0 };
    model.events.forEach((event) => { counts[event.kind] = (counts[event.kind] || 0) + 1; });
    document.getElementById("time-sub").textContent = "Teacher notes use the assignment due date. Behavior and attendance use the portal date. Newest first.";
    const chips = [["all", "All"], ["note", "Notes"], ["behavior", "Behavior"], ["attendance", "Attendance"]]
      .filter(([kind]) => kind === "all" || counts[kind])
      .map(([kind, label]) => `<button type="button" class="chip" data-time="${kind}" aria-pressed="${state.timeFilter === kind}">${label} · ${counts[kind] || 0}</button>`);
    const row = document.getElementById("time-chips");
    row.innerHTML = chips.join("");
    row.addEventListener("click", (event) => {
      const button = event.target.closest("[data-time]");
      if (!button) return;
      state.timeFilter = button.dataset.time;
      row.querySelectorAll("[data-time]").forEach((item) => item.setAttribute("aria-pressed", item.dataset.time === state.timeFilter ? "true" : "false"));
      renderTimelineList();
    });
    renderTimelineList();
  }

  function renderTimelineList() {
    const events = MODEL.events.filter((event) => state.timeFilter === "all" || event.kind === state.timeFilter);
    let last = "";
    document.getElementById("timeline-list").innerHTML = events.map((event) => {
      const showDate = event.date !== last;
      last = event.date;
      const when = event.date ? `<time datetime="${event.date}">${showDate ? esc(formatMed(event.date)) : ""}</time>` : "<time>Undated</time>";
      return `<li class="event" style="--c:${event.color}">
        ${when}
        <div class="rail"><div class="event-dot"></div></div>
        <article class="event-card">
          <p class="kicker-inline">${esc(event.kicker || event.kind)}</p>
          <h3>${esc(event.title)}</h3>
          ${timelineBody(event)}
        </article>
      </li>`;
    }).join("") || "<li><p>No events in this view.</p></li>";
  }

  function timelineBody(event) {
    if (event.kind === "note") {
      const score = event.score == null ? "" : `<p>Score ${esc(fmtGrade(event.score))}.</p>`;
      return `${event.detail ? `<p>${esc(event.detail)}</p>` : ""}${score}${event.comment ? `<p class="teacher-note">${richText(event.comment)}</p>` : ""}`;
    }
    if (event.kind === "behavior") {
      const badge = event.demerits ? `<p><span class="badge behavior">${esc(plural(event.demerits, "demerit"))}</span></p>` : '<p><span class="badge">No demerit</span></p>';
      const outcome = event.outcome ? `<p>${esc(event.outcome)}</p>` : "";
      return `${badge}${outcome}${event.comment ? `<p>${richText(event.comment)}</p>` : ""}`;
    }
    const classes = event.classes?.length ? `<p>${esc(joinAnd(event.classes))}</p>` : "";
    const comment = event.comment ? `<p>${richText(event.comment)}</p>` : "";
    return `${classes}${comment}`;
  }

  function renderAttendance(model) {
    const summary = model.summary.attendance?.summary || {};
    const records = model.summary.attendance?.records || [];
    const tardyRecords = records.filter((record) => kindOf(record) === "tardy");
    const mornings = new Set(tardyRecords.map((record) => record.date)).size;
    const excused = tardyRecords.filter((record) => excusedOf(record) === true).length;
    document.getElementById("att-sub").textContent = mornings && mornings < tardyRecords.length
      ? `The portal counts a mark in each class. ${plural(tardyRecords.length, "tardy mark")} fall on ${plural(mornings, "morning")}.`
      : "Absences and tardies from the portal.";
    document.getElementById("att-kpis").classList.add("auto");
    document.getElementById("att-kpis").innerHTML = `
      <article class="kpi"><p class="kpi-label">Absences</p><p class="kpi-value">${esc(summary.absences ?? "—")}</p><p class="kpi-sub">Portal total</p></article>
      <article class="kpi"><p class="kpi-label">Tardies</p><p class="kpi-value">${esc(summary.tardies ?? tardyRecords.length)}</p><p class="kpi-sub">${esc(`${excused} excused`)}</p></article>
      <article class="kpi"><p class="kpi-label">Present marks</p><p class="kpi-value">${esc(summary.present ?? "—")}</p><p class="kpi-sub">Class periods</p></article>`;
    document.getElementById("att-scale").innerHTML = [
      ["#bae6fd", "Excused tardy"],
      ["#fed7aa", "Unexcused tardy"],
      ["#fecdd3", "Absence"]
    ].map(([color, label]) => `<span><i style="background:${color}"></i>${label}</span>`).join("");
    document.getElementById("att-heat").innerHTML = calendarHTML(model, "attendance");
    document.getElementById("att-heat").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-date]");
      if (!button) return;
      state.attDate = state.attDate === button.dataset.date ? "" : button.dataset.date;
      document.querySelectorAll("#att-heat button[data-date]").forEach((item) => {
        const on = item.dataset.date === state.attDate;
        item.classList.toggle("selected", on);
        item.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderAttendanceDetail();
    });
    const rows = model.attendanceGroups.map((group) => [
      formatLong(group.date),
      group.title,
      joinAnd([...new Set(group.classes)]),
      [...new Set(group.comments)].join(" ") || "—"
    ]);
    const host = document.getElementById("att-table");
    tableSeq += 1;
    const captionId = `table-caption-${tableSeq}`;
    host.innerHTML = `<h3 class="table-heading">Every mark</h3>${tableHTML("Attendance marks", ["Date", "What", "Classes", "Note"], rows, captionId)}`;
    host.tabIndex = 0;
    host.setAttribute("role", "region");
    host.setAttribute("aria-labelledby", captionId);
  }

  function renderAttendanceDetail() {
    const box = document.getElementById("att-detail");
    if (!state.attDate) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const groups = MODEL.attendanceGroups.filter((group) => group.date === state.attDate);
    box.hidden = false;
    box.innerHTML = `<h3>${esc(formatLong(state.attDate))}</h3>${groups.map((group) => `<p><strong>${esc(group.title)}</strong> · ${esc(joinAnd([...new Set(group.classes)]))}</p>${group.comments.length ? `<p>${esc([...new Set(group.comments)].join(" "))}</p>` : ""}`).join("")}`;
  }

  function renderFooter(model) {
    const phrase = model.updated.text
      ? (/ET\b/.test(model.updated.text) ? model.updated.text : `${model.updated.text} ET`)
      : `${formatLong(model.updated.iso)} ET`;
    const time = model.updated.iso ? `<time datetime="${esc(model.updated.iso)}">${esc(phrase)}</time>` : esc(phrase);
    document.getElementById("updated-line").innerHTML = `Data from the school portal, last updated ${time}`;
    const notes = [];
    if (model.hiddenNames.length) {
      notes.push(`${joinAnd(model.hiddenNames)} ${model.hiddenNames.length === 1 ? "has" : "have"} no grades, so ${model.hiddenNames.length === 1 ? "it is" : "they are"} left out of the grade charts. Attendance still names a class when a mark was recorded there.`);
    }
    notes.push("Class cards are the gradebook averages. The charts weight assignment scores by the category weights.");
    const midterm = model.summary.report_card_and_progress_reports?.mid_term_progress_report;
    if (midterm?.available && midterm.grades_and_comments_populated === false) {
      notes.push("The mid-term progress report was blank, so these figures come from the gradebook.");
    }
    notes.push(`${plural(model.assignments.length, "assignment row")} and ${plural(model.robloxCount, "weekly screen-time row")}.`);
    document.getElementById("footer-note").textContent = notes.join(" ");
  }

  function setupReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || reduceMotion()) {
      nodes.forEach((node) => node.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    window.setTimeout(() => nodes.forEach((node) => node.classList.add("in")), 2200);
  }

  function setupNav() {
    const links = [...document.querySelectorAll(".nav-links a")];
    const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
    const mark = (id) => {
      links.forEach((link) => {
        const on = Boolean(id) && link.getAttribute("href") === `#${id}`;
        link.classList.toggle("target-current", on);
        link.setAttribute("aria-current", on ? "true" : "false");
      });
    };
    const supportsNative = typeof CSS !== "undefined"
      && typeof CSS.supports === "function"
      && CSS.supports("scroll-target-group", "auto")
      && "onscrollend" in window;
    if (supportsNative) {
      const sync = () => {
        const current = document.querySelector(".nav-links a:target-current");
        if (!current) return;
        links.forEach((link) => {
          link.setAttribute("aria-current", link === current ? "true" : "false");
        });
      };
      sync();
      document.addEventListener("scrollend", sync);
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).toSorted((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      mark(visible.target.id);
    }, { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] });
    sections.forEach((section) => observer.observe(section));
  }

  async function main() {
    try {
      selfCheck();
      const [assignText, summary, robloxText] = await Promise.all([
        fetchText("data/assignments.csv", true),
        fetch("data/summary.json", { priority: "high" }).then((response) => {
          if (!response.ok) throw new Error(`Could not load data/summary.json (${response.status}).`);
          return response.json();
        }),
        fetchText("data/roblox_weekly.csv", true)
      ]);
      const assignments = parseCSV(assignText).map(normalizeAssignment);
      const roblox = parseCSV(robloxText).map(normalizeRoblox).filter((row) => row.source);
      MODEL = buildModel(summary, assignments, roblox, "");
      configureCharts();
      renderAll(MODEL);
      document.body.dataset.ready = "true";
      document.body.dataset.assignments = String(MODEL.assignments.length);
    } catch (error) {
      const box = document.getElementById("error");
      box.hidden = false;
      box.textContent = `The gradebook could not be loaded. Serve this folder with a local web server and reload. ${error && error.message ? error.message : ""}`;
      document.body.dataset.ready = "error";
      document.body.dataset.error = error && error.message ? error.message : "unknown";
    }
  }

  main();
})();
