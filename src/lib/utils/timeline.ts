import { scaleTime } from 'd3-scale';
import type { ScaleTime } from 'd3-scale';
import type { ZoomConfig } from '$lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeaderGroup {
  label: string;
  startX: number;
  width: number;
}

export interface HeaderCell {
  label: string;
  x: number;
  width: number;
}

// ---------------------------------------------------------------------------
// Core scale
// ---------------------------------------------------------------------------

/**
 * Creates a d3 scaleTime mapping [startDate, endDate] to pixel positions.
 * The range right-end is computed from the column boundaries so that each
 * column unit lands on exact pixel multiples.
 */
export function createTimeScale(
  dateRange: [Date, Date],
  zoomConfig: ZoomConfig,
): ScaleTime<number, number> {
  const [start, end] = dateRange;
  const boundaries = getColumnBoundaries(start, end, zoomConfig.columnUnit);

  // Total pixel width = number of column intervals × columnWidth
  const totalColumns = Math.max(boundaries.length - 1, 1);
  const totalWidth = totalColumns * zoomConfig.columnWidth;

  return scaleTime().domain([start, end]).range([0, totalWidth]);
}

// ---------------------------------------------------------------------------
// Column boundaries
// ---------------------------------------------------------------------------

/**
 * Returns an array of Date objects representing the start of each column unit
 * between startDate and endDate (inclusive of the boundary after endDate).
 */
export function getColumnBoundaries(
  startDate: Date,
  endDate: Date,
  unit: string,
): Date[] {
  const boundaries: Date[] = [];
  let current = floorDate(startDate, unit);

  // Safety: cap at a large but finite number of iterations.
  let i = 0;
  while (current <= endDate && i < 10000) {
    boundaries.push(new Date(current));
    current = addTime(current, 1, unit);
    i++;
  }
  // Always include the boundary after endDate so bars that end exactly at
  // endDate still have a right edge.
  boundaries.push(new Date(current));

  return boundaries;
}

// ---------------------------------------------------------------------------
// Header groups (top row)
// ---------------------------------------------------------------------------

/**
 * Returns the top-header cells (larger groupings such as Month or Quarter).
 * Each cell covers the span of bottom-header columns that fall within it.
 */
