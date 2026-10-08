/**
 * checkins module — daily check-ins, streaks, the slip flow and the progress
 * page (CLAUDE.md §7.5). Phase 4.
 *
 * Public API, in two entry points (other modules may import only these):
 *   "@/features/checkins"     server code and server components (this file)
 *   "@/features/checkins/ui"  the answer buttons (client)
 */
export { CHART_RANGES, NOTE_MAX, TRIGGERS, type ChartRange, type Outcome, type Trigger } from "./constants";
export { isCheckinErrorKey, type CheckinErrorKey } from "./errors";
export { buildInsights, triggerCounts, type DayRecord, type Insight } from "./insights";
export {
  getCheckinFor,
  getCheckinHistory,
  getCheckinOverview,
  getGroupToday,
  type CheckinDetails,
  type CheckinOverview,
  type MemberToday,
} from "./server/queries";
export { exportCheckinsData } from "./server/export";

// Server components: no JavaScript reaches the browser for these.
export {
  AnsweredDay,
  CheckinErrorBanner,
  CheckinForm,
  GroupToday,
  InsightList,
  KeptMessage,
  NextStep,
  PrayerCard,
  ReflectionForm,
  StreakStats,
  TodayCard,
} from "./components/checkin-views";
export { SeriesChart, TriggerBars, type SeriesPoint } from "./components/charts";
