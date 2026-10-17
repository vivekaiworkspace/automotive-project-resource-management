/**
 * Authoritative Capacity & Conflict Engine Service (Step 5)
 * Handles deterministic capacity mathematics, weekly aggregation across active projects,
 * conflict thresholds (90% warning, 100% block, critical case creation), 4-hour escalation,
 * and immutable resolution evidence.
 */
import crypto from 'node:crypto';
import { query, getPool } from '../../db/index.js';
import { recordAuditEvent } from '../audit/index.js';
import {
  ORGANIZATION_CALENDAR,
  calculateWorkingHoursDeadline,
  formatDateYmd,
  getWeekMonday,
  getWeekFriday,
  getWorkingDaysInRange,
  getWeeklyBreakdown,
  calculateWorkingDaysDifference,
  parseCleanDate,
  countValidWorkingDays,
  isWorkingDay,
} from './calendar.service.js';
import { findNearestCommittedMilestone } from './milestone.service.js';

export const CONFLICT_LEVELS = {
  OK: {
    code: 'OK',
    label: 'OK',
  },
  CAPACITY_WARNING: {
    code: 'CAPACITY_WARNING',
    label: 'Capacity Warning',
  },
  CAPACITY_CONFLICT: {
    code: 'CAPACITY_CONFLICT',
    label: 'Capacity Conflict',
  },
  CRITICAL_DELIVERY_AT_RISK: {
    code: 'CRITICAL_DELIVERY_AT_RISK',
    label: 'Critical — Delivery-at-Risk Conflict',
  },
};

export const RESOLUTION_TYPES = [
  'REASSIGN_WORK',
  'ADJUST_ASSIGNMENT_DATES',
  'REDUCE_OR_SPLIT_SCOPE',
  'CHANGE_PRIORITY',
  'AUTHORIZE_OVERRIDE',
];

export const ADVISORY_LOCK_ESCALATION = 842001;

/**
 * Redact approved leave records according to caller roles (Step 5 Review Remediation § B, C, DEF-STP5-001)
 * - SYSTEM_ADMIN and RESOURCE_MANAGER: authorized resource roles, full leave view
 * - TEAM_LEAD: scoped team members, see leave dates, duration, status, and leave type (redact leave reason and approver)
 * - PROJECT_MANAGER and TEAM_MEMBER: redact to only unavailable from/to and duration (no type, reason, or approver)
 */
export function redactApprovedLeavesForRole(leaves, roles = []) {
  if (!Array.isArray(leaves)) return [];
  const userRoles = new Set(roles);
  const isAuthorizedResourceRole = userRoles.has('SYSTEM_ADMIN') || userRoles.has('RESOURCE_MANAGER');

  if (isAuthorizedResourceRole) {
    return leaves;
  }

  const isTeamLead = userRoles.has('TEAM_LEAD');

  return leaves.map(l => {
    const sDate = l.start_date || l.unavailable_from;
    const eDate = l.end_date || l.unavailable_to;
    const durationDays = l.duration_days !== undefined
      ? l.duration_days
      : (sDate && eDate ? getWorkingDaysInRange(sDate, eDate) : 0);
    const durationHours = l.duration_hours !== undefined
      ? l.duration_hours
      : (durationDays * ORGANIZATION_CALENDAR.standardHoursPerDay);

    if (isTeamLead) {
      const redacted = {
        id: l.id,
        unavailable_from: sDate,
        unavailable_to: eDate,
        start_date: sDate,
        end_date: eDate,
        duration_days: durationDays,
        duration_hours: durationHours,
        status: l.status,
      };
      if (l.leave_type !== undefined) redacted.leave_type = l.leave_type;
      return redacted;
    }

    return {
      id: l.id,
      unavailable_from: sDate,
      unavailable_to: eDate,
      start_date: sDate,
      end_date: eDate,
      duration_days: durationDays,
      duration_hours: durationHours,
      status: l.status,
    };
  });
}

/**
 * Redact conflict case snapshot for non-authorized resource roles
 */
export function redactConflictCaseForRole(caseRecord, roles = []) {
  if (!caseRecord) return caseRecord;
  const userRoles = new Set(roles);
  const isAuthorizedResourceRole = userRoles.has('SYSTEM_ADMIN') || userRoles.has('RESOURCE_MANAGER');

  if (isAuthorizedResourceRole) {
    return caseRecord;
  }

  const copy = { ...caseRecord };
  if (copy.case_data && typeof copy.case_data === 'object') {
    const caseDataCopy = { ...copy.case_data };
    if (Array.isArray(caseDataCopy.approved_leaves)) {
      caseDataCopy.approved_leaves = redactApprovedLeavesForRole(caseDataCopy.approved_leaves, roles);
    }
    copy.case_data = caseDataCopy;
  }
  return copy;
}

/**
 * Pure function: Calculate net capacity in hours
 */
export function calculateNetCapacityHours(workingDaysCount, standardHoursPerDay, approvedLeaveHours = 0, bufferPercent = 0) {
  const grossHours = workingDaysCount * standardHoursPerDay;
  const availableHours = Math.max(0, grossHours - approvedLeaveHours);
  const netHours = availableHours * (1.0 - (bufferPercent / 100.0));
  return Math.round(netHours * 100) / 100;
}

/**
 * Pure function: Evaluate utilization percentage and threshold
 */
export function evaluateUtilization(plannedHours, netCapacityHours) {
  if (netCapacityHours <= 0) {
    return {
      plannedUtilizationPercent: plannedHours > 0 ? 999.99 : 0.0,
      status: plannedHours > 0 ? 'CAPACITY_CONFLICT' : 'OK',
      label: plannedHours > 0 ? CONFLICT_LEVELS.CAPACITY_CONFLICT.label : 'OK',
      message: plannedHours > 0 ? 'Member has zero net capacity during this timeframe' : 'No load assigned',
    };
  }

  const utilPercent = Math.round((plannedHours / netCapacityHours) * 10000) / 100;

  if (utilPercent >= 100.0) {
    return {
      plannedUtilizationPercent: utilPercent,
      status: 'CAPACITY_CONFLICT',
      label: CONFLICT_LEVELS.CAPACITY_CONFLICT.label,
      message: `Proposed assignment exceeds 100% capacity (${utilPercent}%) and requires authorized override`,
    };
  }

  if (utilPercent >= 90.0) {
    return {
      plannedUtilizationPercent: utilPercent,
      status: 'CAPACITY_WARNING',
      label: CONFLICT_LEVELS.CAPACITY_WARNING.label,
      message: `Proposed assignment reaches warning threshold (${utilPercent}%)`,
    };
  }

  return {
    plannedUtilizationPercent: utilPercent,
    status: 'OK',
    label: CONFLICT_LEVELS.OK.label,
    message: 'Utilization within standard capacity',
  };
}

/**
 * Generate readable case code (e.g. CC-2026-0001)
 */
async function generateCaseCode(client = null) {
  const runner = client || { query };
  const res = await runner.query(`
    UPDATE capacity_case_sequence
    SET next_val = next_val + 1
    WHERE id = 1
    RETURNING next_val - 1 AS current_seq;
  `);
  const seq = res.rows[0]?.current_seq || 1;
  const padded = String(seq).padStart(4, '0');
  const year = new Date().getFullYear();
  return `CC-${year}-${padded}`;
}

/**
 * Fetch member metadata (buffer percent, team, etc.)
 */
