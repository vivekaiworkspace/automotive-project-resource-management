/**
 * Organization Calendar Service
 * Working days: Monday–Friday, 8 hours per day, Asia/Kolkata timezone.
 * Pure deterministic calendar functions shared across Activity Planning (Step 4)
 * and Capacity Scheduling (Step 5).
 */

export const ORGANIZATION_CALENDAR = {
  timezone: 'Asia/Kolkata',
  standardHoursPerDay: 8.0,
  workingDays: [1, 2, 3, 4, 5], // 1 = Monday, ..., 5 = Friday
  materialChangeWorkingDayThreshold: 3,
  materialChangeEstimatePercentThreshold: 20.0,
};

function parseCleanDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const cleanStr = String(val).trim().split('T')[0];
  const d = new Date(`${cleanStr}T00:00:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns true if the given date string (YYYY-MM-DD) falls on Monday through Friday
 */
export function isWorkingDay(dateStr) {
  const d = parseCleanDate(dateStr);
  if (!d) return false;
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  return day >= 1 && day <= 5;
}

/**
 * Calculate working days difference between two dates.
 * Measures how many working days a date has moved:
 * e.g. Mon 2026-11-02 -> Mon 2026-11-02 = 0
 * e.g. Mon 2026-11-02 -> Tue 2026-11-03 = 1
 * e.g. Mon 2026-11-02 -> Thu 2026-11-05 = 3
 * e.g. Mon 2026-11-02 -> Fri 2026-11-06 = 4
 * e.g. Fri 2026-11-06 -> Mon 2026-11-09 = 1 (weekend skipped)
 */
export function calculateWorkingDaysDifference(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return 0;
  const d1 = parseCleanDate(dateStr1);
  const d2 = parseCleanDate(dateStr2);
  if (!d1 || !d2) return 0;

  if (d1.getTime() === d2.getTime()) return 0;

  const [start, end] = d1 < d2 ? [new Date(d1), new Date(d2)] : [new Date(d2), new Date(d1)];
  let count = 0;

  // Advance by 1 calendar day until reaching end
  start.setDate(start.getDate() + 1);
  while (start <= end) {
    const day = start.getDay();
    if (day >= 1 && day <= 5) {
      count++;
    }
    start.setDate(start.getDate() + 1);
  }

  return count;
}

/**
 * Material change check: Start or Due date moves by more than 3 working days
 */
export function isDateMaterialChange(oldDateStr, newDateStr) {
  if (!oldDateStr || !newDateStr) return false;
  const diff = calculateWorkingDaysDifference(oldDateStr, newDateStr);
  return diff > ORGANIZATION_CALENDAR.materialChangeWorkingDayThreshold;
}

/**
 * Material change check: Current estimate changes by more than 20 percent from previous value
 */
export function isEstimateMaterialChange(oldEstimate, newEstimate) {
  if (oldEstimate === null || oldEstimate === undefined || newEstimate === null || newEstimate === undefined) {
    return false;
  }
  const oldVal = Number(oldEstimate);
  const newVal = Number(newEstimate);
  if (isNaN(oldVal) || isNaN(newVal) || oldVal === newVal) {
    return false;
  }
  if (oldVal === 0) {
    return newVal > 0;
  }
  const pct = (Math.abs(newVal - oldVal) / oldVal) * 100.0;
  return pct > ORGANIZATION_CALENDAR.materialChangeEstimatePercentThreshold;
}

/**
 * Material change check: Priority changes while status is Planned or In Progress
 */
export function isPriorityMaterialChange(status, oldPriorityId, newPriorityId) {
  if (['PLANNED', 'IN_PROGRESS'].includes(status)) {
    return Boolean(oldPriorityId && newPriorityId && oldPriorityId !== newPriorityId);
  }
  return false;
}

/**
 * Calculate response deadline in working hours from a given timestamp
 * using Asia/Kolkata timezone (UTC+05:30) and Monday-Friday 09:00-17:00 working calendar.
 */
export function calculateWorkingHoursDeadline(fromTimestamp, workingHours = 4.0) {
  const fromDate = fromTimestamp instanceof Date ? fromTimestamp : new Date(fromTimestamp);
  const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  
  // Convert UTC timestamp to simulated Kolkata local time (represented as a Date object in UTC)
  let localMs = fromDate.getTime() + KOLKATA_OFFSET_MS;
  let localDate = new Date(localMs);
  
  // Advance to valid working hours if currently outside
  function normalizeToWorkingHours(date) {
    let day = date.getUTCDay(); // 0 = Sun, 6 = Sat
    let hour = date.getUTCHours();
    
    // If weekend, move to next Monday at 09:00
    if (day === 0) { // Sunday -> +1 day
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(9, 0, 0, 0);
    } else if (day === 6) { // Saturday -> +2 days
      date.setUTCDate(date.getUTCDate() + 2);
      date.setUTCHours(9, 0, 0, 0);
    } else {
      // Weekday
      if (hour < 9) {
        date.setUTCHours(9, 0, 0, 0);
      } else if (hour >= 17) {
        // Move to next working day at 09:00
        date.setUTCDate(date.getUTCDate() + 1);
        if (date.getUTCDay() === 6) { // Landed on Saturday -> jump to Monday
          date.setUTCDate(date.getUTCDate() + 2);
        }
        date.setUTCHours(9, 0, 0, 0);
      }
    }
  }

  normalizeToWorkingHours(localDate);

  let remainingMinutes = Math.round(workingHours * 60);

  while (remainingMinutes > 0) {
    let hour = localDate.getUTCHours();
    let min = localDate.getUTCMinutes();
    let minutesUntilEndOfWorkDay = (17 - hour) * 60 - min;

    if (minutesUntilEndOfWorkDay >= remainingMinutes) {
      localDate.setUTCMinutes(localDate.getUTCMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesUntilEndOfWorkDay;
      // Advance to next working day at 09:00
      localDate.setUTCDate(localDate.getUTCDate() + 1);
      if (localDate.getUTCDay() === 6) {
        localDate.setUTCDate(localDate.getUTCDate() + 2);
      } else if (localDate.getUTCDay() === 0) {
        localDate.setUTCDate(localDate.getUTCDate() + 1);
      }
      localDate.setUTCHours(9, 0, 0, 0);
    }
  }

  // Convert simulated Kolkata local time back to UTC Date
  return new Date(localDate.getTime() - KOLKATA_OFFSET_MS);
}

/**
 * Format a Date or date string to YYYY-MM-DD
 */
export function formatDateYmd(dateVal) {
  if (!dateVal) return null;
  const d = parseCleanDate(dateVal);
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the Monday of the ISO week for a given date string (YYYY-MM-DD)
 */
export function getWeekMonday(dateStr) {
  const d = parseCleanDate(dateStr);
  if (!d) return null;
  const day = d.getDay(); // 0 = Sun, 1 = Mon ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return formatDateYmd(monday);
}

/**
 * Get the Friday of the working week for a given Monday date string (YYYY-MM-DD)
 */
export function getWeekFriday(mondayStr) {
  const d = parseCleanDate(mondayStr);
  if (!d) return null;
  const friday = new Date(d);
  friday.setDate(friday.getDate() + 4);
  return formatDateYmd(friday);
}

/**
 * Calculate working days in a date range [startDateStr, endDateStr]
 */
export function getWorkingDaysInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 0;
  const d1 = parseCleanDate(startDateStr);
  const d2 = parseCleanDate(endDateStr);
  if (!d1 || !d2 || d1 > d2) return 0;

  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const day = cur.getDay();
    if (day >= 1 && day <= 5) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Break down a date range into weekly buckets (Monday to Friday)
 */
export function getWeeklyBreakdown(startDateStr, endDateStr) {
  const d1 = parseCleanDate(startDateStr);
  const d2 = parseCleanDate(endDateStr);
  if (!d1 || !d2 || d1 > d2) return [];

  const weeks = [];
  const startMon = getWeekMonday(startDateStr);
  const endMon = getWeekMonday(endDateStr);

  let currentMon = parseCleanDate(startMon);
  const finalMon = parseCleanDate(endMon);

  while (currentMon <= finalMon) {
    const monStr = formatDateYmd(currentMon);
    const friStr = getWeekFriday(monStr);

    // Working days within this week that overlap the activity/assignment range
    const curMonDate = parseCleanDate(monStr);
    const curFriDate = parseCleanDate(friStr);

    const overlapStart = curMonDate > d1 ? curMonDate : d1;
    const overlapEnd = curFriDate < d2 ? curFriDate : d2;

    const overlapDays = overlapStart <= overlapEnd ? getWorkingDaysInRange(formatDateYmd(overlapStart), formatDateYmd(overlapEnd)) : 0;

    weeks.push({
      weekStart: monStr,
      weekEnd: friStr,
      workingDaysCount: 5,
      overlappingWorkingDays: overlapDays,
    });

    currentMon.setDate(currentMon.getDate() + 7);
  }

  return weeks;
}
