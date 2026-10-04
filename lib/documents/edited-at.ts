import { differenceInCalendarDays, format } from "date-fns";

/**
 * When a document was last written, as a tile shows it.
 *
 * Relative while that is the useful answer and absolute once it is not: "6d
 * ago" is something a person can feel, "97d ago" is arithmetic. The cut is a
 * week, after which the date reads faster than the gap.
 */
export function describeEditedAt(updatedAt: Date, now: Date): string {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - updatedAt.getTime()) / 1000),
  );

  if (seconds < 60) {
    return "Edited just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Edited ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Edited ${hours}h ago`;
  }

  // Calendar days, so something written late yesterday reads as 1d rather than
  // as hours a person has to divide.
  const days = differenceInCalendarDays(now, updatedAt);
  if (days < 7) {
    return `Edited ${days}d ago`;
  }

  return `Edited ${format(updatedAt, now.getFullYear() === updatedAt.getFullYear() ? "MMM d" : "MMM d, yyyy")}`;
}