export async function getMemberInfo(userId, client = null) {
  const runner = client || { query };
  let sql = `
    SELECT 
      m.id AS member_id,
      m.user_id,
      m.non_project_buffer_percent,
      m.team_id,
      u.full_name,
      u.email
    FROM users u
    LEFT JOIN members m ON m.user_id = u.id
    WHERE u.id = $1
  `;
  let res = await runner.query(sql, [userId]);
  if (res.rows[0]) return res.rows[0];

  // Fallback: check if userId was actually a member_id
  sql = `
    SELECT
      m.id AS member_id,
      m.user_id,
      m.non_project_buffer_percent,
      m.team_id,
      u.full_name,
      u.email
    FROM members m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id = $1
  `;
  res = await runner.query(sql, [userId]);
  return res.rows[0] || null;
}

/**
 * Calculate weekly utilization across active projects for a user over a date range
 */
export async function evaluateUserWorkload({
  userId,
  startDate,
  endDate,
  proposedPlannedHours = 0,
  excludeAssignmentId = null,
  client = null
}) {
  const runner = client || { query };

  const member = await getMemberInfo(userId, client);
  const bufferPercent = member?.non_project_buffer_percent ? Number(member.non_project_buffer_percent) : 0.0;
  const effectiveMemberId = member?.member_id || null;

  const weeklyBuckets = getWeeklyBreakdown(startDate, endDate);
  if (weeklyBuckets.length === 0) {
    return {
      peakUtilizationPercent: 0,
      conflictStatus: 'OK',
      conflictLabel: CONFLICT_LEVELS.OK.label,
      weeks: [],
      conflictingAssignments: [],
      approvedLeaves: [],
    };
  }

  const rangeStart = weeklyBuckets[0].weekStart;
  const rangeEnd = weeklyBuckets[weeklyBuckets.length - 1].weekEnd;

  // 1. Fetch cross-project active assignments
  let assignSql = `
    SELECT 
      a.id AS assignment_id,
      a.activity_id,
      a.planned_hours,
      TO_CHAR(a.start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(a.end_date, 'YYYY-MM-DD') AS end_date,
      act.title AS activity_title,
      act.project_id,
      p.code AS project_code,
      p.name AS project_name,
      act.status AS activity_status
    FROM assignments a
    JOIN activities act ON act.id = a.activity_id
    JOIN projects p ON p.id = act.project_id
    WHERE (a.user_id = $1 OR a.member_id = $2)
      AND a.status = 'ACTIVE'
      AND a.start_date <= $4::date
      AND a.end_date >= $3::date
      AND act.archived_at IS NULL
      AND p.status NOT IN ('ARCHIVED', 'CANCELLED')
  `;
  const assignParams = [userId, effectiveMemberId || userId, rangeStart, rangeEnd];
  if (excludeAssignmentId) {
    assignSql += ` AND a.id != $5`;
    assignParams.push(excludeAssignmentId);
  }

  const assignmentsRes = await runner.query(assignSql, assignParams);
  const existingAssignments = assignmentsRes.rows;

  // 2. Fetch approved leaves
  const leaveSql = `
    SELECT 
      id,
      leave_type,
      leave_reason,
      approved_by_user_id,
      TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
      status
    FROM leave_records
    WHERE (user_id = $1 OR member_id = $2)
      AND status = 'APPROVED'
      AND start_date <= $4::date
      AND end_date >= $3::date
  `;
  const leaveRes = await runner.query(leaveSql, [userId, effectiveMemberId || userId, rangeStart, rangeEnd]);
  const approvedLeaves = leaveRes.rows;

  // 2b. Fetch pending leaves (for soft warning detection, CPD-006)
  const pendingLeaveSql = `
    SELECT 
      id,
      leave_type,
      leave_reason,
      approved_by_user_id,
      TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
      status
    FROM leave_records
    WHERE (user_id = $1 OR member_id = $2)
      AND status = 'PENDING'
      AND start_date <= $4::date
      AND end_date >= $3::date
  `;
  const pendingLeaveRes = await runner.query(pendingLeaveSql, [userId, effectiveMemberId || userId, rangeStart, rangeEnd]);
  const pendingLeaves = pendingLeaveRes.rows;

  // 2c. Fetch member calendar exceptions
  let calendarExceptions = [];
  const exceptionSql = `
    SELECT
      id,
      TO_CHAR(exception_date, 'YYYY-MM-DD') AS exception_date
    FROM member_calendar_exceptions
    WHERE (
      ($1::uuid IS NOT NULL AND member_id = $1)
      OR member_id IN (SELECT id FROM members WHERE user_id = $2)
    )
    AND exception_date <= $4::date
    AND exception_date >= $3::date
  `;
  const exceptionRes = await runner.query(exceptionSql, [
    effectiveMemberId,
    userId,
    rangeStart,
    rangeEnd,
  ]);
  calendarExceptions = exceptionRes.rows;

  // Build unified set of unavailable working dates (Monday–Friday only, deduplicating approved leave and exceptions)
  const unavailableWorkingDates = new Set();
  for (const l of approvedLeaves) {
    const cur = parseCleanDate(l.start_date);
    const end = parseCleanDate(l.end_date);
    if (cur && end && cur <= end) {
      while (cur <= end) {
        const day = cur.getDay();
        if (day >= 1 && day <= 5) {
          unavailableWorkingDates.add(formatDateYmd(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  for (const e of calendarExceptions) {
    const d = parseCleanDate(e.exception_date);
    if (d) {
      const day = d.getDay();
      if (day >= 1 && day <= 5) {
        unavailableWorkingDates.add(formatDateYmd(d));
      }
    }
  }

  let hasPendingLeaveOverlap = false;
  if (proposedPlannedHours > 0 || existingAssignments.length > 0) {
    for (const pl of pendingLeaves) {
      if (pl.start_date <= endDate && pl.end_date >= startDate) {
        hasPendingLeaveOverlap = true;
        break;
      }
    }
  }

  const totalProposedWorkingDays = countValidWorkingDays(startDate, endDate, unavailableWorkingDates);

  let peakUtilization = 0.0;
  let hasHardConflict = false;
  let hasSoftWarning = hasPendingLeaveOverlap;

  const processedWeeks = weeklyBuckets.map(w => {
    // Calculate leave hours in this week specifically (preserves existing leaveHours field)
    let weekLeaveWorkingDays = 0;
    for (const l of approvedLeaves) {
      const lStart = l.start_date > w.weekStart ? l.start_date : w.weekStart;
      const lEnd = l.end_date < w.weekEnd ? l.end_date : w.weekEnd;
      if (lStart <= lEnd) {
        weekLeaveWorkingDays += getWorkingDaysInRange(lStart, lEnd);
      }
    }
    const leaveHours = weekLeaveWorkingDays * ORGANIZATION_CALENDAR.standardHoursPerDay;

    // Calculate total unavailable working days in this week (leave + exceptions combined, deduplicated)
    let weekUnavailableWorkingDays = 0;
    const curMon = parseCleanDate(w.weekStart);
    const curFri = parseCleanDate(w.weekEnd);
    while (curMon <= curFri) {
      const dStr = formatDateYmd(curMon);
      if (unavailableWorkingDates.has(dStr)) {
        weekUnavailableWorkingDays++;
      }
      curMon.setDate(curMon.getDate() + 1);
    }
    const totalUnavailableHours = weekUnavailableWorkingDays * ORGANIZATION_CALENDAR.standardHoursPerDay;

    // Calculate net capacity using deduplicated total unavailable hours
    const netCapacity = calculateNetCapacityHours(
      w.workingDaysCount,
      ORGANIZATION_CALENDAR.standardHoursPerDay,
      totalUnavailableHours,
      bufferPercent
    );

    // Calculate existing assignment hours allocated to this week using valid working days
    let existingHoursThisWeek = 0;
    const weeklyAssignments = [];

    for (const a of existingAssignments) {
      const aStart = a.start_date > w.weekStart ? a.start_date : w.weekStart;
      const aEnd = a.end_date < w.weekEnd ? a.end_date : w.weekEnd;
      if (aStart <= aEnd) {
        const overlapDays = countValidWorkingDays(aStart, aEnd, unavailableWorkingDates);
        const totalDays = countValidWorkingDays(a.start_date, a.end_date, unavailableWorkingDates);
        const hoursInWeek = totalDays > 0 ? (overlapDays / totalDays) * Number(a.planned_hours) : Number(a.planned_hours);
        existingHoursThisWeek += hoursInWeek;
        weeklyAssignments.push({
          assignment_id: a.assignment_id,
          activity_id: a.activity_id,
          project_code: a.project_code,
          project_name: a.project_name,
          activity_title: a.activity_title,
          hoursInWeek: Math.round(hoursInWeek * 100) / 100,
        });
      }
    }

    // Proposed assignment hours in this week using valid working days
    let proposedHoursThisWeek = 0;
    if (proposedPlannedHours > 0) {
      const pStart = startDate > w.weekStart ? startDate : w.weekStart;
      const pEnd = endDate < w.weekEnd ? endDate : w.weekEnd;
      if (pStart <= pEnd) {
        const weekOverlapProposedValidDays = countValidWorkingDays(pStart, pEnd, unavailableWorkingDates);
        if (totalProposedWorkingDays > 0) {
          proposedHoursThisWeek = (weekOverlapProposedValidDays / totalProposedWorkingDays) * proposedPlannedHours;
        } else {
          proposedHoursThisWeek = proposedPlannedHours;
        }
      }
    }

    const totalLoad = Math.round((existingHoursThisWeek + proposedHoursThisWeek) * 100) / 100;
    const evalRes = evaluateUtilization(totalLoad, netCapacity);

    if (evalRes.plannedUtilizationPercent > peakUtilization) {
      peakUtilization = evalRes.plannedUtilizationPercent;
    }
    if (evalRes.status === 'CAPACITY_CONFLICT') {
      hasHardConflict = true;
    } else if (evalRes.status === 'CAPACITY_WARNING') {
      hasSoftWarning = true;
    }

    return {
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      workingDays: w.workingDaysCount,
      grossCapacityHours: w.workingDaysCount * ORGANIZATION_CALENDAR.standardHoursPerDay,
      leaveHours,
      bufferPercent,
      netCapacityHours: netCapacity,
      existingHours: Math.round(existingHoursThisWeek * 100) / 100,
      proposedHours: Math.round(proposedHoursThisWeek * 100) / 100,
      totalPlannedHours: totalLoad,
      overloadHours: Math.max(0, Math.round((totalLoad - netCapacity) * 100) / 100),
      utilizationPercent: evalRes.plannedUtilizationPercent,
      status: evalRes.status,
      label: evalRes.label,
      weeklyAssignments,
    };
  });

  let conflictStatus = 'OK';
  let conflictLabel = CONFLICT_LEVELS.OK.label;

  if (hasHardConflict) {
    conflictStatus = 'CAPACITY_CONFLICT';
    conflictLabel = CONFLICT_LEVELS.CAPACITY_CONFLICT.label;
  } else if (hasSoftWarning) {
    conflictStatus = 'CAPACITY_WARNING';
    conflictLabel = CONFLICT_LEVELS.CAPACITY_WARNING.label;
  }

  return {
    peakUtilizationPercent: peakUtilization,
    conflictStatus,
    conflictLabel,
    weeks: processedWeeks,
    conflictingAssignments: existingAssignments,
    approvedLeaves,
    pendingLeaves,
    hasPendingLeaveWarning: hasPendingLeaveOverlap,
  };
}

/**
 * Determine if a Capacity Conflict is Critical — Delivery-at-Risk Conflict
 */
export async function evaluateCriticality({
  projectId,
  activityId,
  activityStartDate,
  activityDueDate,
  client = null
}) {
  const runner = client || { query };

  const todayStr = formatDateYmd(new Date());

  // Trigger A: affects an activity due to start within one working day
  const daysUntilStart = calculateWorkingDaysDifference(todayStr, activityStartDate);
  const startsWithinOneWorkingDay = daysUntilStart <= 1;

  // Trigger B: threatens a committed milestone
  const nearestMilestone = await findNearestCommittedMilestone(projectId, activityDueDate);

  let threatensCommittedMilestone = false;
  let deliveryImpactStatement = null;

  if (nearestMilestone) {
    // If activity due date is on or after committed milestone target date,
    // or within 3 working days of the milestone target date
    const milestoneDate = nearestMilestone.target_date;
    if (activityDueDate >= milestoneDate) {
      threatensCommittedMilestone = true;
      deliveryImpactStatement = `Activity due date (${activityDueDate}) reaches or exceeds committed milestone '${nearestMilestone.name}' target date (${milestoneDate}), placing delivery at risk.`;
    } else {
      const daysToMilestone = calculateWorkingDaysDifference(activityDueDate, milestoneDate);
      if (daysToMilestone <= 3) {
        threatensCommittedMilestone = true;
        deliveryImpactStatement = `Activity due date (${activityDueDate}) is within ${daysToMilestone} working days of committed milestone '${nearestMilestone.name}' target date (${milestoneDate}), threatening schedule buffer.`;
      }
    }
  }

  const isCritical = startsWithinOneWorkingDay || threatensCommittedMilestone;

  if (isCritical && !deliveryImpactStatement) {
    if (startsWithinOneWorkingDay) {
      deliveryImpactStatement = `Activity is due to start within one working day (${activityStartDate}) with unresolved capacity overload.`;
    }
  }

  return {
    isCritical,
    startsWithinOneWorkingDay,
    threatensCommittedMilestone,
    nearestCommittedMilestone: nearestMilestone,
    deliveryImpactStatement,
  };
}

/**
 * Identify alternative team members whose capacity remains strictly below 100%
 * after taking on the proposed reassignment (Step 5 § 4).
 * IMPORTANT: Skill matching is explicitly OUT OF SCOPE. No skill claims made.
 */
export async function findAlternativeReassignmentCandidates({
  activityId,
  startDate,
  endDate,
  plannedHours,
  currentUserId,
  client = null
}) {
  const runner = client || { query };

  // Fetch all active team members/engineers
  const usersSql = `
    SELECT DISTINCT
      u.id,
      u.full_name,
      u.email
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role_code IN ('TEAM_MEMBER', 'TEAM_LEAD')
      AND u.is_active = TRUE
      AND u.id != $1
    ORDER BY u.full_name ASC
  `;
  const candidatesRes = await runner.query(usersSql, [currentUserId]);
  const allCandidates = candidatesRes.rows;

  const qualifiedCandidates = [];

  for (const candidate of allCandidates) {
    const workload = await evaluateUserWorkload({
      userId: candidate.id,
      startDate,
      endDate,
      proposedPlannedHours: plannedHours,
      client: runner,
    });

    // Check: Does resulting capacity remain BELOW 100% in ALL weeks?
    const hasOverload = workload.weeks.some(w => w.utilizationPercent >= 100.0);
    if (!hasOverload) {
      qualifiedCandidates.push({
        user_id: candidate.id,
        full_name: candidate.full_name,
        email: candidate.email,
        peak_resulting_utilization: workload.peakUtilizationPercent,
        available_weeks_count: workload.weeks.length,
      });
    }
  }

  return qualifiedCandidates;
}

/**
 * Create a Capacity Conflict Resolution case (Step 5 § 3)
 */
export async function createCapacityConflictCase({
  activityId,
  assignmentId = null,
  affectedUserId,
  projectId,
  workload,
  criticality,
  actorId = null,
  currentUser = null,
  client = null
}) {
  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTransaction = !client;

  try {
    if (isLocalTransaction) await dbClient.query('BEGIN');

    const caseCode = await generateCaseCode(dbClient);
    const createdAt = new Date();
    const deadline = calculateWorkingHoursDeadline(createdAt, 4.0);

    // Fetch activity details
    const actSql = `
      SELECT 
        a.id, a.title, a.project_id, a.status, a.remaining_effort_hours,
        TO_CHAR(a.start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(a.due_date, 'YYYY-MM-DD') AS due_date,
        p.code AS project_code, p.name AS project_name,
        r.name AS priority_name,
        a.priority_id
      FROM activities a
      JOIN projects p ON p.id = a.project_id
      LEFT JOIN reference_data r ON r.id = a.priority_id
      WHERE a.id = $1
    `;
    const actRes = await dbClient.query(actSql, [activityId]);
    const activity = actRes.rows[0];

    // Fetch affected engineer details
    const userSql = `SELECT id, full_name, email FROM users WHERE id = $1`;
    const userRes = await dbClient.query(userSql, [affectedUserId]);
    const engineer = userRes.rows[0];

    // Fetch responsible PM for project (supporting project_manager_scopes and user_scopes)
    const projectManager = await findResponsibleProjectManager(projectId, dbClient);

    // Fetch responsible Resource Manager for team (supporting resource_manager_scopes and user_scopes)
    const resourceManager = await findResponsibleResourceManager(affectedUserId, dbClient);

    // Overload numbers
    const peakWeek = workload.weeks.reduce((max, w) => w.utilizationPercent > max.utilizationPercent ? w : max, workload.weeks[0] || {});

    const caseData = {
      conflict_id: caseCode,
      creation_timestamp: createdAt.toISOString(),
      current_status: 'RESOURCE_RESOLUTION_REQUIRED',
      status_label: 'Resource Resolution Required',
      severity: 'CRITICAL_DELIVERY_AT_RISK',
      severity_label: CONFLICT_LEVELS.CRITICAL_DELIVERY_AT_RISK.label,
      deadline: deadline.toISOString(),
      affected_engineer: {
        id: engineer.id,
        full_name: engineer.full_name,
        email: engineer.email,
      },
      weekly_utilization: peakWeek.utilizationPercent || workload.peakUtilizationPercent,
      overload_hours: peakWeek.overloadHours || 0,
      net_capacity: peakWeek.netCapacityHours || 0,
      affected_dates: {
        week_start: peakWeek.weekStart,
        week_end: peakWeek.weekEnd,
      },
      conflicting_assignments: workload.conflictingAssignments.map(a => ({
        assignment_id: a.assignment_id,
        activity_id: a.activity_id,
        activity_title: a.activity_title,
        project_code: a.project_code,
        project_name: a.project_name,
        planned_hours: Number(a.planned_hours),
        start_date: a.start_date,
        end_date: a.end_date,
      })),
      activity: {
        id: activity.id,
        title: activity.title,
        project_id: activity.project_id,
        project_name: activity.project_name,
        project_code: activity.project_code,
        priority: activity.priority_name || 'MEDIUM',
        status: activity.status,
        remaining_effort: Number(activity.remaining_effort_hours || 0),
        planned_dates: {
          start_date: activity.start_date,
          due_date: activity.due_date,
        },
        due_date: activity.due_date,
      },
      nearest_committed_milestone: criticality.nearestCommittedMilestone ? {
        id: criticality.nearestCommittedMilestone.id,
        name: criticality.nearestCommittedMilestone.name,
        milestone_type: criticality.nearestCommittedMilestone.milestone_type,
        target_date: criticality.nearestCommittedMilestone.target_date,
      } : null,
      delivery_impact_statement: criticality.deliveryImpactStatement,
      approved_leaves: workload.approvedLeaves,
      project_manager: projectManager,
      resource_manager: resourceManager,
    };

    const insertSql = `
      INSERT INTO capacity_conflict_cases (
        case_code, activity_id, assignment_id, affected_user_id, project_id,
        status, severity, created_at, deadline, case_data
      ) VALUES ($1, $2, $3, $4, $5, 'RESOURCE_RESOLUTION_REQUIRED', 'CRITICAL_DELIVERY_AT_RISK', $6, $7, $8)
      RETURNING *;
    `;

    const caseRes = await dbClient.query(insertSql, [
      caseCode,
      activityId,
      assignmentId,
      affectedUserId,
      projectId,
      createdAt,
      deadline,
      JSON.stringify(caseData),
    ]);

    const createdCase = caseRes.rows[0];

    // Create in-app notifications for PM and RM
    const notifyUsers = [projectManager?.id, resourceManager?.id].filter(Boolean);
    for (const uid of notifyUsers) {
      await dbClient.query(`
        INSERT INTO in_app_notifications (user_id, case_id, type, title, message)
        VALUES ($1, $2, 'CRITICAL_CONFLICT', $3, $4)
      `, [
        uid,
        createdCase.id,
        `Critical Capacity Conflict: ${caseCode}`,
        `Critical capacity conflict on activity '${activity.title}' requires resolution within 4 working hours.`
      ]);
    }

    // Append immutable audit log
    // The audit actor must be the authenticated user who caused the assignment attempt/case creation.
    // The overloaded engineer remains an affected subject in case data, not the audit actor.
    const resolvedActorId = actorId || currentUser?.id || affectedUserId;
    await recordAuditEvent({
      correlationId: crypto.randomUUID(),
      entityName: 'capacity_conflict_case',
      entityId: createdCase.id,
      action: 'CASE_CREATE',
      actorId: resolvedActorId,
      afterState: caseData,
      changeReason: criticality.deliveryImpactStatement || 'Critical delivery-at-risk conflict created',
      client: dbClient,
    });

    if (isLocalTransaction) await dbClient.query('COMMIT');
    return createdCase;
  } catch (err) {
    if (isLocalTransaction) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTransaction) dbClient.release();
  }
}

/**
 * Present resolution options in exact order (Step 5 § 4):
 * 1. Reassign work (preferred)
 * 2. Adjust assignment dates
 * 3. Reduce or split scope
 * 4. Change priority
 * 5. Authorize override
 */
export async function getCaseResolutionOptions(caseId, currentUser) {
  const caseRes = await query('SELECT * FROM capacity_conflict_cases WHERE id = $1', [caseId]);
  const conflictCase = caseRes.rows[0];
  if (!conflictCase) {
    const err = new Error(`Capacity conflict case not found (ID: ${caseId})`);
    err.statusCode = 404;
    throw err;
  }

  const actRes = await query('SELECT * FROM activities WHERE id = $1', [conflictCase.activity_id]);
  const activity = actRes.rows[0];

  const startDate = formatDateYmd(activity.start_date);
  const dueDate = formatDateYmd(activity.due_date);
  const plannedHours = Number(activity.remaining_effort_hours || activity.current_estimate_hours || 40);

  const candidates = await findAlternativeReassignmentCandidates({
    activityId: activity.id,
    startDate,
    endDate: dueDate,
    plannedHours,
    currentUserId: conflictCase.affected_user_id,
  });

  return [
    {
      order: 1,
      type: 'REASSIGN_WORK',
      label: 'Reassign work',
      is_preferred: true,
      description: 'Reassign work to an alternative team member whose capacity remains below 100%.',
      candidates,
    },
    {
      order: 2,
      type: 'ADJUST_ASSIGNMENT_DATES',
      label: 'Adjust assignment dates',
      is_preferred: false,
      description: 'Adjust assignment dates to relieve weekly overload. The Project Manager must explicitly approve any schedule change. System will not move dates automatically.',
    },
    {
      order: 3,
      type: 'REDUCE_OR_SPLIT_SCOPE',
      label: 'Reduce or split scope',
      is_preferred: false,
      description: 'Reduce planned hours or split activity scope so assigned effort fits within net capacity.',
    },
    {
      order: 4,
      type: 'CHANGE_PRIORITY',
      label: 'Change priority',
      is_preferred: false,
      description: 'Adjust priority to defer lower-priority work across conflicting activities.',
    },
    {
      order: 5,
      type: 'AUTHORIZE_OVERRIDE',
      label: 'Authorize override',
      is_preferred: false,
      description: 'Record an authorized capacity override with business justification (minimum 10 characters). Must be approved by Project Manager or System Admin.',
    },
  ];
}

/**
 * Centralized Scope & Responsibility Evaluation Helpers (Step 5 § 5)
 */
export async function isProjectManagerForProject(userId, projectId, client = null) {
  const runner = client || { query };
  const res = await runner.query(`
    SELECT 1 FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2
    UNION
    SELECT 1 FROM user_scopes WHERE user_id = $1 AND scope_type = 'PROJECT' AND target_id::uuid = $2
  `, [userId, projectId]);
  return res.rows.length > 0;
}

export async function isResourceManagerForUser(rmUserId, targetUserId, client = null) {
  const runner = client || { query };
  const res = await runner.query(`
    SELECT 1 FROM team_memberships tm
    WHERE tm.user_id = $1
      AND tm.archived_at IS NULL
      AND tm.team_id IN (
        SELECT team_id FROM resource_manager_scopes WHERE user_id = $2
        UNION
        SELECT target_id::uuid FROM user_scopes WHERE user_id = $2 AND scope_type = 'TEAM'
      )
  `, [targetUserId, rmUserId]);
  return res.rows.length > 0;
}

export async function findResponsibleProjectManager(projectId, client = null) {
  const runner = client || { query };
  const pmSql = `
    SELECT u.id, u.full_name, u.email
    FROM users u
    WHERE u.is_active = TRUE
      AND (
        u.id IN (SELECT pms.user_id FROM project_manager_scopes pms WHERE pms.project_id = $1)
        OR
        u.id IN (SELECT us.user_id FROM user_scopes us WHERE us.scope_type = 'PROJECT' AND us.target_id::uuid = $1)
      )
    LIMIT 1
  `;
  const pmRes = await runner.query(pmSql, [projectId]);
  return pmRes.rows[0] || null;
}

export async function findResponsibleResourceManager(affectedUserId, client = null) {
  const runner = client || { query };
  const rmSql = `
    SELECT u.id, u.full_name, u.email
    FROM team_memberships tm
    JOIN users u ON (
      u.id IN (SELECT rms.user_id FROM resource_manager_scopes rms WHERE rms.team_id = tm.team_id)
      OR
      u.id IN (SELECT us.user_id FROM user_scopes us WHERE us.scope_type = 'TEAM' AND us.target_id::uuid = tm.team_id)
    )
    WHERE tm.user_id = $1
      AND tm.archived_at IS NULL
      AND u.is_active = TRUE
    LIMIT 1
  `;
  const rmRes = await runner.query(rmSql, [affectedUserId]);
  return rmRes.rows[0] || null;
}

/**
 * Check permissions for viewing resolution options (Step 5 § 4, 5)
 * - SYSTEM_ADMIN: allow all cases.
 * - PROJECT_MANAGER: allow only cases in assigned project scope.
 * - RESOURCE_MANAGER: allow only cases involving members within resource scope.
 * - TEAM_MEMBER and TEAM_LEAD: deny with HTTP 403.
 */
export async function assertCanViewCaseOptions(conflictCase, user, client = null) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const runner = client || { query };
  const rolesRes = await runner.query('SELECT role_code FROM user_roles WHERE user_id = $1', [user.id]);
  const roles = new Set(rolesRes.rows.map(r => r.role_code));

  if (roles.has('SYSTEM_ADMIN')) {
    return { isAdmin: true };
  }

  const isPM = roles.has('PROJECT_MANAGER');
  const isRM = roles.has('RESOURCE_MANAGER');

  if (!isPM && !isRM) {
    const err = new Error('Access denied. Cross-project conflict resolution options are restricted to System Admin, Project Manager, and Resource Manager.');
    err.statusCode = 403;
    throw err;
  }

  if (isPM) {
    const hasPMScope = await isProjectManagerForProject(user.id, conflictCase.project_id, runner);
    if (hasPMScope) {
      return { isPM: true };
    }
    if (!isRM) {
      const err = new Error('Project Manager can access options only for cases within assigned projects');
      err.statusCode = 403;
      throw err;
    }
  }

  if (isRM) {
    const hasRMScope = await isResourceManagerForUser(user.id, conflictCase.affected_user_id, runner);
    if (hasRMScope) {
      return { isRM: true };
    }
    const err = new Error('Resource Manager can access options only for cases concerning members within resource scope');
    err.statusCode = 403;
    throw err;
  }

  const err = new Error('Access denied to case resolution options');
  err.statusCode = 403;
  throw err;
}

/**
 * Check permissions for escalating a conflict case (Step 5 § 5, 6)
 * - SYSTEM_ADMIN: allow.
 * - PROJECT_MANAGER: allow only for an assigned project.
 * - RESOURCE_MANAGER, TEAM_LEAD, TEAM_MEMBER: deny with HTTP 403.
 */
export async function assertCanEscalateCase(conflictCase, user, client = null) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const runner = client || { query };
  const rolesRes = await runner.query('SELECT role_code FROM user_roles WHERE user_id = $1', [user.id]);
  const roles = new Set(rolesRes.rows.map(r => r.role_code));

  if (roles.has('SYSTEM_ADMIN')) {
    return { isAdmin: true };
  }

  if (roles.has('PROJECT_MANAGER')) {
    const hasPMScope = await isProjectManagerForProject(user.id, conflictCase.project_id, runner);
    if (!hasPMScope) {
      const err = new Error('Project Manager can escalate cases only within their assigned projects');
      err.statusCode = 403;
      throw err;
    }
    return { isPM: true };
  }

  const err = new Error('Unauthorized: Only an assigned Project Manager or System Admin can escalate this conflict case');
  err.statusCode = 403;
  throw err;
}

/**
 * Check permissions for resolving a capacity conflict case (Step 5 § 5)
 * - Resource Manager: Can propose options but cannot directly assign work or approve overrides.
 * - Project Manager: Can resolve cases ONLY within assigned projects.
 * - System Admin: Can resolve or override any case.
 */
export async function assertCanResolveCase(conflictCase, user, resolutionType) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const rolesRes = await query('SELECT role_code FROM user_roles WHERE user_id = $1', [user.id]);
  const roles = new Set(rolesRes.rows.map(r => r.role_code));

  if (roles.has('SYSTEM_ADMIN')) {
    return { isAdmin: true };
  }

  // Resource Manager is explicitly prohibited from assigning activities or approving overrides
  if (roles.has('RESOURCE_MANAGER') && !roles.has('PROJECT_MANAGER')) {
    const err = new Error('Resource Manager cannot directly assign activities or approve an override');
    err.statusCode = 403;
    throw err;
  }

  if (roles.has('PROJECT_MANAGER')) {
    const hasPMScope = await isProjectManagerForProject(user.id, conflictCase.project_id);
    if (!hasPMScope) {
      const err = new Error('Project Manager can resolve cases only within their assigned projects');
      err.statusCode = 403;
      throw err;
    }
    return { isPM: true };
  }

  const err = new Error('Unauthorized: Only an assigned Project Manager or System Admin can resolve this conflict case');
  err.statusCode = 403;
  throw err;
}

/**
 * Resolve a capacity conflict case (Step 5 § 7 & 8)
 * Stores full required evidence, atomic updates, and immutable audit record.
 */
export async function resolveCapacityConflictCase(caseId, {
  resolutionType,
  reason,
  newAssigneeUserId = null,
  newStartDate = null,
  newEndDate = null,
  newPlannedHours = null,
  newPriorityId = null,
  justificationReason = null,
}, currentUser) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const caseRes = await client.query('SELECT * FROM capacity_conflict_cases WHERE id = $1 FOR UPDATE', [caseId]);
    const conflictCase = caseRes.rows[0];
    if (!conflictCase) {
      const err = new Error(`Capacity conflict case not found (ID: ${caseId})`);
      err.statusCode = 404;
      throw err;
    }

    if (conflictCase.status === 'RESOLVED') {
      const err = new Error('Case is already resolved');
      err.statusCode = 400;
      throw err;
    }

    await assertCanResolveCase(conflictCase, currentUser, resolutionType);

    if (!RESOLUTION_TYPES.includes(resolutionType)) {
      const err = new Error(`Invalid resolution type: ${resolutionType}. Must be one of: ${RESOLUTION_TYPES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanReason = String(reason || justificationReason || '').trim();
    if (cleanReason.length < 10) {
      const err = new Error('A case cannot be closed as Resolved without a written reason of at least 10 characters');
      err.statusCode = 400;
      throw err;
    }

    const actRes = await client.query('SELECT * FROM activities WHERE id = $1 FOR UPDATE', [conflictCase.activity_id]);
    const activity = actRes.rows[0];

    const correlationId = crypto.randomUUID();
    const resolutionDetails = {
      resolution_type: resolutionType,
      named_decision_maker: {
        id: currentUser.id,
        email: currentUser.email,
      },
      resolved_at: new Date().toISOString(),
      reason: cleanReason,
      before_state: {
        weekly_utilization: conflictCase.case_data.weekly_utilization,
        net_capacity: conflictCase.case_data.net_capacity,
        activity: conflictCase.case_data.activity,
      },
      resulting_field_changes: {},
    };

    // Apply specific resolution mechanics
    if (resolutionType === 'REASSIGN_WORK') {
      if (!newAssigneeUserId) {
        const err = new Error('newAssigneeUserId is required for REASSIGN_WORK resolution');
        err.statusCode = 400;
        throw err;
      }

      // Check resulting capacity for candidate
      const candWorkload = await evaluateUserWorkload({
        userId: newAssigneeUserId,
        startDate: formatDateYmd(activity.start_date),
        endDate: formatDateYmd(activity.due_date),
        proposedPlannedHours: Number(activity.remaining_effort_hours || 40),
        client,
      });

      if (candWorkload.weeks.some(w => w.utilizationPercent >= 100.0)) {
        const err = new Error('Cannot reassign: proposed assignee resulting utilization would reach or exceed 100%');
        err.statusCode = 400;
        throw err;
      }

      const candRes = await client.query('SELECT id, full_name, email FROM users WHERE id = $1', [newAssigneeUserId]);
      const newAssignee = candRes.rows[0];

      await client.query(`
        UPDATE activities 
        SET owner_user_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE id = $3
      `, [newAssigneeUserId, currentUser.id, activity.id]);

      await client.query(`
        UPDATE assignments 
        SET user_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE activity_id = $2 AND status = 'ACTIVE'
      `, [newAssigneeUserId, activity.id]);

      resolutionDetails.resulting_field_changes = {
        old_assignee_id: conflictCase.affected_user_id,
        new_assignee_id: newAssigneeUserId,
        new_assignee_name: newAssignee.full_name,
        resulting_utilization_percent: candWorkload.peakUtilizationPercent,
      };
    } else if (resolutionType === 'ADJUST_ASSIGNMENT_DATES') {
      if (!newStartDate || !newEndDate) {
        const err = new Error('newStartDate and newEndDate are required for ADJUST_ASSIGNMENT_DATES resolution');
        err.statusCode = 400;
        throw err;
      }
      if (newEndDate < newStartDate) {
        const err = new Error('newEndDate cannot be earlier than newStartDate');
        err.statusCode = 400;
        throw err;
      }

      await client.query(`
        UPDATE activities 
        SET start_date = $1, due_date = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = $3
        WHERE id = $4
      `, [newStartDate, newEndDate, currentUser.id, activity.id]);

      await client.query(`
        UPDATE assignments 
        SET start_date = $1, end_date = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE activity_id = $3 AND status = 'ACTIVE'
      `, [newStartDate, newEndDate, activity.id]);

      resolutionDetails.resulting_field_changes = {
        old_start_date: formatDateYmd(activity.start_date),
        old_due_date: formatDateYmd(activity.due_date),
        new_start_date: newStartDate,
        new_due_date: newEndDate,
        milestone_impact: `Schedule updated with explicit approval from Project Manager ${currentUser.email}.`,
      };
    } else if (resolutionType === 'REDUCE_OR_SPLIT_SCOPE') {
      const hours = Number(newPlannedHours);
      if (isNaN(hours) || hours <= 0) {
        const err = new Error('Valid newPlannedHours > 0 is required for REDUCE_OR_SPLIT_SCOPE resolution');
        err.statusCode = 400;
        throw err;
      }

      await client.query(`
        UPDATE activities 
        SET remaining_effort_hours = $1, current_estimate_hours = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE id = $3
      `, [hours, currentUser.id, activity.id]);

      await client.query(`
        UPDATE assignments 
        SET planned_hours = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE activity_id = $2 AND status = 'ACTIVE'
      `, [hours, activity.id]);

      resolutionDetails.resulting_field_changes = {
        old_remaining_effort_hours: Number(activity.remaining_effort_hours),
        new_remaining_effort_hours: hours,
      };
    } else if (resolutionType === 'CHANGE_PRIORITY') {
      if (!newPriorityId) {
        const err = new Error('newPriorityId is required for CHANGE_PRIORITY resolution');
        err.statusCode = 400;
        throw err;
      }

      await client.query(`
        UPDATE activities 
        SET priority_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE id = $3
      `, [newPriorityId, currentUser.id, activity.id]);

      resolutionDetails.resulting_field_changes = {
        old_priority_id: activity.priority_id,
        new_priority_id: newPriorityId,
      };
    } else if (resolutionType === 'AUTHORIZE_OVERRIDE') {
      // Record conflict override
      let assignId = conflictCase.assignment_id;
      if (!assignId) {
        const assignRes = await client.query('SELECT id FROM assignments WHERE activity_id = $1 AND status = \'ACTIVE\' LIMIT 1', [activity.id]);
        assignId = assignRes.rows[0]?.id;
      }

      if (assignId) {
        await client.query(`
          INSERT INTO conflict_overrides (
            assignment_id, overridden_by_user_id, override_role,
            utilization_percent_at_override, justification_reason
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          assignId,
          currentUser.id,
          currentUser.role || 'PROJECT_MANAGER',
          conflictCase.case_data.weekly_utilization || 100.0,
          cleanReason
        ]);
      }

      resolutionDetails.resulting_field_changes = {
        overload_hours: conflictCase.case_data.overload_hours,
        authorized_by: currentUser.email,
        override_role: currentUser.role || 'PROJECT_MANAGER',
        justification_reason: cleanReason,
      };
    }

    // After-state capacity re-calculation (using new dates when dates were adjusted)
    const evalStartDate = (resolutionType === 'ADJUST_ASSIGNMENT_DATES' && newStartDate)
      ? newStartDate
      : formatDateYmd(activity.start_date);
    const evalEndDate = (resolutionType === 'ADJUST_ASSIGNMENT_DATES' && newEndDate)
      ? newEndDate
      : formatDateYmd(activity.due_date);

    const afterWorkload = await evaluateUserWorkload({
      userId: conflictCase.affected_user_id,
      startDate: evalStartDate,
      endDate: evalEndDate,
      client,
    });
    resolutionDetails.after_state = {
      weekly_utilization: afterWorkload.peakUtilizationPercent,
      conflict_status: afterWorkload.conflictStatus,
      evaluated_date_range: {
        start_date: evalStartDate,
        end_date: evalEndDate,
      },
    };

    // Update case record
    const updateCaseSql = `
      UPDATE capacity_conflict_cases
      SET 
        status = 'RESOLVED',
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by_user_id = $1,
        resolution_type = $2,
        resolution_details = $3,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const updatedRes = await client.query(updateCaseSql, [
      currentUser.id,
      resolutionType,
      JSON.stringify(resolutionDetails),
      caseId
    ]);

    // Append immutable audit log
    await recordAuditEvent({
      correlationId,
      entityName: 'capacity_conflict_case',
      entityId: caseId,
      action: 'CASE_RESOLVE',
      actorId: currentUser.id,
      beforeState: conflictCase,
      afterState: updatedRes.rows[0],
      changeReason: cleanReason,
      client,
    });

    await client.query('COMMIT');
    return updatedRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Escalate a capacity conflict case (Step 5 § 6)
 * - Atomic transaction with active client
 * - Notifies all active SYSTEM_ADMIN users (and delivery authority if configured)
 * - Records immutable audit entry
 */
export async function escalateCapacityConflictCase(caseId, { reason } = {}, currentUser = null, client = null) {
  const pool = getPool();
  const dbClient = client || await pool.connect();
  const isLocalTransaction = !client;

  try {
    if (isLocalTransaction) await dbClient.query('BEGIN');

    const caseRes = await dbClient.query('SELECT * FROM capacity_conflict_cases WHERE id = $1 FOR UPDATE', [caseId]);
    const conflictCase = caseRes.rows[0];
    if (!conflictCase) {
      const err = new Error(`Capacity conflict case not found (ID: ${caseId})`);
      err.statusCode = 404;
      throw err;
    }

    if (conflictCase.status === 'RESOLVED') {
      const err = new Error('Cannot escalate an already resolved case');
      err.statusCode = 400;
      throw err;
    }

    if (currentUser) {
      await assertCanEscalateCase(conflictCase, currentUser, dbClient);
    }

    if (conflictCase.status === 'ESCALATED') {
      // Idempotent: already escalated
      if (isLocalTransaction) await dbClient.query('COMMIT');
      return conflictCase;
    }

    const cleanReason = String(reason || 'Escalated due to response deadline expiration or no workable resolution').trim();

    const updateSql = `
      UPDATE capacity_conflict_cases
      SET 
        status = 'ESCALATED',
        escalated_at = CURRENT_TIMESTAMP,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const res = await dbClient.query(updateSql, [caseId]);
    const updatedCase = res.rows[0];

    // Escalation must notify all active SYSTEM_ADMIN users.
    // If a configured delivery authority exists, notify it too; otherwise use all active SYSTEM_ADMIN users as Core Pilot fallback.
    const adminRes = await dbClient.query(`
      SELECT DISTINCT u.id, u.email
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_code = 'SYSTEM_ADMIN' AND u.is_active = TRUE;
    `);

    const notifyUserIds = new Set(adminRes.rows.map(r => r.id));

    if (process.env.DELIVERY_AUTHORITY_USER_ID) {
      notifyUserIds.add(process.env.DELIVERY_AUTHORITY_USER_ID);
    }

    for (const adminId of notifyUserIds) {
      await dbClient.query(`
        INSERT INTO in_app_notifications (user_id, case_id, type, title, message)
        VALUES ($1, $2, 'CASE_ESCALATED', $3, $4)
      `, [
        adminId,
        caseId,
        `Case Escalated: ${conflictCase.case_code}`,
        `Unresolved critical capacity conflict ${conflictCase.case_code} has been escalated to delivery authority.`
      ]);
    }

    await recordAuditEvent({
      entityName: 'capacity_conflict_case',
      entityId: caseId,
      action: 'CASE_ESCALATE',
      actorId: currentUser?.id || null,
      beforeState: conflictCase,
      afterState: updatedCase,
      changeReason: cleanReason,
      client: dbClient,
    });

    if (isLocalTransaction) await dbClient.query('COMMIT');
    return updatedCase;
  } catch (err) {
    if (isLocalTransaction) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (isLocalTransaction) dbClient.release();
  }
}

