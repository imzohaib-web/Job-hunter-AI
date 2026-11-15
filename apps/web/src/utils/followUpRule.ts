import type { ApplicationDetailItem } from "@/hooks/useApi";

/**
 * Determines whether an application needs follow-up.
 * Rule: Application was applied more than 7 days ago with no subsequent status change.
 *
 * @param app - The application item
 * @param referenceDate - The reference date to calculate from (defaults to now)
 * @returns boolean indicating if follow-up is needed
 */
export function isApplicationNeedingFollowUp(
  app: ApplicationDetailItem,
  referenceDate: Date = new Date(),
): boolean {
  // Only applications currently in 'applied' status can need follow-up
  if (app.status !== "applied") {
    return false;
  }

  // Determine the date when the application entered 'applied' status
  let appliedDate: Date | null = null;

  if (app.appliedAt) {
    const d = new Date(app.appliedAt);
    if (!isNaN(d.getTime())) {
      appliedDate = d;
    }
  }

  // Fallback to the latest statusHistory entry where status was 'applied'
  if (!appliedDate && app.statusHistory && app.statusHistory.length > 0) {
    const appliedEntry = [...app.statusHistory]
      .reverse()
      .find((entry) => entry.status === "applied");
    if (appliedEntry?.changedAt) {
      const d = new Date(appliedEntry.changedAt);
      if (!isNaN(d.getTime())) {
        appliedDate = d;
      }
    }
  }

  // Fallback to createdAt if marked applied from the beginning
  if (!appliedDate && app.createdAt) {
    const d = new Date(app.createdAt);
    if (!isNaN(d.getTime())) {
      appliedDate = d;
    }
  }

  if (!appliedDate) {
    return false;
  }

  // Check if there was any subsequent status change recorded after appliedDate
  if (app.statusHistory && app.statusHistory.length > 0) {
    const subsequentChange = app.statusHistory.some((entry) => {
      const entryDate = new Date(entry.changedAt);
      return entryDate.getTime() > appliedDate!.getTime() && entry.status !== "applied";
    });

    if (subsequentChange) {
      return false;
    }
  }

  // Calculate elapsed time in days
  const elapsedMs = referenceDate.getTime() - appliedDate.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  // Must be strictly more than 7 days ago
  return elapsedDays > 7;
}

/**
 * Filter an array of applications to those requiring follow-up.
 */
export function getApplicationsNeedingFollowUp(
  apps: ApplicationDetailItem[],
  referenceDate: Date = new Date(),
): ApplicationDetailItem[] {
  return apps.filter((app) => isApplicationNeedingFollowUp(app, referenceDate));
}

/**
 * Helper to get days since applied.
 */
export function getDaysSinceApplied(
  app: ApplicationDetailItem,
  referenceDate: Date = new Date(),
): number {
  let appliedDate: Date | null = null;
  if (app.appliedAt) {
    const d = new Date(app.appliedAt);
    if (!isNaN(d.getTime())) appliedDate = d;
  } else if (app.statusHistory) {
    const appliedEntry = [...app.statusHistory]
      .reverse()
      .find((e) => e.status === "applied");
    if (appliedEntry) appliedDate = new Date(appliedEntry.changedAt);
  }

  if (!appliedDate && app.createdAt) {
    appliedDate = new Date(app.createdAt);
  }

  if (!appliedDate) return 0;
  const elapsedMs = Math.max(0, referenceDate.getTime() - appliedDate.getTime());
  return Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
}