export function getTopHeaderGroups(
  startDate: Date,
  endDate: Date,
  zoomConfig: ZoomConfig,
): HeaderGroup[] {
  const { columnUnit, columnWidth, topHeaderUnit, topHeaderFormat } = zoomConfig;

  // Build the full list of column-unit boundaries so we can map pixels.
  const colBoundaries = getColumnBoundaries(startDate, endDate, columnUnit);

  // Iterate over top-header units that overlap [startDate, endDate].
  const groups: HeaderGroup[] = [];
  let topCurrent = floorDate(startDate, topHeaderUnit);

  let safetyCount = 0;
  while (topCurrent <= endDate && safetyCount < 2000) {
    safetyCount++;
    const topNext = addTime(topCurrent, 1, topHeaderUnit);

    // Find the column-boundary index where this top-header cell starts.
    const startCol = colBoundaries.findIndex((b) => b >= topCurrent);
    if (startCol === -1) {
      topCurrent = topNext;
      continue;
    }

    // Find how many column slots fall within [topCurrent, topNext).
    let colCount = 0;
    for (let ci = startCol; ci < colBoundaries.length - 1; ci++) {
      if (colBoundaries[ci] < topNext) {
        colCount++;
      } else {
        break;
      }
    }

    if (colCount > 0) {
      groups.push({
        label: formatDate(topCurrent, topHeaderFormat),
        startX: startCol * columnWidth,
        width: colCount * columnWidth,
      });
    }

    topCurrent = topNext;
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Bottom header cells
// ---------------------------------------------------------------------------

/**
 * Returns bottom-header cells (one per column unit).
 */
export function getBottomHeaderCells(
  startDate: Date,
  endDate: Date,
  zoomConfig: ZoomConfig,
): HeaderCell[] {
  const { columnUnit, columnWidth, bottomHeaderFormat } = zoomConfig;
  const boundaries = getColumnBoundaries(startDate, endDate, columnUnit);

  const cells: HeaderCell[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    cells.push({
      label: formatDate(boundaries[i], bottomHeaderFormat),
      x: i * columnWidth,
      width: columnWidth,
    });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Date formatting  (no external libraries)
// ---------------------------------------------------------------------------

/**
 * Formats a Date using a format string that supports a subset of tokens used
 * in date-fns / Java SimpleDateFormat:
 *
 *   yyyy  — 4-digit year
 *   yy    — 2-digit year
 *   MMMM  — full month name
 *   MMM   — abbreviated month name (3 chars)
 *   MM    — zero-padded month number
 *   M     — month number
 *   dd    — zero-padded day
 *   d     — day number
 *   EEE   — abbreviated weekday (Mon, Tue …)
 *   EEEE  — full weekday
 *   HH    — zero-padded 24h hour
 *   H     — 24h hour
 *   mm    — zero-padded minutes
 *   'Q'Q  — literal "Q" followed by quarter number  (e.g. 'Q'Q → Q1)
 *   'W'w  — literal "W" followed by ISO week number (e.g. 'W'w → W12)
 *   Anything inside single-quotes is emitted as a literal (quotes stripped).
 */
export function formatDate(date: Date, format: string): string {
  // Tokenise: split on single-quoted literals and format tokens.
  // Single-quoted sections → literal text.
  const tokens = tokeniseFormat(format);

  return tokens
    .map((tok) => {
      if (tok.literal) return tok.value;
      return applyToken(date, tok.value);
    })
    .join('');
}

interface FormatToken {
  literal: boolean;
  value: string;
}

function tokeniseFormat(format: string): FormatToken[] {
  const tokens: FormatToken[] = [];
  let i = 0;
  while (i < format.length) {
    if (format[i] === "'") {
      // Read until closing single-quote ('' = escaped single quote).
      let literal = '';
      i++; // skip opening quote
      while (i < format.length) {
        if (format[i] === "'" && format[i + 1] === "'") {
          literal += "'";
          i += 2;
        } else if (format[i] === "'") {
          i++; // skip closing quote
          break;
        } else {
          literal += format[i];
          i++;
        }
      }
      tokens.push({ literal: true, value: literal });
    } else {
      // Collect a run of the same character (format token).
      const ch = format[i];
      let run = '';
      while (i < format.length && format[i] === ch) {
        run += format[i];
        i++;
      }
      tokens.push({ literal: false, value: run });
    }
  }
  return tokens;
}

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function applyToken(date: Date, token: string): string {
  switch (token) {
    case 'yyyy': return String(date.getFullYear());
    case 'yy': return String(date.getFullYear()).slice(-2);
    case 'MMMM': return MONTH_NAMES_FULL[date.getMonth()];
    case 'MMM': return MONTH_NAMES_SHORT[date.getMonth()];
    case 'MM': return String(date.getMonth() + 1).padStart(2, '0');
    case 'M': return String(date.getMonth() + 1);
    case 'dd': return String(date.getDate()).padStart(2, '0');
    case 'd': return String(date.getDate());
    case 'EEEE': return DAY_NAMES_FULL[date.getDay()];
    case 'EEE': return DAY_NAMES_SHORT[date.getDay()];
    case 'HH': return String(date.getHours()).padStart(2, '0');
    case 'H': return String(date.getHours());
    case 'mm': return String(date.getMinutes()).padStart(2, '0');
    // Quarter:  'Q'Q → the literal "Q" is already handled in tokeniser;
    // this branch handles a bare "Q" token meaning the quarter digit.
    case 'Q': return String(Math.floor(date.getMonth() / 3) + 1);
    // ISO week number (bare 'w' token after the literal 'W' was stripped).
    case 'w': return String(isoWeekNumber(date));
    default: return token; // Unknown token — emit as-is.
  }
}

// ---------------------------------------------------------------------------
// Time arithmetic
// ---------------------------------------------------------------------------

/**
 * Returns a new Date with `amount` units of `unit` added.
 * Supported units: 'hour', 'day', 'week', 'month', 'quarter', 'year'.
 */
export function addTime(date: Date, amount: number, unit: string): Date {
  const d = new Date(date);
  switch (unit) {
    case 'hour':
      d.setHours(d.getHours() + amount);
      break;
    case 'day':
      d.setDate(d.getDate() + amount);
      break;
    case 'week':
      d.setDate(d.getDate() + amount * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + amount);
      break;
    case 'quarter':
      d.setMonth(d.getMonth() + amount * 3);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + amount);
      break;
  }
  return d;
}

/**
 * Returns the difference between two dates in the given unit (a - b).
 */
export function diffTime(a: Date, b: Date, unit: string): number {
  const msA = a.getTime();
  const msB = b.getTime();
  const diffMs = msA - msB;

  switch (unit) {
    case 'hour': return diffMs / (1000 * 60 * 60);
    case 'day': return diffMs / (1000 * 60 * 60 * 24);
    case 'week': return diffMs / (1000 * 60 * 60 * 24 * 7);
    case 'month': {
      // Approximate using calendar months.
      const years = a.getFullYear() - b.getFullYear();
      const months = a.getMonth() - b.getMonth();
      return years * 12 + months + (a.getDate() - b.getDate()) / 31;
    }
    case 'quarter': return diffTime(a, b, 'month') / 3;
    case 'year': return diffTime(a, b, 'month') / 12;
    default: return diffMs;
  }
}

// ---------------------------------------------------------------------------
// Floor (snap to unit start)
// ---------------------------------------------------------------------------

/**
 * Returns a new Date floored to the start of the given unit.
 */
export function floorDate(date: Date, unit: string): Date {
  const d = new Date(date);
  switch (unit) {
    case 'hour':
      d.setMinutes(0, 0, 0);
      break;
    case 'day':
      d.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      // ISO week starts on Monday.
      const day = d.getDay(); // 0=Sun
      const diff = (day === 0 ? -6 : 1 - day);
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      break;
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3);
      d.setMonth(q * 3, 1);
      d.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      break;
  }
  return d;
}

/**
 * Round a date to the **nearest** snap-unit boundary (not just floor).
 * E.g. at day snap, 2026-03-30T18:00 rounds to 2026-03-31, not 2026-03-30.
 */
export function roundDate(date: Date, unit: string): Date {
  const floored = floorDate(date, unit);
  const ceiled = addTime(floored, 1, unit);
  const diffToFloor = date.getTime() - floored.getTime();
  const diffToCeil = ceiled.getTime() - date.getTime();
  return diffToFloor <= diffToCeil ? floored : ceiled;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the date falls on Saturday or Sunday. */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Returns today's date at midnight (local time). */
export function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Expands a [start, end] date range by padding before the start and after the
 * end.  Padding amount is proportional to the column unit so there is always
 * some empty space on each side of the chart.
 */
export function padDateRange(
  start: Date,
  end: Date,
  zoomConfig: ZoomConfig,
): [Date, Date] {
  const { columnUnit } = zoomConfig;

  // Use a small fixed padding appropriate to each unit.
  const padAmounts: Record<string, number> = {
    hour: 6,
    day: 3,
    week: 2,
    month: 1,
  };
  const pad = padAmounts[columnUnit] ?? 2;

  const paddedStart = floorDate(addTime(start, -pad, columnUnit), columnUnit);
  const paddedEnd = floorDate(addTime(end, pad + 1, columnUnit), columnUnit);

  return [paddedStart, paddedEnd];
}

// ---------------------------------------------------------------------------
// ISO week number (Monday-based, ISO 8601)
// ---------------------------------------------------------------------------

function isoWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday of current week → determines the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4); // Jan 4 is always in W1
  return Math.round(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// ISO string helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD using local time (not UTC).
 * Used by drag handlers to convert snapped dates to ISO strings.
 */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format an ISO date string for human display (e.g. "Mar 30, 2026").
 */
export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