/**
 * Background / Cron check: Escalate overdue cases past deadline (Step 5 § 6)
 * - Dedicated scheduled job
 * - Uses configured organization calendar / timezone and persisted case deadline
 * - Prevents duplicate concurrent executions using PostgreSQL advisory lock
 * - Structured application logging
 */
export async function checkAndEscalateOverdueCases({ now = null } = {}) {
  const pool = getPool();
  const lockClient = await pool.connect();
  let lockAcquired = false;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    component: 'background-worker',
    job: 'checkAndEscalateOverdueCases',
    status: 'STARTED',
    message: 'Starting overdue capacity-conflict escalation check',
  }));

  try {
    const lockRes = await lockClient.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_ESCALATION]);
    lockAcquired = lockRes.rows[0]?.acquired === true;

    if (!lockAcquired) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        component: 'background-worker',
        job: 'checkAndEscalateOverdueCases',
        status: 'SKIPPED',
        message: 'Concurrent execution in progress: advisory lock could not be acquired',
      }));
      const res = [];
      res.escalatedCount = 0;
      res.skipped = true;
      return res;
    }

    const checkTime = now ? new Date(now) : new Date();
    const sql = `
      SELECT id, case_code, deadline FROM capacity_conflict_cases
      WHERE status = 'RESOURCE_RESOLUTION_REQUIRED'
        AND deadline < $1
      ORDER BY deadline ASC;
    `;
    const res = await lockClient.query(sql, [checkTime]);
    const escalated = [];

    for (const row of res.rows) {
      try {
        const updated = await escalateCapacityConflictCase(row.id, {
          reason: 'Overdue: four-working-hour resolution deadline expired without resolution'
        }, null);
        escalated.push(updated);
      } catch (caseErr) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          component: 'background-worker',
          job: 'checkAndEscalateOverdueCases',
          case_id: row.id,
          case_code: row.case_code,
          error: caseErr.message,
        }));
      }
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      component: 'background-worker',
      job: 'checkAndEscalateOverdueCases',
      status: 'COMPLETED',
      escalated_count: escalated.length,
      message: `Overdue escalation check completed successfully. Escalated ${escalated.length} cases.`,
    }));

    escalated.escalatedCount = escalated.length;
    escalated.skipped = false;
    return escalated;
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      component: 'background-worker',
      job: 'checkAndEscalateOverdueCases',
      status: 'FAILED',
      error: err.message,
      stack: err.stack,
    }));
    throw err;
  } finally {
    if (lockAcquired) {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ESCALATION]);
      } catch (unErr) {
        // Ignore unlock error
      }
    }
    lockClient.release();
  }
}

