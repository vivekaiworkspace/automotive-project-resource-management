/**
 * Capacity & Assignment Engine Module (Step 5)
 * Architectural boundary: Deterministic capacity mathematics, 90% soft warning, 100% hard block, cross-project aggregation (CPD-002, CPD-004, CPD-005).
 */
export const capacitySchedulingModule = {
  name: 'capacity_scheduling',
  version: '0.2.0',
  status: 'CORE_PILOT_IMPLEMENTED',
  units: 'HOURS',
  thresholds: {
    softWarningPercent: 90.0,
    hardBlockPercent: 100.0,
    minOverrideReasonChars: 10,
  },
  
  /**
   * Pure function: Calculate net capacity in hours given working days, standard hours, approved leave, and buffer percent
   */
  calculateNetCapacityHours(workingDaysCount, standardHoursPerDay, approvedLeaveHours = 0, bufferPercent = 0) {
    const grossHours = workingDaysCount * standardHoursPerDay;
    const availableHours = Math.max(0, grossHours - approvedLeaveHours);
    const netHours = availableHours * (1.0 - (bufferPercent / 100.0));
    return Math.round(netHours * 100) / 100;
  },

  /**
   * Pure function: Evaluate utilization and threshold violation
   */
  evaluateUtilization(plannedHours, netCapacityHours) {
    if (netCapacityHours <= 0) {
      return {
        plannedUtilizationPercent: plannedHours > 0 ? 999.99 : 0.0,
        status: plannedHours > 0 ? 'HARD_BLOCK' : 'OK',
        label: plannedHours > 0 ? 'Capacity Conflict' : 'OK',
        message: plannedHours > 0 ? 'Member has zero net capacity during this timeframe' : 'No load assigned',
      };
    }

    const utilPercent = Math.round((plannedHours / netCapacityHours) * 10000) / 100;
    
    if (utilPercent >= 100.0) {
      return {
        plannedUtilizationPercent: utilPercent,
        status: 'HARD_BLOCK',
        label: 'Capacity Conflict',
        message: `Proposed assignment exceeds 100% capacity (${utilPercent}%) and requires authorized override`,
      };
    }

    if (utilPercent >= 90.0) {
      return {
        plannedUtilizationPercent: utilPercent,
        status: 'SOFT_WARNING',
        label: 'Capacity Warning',
        message: `Proposed assignment reaches warning threshold (${utilPercent}%)`,
      };
    }

    return {
      plannedUtilizationPercent: utilPercent,
      status: 'OK',
      label: 'OK',
      message: 'Utilization within standard capacity',
    };
  }
};

export * from './calendar.service.js';
export * from './milestone.service.js';
export * from './capacity.service.js';
export * from './capacity.controller.js';
