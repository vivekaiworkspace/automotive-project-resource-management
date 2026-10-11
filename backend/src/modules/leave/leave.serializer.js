/**
 * Server-Side Privacy Serializer for Leave Management (CPD-006, Step 6)
 * 
 * Strict field-level access control enforced purely at server-side serialization layer:
 * 1. SYSTEM_ADMIN: Full leave record for all members.
 * 2. RESOURCE_MANAGER: Full leave record for members in authorized resource scope.
 * 3. TEAM_LEAD: For own team members only: leave dates, duration, status, and leave_type.
 *    leave_reason is masked (null). Approver identity (approved_by_user_id, etc.) is NEVER serialized.
 * 4. PROJECT_MANAGER & peer TEAM_MEMBER: Availability information only (dates, duration, status).
 *    leave_type: null, leave_reason: null. Approver identity is NEVER serialized.
 * 5. TEAM_MEMBER viewing own leave: Can view own leave_type and leave_reason. Approver identity not serialized.
 */

import { getWorkingDaysInRange, ORGANIZATION_CALENDAR } from '../capacity_scheduling/calendar.service.js';

export function serializeLeaveForRole(leaveRecord, callerRoles = [], options = {}) {
  if (!leaveRecord) return null;

  const {
    isOwnRecord = false,
    isInTeam = false,
    isInResourceScope = false,
  } = options;

  const roles = new Set(callerRoles);
  const isAdmin = roles.has('SYSTEM_ADMIN');
  const isRM = roles.has('RESOURCE_MANAGER');
  const isTL = roles.has('TEAM_LEAD');

  const sDate = leaveRecord.start_date || leaveRecord.unavailable_from;
  const eDate = leaveRecord.end_date || leaveRecord.unavailable_to;
  const durationDays = leaveRecord.duration_days !== undefined
    ? Number(leaveRecord.duration_days)
    : (sDate && eDate ? getWorkingDaysInRange(sDate, eDate) : 0);
  const durationHours = leaveRecord.duration_hours !== undefined
    ? Number(leaveRecord.duration_hours)
    : (durationDays * ORGANIZATION_CALENDAR.standardHoursPerDay);

  const baseAvailability = {
    id: leaveRecord.id,
    user_id: leaveRecord.user_id || null,
    member_id: leaveRecord.member_id || null,
    start_date: sDate,
    end_date: eDate,
    unavailable_from: sDate,
    unavailable_to: eDate,
    duration_days: durationDays,
    duration_hours: durationHours,
    status: leaveRecord.status,
    created_at: leaveRecord.created_at,
    decided_at: leaveRecord.decided_at || null,
    version: leaveRecord.version !== undefined ? leaveRecord.version : 1,
  };

  // Tier 1: SYSTEM_ADMIN or in-scope RESOURCE_MANAGER -> full record
  if (isAdmin || (isRM && (isInResourceScope || isOwnRecord))) {
    return {
      ...baseAvailability,
      leave_type: leaveRecord.leave_type,
      leave_reason: leaveRecord.leave_reason,
      approved_by_user_id: leaveRecord.approved_by_user_id || null,
    };
  }

  // Tier 2: Own record for employee -> sees own submitted type and reason; approver identity masked
  if (isOwnRecord) {
    return {
      ...baseAvailability,
      leave_type: leaveRecord.leave_type,
      leave_reason: leaveRecord.leave_reason,
    };
  }

  // Tier 3: TEAM_LEAD for own-team members -> sees dates, duration, status, and leave_type.
  // leave_reason is masked (null). Approver identity MUST NOT exist on output.
  if (isTL && isInTeam) {
    return {
      ...baseAvailability,
      leave_type: leaveRecord.leave_type,
      leave_reason: null,
    };
  }

  // Tier 4: PROJECT_MANAGER & peer TEAM_MEMBER -> availability only (type: null, reason: null, no approver)
  return {
    ...baseAvailability,
    leave_type: null,
    leave_reason: null,
  };
}

export function serializeLeaveListForRole(leaveRecords, callerRoles = [], optionsMap = {}) {
  if (!Array.isArray(leaveRecords)) return [];
  return leaveRecords.map(record => {
    const opts = typeof optionsMap === 'function' ? optionsMap(record) : (optionsMap[record.id] || optionsMap);
    return serializeLeaveForRole(record, callerRoles, opts);
  });
}