/**
 * Save assignment with complete Core Pilot capacity validation (Step 5 § 1, 2, 3)
 */
export async function saveAssignmentWithCapacityValidation({
  activityId,
  userId,
  startDate,
  endDate,
  plannedHours,
  override = null,
  currentUser,
}) {
  const pool = getPool();
  const client = await pool.connect();
  let txCommitted = false;

  try {
    await client.query('BEGIN');

    // 1. Fetch activity and verify existence
    const actRes = await client.query('SELECT * FROM activities WHERE id = $1 FOR UPDATE', [activityId]);
    const activity = actRes.rows[0];
    if (!activity) {
      const err = new Error(`Activity not found (ID: ${activityId})`);
      err.statusCode = 404;
      throw err;
    }

    // Role check: Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment
    // TEAM_MEMBER, TEAM_LEAD, and RESOURCE_MANAGER must receive HTTP 403
    const rolesRes = await client.query('SELECT role_code FROM user_roles WHERE user_id = $1', [currentUser.id]);
    const roles = new Set(rolesRes.rows.map(r => r.role_code));
    const isAdmin = roles.has('SYSTEM_ADMIN');
    const isPM = roles.has('PROJECT_MANAGER');

    if (!isAdmin && !isPM) {
      const msg = roles.has('RESOURCE_MANAGER')
        ? 'Resource Manager cannot directly assign activities. Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment.'
        : 'Only SYSTEM_ADMIN and PROJECT_MANAGER may create, change, or save an activity assignment';
      const err = new Error(msg);
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Project Manager scope check: only for a project within their assigned project scope
    if (isPM && !isAdmin) {
      const scopeRes = await client.query(`
        SELECT 1 FROM project_manager_scopes WHERE user_id = $1 AND project_id = $2
        UNION
        SELECT 1 FROM user_scopes WHERE user_id = $1 AND scope_type = 'PROJECT' AND target_id = $2
      `, [currentUser.id, activity.project_id]);
      if (scopeRes.rows.length === 0) {
        const err = new Error('Project Manager can assign activities only within their assigned projects');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    // 2. Evaluate weekly workload and conflict level
    const workload = await evaluateUserWorkload({
      userId,
      startDate,
      endDate,
      proposedPlannedHours: plannedHours,
      client,
    });

    const criticality = await evaluateCriticality({
      projectId: activity.project_id,
      activityId: activity.id,
      activityStartDate: startDate,
      activityDueDate: activity.due_date ? formatDateYmd(activity.due_date) : endDate,
      client,
    });

    // Determine final conflict level
    let finalConflictLevel = workload.conflictStatus;
    let finalLabel = workload.conflictLabel;

    if (workload.conflictStatus === 'CAPACITY_CONFLICT' && criticality.isCritical) {
      finalConflictLevel = 'CRITICAL_DELIVERY_AT_RISK';
      finalLabel = CONFLICT_LEVELS.CRITICAL_DELIVERY_AT_RISK.label;
    }

    // Handle 90% - 100%: Capacity Warning -> Allow save without override
    if (finalConflictLevel === 'CAPACITY_WARNING') {
      // Proceed to save
    }

    // Handle >= 100% or zero net capacity: Capacity Conflict -> Block save unless authorized override
    if (['CAPACITY_CONFLICT', 'CRITICAL_DELIVERY_AT_RISK'].includes(finalConflictLevel)) {
      let createdCase = null;

      // If Critical, create resolution case immediately with currentUser.id as audit actor
      if (finalConflictLevel === 'CRITICAL_DELIVERY_AT_RISK') {
        createdCase = await createCapacityConflictCase({
          activityId: activity.id,
          affectedUserId: userId,
          projectId: activity.project_id,
          workload,
          criticality,
          actorId: currentUser.id,
          currentUser,
          client,
        });
      }

      // Check override
      if (!override || !override.justification_reason || override.justification_reason.trim().length < 10) {
        if (createdCase) {
          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
        }
        txCommitted = true;
        client.release();

        const err = new Error(
          finalConflictLevel === 'CRITICAL_DELIVERY_AT_RISK'
            ? 'Critical Delivery-at-Risk Conflict: assignment save blocked. Resolution case created.'
            : 'Capacity Conflict: assignment blocked unless an authorized override is recorded (minimum 10 characters).'
        );
        err.statusCode = 409;
        err.code = 'CAPACITY_HARD_CONFLICT';
        err.conflictDetails = {
          conflict_level: finalConflictLevel,
          conflict_label: finalLabel,
          case: createdCase,
          workload,
          planned_utilization: workload.peakUtilizationPercent,
          member_id: userId,
          threshold: 100.00,
          requires_override: true,
        };
        throw err;
      }

      // Verify override authorization
      if (!roles.has('PROJECT_MANAGER') && !roles.has('SYSTEM_ADMIN')) {
        const err = new Error('Overrides can only be authorized by a Project Manager or System Admin');
        err.statusCode = 403;
        throw err;
      }
    }

    // 3. Save assignment
    // Deactivate existing active assignment if any
    await client.query(`
      UPDATE assignments
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE activity_id = $1 AND status = 'ACTIVE'
    `, [activity.id]);

    const insAssignSql = `
      INSERT INTO assignments (
        activity_id, user_id, start_date, end_date, planned_hours, status
      ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
      RETURNING *;
    `;
    const assignRes = await client.query(insAssignSql, [
      activity.id,
      userId,
      startDate,
      endDate,
      plannedHours
    ]);
    const savedAssignment = assignRes.rows[0];

    // Update activity owner_user_id to match assignee
    await client.query(`
      UPDATE activities 
      SET owner_user_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
      WHERE id = $3
    `, [userId, currentUser.id, activity.id]);

    // If override provided, record it
    if (override && override.justification_reason) {
      await client.query(`
        INSERT INTO conflict_overrides (
          assignment_id, overridden_by_user_id, override_role,
          utilization_percent_at_override, justification_reason
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        savedAssignment.id,
        currentUser.id,
        roles.has('SYSTEM_ADMIN') ? 'SYSTEM_ADMIN' : 'PROJECT_MANAGER',
        workload.peakUtilizationPercent,
        override.justification_reason.trim()
      ]);
    }

    await recordAuditEvent({
      correlationId: crypto.randomUUID(),
      entityName: 'assignment',
      entityId: savedAssignment.id,
      action: 'ASSIGNMENT_CREATE',
      actorId: currentUser.id,
      afterState: savedAssignment,
      changeReason: override ? `Assigned with override: ${override.justification_reason}` : 'Assignment save with capacity validation',
      client,
    });

    await client.query('COMMIT');
    txCommitted = true;
    client.release();

    return {
      assignment: savedAssignment,
      conflict_level: finalConflictLevel,
      conflict_label: finalLabel,
      workload,
    };
  } catch (err) {
    if (!txCommitted) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        // Ignore rollback error
      }
      client.release();
    }
    throw err;
  }
}
