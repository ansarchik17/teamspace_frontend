import PageHeader from '../../../shared/ui/PageHeader'
import AppButton from '../../../shared/ui/AppButton'
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MaterialSymbol from "../../../shared/ui/MaterialSymbol";
import AppSelect, { type AppSelectOption } from "../../../shared/ui/AppSelect";
import { EMPTY_ROOM_ID, HttpMeetingRoomRepository, type MeetingRoomAvailability } from "../../../infrastructure/repositories/HttpMeetingRoomRepository";
import { LocalStorageAuthSessionStore as RoomSessionStore } from "../../../infrastructure/storage/LocalStorageAuthSessionStore";
import AppTimePicker from "../../../shared/ui/AppTimePicker";
import { formatDate } from "../../../shared/i18n/format";
import AppToast from "../../../shared/ui/AppToast";
import { getErrorMessage } from "../../../shared/utils/getErrorMessage";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type BrowserNotificationPermission,
} from "../../../shared/notifications/browserNotifications";
import {
  formatInTimeZone,
  formatTimeZoneLabel,
  getBrowserTimeZone,
  getSelectableTimeZones,
  utcIsoToZonedInput,
  zonedInputToUtcIso,
} from "../../../shared/utils/timeZone";
import { createCalendarController } from "../../calendar/createCalendarController";
import CalendarModeSwitch from "../../components/calendar/CalendarModeSwitch";
import CalendarMonthGrid from "../../components/calendar/CalendarMonthGrid";
import CalendarSkeletons from "../../components/calendar/CalendarSkeletons";
import { AttendanceBadge, AttendanceChoice, EventPlaceRow, eventHasOnline, eventHasPlace } from "../../components/calendar/CalendarEventPlace";
import { useTranslation } from "react-i18next";
import { getIntlLocale, i18n } from "../../../shared/i18n";
import type { CalendarAttendance } from "../../../domain/entities/CalendarEvent";
import CalendarFreeBusy, {
  type CalendarFreeBusyRow,
} from "../../components/calendar/CalendarFreeBusy";
import {
  applyAttendance,
  applyRsvpStatus,
  type CalendarEventViewModel,
  type CalendarMode,
  type CalendarRsvpSummary,
  type CalendarViewModel,
} from "../../view-models/CalendarViewModel";
import type {
  CalendarAvailabilityResponse,
  CalendarConflictsByUser,
  CalendarRespondStatus,
  CalendarRsvpStatus,
  CalendarSelectableUser,
  CalendarSuggestedSlot,
  CalendarTodaySummary,
  CalendarUserBusy,
  CreateCalendarEventPayload,
  UpdateCalendarEventPayload,
  UserCalendar,
} from "../../../domain/entities/CalendarEvent";
import { validateCalendarEvent } from "../../../domain/entities/validateCalendarEvent";
import { calendarEventDayKeys } from "../../../application/use-cases/calendar/calendarEventDays";

const translate = i18n.t.bind(i18n) as unknown as (key: string, values?: Record<string, unknown>) => string;
const tc = (key: string, values?: Record<string, unknown>): string =>
  translate(`calendar:page.${key}`, values ?? {});

const weekdayLabels = (): string[] =>
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => tc(`weekdays.${day}`));

const RSVP_STATUS_META: Record<
  CalendarRsvpStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  accepted: { get label() { return tc("rsvp.status.accepted"); }, icon: "check_circle", color: "#1B7A43", bg: "#EAF9F1", border: "#CFEBDD" },
  tentative: { get label() { return tc("rsvp.status.tentative"); }, icon: "help", color: "#9A6700", bg: "#FFF8E1", border: "#F5E1A4" },
  declined: { get label() { return tc("rsvp.status.declined"); }, icon: "cancel", color: "#B63B3B", bg: "#FFF0F0", border: "#F0CFCF" },
  needs_action: { get label() { return tc("rsvp.status.needsAction"); }, icon: "schedule", color: "#5C728E", bg: "#F1F5F9", border: "#E2E8F0" },
};

const RSVP_OPTIONS: Array<{ status: CalendarRespondStatus; label: string }> = [
  { status: "accepted", get label() { return tc("rsvp.action.accept"); } },
  { status: "tentative", get label() { return tc("rsvp.status.tentative"); } },
  { status: "declined", get label() { return tc("rsvp.action.decline"); } },
];

const RSVP_SUCCESS_MESSAGES: Record<CalendarRespondStatus, string> = {
  get accepted() { return tc("rsvp.mine.accepted"); },
  get tentative() { return tc("rsvp.mine.tentative"); },
  get declined() { return tc("rsvp.mine.declined"); },
};

const MY_RSVP_LABELS: Record<CalendarRsvpStatus, string> = {
  get accepted() { return tc("rsvp.mine.accepted"); },
  get tentative() { return tc("rsvp.mine.tentative"); },
  get declined() { return tc("rsvp.mine.declined"); },
  get needs_action() { return tc("rsvp.mine.needsAction"); },
};

function RsvpStatusBadge({ status, size = "md" }: { status: CalendarRsvpStatus; size?: "sm" | "md" }) {
  const meta = RSVP_STATUS_META[status] ?? RSVP_STATUS_META.needs_action;
  return (
    <div
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${size === "sm" ? "h-5" : "h-6"}`}
      style={{ backgroundColor: meta.bg, color: meta.color, borderColor: meta.border }}
      title={meta.label}
    >
      <MaterialSymbol name={meta.icon} size={10} color="currentColor" />
      <span>{meta.label}</span>
    </div>
  );
}

function RsvpSummaryLine({ summary }: { summary: CalendarRsvpSummary }) {
  const parts = [
    { key: "accepted", label: tc("rsvp.summary.accepted"), value: summary.accepted, color: RSVP_STATUS_META.accepted.color },
    { key: "tentative", label: tc("rsvp.status.tentative"), value: summary.tentative, color: RSVP_STATUS_META.tentative.color },
    { key: "declined", label: tc("rsvp.summary.declined"), value: summary.declined, color: RSVP_STATUS_META.declined.color },
    { key: "pending", label: tc("rsvp.summary.pending"), value: summary.pending, color: RSVP_STATUS_META.needs_action.color },
  ];
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold">
      {parts.map((part) => (
        <span key={part.key} style={{ color: part.color }}>
          {part.label}: {part.value}
        </span>
      ))}
    </p>
  );
}

const PARTICIPANT_AVATAR_TONES = ["#E8EEFF:#2458D3", "#E7F7EF:#13784A", "#FFF3E0:#A15C00", "#F3EAFF:#7A3FD1", "#E6F6FA:#0E7490", "#FDECEF:#B42350"];

function ParticipantsCard({
  event,
  loading,
}: {
  event: CalendarEventViewModel;
  loading: boolean;
}) {
  const { t } = useTranslation("calendar");
  const organizerId = Number(event.organizerUserId);
  const showAttendance = eventHasPlace(event) && eventHasOnline(event);
  const attendance = event.attendees.reduce(
    (acc, attendee) => {
      if (attendee.status === "declined") return acc;
      if (attendee.attendance === "offline") acc.offline += 1;
      else if (attendee.attendance === "online") acc.online += 1;
      else if (Number(attendee.id) !== organizerId) acc.unknown += 1;
      return acc;
    },
    { offline: 0, online: 0, unknown: 0 },
  );
  const attendanceTotal = attendance.offline + attendance.online + attendance.unknown;
  const hasInvitees = event.attendees.some((attendee) => Number(attendee.id) !== organizerId);
  const rsvpTiles = [
    { key: "accepted", value: event.rsvpSummary.accepted, meta: RSVP_STATUS_META.accepted },
    { key: "tentative", value: event.rsvpSummary.tentative, meta: RSVP_STATUS_META.tentative },
    { key: "declined", value: event.rsvpSummary.declined, meta: RSVP_STATUS_META.declined },
    { key: "pending", value: event.rsvpSummary.pending, meta: RSVP_STATUS_META.needs_action },
  ] as const;
  const sorted = [...event.attendees].sort((a, b) =>
    Number(b.id === organizerId) - Number(a.id === organizerId) || a.fullName.localeCompare(b.fullName),
  );

  return (
    <section className="mt-5 rounded-2xl border border-[#EDF2F7] bg-white">
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-[#1F2E45]">{t("event.participants.title")}</h3>
          <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#2458D3]">{event.attendees.length}</span>
        </div>
        {loading ? <span className="animate-pulse text-[10px] text-[#90A3BF]">{t("event.participants.updating")}</span> : null}
      </header>

      {hasInvitees ? (
        <div className="grid grid-cols-4 gap-1.5 px-4 pt-3">
          {rsvpTiles.map((tile) => (
            <div key={tile.key} className="rounded-xl px-2 py-1.5 text-center" style={{ backgroundColor: tile.meta.bg }}>
              <p className="text-[15px] font-extrabold leading-5" style={{ color: tile.meta.color }}>{tile.value}</p>
              <p className="truncate text-[10px] font-semibold" style={{ color: tile.meta.color }}>{t(`event.participants.${tile.key}`)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showAttendance && hasInvitees && attendanceTotal > 0 ? (
        <div className="px-4 pt-3">
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#90A3BF]">{t("event.participants.format")}</p>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-[#EEF1F5]">
            <span className="bg-[#16A34A]" style={{ width: `${(attendance.offline / attendanceTotal) * 100}%` }} />
            <span className="bg-[#2458D3]" style={{ width: `${(attendance.online / attendanceTotal) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-[#13784A]"><MaterialSymbol name="location_on" size={12} color="currentColor" />{t("event.attendance.offline")}: {attendance.offline}</span>
            <span className="inline-flex items-center gap-1 text-[#2458D3]"><MaterialSymbol name="videocam" size={12} color="currentColor" />{t("event.attendance.online")}: {attendance.online}</span>
            <span className="inline-flex items-center gap-1 text-[#7B8EA9]"><MaterialSymbol name="schedule" size={12} color="currentColor" />{t("event.participants.notChosen")}: {attendance.unknown}</span>
          </div>
        </div>
      ) : null}

      <ul className="custom-scrollbar mt-3 max-h-56 divide-y divide-[#F0F4FA] overflow-y-auto border-t border-[#F0F4FA]">
        {sorted.map((attendee) => {
          const isOrganizer = Number(attendee.id) === organizerId;
          const [bg, fg] = PARTICIPANT_AVATAR_TONES[Math.abs(attendee.id) % PARTICIPANT_AVATAR_TONES.length].split(":");
          const initials = attendee.fullName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("") || "?";
          return (
            <li key={`preview-att-${attendee.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold" style={{ backgroundColor: bg, color: fg }}>{initials}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#1F2E45]">{attendee.fullName}</p>
                <p className="truncate text-[11px] text-[#7B8EA9]">{isOrganizer ? t("event.participants.organizer") : attendee.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {showAttendance ? <AttendanceBadge attendance={attendee.attendance} /> : null}
                <RsvpStatusBadge status={attendee.status} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RsvpButtons({
  current,
  disabled,
  layout,
  onSelect,
}: {
  current: CalendarRsvpStatus;
  disabled: boolean;
  layout: "row" | "stack" | "compact";
  onSelect: (status: CalendarRespondStatus) => void;
}) {
  const containerClass =
    layout === "stack" ? "space-y-1.5" : "grid grid-cols-3 gap-1.5";
  const buttonClass =
    layout === "compact"
      ? "h-7 min-w-0 rounded-lg px-1 text-[10px]"
      : layout === "stack"
        ? "h-8 w-full rounded-xl px-2 text-[11px]"
        : "h-8 min-w-0 rounded-xl px-1.5 text-[11px]";
  return (
    <div className={containerClass}>
      {RSVP_OPTIONS.map((option) => {
        const meta = RSVP_STATUS_META[option.status];
        const isActive = current === option.status;
        return (
          <button
            key={option.status}
            type="button"
            disabled={disabled || isActive}
            aria-pressed={isActive}
            onClick={() => onSelect(option.status)}
            className={`flex items-center justify-center gap-1.5 border font-bold transition duration-200 active:scale-[0.98] disabled:cursor-default ${buttonClass} ${isActive ? "" : "hover:brightness-95"} ${disabled && !isActive ? "opacity-60" : ""}`}
            style={{
              backgroundColor: meta.bg,
              color: meta.color,
              borderColor: isActive ? meta.color : meta.border,
              boxShadow: isActive ? `0 0 0 1px ${meta.color}` : undefined,
            }}
          >
            {layout !== "compact" ? <MaterialSymbol name={meta.icon} size={12} color="currentColor" /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const emptyCalendarViewModel: CalendarViewModel = {
  host: null,
  events: [],
};

const emptyEventForm: EventFormState = {
  calendarId: "",
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  isAllDay: false,
  isOnline: true,
  location: "",
  color: "#2458D3",
  attendeeIds: [],
  reminderMinutes: "",
  recurrenceRule: "",
  timezone: getBrowserTimeZone(),
};

const HOUR_ROW_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }).map((_, index) => index);
const MINI_CALENDAR_MAX_DOTS = 3;
const MAX_VISIBLE_SUGGESTED_SLOTS = 3;
const REMINDER_CUSTOM_VALUE = "__custom__";
const REMINDER_PRESET_OPTIONS: AppSelectOption[] = [
  { value: "", get label() { return tc("reminder.none"); } },
  { value: "5", get label() { return tc("reminder.m5"); } },
  { value: "10", get label() { return tc("reminder.m10"); } },
  { value: "15", get label() { return tc("reminder.m15"); } },
  { value: "30", get label() { return tc("reminder.m30"); } },
  { value: "60", get label() { return tc("reminder.h1"); } },
  { value: REMINDER_CUSTOM_VALUE, get label() { return tc("reminder.custom"); } },
];

const RECURRENCE_OPTIONS: AppSelectOption[] = [
  { value: "", get label() { return tc("recurrence.none"); } },
  { value: "DAILY", get label() { return tc("recurrence.daily"); } },
  { value: "WEEKLY", get label() { return tc("recurrence.weekly"); } },
  { value: "MONTHLY", get label() { return tc("recurrence.monthly"); } },
];

interface PositionedEvent {
  event: CalendarEventViewModel;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

interface ActiveCalendarEdit {
  event: CalendarEventViewModel;
  occurrenceKey: string;
  mode: "move" | "resize-start" | "resize-end";
  startClientY: number;
  startClientX: number;
  originalDayKey: string;
  draftDayKey: string;
  originalStartMinutes: number;
  originalEndMinutes: number;
  draftStartMinutes: number;
  draftEndMinutes: number;
  hasChanged: boolean;
}

interface EventFormState {
  calendarId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isOnline: boolean;
  location: string;
  roomId?: string;
  color: string;
  attendeeIds: number[];
  reminderMinutes: string;
  recurrenceRule: string;
  timezone: string;
}

interface CalendarToastItem {
  id: number;
  message: string;
  variant: "success" | "error" | "warning";
}

interface EventAvailabilityPayload {
  startTime: string;
  endTime: string;
  attendeeIds: number[];
  excludeEventId?: string | null;
  timezone: string;
}

const isRoomBookedError = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ROOM_ALREADY_BOOKED");

const getErrorStatus = (error: unknown): number | null => {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }

  return null;
};

const isReminderPresetValue = (value: string): boolean =>
  value === "" ||
  REMINDER_PRESET_OPTIONS.some(
    (option) =>
      option.value === value && option.value !== REMINDER_CUSTOM_VALUE,
  );

const getMiniCalendarEventDots = (events: CalendarEventViewModel[]) =>
  events.slice(0, MINI_CALENDAR_MAX_DOTS).map((event, index) => ({
    key: `${event.id}-${index}`,
    color: event.color || "#2458D3",
  }));

const buildQuickReminderOptions = (value: string): AppSelectOption[] => {
  const baseOptions = REMINDER_PRESET_OPTIONS.filter(
    (option) => option.value !== REMINDER_CUSTOM_VALUE,
  );
  if (!value || isReminderPresetValue(value)) {
    return baseOptions;
  }

  return [
    baseOptions[0],
    { value, label: tc("reminder.minutesBefore", { minutes: value }) },
    ...baseOptions.slice(1),
  ];
};

const getOnlineMeetingStatusLabel = (event: CalendarEventViewModel): string => {
  if (!event.isOnline) return tc("online.offline");
  if (event.joinUrl) return tc("online.linkReady");
  if (event.onlineMeetingStatus === "pending") return tc("online.qmeetPending");
  if (event.onlineMeetingStatus === "failed")
    return tc("online.qmeetFailed");
  return tc("online.meeting");
};

const getOnlineMeetingProviderLabel = (
  event: CalendarEventViewModel,
): string => {
  if (!event.meetingProvider) return tc("online.online");
  if (event.meetingProvider === "livekit") return tc("online.video");
  if (event.meetingProvider === "cisco") return "Cisco";
  return event.meetingProvider;
};

const toStartOfDay = (date: Date): Date => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const toEndOfDay = (date: Date): Date => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const addDays = (date: Date, days: number): Date => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

const toDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDayKey = (dayKey: string): Date => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const getStartOfWeek = (date: Date): Date => {
  const normalized = toStartOfDay(date);
  const day = normalized.getDay();
  const mondayShift = day === 0 ? -6 : 1 - day;
  return addDays(normalized, mondayShift);
};

const formatMonthTitle = (date: Date): string =>
  formatDate(date, {
    month: "long",
    year: "numeric",
  });

const formatDayTitle = (date: Date): string =>
  formatDate(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatRangeLabel = (from: Date, to: Date): string => {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = formatDate(from, {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toLabel = formatDate(to, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${fromLabel} — ${toLabel}`;
};

const getRangeForMode = (
  mode: CalendarMode,
  anchorDate: Date,
): { from: Date; to: Date; periodLabel: string } => {
  if (mode === "month") {
    const from = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const to = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return {
      from: toStartOfDay(from),
      to: toEndOfDay(to),
      periodLabel: formatMonthTitle(anchorDate),
    };
  }

  if (mode === "week") {
    const from = getStartOfWeek(anchorDate);
    const to = addDays(from, 6);
    return {
      from: toStartOfDay(from),
      to: toEndOfDay(to),
      periodLabel: formatRangeLabel(from, to),
    };
  }

  return {
    from: toStartOfDay(anchorDate),
    to: toEndOfDay(anchorDate),
    periodLabel: formatDayTitle(anchorDate),
  };
};

const getMonthRange = (anchorDate: Date): { from: Date; to: Date } => {
  const from = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const to = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  return {
    from: toStartOfDay(from),
    to: toEndOfDay(to),
  };
};

const buildMonthCells = (
  anchorDate: Date,
  selectedDayKey: string,
  eventsByDayKey: Record<string, CalendarEventViewModel[]>,
): Array<{
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEventViewModel[];
}> => {
  const monthStart = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    1,
  );
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -firstWeekday);
  const todayKey = toDayKey(new Date());

  return Array.from({ length: 42 }).map((_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toDayKey(date);

    return {
      dateKey,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === anchorDate.getMonth(),
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDayKey,
      events: eventsByDayKey[dateKey] ?? [],
    };
  });
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toHourLabel = (hour: number): string => {
  const date = new Date(2025, 0, 1, hour, 0, 0);
  return formatDate(date, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const toTimeRangeLabel = (
  startIso: string,
  endIso: string,
  isAllDay: boolean,
): string => {
  if (isAllDay) return tc("allDay");
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${start.toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}`;
};

const getFormatterTimeZone = (timezone?: string): string | undefined => {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat(getIntlLocale(), { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return undefined;
  }
};

const formatConflictDateTimeRange = (
  startIso: string,
  endIso: string,
  timezone?: string,
): string => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return "";
  const timeZone = getFormatterTimeZone(timezone);

  const sameDay = start.toDateString() === end.toDateString();
  const startLabel = formatDate(start, {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  if (sameDay) {
    const endTime = formatDate(end, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    return `${startLabel} - ${endTime}`;
  }

  const endLabel = formatDate(end, {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${startLabel} - ${endLabel}`;
};

const formatSuggestedSlotLabel = (
  startIso: string,
  endIso: string,
  timezone?: string,
): string => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return "";
  const timeZone = getFormatterTimeZone(timezone);

  const dayLabel = formatDate(start, {
    weekday: "short",
    day: "2-digit",
    month: "long",
    timeZone,
  });
  const timeLabel = `${start.toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit", timeZone })} - ${end.toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit", timeZone })}`;
  return `${dayLabel}, ${timeLabel}`;
};

const getDateKeyInTimeZone = (date: Date, timezone?: string): string => {
  const timeZone = getFormatterTimeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
};

const getSuggestedSlotKey = (slot: CalendarSuggestedSlot): string =>
  `${slot.startTime}-${slot.endTime}`;

const getSuggestedSlotBadgeLabel = (
  slot: CalendarSuggestedSlot,
  index: number,
  timezone?: string,
): string => {
  if (index === 0) return tc("slots.best");
  if (slot.label?.trim()) return slot.label.trim();

  const start = new Date(slot.startTime);
  if (Number.isNaN(start.valueOf())) return tc("slots.free");

  const now = new Date();
  const slotDayKey = getDateKeyInTimeZone(start, timezone);
  const todayKey = getDateKeyInTimeZone(now, timezone);
  const tomorrowKey = getDateKeyInTimeZone(addDays(now, 1), timezone);

  if (slotDayKey === todayKey) return tc("slots.nearest");
  if (slotDayKey === tomorrowKey) return tc("slots.tomorrow");
  return tc("slots.free");
};

const sortSuggestedSlots = (
  slots: CalendarSuggestedSlot[],
): CalendarSuggestedSlot[] =>
  [...slots].sort((left, right) => {
    const leftScore =
      typeof left.score === "number" ? left.score : Number.NEGATIVE_INFINITY;
    const rightScore =
      typeof right.score === "number" ? right.score : Number.NEGATIVE_INFINITY;
    if (leftScore !== rightScore) return rightScore - leftScore;

    const leftStart = new Date(left.startTime).valueOf();
    const rightStart = new Date(right.startTime).valueOf();
    if (Number.isNaN(leftStart) || Number.isNaN(rightStart)) return 0;
    return leftStart - rightStart;
  });

const getOverlapMinutes = (
  selectedStartIso: string,
  selectedEndIso: string,
  conflictStartIso: string,
  conflictEndIso: string,
  overlapMinutes?: number,
): number => {
  if (typeof overlapMinutes === "number" && overlapMinutes > 0) {
    return overlapMinutes;
  }
  const selectedStart = new Date(selectedStartIso);
  const selectedEnd = new Date(selectedEndIso);
  const conflictStart = new Date(conflictStartIso);
  const conflictEnd = new Date(conflictEndIso);
  if (
    [selectedStart, selectedEnd, conflictStart, conflictEnd].some((value) =>
      Number.isNaN(value.valueOf()),
    )
  ) {
    return 0;
  }
  const overlapStart = Math.max(
    selectedStart.valueOf(),
    conflictStart.valueOf(),
  );
  const overlapEnd = Math.min(selectedEnd.valueOf(), conflictEnd.valueOf());
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
};

const getInitials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part.substring(0, 1).toUpperCase())
    .join("");
};

const formatParticipantCountLabel = (count: number): string => {
  return tc("participants", { count });
};

const toOccurrenceKey = (event: CalendarEventViewModel): string =>
  `${event.id}__${event.dayKey}__${event.startTime}`;

const toLocalDateTimeInputValue = (iso: string, timeZone?: string): string => {
  if (timeZone && timeZone !== getBrowserTimeZone()) {
    return utcIsoToZonedInput(iso, timeZone);
  }
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toAllDayEditorInputValue = (
  iso: string,
  edge: "start" | "end",
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";

  if (edge === "end") {
    date.setMilliseconds(date.getMilliseconds() - 1);
  }

  return `${toDayKey(date)}T00:00`;
};

const fromLocalDateTimeInputValue = (value: string, timeZone?: string): string => {
  if (!value) return "";
  if (timeZone && timeZone !== getBrowserTimeZone()) {
    return zonedInputToUtcIso(value, timeZone);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString();
};

const toAllDayRange = (
  startInputValue: string,
  endInputValue: string,
): { startIso: string; endIso: string } | null => {
  const startDatePart = startInputValue.slice(0, 10);
  const endDatePart = endInputValue.slice(0, 10) || startDatePart;

  if (!startDatePart) return null;

  const start = new Date(`${startDatePart}T00:00`);
  const endBase = new Date(`${endDatePart}T00:00`);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(endBase.valueOf())) {
    return null;
  }

  const end = new Date(endBase);
  end.setDate(end.getDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const normalizeFormForAllDay = (form: EventFormState): EventFormState => {
  const startDate = form.startAt.slice(0, 10) || toDayKey(new Date());
  const endDate = form.endAt.slice(0, 10) || startDate;

  return {
    ...form,
    isAllDay: true,
    startAt: `${startDate}T00:00`,
    endAt: `${endDate}T00:00`,
  };
};

const defaultEventDurationMs = 60 * 60 * 1000;

const parseLocalDateTimeInput = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const getEventDurationMs = (startAt: string, endAt: string): number => {
  const start = parseLocalDateTimeInput(startAt);
  const end = parseLocalDateTimeInput(endAt);
  if (!start || !end) return defaultEventDurationMs;

  const duration = end.getTime() - start.getTime();
  return duration > 0 ? duration : defaultEventDurationMs;
};

const shiftEventStartPreservingDuration = (
  form: EventFormState,
  nextStartAt: string,
): EventFormState => {
  const nextStart = parseLocalDateTimeInput(nextStartAt);
  if (!nextStart) {
    return {
      ...form,
      startAt: nextStartAt,
    };
  }

  const nextEnd = new Date(
    nextStart.getTime() + getEventDurationMs(form.startAt, form.endAt),
  );

  return {
    ...form,
    startAt: nextStartAt,
    endAt: toLocalDateTimeInputValue(nextEnd.toISOString()),
  };
};

const getTimezoneOffsetMinutes = (): number => -new Date().getTimezoneOffset();

const layoutDayEvents = (
  events: CalendarEventViewModel[],
  dayKey: string,
  activeEdit?: ActiveCalendarEdit | null,
): PositionedEvent[] => {
  const dayStart = parseDayKey(dayKey).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const timed = events
    .filter((event) => !event.isAllDay)
    .map((event) => {
      const isEditing = activeEdit?.occurrenceKey === toOccurrenceKey(event);

      let startMinutes: number;
      let endMinutes: number;

      if (isEditing && activeEdit) {
        // If we're editing, the draft times are already day-relative (0-1440)
        // unless it's a multi-day event that was moved.
        // But for now let's use draft times if day matches.
        if (activeEdit.draftDayKey === dayKey) {
          startMinutes = activeEdit.draftStartMinutes;
          endMinutes = activeEdit.draftEndMinutes;
        } else {
          // If moved to another day, don't render on this day
          return null;
        }
      } else {
        const eventStart = new Date(event.startTime).getTime();
        const eventEnd = new Date(event.endTime).getTime();

        startMinutes =
          eventStart < dayStart ? 0 : (eventStart - dayStart) / (1000 * 60);
        endMinutes =
          eventEnd > dayEnd ? 24 * 60 : (eventEnd - dayStart) / (1000 * 60);
      }

      if (startMinutes >= endMinutes) return null;

      return {
        event,
        start: Math.max(0, Math.min(startMinutes, 24 * 60 - 15)),
        end: Math.max(15, Math.min(endMinutes, 24 * 60)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.start - b.start);

  const laneEnds: number[] = [];
  const placements: Array<{
    lane: number;
    lanes: number;
    top: number;
    height: number;
    event: CalendarEventViewModel;
  }> = [];

  for (const item of timed) {
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[laneIndex] = item.end;
    }

    placements.push({
      lane: laneIndex,
      lanes: laneEnds.length,
      top: (item.start / 60) * HOUR_ROW_HEIGHT,
      height: Math.max(22, ((item.end - item.start) / 60) * HOUR_ROW_HEIGHT),
      event: item.event,
    });
  }

  return placements.map((placement) => ({
    event: placement.event,
    top: placement.top,
    height: placement.height,
    lane: placement.lane,
    lanes: placement.lanes,
  }));
};

const getRoomFreeAt = (
  slots: MeetingRoomAvailability["busySlots"],
  rangeStartIso: string,
  rangeEndIso: string,
): Date | null => {
  const rangeStart = new Date(rangeStartIso).valueOf();
  const rangeEnd = new Date(rangeEndIso).valueOf();
  if (Number.isNaN(rangeStart) || Number.isNaN(rangeEnd)) return null;
  const parsed = slots
    .map((slot) => ({ start: new Date(slot.startTime).valueOf(), end: new Date(slot.endTime).valueOf() }))
    .filter((slot) => !Number.isNaN(slot.start) && !Number.isNaN(slot.end) && slot.end > slot.start)
    .sort((a, b) => a.start - b.start);
  let freeAt = 0;
  for (const slot of parsed) {
    const overlapsRange = slot.start < rangeEnd && slot.end > rangeStart;
    const continuesBusy = freeAt > 0 && slot.start <= freeAt;
    if ((overlapsRange || continuesBusy) && slot.end > freeAt) freeAt = slot.end;
  }
  return freeAt > 0 ? new Date(freeAt) : null;
};

const formatRoomFreeAt = (freeAt: Date, rangeStartIso: string): string => {
  const rangeStart = new Date(rangeStartIso);
  const sameDay = !Number.isNaN(rangeStart.valueOf()) && freeAt.toDateString() === rangeStart.toDateString();
  return sameDay
    ? formatDate(freeAt, { hour: "2-digit", minute: "2-digit" })
    : formatDate(freeAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const CALENDAR_PANEL_TOGGLE = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D7E1EF] bg-[#F8FAFD] text-[#506785] transition hover:border-[#AFC2DD] hover:bg-[#EEF3FA] hover:text-[#2457F5]"

export default function CalendarPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const processedEventIdRef = useRef<string | null>(null);
  const [viewModel, setViewModel] = useState<CalendarViewModel>(
    emptyCalendarViewModel,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hostError, setHostError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string>(
    toDayKey(new Date()),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [desktopRightSidebarVisible, setDesktopRightSidebarVisible] = useState(true);
  const [isWideRightSidebarLayout, setIsWideRightSidebarLayout] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1280,
  );
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set());
  const [isCalendarCreatorOpen, setIsCalendarCreatorOpen] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [newCalendarColor, setNewCalendarColor] = useState("#8B3DFF");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const syncLayout = () => {
      setIsWideRightSidebarLayout(media.matches);
      setRightSidebarOpen(false);
    };
    syncLayout();
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEvent, setSelectedEvent] =
    useState<CalendarEventViewModel | null>(null);
  const [selectedEventLoading, setSelectedEventLoading] = useState(false);
  const [eventPreview, setEventPreview] = useState<{
    event: CalendarEventViewModel;
    x: number;
    y: number;
  } | null>(null);
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
  const [showMoreEventOptions, setShowMoreEventOptions] = useState(false);
  const [eventEditorMode, setEventEditorMode] = useState<"create" | "edit">(
    "create",
  );
  const [eventForm, setEventForm] = useState<EventFormState>(emptyEventForm);
  const { t: tCalendar } = useTranslation("calendar");
  const roomRepository = useMemo(() => new HttpMeetingRoomRepository(new RoomSessionStore()), []);
  const [roomOptions, setRoomOptions] = useState<MeetingRoomAvailability[]>([]);
  const [roomsError, setRoomsError] = useState("");
  const [roomsReloadKey, setRoomsReloadKey] = useState(0);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchResults, setSearchResults] = useState<CalendarEventViewModel[]>(
    [],
  );
  const [searchFocusEvent, setSearchFocusEvent] =
    useState<CalendarEventViewModel | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [calendarUsers, setCalendarUsers] = useState<CalendarSelectableUser[]>(
    [],
  );
  const [calendarUsersLoading, setCalendarUsersLoading] = useState(false);
  const [calendarGuestSearch, setCalendarGuestSearch] = useState("");
  const [calendarGuestSearchResults, setCalendarGuestSearchResults] = useState<
    CalendarSelectableUser[]
  >([]);
  const [calendarGuestHasMore, setCalendarGuestHasMore] = useState(true);
  const [calendarGuestLoadingMore, setCalendarGuestLoadingMore] = useState(false);
  const [calendarSidebarSearchResults, setCalendarSidebarSearchResults] =
    useState<CalendarSelectableUser[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<
    CalendarEventViewModel[]
  >([]);
  const [todaySummary, setTodaySummary] = useState<CalendarTodaySummary | null>(
    null,
  );
  const [todayLoading, setTodayLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [availabilityResult, setAvailabilityResult] =
    useState<CalendarAvailabilityResponse | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [showAllSuggestedSlots, setShowAllSuggestedSlots] = useState(false);
  const [selectedSuggestedSlotKey, setSelectedSuggestedSlotKey] =
    useState("");
  const [conflictActionMode, setConflictActionMode] = useState<
    "create" | "update"
  >("create");
  const [toastQueue, setToastQueue] = useState<CalendarToastItem[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [isCustomReminder, setIsCustomReminder] = useState(false);
  const toastIdRef = useRef(0);
  const noResultsWarnedQueryRef = useRef("");

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() => getBrowserNotificationPermission());

  const askNotificationPermission = useCallback(async () => {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
  }, []);

  const pushToast = useCallback(
    (variant: "success" | "error" | "warning", message: string) => {
      const nextId = toastIdRef.current + 1;
      toastIdRef.current = nextId;
      setToastQueue((prev) => [...prev, { id: nextId, message, variant }]);
    },
    [],
  );

  const openMeetingLink = useCallback(
    (url: string) => {
      if (!url) {
        pushToast("warning", tc("toast.linkNotReady"));
        return;
      }

      try {
        const parsed = new URL(url, window.location.origin);
        if (
          parsed.origin === window.location.origin &&
          parsed.pathname.startsWith("/web/")
        ) {
          navigate(`${parsed.pathname.slice(4)}${parsed.search}${parsed.hash}`);
          return;
        }
      } catch {
        pushToast("error", tc("toast.linkInvalid"));
        return;
      }

      window.location.assign(url);
    },
    [navigate, pushToast],
  );

  const openMeetingInNewTab = useCallback(
    (url: string) => {
      if (!url) {
        pushToast("warning", tc("toast.linkNotReady"));
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    },
    [pushToast],
  );

  const copyMeetingLink = useCallback(
    async (url: string) => {
      if (!url) {
        pushToast("warning", tc("toast.linkNotReady"));
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        pushToast("success", tc("toast.linkCopied"));
      } catch {
        pushToast("error", tc("toast.copyFailed"));
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (!actionError) return;
    pushToast("error", actionError);
    setActionError("");
  }, [actionError, pushToast]);

  useEffect(() => {
    if (!actionSuccess) return;
    pushToast("success", actionSuccess);
    setActionSuccess("");
  }, [actionSuccess, pushToast]);

  const removeToast = useCallback((id: number) => {
    setToastQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [ownEventIds, setOwnEventIds] = useState<Set<string>>(() => new Set());
  const [comparisonEventIds, setComparisonEventIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!targetUserId) return;
    setEventPreview(null);
    setSelectedEvent(null);
    setSelectedEventId("");
  }, [targetUserId]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return [];
    return calendarSidebarSearchResults;
  }, [calendarSidebarSearchResults, userSearch]);

  const targetUser = useMemo(
    () => calendarUsers.find((u) => u.id === targetUserId) || null,
    [calendarUsers, targetUserId],
  );
  const isReadOnlyExternalCalendar = false;
  const viewerId = viewModel.host?.id ?? null;

  const { calendarController } = useMemo(() => createCalendarController(), []);

  const loadCalendars = useCallback(async () => {
    try {
      const items = await calendarController.loadCalendars();
      setCalendars(items);
      setVisibleCalendarIds((current) => current.size ? current : new Set(items.map((item) => item.id)));
    } catch (error) {
      setActionError(getErrorMessage(error, tc("errors.loadCalendars")));
    }
  }, [calendarController]);

  useEffect(() => { void loadCalendars(); }, [loadCalendars]);

  const range = useMemo(
    () => getRangeForMode(mode, anchorDate),
    [mode, anchorDate],
  );
  const eventsLoadRange = useMemo(
    () => getMonthRange(anchorDate),
    [anchorDate],
  );

  const loadCalendar = useCallback(
    async (options?: { force?: boolean; refresh?: boolean }) => {
      const force = options?.force ?? false;
      const refresh = options?.refresh ?? false;

      if (!refresh) {
        setIsLoading(true);
      }

      const request = {
        fromIso: eventsLoadRange.from.toISOString(),
        toIso: eventsLoadRange.to.toISOString(),
        force,
      };
      const ownResult = await calendarController.loadPage(request);

      if (targetUserId) {
        const comparedResult = await calendarController.loadPage({ ...request, userId: targetUserId });
        const ownIds = new Set(ownResult.viewModel.events.map((event) => event.id));
        const comparedIds = new Set(comparedResult.viewModel.events.map((event) => event.id));
        const comparedOnly = comparedResult.viewModel.events
          .filter((event) => !ownIds.has(event.id))
          .map((event) => ({ ...event, color: "#8B3DFF" }));

        setOwnEventIds(ownIds);
        setComparisonEventIds(comparedIds);
        setViewModel({
          host: ownResult.viewModel.host,
          events: [...ownResult.viewModel.events, ...comparedOnly].sort(
            (a, b) => new Date(a.startTime).valueOf() - new Date(b.startTime).valueOf(),
          ),
        });
        setHostError(ownResult.hostError || comparedResult.hostError);
        setEventsError(ownResult.eventsError || comparedResult.eventsError);
      } else {
        setOwnEventIds(new Set(ownResult.viewModel.events.map((event) => event.id)));
        setComparisonEventIds(new Set());
        setViewModel(ownResult.viewModel);
        setHostError(ownResult.hostError);
        setEventsError(ownResult.eventsError);
      }

      if (!refresh) {
        setIsLoading(false);
      }
    },
    [
      calendarController,
      eventsLoadRange.from,
      eventsLoadRange.to,
      targetUserId,
    ],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadCalendar({ force: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [loadCalendar]);

  const resetEventFormForCreate = useCallback(() => {
    const now = new Date();
    const selectedDate = parseDayKey(selectedDayKey);
    const start =
      selectedDayKey === toDayKey(now) ? new Date(now) : new Date(selectedDate);

    if (selectedDayKey === toDayKey(now)) {
      start.setSeconds(0, 0);
      start.setMinutes(Math.floor(start.getMinutes() / 15) * 15);
    } else {
      start.setHours(9, 0, 0, 0);
    }

    const end = new Date(start.getTime() + defaultEventDurationMs);

    setEventForm({
      ...emptyEventForm,
      calendarId: calendars.find((item) => item.isDefault)?.id ?? calendars[0]?.id ?? "",
      startAt: toLocalDateTimeInputValue(start.toISOString()),
      endAt: toLocalDateTimeInputValue(end.toISOString()),
    });
    setIsCustomReminder(false);
    setFieldErrors({});
    setAvailabilityResult(null);
  }, [calendars, selectedDayKey]);

  const handleCloseEventEditor = useCallback(() => {
    setIsEventEditorOpen(false);
    setFieldErrors({});
    setAvailabilityResult(null);
    setAvailabilityError("");
    setAvailabilityLoading(false);
    setIsConflictDialogOpen(false);
    setShowAllSuggestedSlots(false);
    setSelectedSuggestedSlotKey("");
  }, []);

  const closeConflictDialog = useCallback(() => {
    setIsConflictDialogOpen(false);
    setShowAllSuggestedSlots(false);
    setSelectedSuggestedSlotKey("");
    setAvailabilityError("");
    setAvailabilityLoading(false);
    setAvailabilityResult(null);
  }, []);

  const fillEventFormFromEvent = useCallback(
    (event: CalendarEventViewModel) => {
      const isCustom =
        event.reminderMinutes !== null &&
        !isReminderPresetValue(String(event.reminderMinutes));
      setIsCustomReminder(isCustom);
      setEventForm({
        calendarId: event.calendarId,
        timezone: getBrowserTimeZone(),
        title: event.title,
        description: event.description,
        startAt: event.isAllDay
          ? toAllDayEditorInputValue(event.startTime, "start")
          : toLocalDateTimeInputValue(event.startTime),
        endAt: event.isAllDay
          ? toAllDayEditorInputValue(event.endTime, "end")
          : toLocalDateTimeInputValue(event.endTime),
        isAllDay: event.isAllDay,
        isOnline: event.isOnline,
        location: event.location,
        roomId: event.roomId || "",
        color: event.color || "#2458D3",
        attendeeIds: event.attendeeIds,
        reminderMinutes:
          event.reminderMinutes !== null ? String(event.reminderMinutes) : "",
        recurrenceRule: event.recurrenceRule || "",
      });

      setFieldErrors({});
      setAvailabilityResult(null);
    },
    [],
  );

  const mergeCalendarUsers = useCallback((users: CalendarSelectableUser[]) => {
    setCalendarUsers((prev) => {
      const next = new Map(prev.map((user) => [user.id, user]));
      users.forEach((user) => next.set(user.id, user));
      return Array.from(next.values());
    });
  }, []);

  const loadCalendarUsers = useCallback(
    async (query = "", target: "sidebar" | "guest" = "sidebar") => {
      setCalendarUsersLoading(true);
      try {
        const users = await calendarController.loadUsers(query);
        mergeCalendarUsers(users);
        if (target === "guest") {
          setCalendarGuestSearchResults(users);
        } else {
          setCalendarSidebarSearchResults(users);
        }
      } catch {
        if (target === "guest") {
          setCalendarGuestSearchResults([]);
        } else {
          setCalendarSidebarSearchResults([]);
        }
      } finally {
        setCalendarUsersLoading(false);
      }
    },
    [calendarController, mergeCalendarUsers],
  );

  const loadInitialGuests = useCallback(
    async (query = "") => {
      setCalendarUsersLoading(true);
      setCalendarGuestHasMore(true);
      try {
        const users = await calendarController.loadUsers(query, 20, 0);
        mergeCalendarUsers(users);
        setCalendarGuestSearchResults(users);
        if (users.length < 20) {
          setCalendarGuestHasMore(false);
        }
      } catch {
        setCalendarGuestSearchResults([]);
        setCalendarGuestHasMore(false);
      } finally {
        setCalendarUsersLoading(false);
      }
    },
    [calendarController, mergeCalendarUsers],
  );

  const loadMoreGuests = useCallback(async () => {
    if (calendarGuestLoadingMore || !calendarGuestHasMore) return;
    setCalendarGuestLoadingMore(true);
    try {
      const currentOffset = calendarGuestSearchResults.length;
      const query = calendarGuestSearch.trim();
      const users = await calendarController.loadUsers(query, 20, currentOffset);
      if (users.length > 0) {
        mergeCalendarUsers(users);
        setCalendarGuestSearchResults((prev) => {
          const next = new Map(prev.map((u) => [u.id, u]));
          users.forEach((u) => next.set(u.id, u));
          return Array.from(next.values());
        });
      }
      if (users.length < 20) {
        setCalendarGuestHasMore(false);
      }
    } catch {
      setCalendarGuestHasMore(false);
    } finally {
      setCalendarGuestLoadingMore(false);
    }
  }, [
    calendarGuestLoadingMore,
    calendarGuestHasMore,
    calendarGuestSearchResults,
    calendarGuestSearch,
    calendarController,
    mergeCalendarUsers,
  ]);

  const [activeEdit, setActiveEdit] = useState<ActiveCalendarEdit | null>(null);
  const [dragSelection, setDragSelection] = useState<{
    dayKey: string;
    startMinutes: number;
    endMinutes: number;
    startClientY: number;
    originalStartMinutes: number;
  } | null>(null);
  const suppressNextPreviewRef = useRef(false);
  const calendarBodyGridRef = useRef<HTMLDivElement | null>(null);
  const weekTimeScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const visibleDayKeysRef = useRef<string[]>([]);
  const calendarTimeColumnWidthRef = useRef(64);
  const organizerWarningAtRef = useRef(0);
  const recurringWarningAtRef = useRef(0);

  const handleColumnPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, dayKey: string) => {
      if (e.button !== 0 || isReadOnlyExternalCalendar) return;

      // Prevent default text selection or browser drag start, which cancel pointer events immediately
      e.preventDefault();
      e.stopPropagation();

      // Capture the pointer to guarantee pointermove/pointerup events are fired correctly even when dragging outside the column
      e.currentTarget.setPointerCapture(e.pointerId);

      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;

      const startMinRaw = clickY;
      const snappedStart = clamp(
        Math.round(startMinRaw / 15) * 15,
        0,
        24 * 60 - 15,
      );

      setDragSelection({
        dayKey,
        startMinutes: snappedStart,
        endMinutes: snappedStart + 30, // Default 30 min duration
        startClientY: e.clientY,
        originalStartMinutes: snappedStart,
      });
    },
    [isReadOnlyExternalCalendar],
  );

  useEffect(() => {
    if (!dragSelection) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      const deltaPixels = event.clientY - dragSelection.startClientY;
      const deltaMinutes = Math.round(deltaPixels / 15) * 15;

      setDragSelection((prev) => {
        if (!prev) return prev;
        let nextStart = prev.originalStartMinutes;
        let nextEnd = prev.originalStartMinutes + 30;

        if (deltaMinutes > 0) {
          nextEnd = clamp(
            prev.originalStartMinutes + deltaMinutes,
            prev.originalStartMinutes + 15,
            24 * 60,
          );
        } else if (deltaMinutes < 0) {
          nextStart = clamp(
            prev.originalStartMinutes + deltaMinutes,
            0,
            prev.originalStartMinutes - 15,
          );
          nextEnd = prev.originalStartMinutes;
        }

        return {
          ...prev,
          startMinutes: nextStart,
          endMinutes: nextEnd,
        };
      });
    };

    const handleUp = (event: PointerEvent) => {
      // Release pointer capture
      try {
        if (event.target && "releasePointerCapture" in event.target) {
          (event.target as any).releasePointerCapture(event.pointerId);
        }
      } catch {}

      const finalSelection = dragSelection;
      setDragSelection(null);

      if (isReadOnlyExternalCalendar) return;

      const selectedDate = parseDayKey(finalSelection.dayKey);
      const start = new Date(selectedDate);
      start.setHours(
        Math.floor(finalSelection.startMinutes / 60),
        finalSelection.startMinutes % 60,
        0,
        0,
      );
      const end = new Date(selectedDate);
      end.setHours(
        Math.floor(finalSelection.endMinutes / 60),
        finalSelection.endMinutes % 60,
        0,
        0,
      );

      setEventForm({
        ...emptyEventForm,
        calendarId: calendars.find((item) => item.isDefault)?.id ?? calendars[0]?.id ?? "",
        startAt: toLocalDateTimeInputValue(start.toISOString()),
        endAt: toLocalDateTimeInputValue(end.toISOString()),
      });
      setIsCustomReminder(false);
      setFieldErrors({});
      setAvailabilityResult(null);
      setEventPreview(null);
      setSelectedEventId("");
      setSelectedEvent(null);
      setEventEditorMode("create");
      setIsEventEditorOpen(true);
      setActionError("");
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [calendars, dragSelection, isReadOnlyExternalCalendar]);

  const openCreateEventEditor = useCallback(() => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }

    setEventPreview(null);
    setSelectedEventId("");
    setSelectedEvent(null);
    resetEventFormForCreate();
    setEventEditorMode("create");
    setIsEventEditorOpen(true);
    setActionError("");
    setAvailabilityError("");
    setIsConflictDialogOpen(false);
    setShowAllSuggestedSlots(false);
    setSelectedSuggestedSlotKey("");
  }, [isReadOnlyExternalCalendar, resetEventFormForCreate]);

  const openEditEventEditor = useCallback(
    (eventToEdit?: CalendarEventViewModel | null) => {
      if (isReadOnlyExternalCalendar) {
        setActionError(
          tc("errors.readOnly"),
        );
        return;
      }

      const sourceEvent =
        eventToEdit ?? selectedEvent ?? eventPreview?.event ?? null;
      if (!sourceEvent?.id) {
        setActionError(
          tc("errors.noEventEdit"),
        );
        return;
      }

      setSelectedEventId(sourceEvent.id);
      setSelectedEvent(sourceEvent);
      fillEventFormFromEvent(sourceEvent);
      setEventEditorMode("edit");
      setIsEventEditorOpen(true);
      setEventPreview(null);
      setActionError("");
      setAvailabilityError("");
      setIsConflictDialogOpen(false);
      setShowAllSuggestedSlots(false);
      setSelectedSuggestedSlotKey("");
    },
    [
      eventPreview,
      fillEventFormFromEvent,
      isReadOnlyExternalCalendar,
      selectedEvent,
    ],
  );

  const persistEventTimeChange = useCallback(
    async (
      calendarEvent: CalendarEventViewModel,
      startMinutes: number,
      endMinutes: number,
      dayKey: string,
    ) => {
      const dayDate = parseDayKey(dayKey);
      const newStart = new Date(dayDate);
      newStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      const newEnd = new Date(dayDate);
      newEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

      await calendarController.updateEvent(calendarEvent.id, {
        title: calendarEvent.title,
        description: calendarEvent.description,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        attendeeIds: calendarEvent.attendeeIds,
        isAllDay: calendarEvent.isAllDay,
        isOnline: calendarEvent.isOnline,
        location: calendarEvent.location,
        color: calendarEvent.color,
        reminderMinutes:
          calendarEvent.reminderMinutes !== null
            ? calendarEvent.reminderMinutes
            : undefined,
        recurrenceRule: calendarEvent.recurrenceRule,
        recurrenceInterval:
          calendarEvent.recurrenceInterval !== null
            ? calendarEvent.recurrenceInterval
            : undefined,
        recurrenceUntil: calendarEvent.recurrenceUntil,
      });
    },
    [calendarController],
  );

  const startPointerEdit = useCallback(
    (
      pointerEvent: React.PointerEvent,
      calendarEvent: CalendarEventViewModel,
      mode: ActiveCalendarEdit["mode"],
      clickedDayKey?: string,
    ) => {
      const targetDayKey = clickedDayKey || calendarEvent.dayKey;
      const dayStart = parseDayKey(targetDayKey).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      if (isReadOnlyExternalCalendar) {
        return;
      }
      if (!calendarEvent.isOrganizer) {
        const now = Date.now();
        if (now - organizerWarningAtRef.current > 1200) {
          setActionError(tc("errors.organizerOnly"));
          organizerWarningAtRef.current = now;
        }
        return;
      }

      if (calendarEvent.isAllDay) {
        return;
      }

      if (false && calendarEvent.recurrenceRule) {
        const now = Date.now();
        if (now - recurringWarningAtRef.current > 2500) {
          setActionError(
            tc("errors.recurringSeries"),
          );
          recurringWarningAtRef.current = now;
        }
      }

      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();

      const eventStart = new Date(calendarEvent.startTime).getTime();
      const eventEnd = new Date(calendarEvent.endTime).getTime();

      const originalStartMinutes =
        eventStart < dayStart ? 0 : (eventStart - dayStart) / (1000 * 60);
      const originalEndMinutes =
        eventEnd > dayEnd ? 24 * 60 : (eventEnd - dayStart) / (1000 * 60);

      setActiveEdit({
        event: calendarEvent,
        occurrenceKey: toOccurrenceKey(calendarEvent),
        mode,
        startClientY: pointerEvent.clientY,
        startClientX: pointerEvent.clientX,
        originalDayKey: targetDayKey,
        draftDayKey: targetDayKey,
        originalStartMinutes,
        originalEndMinutes,
        draftStartMinutes: originalStartMinutes,
        draftEndMinutes: originalEndMinutes,
        hasChanged: false,
      });
    },
    [isReadOnlyExternalCalendar],
  );

  useEffect(() => {
    if (!activeEdit) return;

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      setActiveEdit((prev) => {
        if (!prev) return prev;
        const deltaPixels = event.clientY - prev.startClientY;
        const rawDeltaMinutes = (deltaPixels / HOUR_ROW_HEIGHT) * 60;
        const snappedDelta = Math.round(rawDeltaMinutes / 15) * 15;

        const duration = prev.originalEndMinutes - prev.originalStartMinutes;
        let nextStart = prev.originalStartMinutes;
        let nextEnd = prev.originalEndMinutes;
        let nextDayKey = prev.draftDayKey;

        if (prev.mode === "move") {
          nextStart = clamp(
            prev.originalStartMinutes + snappedDelta,
            0,
            24 * 60 - duration,
          );
          nextEnd = nextStart + duration;

          if (
            calendarBodyGridRef.current &&
            visibleDayKeysRef.current.length > 1
          ) {
            const rect = calendarBodyGridRef.current.getBoundingClientRect();
            const dayColWidth = calendarTimeColumnWidthRef.current;
            const daysAreaLeft = rect.left + dayColWidth;
            const daysAreaWidth = Math.max(1, rect.width - dayColWidth);
            const dayWidth = daysAreaWidth / visibleDayKeysRef.current.length;
            const x = event.clientX - daysAreaLeft;
            const rawIndex = Math.floor(x / dayWidth);
            const dayIndex = clamp(
              rawIndex,
              0,
              visibleDayKeysRef.current.length - 1,
            );
            nextDayKey =
              visibleDayKeysRef.current[dayIndex] ?? prev.draftDayKey;
          }
        } else if (prev.mode === "resize-start") {
          nextStart = clamp(
            prev.originalStartMinutes + snappedDelta,
            0,
            prev.originalEndMinutes - 15,
          );
          nextEnd = prev.originalEndMinutes;
        } else {
          nextStart = prev.originalStartMinutes;
          nextEnd = clamp(
            prev.originalEndMinutes + snappedDelta,
            prev.originalStartMinutes + 15,
            24 * 60,
          );
        }

        const nextState = {
          ...prev,
          draftDayKey: nextDayKey,
          draftStartMinutes: nextStart,
          draftEndMinutes: nextEnd,
          hasChanged:
            nextStart !== prev.originalStartMinutes ||
            nextEnd !== prev.originalEndMinutes ||
            nextDayKey !== prev.originalDayKey,
        };

        return nextState;
      });
    };

    const handleUp = () => {
      const edit = activeEdit;
      if (!edit?.hasChanged) {
        setActiveEdit(null);
        return;
      }

      // Optimistic UI update: keep new slot immediately and avoid visual rollback before server refresh.
      const nextDayDate = parseDayKey(edit.draftDayKey);
      const nextStart = new Date(nextDayDate);
      nextStart.setHours(
        Math.floor(edit.draftStartMinutes / 60),
        edit.draftStartMinutes % 60,
        0,
        0,
      );
      const nextEnd = new Date(nextDayDate);
      nextEnd.setHours(
        Math.floor(edit.draftEndMinutes / 60),
        edit.draftEndMinutes % 60,
        0,
        0,
      );
      const nextStartIso = nextStart.toISOString();
      const nextEndIso = nextEnd.toISOString();

      setViewModel((prev) => ({
        ...prev,
        events: prev.events.map((event) =>
          toOccurrenceKey(event) === edit.occurrenceKey
            ? {
                ...event,
                dayKey: edit.draftDayKey,
                startTime: nextStartIso,
                endTime: nextEndIso,
                timeLabel: toTimeRangeLabel(
                  nextStartIso,
                  nextEndIso,
                  event.isAllDay,
                ),
              }
            : event,
        ),
      }));

      setActiveEdit(null);
      suppressNextPreviewRef.current = true;
      void (async () => {
        try {
          await persistEventTimeChange(
            edit.event,
            edit.draftStartMinutes,
            edit.draftEndMinutes,
            edit.draftDayKey,
          );
          await loadCalendar({ refresh: true });
          setActionSuccess(tc("success.updatedShort"));
        } catch (error) {
          // Rollback optimistic update when backend rejects edit.
          setViewModel((prev) => ({
            ...prev,
            events: prev.events.map((event) =>
              toOccurrenceKey(event) === edit.occurrenceKey
                ? {
                    ...event,
                    dayKey: edit.event.dayKey,
                    startTime: edit.event.startTime,
                    endTime: edit.event.endTime,
                    timeLabel: edit.event.timeLabel,
                  }
                : event,
            ),
          }));
          setActionError(
            getErrorMessage(error, tc("errors.changeTime")),
          );
        }
      })();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [activeEdit, loadCalendar, persistEventTimeChange]);

  const handleDrop = useCallback(
    async (event: React.DragEvent, dayKey: string) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("calendar-event");
      if (!data) return;

      const calendarEvent: CalendarEventViewModel = JSON.parse(data);
      const rect = event.currentTarget.getBoundingClientRect();
      // Use clientY because offsetY might be relative to child elements
      const offsetY = event.clientY - rect.top;

      // Calculate minutes from vertical offset
      const totalMinutes = (offsetY / HOUR_ROW_HEIGHT) * 60;
      // Snap to 15 minute increments
      const snappedMinutes = Math.round(totalMinutes / 15) * 15;

      const dayDate = parseDayKey(dayKey);
      const newStart = new Date(dayDate);
      newStart.setHours(
        Math.floor(snappedMinutes / 60),
        snappedMinutes % 60,
        0,
        0,
      );

      const oldStart = new Date(calendarEvent.startTime);
      const oldEnd = new Date(calendarEvent.endTime);
      const durationMs = oldEnd.getTime() - oldStart.getTime();
      const newEnd = new Date(newStart.getTime() + durationMs);

      try {
        await calendarController.updateEvent(calendarEvent.id, {
          title: calendarEvent.title,
          description: calendarEvent.description,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          attendeeIds: calendarEvent.attendeeIds,
          isAllDay: calendarEvent.isAllDay,
          isOnline: calendarEvent.isOnline,
          location: calendarEvent.location,
          color: calendarEvent.color,
          reminderMinutes:
            calendarEvent.reminderMinutes !== null
              ? calendarEvent.reminderMinutes
              : undefined,
          recurrenceRule: calendarEvent.recurrenceRule,
          recurrenceInterval:
            calendarEvent.recurrenceInterval !== null
              ? calendarEvent.recurrenceInterval
              : undefined,
          recurrenceUntil: calendarEvent.recurrenceUntil,
        });
        void loadCalendar({ refresh: true });
        setActionSuccess(tc("success.moved"));
      } catch (err) {
        setActionError(getErrorMessage(err, tc("errors.move")));
      }
    },
    [calendarController, loadCalendar],
  );

  const loadSecondaryData = useCallback(async () => {
    setTodayLoading(true);
    try {
      const [upcoming, today] = await Promise.all([
        calendarController.loadUpcomingEvents(5),
        calendarController.loadTodaySummary(getTimezoneOffsetMinutes()),
      ]);
      setUpcomingEvents(
        upcoming.map((event) =>
          calendarController.toEventViewModel(event, viewerId),
        ),
      );
      setTodaySummary(today);
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          tc("errors.loadExtra"),
        ),
      );
    } finally {
      setTodayLoading(false);
    }
  }, [calendarController, viewerId]);

  useEffect(() => {
    void loadSecondaryData();
  }, [loadSecondaryData]);

  useEffect(() => {
    void loadCalendarUsers("", "sidebar");
    void loadInitialGuests("");
  }, [loadCalendarUsers, loadInitialGuests]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadCalendarUsers(userSearch.trim(), "sidebar");
    }, 250);

    return () => window.clearTimeout(handle);
  }, [loadCalendarUsers, userSearch]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadInitialGuests(calendarGuestSearch.trim());
    }, 250);

    return () => window.clearTimeout(handle);
  }, [calendarGuestSearch, loadInitialGuests]);

  useEffect(() => {
    if (!isEventEditorOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isConflictDialogOpen) {
          closeConflictDialog();
          return;
        }
        handleCloseEventEditor();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeConflictDialog,
    handleCloseEventEditor,
    isConflictDialogOpen,
    isEventEditorOpen,
  ]);

  const selectEvent = useCallback(
    async (eventId: string) => {
      setSelectedEventId(eventId);
      setSelectedEventLoading(true);
      setActionError("");
      try {
        const isComparedOnlyEvent =
          typeof targetUserId === "number" &&
          comparisonEventIds.has(eventId) &&
          !ownEventIds.has(eventId);
        const loaded =
          isComparedOnlyEvent
            ? await calendarController.getUserEvent(targetUserId, eventId)
            : await calendarController.getEvent(eventId);
        const view = calendarController.toEventViewModel(
          loaded,
          viewerId,
        );
        setSelectedEvent(view);
        fillEventFormFromEvent(view);
      } catch (error) {
        setActionError(
          getErrorMessage(error, tc("errors.loadDetails")),
        );
      } finally {
        setSelectedEventLoading(false);
      }
    },
    [calendarController, comparisonEventIds, fillEventFormFromEvent, ownEventIds, targetUserId, viewerId],
  );

  const openEventPreview = useCallback(
    (event: CalendarEventViewModel, clientX?: number, clientY?: number) => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidth = 360;
      const cardHeight = 240;
      const baseX = typeof clientX === "number" ? clientX : viewportWidth / 2;
      const baseY = typeof clientY === "number" ? clientY : viewportHeight / 2;
      const x = Math.max(16, Math.min(baseX, viewportWidth - cardWidth - 16));
      const y = Math.max(16, Math.min(baseY, viewportHeight - cardHeight - 16));

      setEventPreview({ event, x, y });
      if (selectedEventId !== event.id) {
        void selectEvent(event.id);
      }
    },
    [selectEvent, selectedEventId],
  );

  useEffect(() => {
    if (!searchFocusEvent || !searchTitle.trim()) return;

    const eventDate = parseDayKey(searchFocusEvent.dayKey);
    if (selectedDayKey !== searchFocusEvent.dayKey) {
      setSelectedDayKey(searchFocusEvent.dayKey);
    }
    if (toDayKey(anchorDate) !== searchFocusEvent.dayKey) {
      setAnchorDate(eventDate);
    }
    openEventPreview(searchFocusEvent);
    setSearchFocusEvent(null);
  }, [
    anchorDate,
    openEventPreview,
    searchFocusEvent,
    searchTitle,
    selectedDayKey,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventId = params.get("event") || params.get("eventId");
    if (!eventId) {
      processedEventIdRef.current = null;
      return;
    }

    if (!viewModel.events.length) return;
    if (processedEventIdRef.current === eventId) return;
    processedEventIdRef.current = eventId;

    const match = viewModel.events.find((e) => e.id === eventId);
    if (match) {
      const eventDate = parseDayKey(match.dayKey);
      setSelectedDayKey(match.dayKey);
      setAnchorDate(eventDate);
      openEventPreview(match);

      const cleanParams = new URLSearchParams(location.search);
      cleanParams.delete("event");
      cleanParams.delete("eventId");
      const searchStr = cleanParams.toString();
      window.history.replaceState(
        null,
        "",
        `${location.pathname}${searchStr ? "?" + searchStr : ""}`,
      );
    } else {
      let isCancelled = false;
      void calendarController
        .getEvent(eventId)
        .then((loaded) => {
          if (isCancelled) return;
          const view = calendarController.toEventViewModel(
            loaded,
            viewerId,
          );
          const eventDate = parseDayKey(view.dayKey);
          setSelectedDayKey(view.dayKey);
          setAnchorDate(eventDate);
          openEventPreview(view);

          const cleanParams = new URLSearchParams(location.search);
          cleanParams.delete("event");
          cleanParams.delete("eventId");
          const searchStr = cleanParams.toString();
          window.history.replaceState(
            null,
            "",
            `${location.pathname}${searchStr ? "?" + searchStr : ""}`,
          );
        })
        .catch((err) => {
          console.error(
            "Failed to pre-select event from URL query parameter",
            err,
          );
        });
      return () => {
        isCancelled = true;
      };
    }
  }, [
    location.search,
    viewModel.events,
    viewerId,
    calendarController,
    openEventPreview,
  ]);

  const roomRangeStartIso = eventForm.isAllDay
    ? toAllDayRange(eventForm.startAt, eventForm.endAt)?.startIso ?? ""
    : fromLocalDateTimeInputValue(eventForm.startAt, eventForm.timezone) || "";
  const roomRangeEndIso = eventForm.isAllDay
    ? toAllDayRange(eventForm.startAt, eventForm.endAt)?.endIso ?? ""
    : fromLocalDateTimeInputValue(eventForm.endAt, eventForm.timezone) || "";

  useEffect(() => {
    if (!isEventEditorOpen) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const hasRange =
        Boolean(roomRangeStartIso && roomRangeEndIso) &&
        new Date(roomRangeEndIso).valueOf() > new Date(roomRangeStartIso).valueOf();
      try {
        const [availability, rooms] = await Promise.all([
          hasRange ? roomRepository.listAvailability(roomRangeStartIso, roomRangeEndIso) : Promise.resolve([] as MeetingRoomAvailability[]),
          roomRepository.listRooms(),
        ]);
        const availabilityById = new Map(availability.map((item) => [item.room.id, item]));
        const items: MeetingRoomAvailability[] = [
          ...rooms.map((room) => {
            const known = availabilityById.get(room.id);
            return known ? { ...known, room: { ...known.room, ...room } } : { room, isAvailable: null, busySlots: [] };
          }),
          ...availability.filter((item) => !rooms.some((room) => room.id === item.room.id)),
        ];
        if (!active) return;
        setRoomOptions(items);
        setRoomsError("");
      } catch (error) {
        try {
          const rooms = await roomRepository.listRooms();
          if (!active) return;
          setRoomOptions(rooms.map((room) => ({ room, isAvailable: null, busySlots: [] })));
          setRoomsError("");
        } catch {
          if (!active) return;
          setRoomOptions([]);
          setRoomsError(getErrorMessage(error, tc("errors.loadRooms")));
        }
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isEventEditorOpen, roomRangeStartIso, roomRangeEndIso, roomRepository, roomsReloadKey]);

  const prefillHandledRef = useRef(false);
  useEffect(() => {
    const prefill = (location.state as { createEvent?: { title?: string; attendeeIds?: number[] } } | null)?.createEvent;
    if (!prefill || prefillHandledRef.current || !calendars.length) return;
    prefillHandledRef.current = true;
    openCreateEventEditor();
    setEventForm((prev) => ({
      ...prev,
      title: (prefill.title || "").slice(0, 255),
      attendeeIds: Array.isArray(prefill.attendeeIds) ? prefill.attendeeIds.filter((id) => Number.isFinite(id)) : prev.attendeeIds,
    }));
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [calendars.length, location.pathname, location.search, location.state, navigate, openCreateEventEditor]);

  const toEventPayload = useCallback(():
    | CreateCalendarEventPayload
    | UpdateCalendarEventPayload
    | null => {
    const allDayRange = eventForm.isAllDay
      ? toAllDayRange(eventForm.startAt, eventForm.endAt)
      : null;
    const startIso =
      allDayRange?.startIso ?? fromLocalDateTimeInputValue(eventForm.startAt, eventForm.timezone);
    const endIso =
      allDayRange?.endIso ?? fromLocalDateTimeInputValue(eventForm.endAt, eventForm.timezone);

    const newErrors: Record<string, boolean> = {};
    if (!eventForm.title.trim()) newErrors.title = true;
    if (!eventForm.startAt) newErrors.startAt = true;
    if (!eventForm.endAt) newErrors.endAt = true;

    setFieldErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setActionError(tc("errors.required"));
      return null;
    }

    if (new Date(endIso).valueOf() <= new Date(startIso).valueOf()) {
      setActionError(tc("errors.endBeforeStart"));
      setFieldErrors({ endAt: true });
      return null;
    }

    const recurrenceRule = eventForm.recurrenceRule.trim();
    const payload: CreateCalendarEventPayload = {
      calendarId: eventForm.calendarId || undefined,
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      startTime: startIso,
      endTime: endIso,
      attendeeIds: eventForm.attendeeIds,
      isAllDay: eventForm.isAllDay,
      isOnline: eventForm.isOnline,
      location: eventForm.location.trim(),
      roomId: eventForm.roomId || undefined,
      color: eventForm.color || "#2458D3",
      reminderMinutes: eventForm.reminderMinutes
        ? Number(eventForm.reminderMinutes)
        : null,
      recurrenceRule: recurrenceRule || undefined,
    };

    try {
      validateCalendarEvent(payload);
    } catch (error) {
      setActionError(getErrorMessage(error, tc("errors.checkParams")));
      return null;
    }

    return payload;
  }, [eventForm]);

  const buildAvailabilityPayload =
    useCallback((): EventAvailabilityPayload | null => {
      const allDayRange = eventForm.isAllDay
        ? toAllDayRange(eventForm.startAt, eventForm.endAt)
        : null;
      const startIso =
        allDayRange?.startIso ?? fromLocalDateTimeInputValue(eventForm.startAt, eventForm.timezone);
      const endIso =
        allDayRange?.endIso ?? fromLocalDateTimeInputValue(eventForm.endAt, eventForm.timezone);

      if (!startIso || !endIso) return null;
      if (new Date(endIso).valueOf() <= new Date(startIso).valueOf())
        return null;
      if (!eventForm.attendeeIds.length) return null;

      return {
        startTime: startIso,
        endTime: endIso,
        attendeeIds: eventForm.attendeeIds ?? [],
        excludeEventId:
          eventEditorMode === "edit" ? selectedEventId || null : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      };
    }, [eventEditorMode, eventForm, selectedEventId]);

  const findConflictingEvent = useCallback(
    (
      _payload: CreateCalendarEventPayload | UpdateCalendarEventPayload,
      _options?: { excludeEventId?: string },
    ): CalendarEventViewModel | null => {
      // Overlapping events are allowed, so local availability check is bypassed
      return null;
    },
    [],
  );

  const filteredEvents = useMemo(() => {
    const source = searchTitle.trim() ? searchResults : viewModel.events;
    return source.filter((event) => !event.isOrganizer || !event.calendarId || visibleCalendarIds.has(event.calendarId));
  }, [searchResults, searchTitle, viewModel.events, visibleCalendarIds]);

  const normalizedSelectedDayKey = useMemo(() => {
    const currentSelected = parseDayKey(selectedDayKey);
    if (currentSelected < range.from || currentSelected > range.to) {
      return toDayKey(range.from);
    }

    return selectedDayKey;
  }, [range.from, range.to, selectedDayKey]);

  const eventsByDayKey = useMemo(() => {
    return filteredEvents.reduce<Record<string, CalendarEventViewModel[]>>(
      (acc, event) => {
        for (const key of calendarEventDayKeys(event)) {
          const bucket = acc[key] ?? [];
          bucket.push(event);
          acc[key] = bucket;
        }
        return acc;
      },
      {},
    );
  }, [filteredEvents]);

  const monthCells = useMemo(
    () => buildMonthCells(anchorDate, normalizedSelectedDayKey, eventsByDayKey),
    [anchorDate, normalizedSelectedDayKey, eventsByDayKey],
  );

  const miniCalendarCells = useMemo(
    () => buildMonthCells(anchorDate, normalizedSelectedDayKey, eventsByDayKey),
    [anchorDate, normalizedSelectedDayKey, eventsByDayKey],
  );

  const visibleDayKeys = useMemo(() => {
    if (mode === "day") {
      return [normalizedSelectedDayKey];
    }

    if (mode === "week") {
      const start = getStartOfWeek(anchorDate);
      return Array.from({ length: 7 }).map((_, index) =>
        toDayKey(addDays(start, index)),
      );
    }

    return [];
  }, [anchorDate, mode, normalizedSelectedDayKey]);

  const positionedByDay = useMemo(() => {
    const map: Record<string, PositionedEvent[]> = {};
    for (const dayKey of visibleDayKeys) {
      map[dayKey] = layoutDayEvents(
        eventsByDayKey[dayKey] ?? [],
        dayKey,
        activeEdit,
      );
    }
    return map;
  }, [activeEdit, eventsByDayKey, visibleDayKeys]);

  const mobilePositionedEvents = useMemo(() => {
    return layoutDayEvents(
      eventsByDayKey[normalizedSelectedDayKey] ?? [],
      normalizedSelectedDayKey,
      activeEdit,
    );
  }, [activeEdit, eventsByDayKey, normalizedSelectedDayKey]);

  const allDayEventsByDay = useMemo(() => {
    const map: Record<string, CalendarEventViewModel[]> = {};
    for (const dayKey of visibleDayKeys) {
      map[dayKey] = (eventsByDayKey[dayKey] ?? []).filter(
        (event) => event.isAllDay,
      );
    }
    return map;
  }, [eventsByDayKey, visibleDayKeys]);

  const selectedDayEvents = useMemo(() => {
    return eventsByDayKey[normalizedSelectedDayKey] ?? [];
  }, [eventsByDayKey, normalizedSelectedDayKey]);

  const handleToday = () => {
    const now = new Date();
    setAnchorDate(now);
    setSelectedDayKey(toDayKey(now));
  };

  const handlePrev = () => {
    if (mode === "month") {
      setAnchorDate(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
      );
      return;
    }

    if (mode === "week") {
      setAnchorDate((prev) => addDays(prev, -7));
      return;
    }

    setAnchorDate((prev) => addDays(prev, -1));
  };

  const handleNext = () => {
    if (mode === "month") {
      setAnchorDate(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
      );
      return;
    }

    if (mode === "week") {
      setAnchorDate((prev) => addDays(prev, 7));
      return;
    }

    setAnchorDate((prev) => addDays(prev, 1));
  };

  const handleCreateEvent = async (force = false) => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    setActionLoading(true);
    const payload = toEventPayload();
    if (!payload) {
      setActionLoading(false);
      return;
    }

    const conflictingEvent = findConflictingEvent(payload);
    if (conflictingEvent) {
      setActionError(
        tc("timeTaken", { title: conflictingEvent.title, time: conflictingEvent.timeLabel }),
      );
      setActionLoading(false);
      return;
    }

    setActionError("");
    try {
      if (!force) {
        const availability = await runAvailabilityCheck({
          startTime: payload.startTime,
          endTime: payload.endTime,
          attendeeIds: payload.attendeeIds ?? [],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
        if (availability && !availability.isAvailable) {
          openConflictDialog("create", availability);
          return;
        }
      } else {
        setAvailabilityResult(null);
        setAvailabilityError("");
      }

      await submitEventMutation("create", payload, { force });
    } catch (error) {
      if (isRoomBookedError(error)) {
        setRoomsReloadKey((key) => key + 1);
        setActionError(getErrorMessage(error, tc("errors.roomBusy")));
      } else if (getErrorStatus(error) === 409) {
        const availability = await runAvailabilityCheck({
          startTime: payload.startTime,
          endTime: payload.endTime,
          attendeeIds: payload.attendeeIds ?? [],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
        if (availability && !availability.isAvailable) {
          openConflictDialog("create", availability);
          return;
        }
        await Promise.all([loadCalendar({ force: true }), loadSecondaryData()]);
        setActionError(
          tc("errors.attendeeConflict"),
        );
      } else {
        setActionError(getErrorMessage(error, tc("errors.create")));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateEvent = async () => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    if (!selectedEventId) {
      setActionError(
        tc("errors.noEventSave"),
      );
      return;
    }
    setActionLoading(true);
    const payload = toEventPayload();
    if (!payload) {
      setActionLoading(false);
      return;
    }
    if (!payload.roomId && selectedEvent?.id === selectedEventId && selectedEvent?.roomId) {
      payload.roomId = EMPTY_ROOM_ID;
    }

    const conflictingEvent = findConflictingEvent(payload, {
      excludeEventId: selectedEventId,
    });
    if (conflictingEvent) {
      setActionError(
        tc("timeTaken", { title: conflictingEvent.title, time: conflictingEvent.timeLabel }),
      );
      setActionLoading(false);
      return;
    }

    setActionError("");
    try {
      const availability = await runAvailabilityCheck({
        startTime: payload.startTime,
        endTime: payload.endTime,
        attendeeIds: payload.attendeeIds ?? [],
        excludeEventId: selectedEventId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (availability && !availability.isAvailable) {
        openConflictDialog("update", availability);
        return;
      }

      await submitEventMutation("update", payload);
    } catch (error) {
      if (isRoomBookedError(error)) {
        setRoomsReloadKey((key) => key + 1);
        setActionError(getErrorMessage(error, tc("errors.roomBusy")));
      } else if (getErrorStatus(error) === 409) {
        const availability = await runAvailabilityCheck({
          startTime: payload.startTime,
          endTime: payload.endTime,
          attendeeIds: payload.attendeeIds ?? [],
          excludeEventId: selectedEventId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
        if (availability && !availability.isAvailable) {
          openConflictDialog("update", availability);
          return;
        }
        await Promise.all([
          loadCalendar({ force: true }),
          loadSecondaryData(),
          selectEvent(selectedEventId),
        ]);
        setActionError(
          tc("errors.timeTaken"),
        );
      } else {
        setActionError(getErrorMessage(error, tc("errors.update")));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    if (!selectedEventId) {
      setActionError(
        tc("errors.noEventDelete"),
      );
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      await calendarController.deleteEvent(selectedEventId);
      setActionSuccess(tc("success.deleted"));
      setSelectedEventId("");
      setSelectedEvent(null);
      setEventPreview(null);
      setIsEventEditorOpen(false);
      await Promise.all([loadCalendar({ force: true }), loadSecondaryData()]);
    } catch (error) {
      setActionError(getErrorMessage(error, tc("errors.delete")));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttendance = async (attendance: CalendarAttendance) => {
    if (isReadOnlyExternalCalendar || !selectedEventId || actionLoading) return;
    const eventId = selectedEventId;
    const current = eventPreview?.event.id === eventId ? eventPreview.event : selectedEvent;
    const status: CalendarRespondStatus =
      current?.myRsvpStatus === "accepted" || current?.myRsvpStatus === "tentative"
        ? current.myRsvpStatus
        : "accepted";
    const previousSelectedEvent = selectedEvent;
    const previousPreview = eventPreview;
    const applyToEvent = (event: CalendarEventViewModel) =>
      viewerId && event.id === eventId
        ? applyAttendance(event, viewerId, attendance, status)
        : event;

    setActionLoading(true);
    setActionError("");
    setSelectedEvent((prev) => (prev ? applyToEvent(prev) : prev));
    setEventPreview((prev) =>
      prev ? { ...prev, event: applyToEvent(prev.event) } : prev,
    );
    setViewModel((prev) => ({ ...prev, events: prev.events.map(applyToEvent) }));
    try {
      await calendarController.respondInvite(eventId, status, undefined, attendance);
      setActionSuccess(tCalendar("event.attendance.saved"));
      await Promise.all([loadCalendar({ force: true }), selectEvent(eventId)]);
    } catch (error) {
      setSelectedEvent(previousSelectedEvent);
      setEventPreview(previousPreview);
      setActionError(getErrorMessage(error, tc("errors.rsvp")));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRsvp = async (status: CalendarRespondStatus) => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    if (!selectedEventId) {
      setActionError(
        tc("errors.noEventRsvp"),
      );
      return;
    }
    if (actionLoading) return;
    const eventId = selectedEventId;
    const previousSelectedEvent = selectedEvent;
    const previousPreview = eventPreview;
    const applyToEvent = (event: CalendarEventViewModel) =>
      viewerId && event.id === eventId
        ? applyRsvpStatus(event, viewerId, status)
        : event;

    setActionLoading(true);
    setActionError("");
    setSelectedEvent((prev) => (prev ? applyToEvent(prev) : prev));
    setEventPreview((prev) =>
      prev ? { ...prev, event: applyToEvent(prev.event) } : prev,
    );
    setViewModel((prev) => ({ ...prev, events: prev.events.map(applyToEvent) }));
    try {
      await calendarController.respondInvite(eventId, status);
      setActionSuccess(RSVP_SUCCESS_MESSAGES[status]);
      await Promise.all([loadCalendar({ force: true }), selectEvent(eventId)]);
    } catch (error) {
      setSelectedEvent(previousSelectedEvent);
      setEventPreview(previousPreview);
      await loadCalendar({ force: true }).catch(() => undefined);
      setActionError(
        getErrorMessage(error, tc("errors.rsvp")),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetReminder = async (
    reminderValue = eventForm.reminderMinutes,
  ) => {
    void askNotificationPermission();
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    if (!selectedEventId) {
      setActionError(
        tc("errors.noEventReminder"),
      );
      return;
    }
    const minutesBefore = Number(reminderValue);
    if (!Number.isFinite(minutesBefore) || minutesBefore < 0) {
      setActionError(tc("errors.reminderMinutes"));
      return;
    }

    setActionLoading(true);
    setActionError("");
    try {
      await calendarController.setReminder(selectedEventId, minutesBefore);
      setActionSuccess(tc("success.reminderSet"));
      await selectEvent(selectedEventId);
    } catch (error) {
      setActionError(
        getErrorMessage(error, tc("errors.reminderSet")),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteReminder = async () => {
    if (isReadOnlyExternalCalendar) {
      setActionError(
        tc("errors.readOnly"),
      );
      return;
    }
    if (!selectedEventId) {
      setActionError(
        tc("errors.noEventReminderDelete"),
      );
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      await calendarController.deleteReminder(selectedEventId);
      setActionSuccess(tc("success.reminderDeleted"));
      await selectEvent(selectedEventId);
    } catch (error) {
      setActionError(getErrorMessage(error, tc("errors.reminderDelete")));
    } finally {
      setActionLoading(false);
    }
  };

  const performSearch = useCallback(
    (rawQuery: string) => {
      const query = rawQuery.trim().toLowerCase();
      if (!query) {
        setSearchResults([]);
        setSearchFocusEvent(null);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);

      const mapped = viewModel.events.filter(
        (event) =>
          (event.title || "").toLowerCase().includes(query) ||
          (event.description || "").toLowerCase().includes(query) ||
          (event.location || "").toLowerCase().includes(query),
      );

      setSearchResults(mapped);
      if (mapped.length === 0 && noResultsWarnedQueryRef.current !== rawQuery) {
        pushToast("warning", tc("nothingFound"));
        noResultsWarnedQueryRef.current = rawQuery;
        setSearchFocusEvent(null);
      }
      if (mapped.length > 0) {
        noResultsWarnedQueryRef.current = "";
        const first = mapped[0];
        if (selectedEventId !== first.id || selectedDayKey !== first.dayKey) {
          setSearchFocusEvent(first);
        }
      }
      setSearchLoading(false);
    },
    [viewModel.events, pushToast, selectedDayKey, selectedEventId],
  );

  useEffect(() => {
    const query = searchTitle.trim();
    if (!query) {
      setSearchResults([]);
      setSearchFocusEvent(null);
      setSearchLoading(false);
      noResultsWarnedQueryRef.current = "";
      return;
    }

    const timeout = window.setTimeout(() => {
      performSearch(query);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [performSearch, searchTitle, viewModel.events]);

  const quickReminderOptions = useMemo(
    () => buildQuickReminderOptions(eventForm.reminderMinutes),
    [eventForm.reminderMinutes],
  );

  const hasFullError = !filteredEvents.length && eventsError;

  useEffect(() => {
    if (isLoading || hasFullError) {
      return;
    }
    if (mode !== "week" && mode !== "day") {
      return;
    }

    const scrollEl = weekTimeScrollContainerRef.current;
    if (!scrollEl) {
      return;
    }

    const apply = () => {
      const todayKey = toDayKey(new Date());
      const includesToday = visibleDayKeys.includes(todayKey);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      let anchorMinutes: number;
      if (includesToday) {
        anchorMinutes = Math.max(7 * 60, nowMinutes - 60);
      } else {
        anchorMinutes = 9 * 60;
      }

      const targetTop = (anchorMinutes / 60) * HOUR_ROW_HEIGHT;
      const stickyHeader = scrollEl.querySelector(".sticky");
      const headerH =
        stickyHeader instanceof HTMLElement ? stickyHeader.offsetHeight : 72;
      const visibleBelowHeader = Math.max(120, scrollEl.clientHeight - headerH);
      let scrollTop = targetTop - headerH - visibleBelowHeader * 0.12;
      const maxScroll = Math.max(
        0,
        scrollEl.scrollHeight - scrollEl.clientHeight,
      );
      scrollTop = Math.max(0, Math.min(scrollTop, maxScroll));
      scrollEl.scrollTop = scrollTop;
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(apply);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchorDate, hasFullError, isLoading, mode, targetUserId, visibleDayKeys]);

  const showSidebarDetails = false;
  const rightSidebarContent = (
    <div className="relative flex min-h-full min-w-0 flex-col gap-3">
      <section className="min-w-0 shrink-0 rounded-[14px] border border-[#E3EAF4] bg-white p-3 shadow-[0_4px_16px_rgba(47,65,97,0.03)]">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[15px] font-bold capitalize tracking-[-0.02em] text-[#111832]">{formatMonthTitle(anchorDate)}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={handlePrev} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F7FB] text-[#1E2A4A] transition hover:bg-[#EAF0FA]" aria-label={tc("nav.prevPeriod")}><MaterialSymbol name="chevron_left" size={16} color="currentColor" /></button>
            <button type="button" onClick={handleNext} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F7FB] text-[#1E2A4A] transition hover:bg-[#EAF0FA]" aria-label={tc("nav.nextPeriod")}><MaterialSymbol name="chevron_right" size={16} color="currentColor" /></button>
            <button
              type="button"
              onClick={() => {
                if (isWideRightSidebarLayout) setDesktopRightSidebarVisible(false)
                else setRightSidebarOpen(false)
              }}
              className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F7FB] text-[#1E2A4A] transition hover:bg-[#EAF0FA] hover:text-[#2457F5]"
              aria-label={tc("sidebar.toggleHide")}
              aria-expanded
            >
              <MaterialSymbol name="side_navigation" size={16} color="currentColor" />
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-[#E3EAF4] px-1.5 py-2">
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold text-[#7383A3]">
            {weekdayLabels().map((day) => <span key={`right-${day}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {miniCalendarCells.map((cell) => (
              <button key={`right-mini-${cell.dateKey}`} type="button" onClick={() => { setSelectedDayKey(cell.dateKey); setAnchorDate(parseDayKey(cell.dateKey)); }} className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition ${cell.isSelected ? "bg-[#1765FF] text-white shadow-[0_4px_10px_rgba(23,101,255,.25)]" : cell.inCurrentMonth ? "text-[#17213D] hover:bg-[#EFF4FF]" : "text-[#B7C2D7]"}`}>{cell.dayNumber}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="min-w-0 flex-1 rounded-[14px] border border-[#E3EAF4] bg-white p-3 shadow-[0_4px_16px_rgba(47,65,97,0.03)]">
        <h3 className="mb-2.5 text-[15px] font-bold tracking-[-0.02em] text-[#111832]">{tc("users.searchEmployee")}</h3>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7890B3]">
            <MaterialSymbol name="search" size={17} color="currentColor" />
          </span>
          <input
            type="search"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder={tc("users.searchPlaceholder")}
            className="h-10 w-full rounded-[10px] border border-[#D5E0F0] bg-white pl-9 pr-8 text-xs text-[#1C2942] shadow-none outline-none transition placeholder:text-[#91A1BB] focus:border-[#A9BEE3] focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"
          />
          {calendarUsersLoading ? (
            <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-[#D7E2F3] border-t-[#1765FF]" aria-label={tc("search")} />
          ) : userSearch ? (
            <button type="button" onClick={() => setUserSearch("")} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#8495B0] hover:bg-[#F1F4FA]" aria-label={tc("clearSearch")}>
              <MaterialSymbol name="close" size={14} color="currentColor" />
            </button>
          ) : null}
        </div>

        {targetUserId ? (
          <div className="mt-2 rounded-lg border border-[#D9E5FF] bg-[#F3F7FF] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#8B3DFF]" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#31558F]">{targetUser?.fullName}</span>
              <button type="button" onClick={() => setTargetUserId(null)} className="text-[#5274A8] hover:text-[#174FC5]" aria-label={tc("users.hideCalendar")}><MaterialSymbol name="close" size={15} color="currentColor" /></button>
            </div>
            <p className="mt-1 text-[10px] text-[#6E84A5]">{tc("users.busyLegend")}</p>
            <button type="button" onClick={() => { openCreateEventEditor(); setEventForm((prev) => ({ ...prev, attendeeIds: targetUserId ? [targetUserId] : [] })); }} className="ts-button ts-button--primary mt-2 flex h-7 w-full items-center justify-center gap-1 rounded-md bg-[#2458D3] px-2 text-[10px] font-semibold text-white hover:bg-[#1D49B3]">
              <MaterialSymbol name="person_add" size={13} color="currentColor" />
              {tc("users.createMeeting")}
            </button>
          </div>
        ) : null}

        {userSearch.trim() ? (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-[#E2E9F4] bg-white p-1.5 shadow-[0_12px_30px_rgba(31,55,95,0.12)]">
            <div className="flex items-center justify-between px-2.5 py-2 text-xs font-semibold text-[#607493]">
              <span>{tc("users.employees")}</span>
              <span className="text-[#1765FF]">{tc("users.found", { count: filteredUsers.length })}</span>
            </div>
            {filteredUsers.slice(0, 8).map((user) => (
              <button key={`right-search-user-${user.id}`} type="button" onClick={() => { setTargetUserId(user.id); setUserSearch(""); }} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${targetUserId === user.id ? "bg-[#EEF4FF]" : "hover:bg-[#F4F7FD]"}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7EEFF] text-xs font-bold text-[#3158D7]">{user.fullName.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[#263653]">{user.fullName}</span>
                  {user.email ? <span className="block truncate text-[10px] text-[#8191AB]">{user.email}</span> : null}
                </span>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${targetUserId === user.id ? "border-[#1765FF] bg-[#1765FF] text-white" : "border-[#D7E1EF] text-[#294064]"}`}>
                  <MaterialSymbol name={targetUserId === user.id ? "check" : "add"} size={17} color="currentColor" />
                </span>
              </button>
            ))}
            {!calendarUsersLoading && filteredUsers.length === 0 ? <p className="px-2 py-2 text-xs text-[#8A9BB4]">{tc("users.notFound")}</p> : null}
          </div>
        ) : null}

        <div className="my-4 h-px bg-[#E4EAF3]" />
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#111832]">{tc("calendars.mine")}</h3>
          <button type="button" onClick={() => setIsCalendarCreatorOpen(true)} className="flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#1765FF] hover:bg-[#F2F5FB]" aria-label={tc("calendars.add")}><MaterialSymbol name="add" size={19} color="currentColor" />{tc("add")}</button>
        </div>
        <div className="divide-y divide-[#E8EDF5]">
          {calendars.map((calendar) => {
            const checked = visibleCalendarIds.has(calendar.id);
            return <label key={calendar.id} className="flex cursor-pointer items-center gap-3 px-1 py-2.5 text-sm font-medium text-[#26324D] hover:bg-[#F7F9FD]">
              <input type="checkbox" checked={checked} onChange={() => setVisibleCalendarIds((current) => { const next = new Set(current); if (next.has(calendar.id)) next.delete(calendar.id); else next.add(calendar.id); return next; })} className="sr-only" />
              <span className="flex h-5 w-5 items-center justify-center rounded-[5px] text-white" style={{ backgroundColor: checked ? calendar.color : "#E8EDF5" }}>{checked ? <MaterialSymbol name="check" size={14} color="currentColor" /> : null}</span>
              <span className="min-w-0 flex-1">{calendar.name}</span>
              <MaterialSymbol name="more_vert" size={18} color="#7C8EAB" />
            </label>;
          })}
        </div>
      </section>

      {showSidebarDetails ? <>
      <section className="rounded-xl border border-[#E5ECF7] bg-[#FAFCFF] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#263C5A]">{tc("sidebar.event")}</h3>
          {selectedEventLoading ? (
            <span className="text-[11px] text-[#7B8EA9]">{tc("loading")}</span>
          ) : null}
        </div>
        {selectedEvent ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-[#E5ECF7] bg-white p-2">
              <p className="truncate text-sm font-semibold text-[#243D5C]">
                {selectedEvent.title}
              </p>
              <p className="mt-1 text-xs text-[#6F84A3]">
                {selectedEvent.timeLabel}
              </p>
              <p className="mt-1 text-xs text-[#6F84A3]">
                {selectedEvent.location ||
                  (selectedEvent.isOnline ? tc("online.online") : tc("online.offline"))}
              </p>
              {selectedEvent.roomId ? (
                <p className="mt-1 text-xs text-[#6F84A3]">
                  {tc("room.inline", { name: selectedEvent.roomName || roomOptions.find((item) => item.room.id === selectedEvent.roomId)?.room.name || tc("room.booked") })}
                </p>
              ) : null}
              {selectedEvent.isOnline ? (
                <div className="mt-2 rounded-lg border border-[#D7E7FF] bg-[#F5F9FF] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#1E4F91]">
                        {getOnlineMeetingProviderLabel(selectedEvent)}
                      </p>
                      <p className="text-[11px] text-[#5F7CA8]">
                        {getOnlineMeetingStatusLabel(selectedEvent)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#2458D3]">
                      {tc("online.online")}
                    </span>
                  </div>
                  {selectedEvent.joinUrl ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openMeetingLink(selectedEvent.joinUrl)}
                        className="ts-button ts-button--primary ts-button--compact h-8 flex-1 rounded-lg bg-[#2458D3] px-2 text-[11px] font-semibold text-white hover:bg-[#1666CC]"
                      >
                        {tc("join")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openMeetingInNewTab(selectedEvent.joinUrl)
                        }
                        className="h-8 rounded-lg border border-[#CFE0F8] bg-white px-2 text-[11px] font-semibold text-[#2D4A6E] hover:bg-[#F4F8FF]"
                      >
                        {tc("newTab")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void copyMeetingLink(selectedEvent.joinUrl);
                        }}
                        className="h-8 rounded-lg border border-[#CFE0F8] bg-white px-2 text-[11px] font-semibold text-[#2D4A6E] hover:bg-[#F4F8FF]"
                      >
                        {tc("copy")}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-[#5F7CA8]">
                      {tc("online.linkUnavailable")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  openEditEventEditor();
                }}
                disabled={isReadOnlyExternalCalendar}
                className="h-8 rounded-lg border border-[#D5E2F4] bg-white text-xs font-semibold text-[#2D4A6E] hover:bg-[#F4F8FF]"
              >
                {tc("editShort")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteEvent();
                }}
                disabled={isReadOnlyExternalCalendar}
                className="h-8 rounded-lg border border-[#F0CFCF] bg-[#FFF6F6] text-xs font-semibold text-[#C53030] hover:bg-[#FFEDED]"
              >
                {tc("delete")}
              </button>
            </div>
            {!selectedEvent.isOrganizer ? (
              <RsvpButtons
                current={selectedEvent.myRsvpStatus}
                disabled={actionLoading || isReadOnlyExternalCalendar}
                layout="compact"
                onSelect={(status) => {
                  void handleRsvp(status);
                }}
              />
            ) : null}
            <div className="space-y-2">
              <AppSelect
                value={eventForm.reminderMinutes}
                options={quickReminderOptions}
                showButtonAvatar={false}
                showOptionAvatar={false}
                onChange={(value) => {
                  setEventForm((prev) => ({ ...prev, reminderMinutes: value }));
                  if (value) {
                    void handleSetReminder(value);
                    return;
                  }
                  void handleDeleteReminder();
                }}
                placeholder={tc("reminder.label")}
                ariaLabel={tc("reminder.select")}
                buttonClassName="h-8 rounded-lg border border-[#D7E2F3] bg-white px-2 text-xs"
                menuClassName="z-[430]"
              />
              <p className="text-[11px] text-[#7E93B1]">
                {tc("reminder.instantHint")}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#7E93B1]">
            {tc("sidebar.selectEventHint")}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[#E5ECF7] bg-[#FAFCFF] p-3">
        <h3 className="mb-2 text-sm font-semibold text-[#263C5A]">
          {tc("sidebar.dayEvents")}
        </h3>
        <div className="space-y-2">
          {selectedDayEvents.length ? (
            selectedDayEvents.slice(0, 5).map((event) => (
              <article
                key={`side-${event.id}`}
                onClick={() => {
                  openEventPreview(event);
                }}
                className="cursor-pointer rounded-xl border border-[#E5ECF7] bg-white p-2.5 transition hover:border-[#C8DCF8] hover:bg-[#F4F9FF]"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: event.color || "#2458D3" }}
                  />
                  <p className="truncate text-sm font-semibold text-[#233B5A]">
                    {event.title}
                  </p>
                </div>
                <p className="text-xs text-[#6F84A3]">{event.timeLabel}</p>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[#D5E0F0] bg-[#F9FBFF] px-3 py-4 text-center text-xs text-[#7E93B1]">
              {tc("sidebar.noEvents")}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#E5ECF7] bg-[#FAFCFF] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#263C5A]">
            {tc("sidebar.upcoming")}
          </h3>
        </div>
        <div className="space-y-1.5">
          {upcomingEvents.slice(0, 4).map((event) => (
            <button
              key={`upcoming-${event.id}`}
              type="button"
              onClick={() => {
                openEventPreview(event);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-[#E5ECF7] bg-white px-2 py-1.5 text-left hover:bg-[#F4F8FF]"
            >
              <span className="truncate text-xs text-[#284260]">
                {event.title}
              </span>
              <span className="ml-2 text-[11px] text-[#7A8EAE]">
                {event.timeLabel}
              </span>
            </button>
          ))}
          {!upcomingEvents.length ? (
            <p className="text-xs text-[#7E93B1]">{tc("sidebar.noUpcoming")}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-[#E5ECF7] bg-[#FAFCFF] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#263C5A]">
            {tc("sidebar.todaySummary")}
          </h3>
          {todayLoading ? (
            <span className="text-[11px] text-[#7B8EA9]">...</span>
          ) : null}
        </div>
        <p className="text-xs text-[#6E83A2]">
          {tc("todayCounts", { events: todaySummary?.eventsCount ?? 0, tasks: todaySummary?.tasksCount ?? 0 })}
        </p>
        {todaySummary?.tasks.slice(0, 3).map((task) => (
          <div
            key={`task-${task.id}`}
            className="mt-1 rounded-lg border border-[#E5ECF7] bg-white px-2 py-1.5 text-xs text-[#2B4464]"
          >
            {task.title || tc("untitled")}
          </div>
        ))}
      </section>
      </> : null}
    </div>
  );

  const organizerUserId =
    eventEditorMode === "edit"
      ? (selectedEvent?.organizerUserId ?? null)
      : null;

  const guestSelectOptions = useMemo(() => {
    const sourceUsers =
      calendarGuestSearchResults.length || calendarGuestSearch.trim()
        ? calendarGuestSearchResults
        : calendarUsers;
    const baseOptions = sourceUsers.map((user) => ({
      value: String(user.id),
      label: user.fullName || user.email || `User ${user.id}`,
      disabled: organizerUserId !== null && user.id === organizerUserId,
    }));

    if (selectedEvent) {
      selectedEvent.attendees.forEach((attendee) => {
        if (
          !baseOptions.some((opt) => Number(opt.value) === Number(attendee.id))
        ) {
          baseOptions.push({
            value: String(attendee.id),
            label: attendee.fullName,
            disabled:
              organizerUserId !== null &&
              Number(attendee.id) === Number(organizerUserId),
          });
        }
      });
    }

    return baseOptions;
  }, [
    calendarGuestSearch,
    calendarGuestSearchResults,
    calendarUsers,
    organizerUserId,
    selectedEvent,
  ]);

  const selectedGuestUsers = useMemo(() => {
    return eventForm.attendeeIds.map((id) => {
      const fromBase = calendarUsers.find((u) => Number(u.id) === Number(id));
      if (fromBase) return fromBase;

      const fromEvent = selectedEvent?.attendees.find(
        (a) => Number(a.id) === Number(id),
      );
      if (fromEvent)
        return {
          id: fromEvent.id,
          fullName: fromEvent.fullName,
          email: fromEvent.email,
        };

      return { id: Number(id), fullName: `User ${id}`, email: "" };
    });
  }, [calendarUsers, eventForm.attendeeIds, selectedEvent, organizerUserId]);

  const selectedGuestUsersById = useMemo(() => {
    return new Map(selectedGuestUsers.map((user) => [Number(user.id), user]));
  }, [selectedGuestUsers]);

  const timeZoneOptions = useMemo<AppSelectOption[]>(
    () =>
      getSelectableTimeZones(eventForm.timezone).map((zone) => ({
        value: zone,
        label: formatTimeZoneLabel(zone),
      })),
    [eventForm.timezone],
  );

  const [freeBusy, setFreeBusy] = useState<CalendarUserBusy[]>([]);
  const [freeBusyLoading, setFreeBusyLoading] = useState(false);
  const [freeBusyError, setFreeBusyError] = useState("");

  const freeBusyProposal = useMemo(() => {
    const allDayRange = eventForm.isAllDay
      ? toAllDayRange(eventForm.startAt, eventForm.endAt)
      : null;
    const startIso =
      allDayRange?.startIso ?? fromLocalDateTimeInputValue(eventForm.startAt, eventForm.timezone);
    const endIso =
      allDayRange?.endIso ?? fromLocalDateTimeInputValue(eventForm.endAt, eventForm.timezone);
    const startMs = startIso ? Date.parse(startIso) : NaN;
    if (!Number.isFinite(startMs)) return null;
    const endMs = endIso ? Date.parse(endIso) : NaN;
    const dayStart = new Date(startMs);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return {
      dayStartMs: dayStart.valueOf(),
      fromIso: dayStart.toISOString(),
      toIso: dayEnd.toISOString(),
      startMs,
      endMs: Number.isFinite(endMs) && endMs > startMs ? endMs : null,
    };
  }, [eventForm.endAt, eventForm.isAllDay, eventForm.startAt]);

  const timeZoneHint = useMemo(() => {
    const browserTimeZone = getBrowserTimeZone();
    if (!freeBusyProposal || eventForm.timezone === browserTimeZone) return "";
    const startIso = new Date(freeBusyProposal.startMs).toISOString();
    const endIso = freeBusyProposal.endMs
      ? new Date(freeBusyProposal.endMs).toISOString()
      : "";
    const dateLabel = formatInTimeZone(startIso, browserTimeZone, {
      day: "numeric",
      month: "short",
    });
    const startLabel = formatInTimeZone(startIso, browserTimeZone, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endLabel = endIso
      ? formatInTimeZone(endIso, browserTimeZone, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return tc("yourTime", { date: dateLabel, time: `${startLabel}${endLabel ? `–${endLabel}` : ""}`, zone: formatTimeZoneLabel(browserTimeZone) });
  }, [eventForm.timezone, freeBusyProposal]);

  const freeBusyAttendeeIds = useMemo(
    () =>
      [...new Set(eventForm.attendeeIds)].filter(
        (id) => Number(id) !== Number(viewerId),
      ),
    [eventForm.attendeeIds, viewerId],
  );
  const freeBusyAttendeeKey = freeBusyAttendeeIds.join(",");
  const freeBusyExcludeEventId =
    eventEditorMode === "edit" ? selectedEventId || null : null;

  useEffect(() => {
    if (!isEventEditorOpen || !freeBusyProposal || !freeBusyAttendeeIds.length) {
      setFreeBusy([]);
      setFreeBusyLoading(false);
      setFreeBusyError("");
      return;
    }
    let cancelled = false;
    setFreeBusyLoading(true);
    setFreeBusyError("");
    const timer = window.setTimeout(() => {
      calendarController
        .loadFreeBusy({
          attendeeIds: freeBusyAttendeeIds,
          fromIso: freeBusyProposal.fromIso,
          toIso: freeBusyProposal.toIso,
          excludeEventId: freeBusyExcludeEventId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        })
        .then((result) => {
          if (!cancelled) setFreeBusy(result);
        })
        .catch((error) => {
          if (cancelled) return;
          setFreeBusy([]);
          setFreeBusyError(
            getErrorMessage(error, tc("errors.loadBusy")),
          );
        })
        .finally(() => {
          if (!cancelled) setFreeBusyLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    calendarController,
    isEventEditorOpen,
    freeBusyProposal?.fromIso,
    freeBusyProposal?.toIso,
    freeBusyAttendeeKey,
    freeBusyExcludeEventId,
  ]);

  const freeBusyRows = useMemo<CalendarFreeBusyRow[]>(() => {
    if (!freeBusyProposal) return [];
    const dayStartMs = freeBusyProposal.dayStartMs;
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const ownSlots = viewModel.events
      .filter((event) => {
        if (event.id === freeBusyExcludeEventId) return false;
        if (event.isAllDay || event.myRsvpStatus === "declined") return false;
        const start = Date.parse(event.startTime);
        const end = Date.parse(event.endTime);
        return start < dayEndMs && end > dayStartMs;
      })
      .map((event) => ({
        eventId: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
      }));
    const rows: CalendarFreeBusyRow[] = [];
    if (viewerId) {
      rows.push({
        userId: viewerId,
        name: tc("you"),
        slots: ownSlots,
        isCurrentUser: true,
      });
    }
    freeBusyAttendeeIds.forEach((userId) => {
      const busy = freeBusy.find((item) => item.userId === userId);
      rows.push({
        userId,
        name: selectedGuestUsersById.get(Number(userId))?.fullName || `User ${userId}`,
        slots: busy?.slots ?? [],
        unavailable: busy?.unavailable ?? false,
      });
    });
    return rows;
  }, [
    freeBusy,
    freeBusyAttendeeIds,
    freeBusyExcludeEventId,
    freeBusyProposal,
    selectedGuestUsersById,
    viewModel.events,
    viewerId,
  ]);

  const groupedAvailabilityConflicts = useMemo<
    CalendarConflictsByUser[]
  >(() => {
    if (!availabilityResult) return [];
    if (availabilityResult.conflictsByUser.length)
      return availabilityResult.conflictsByUser;

    const grouped = new Map<number, CalendarConflictsByUser>();
    availabilityResult.conflicts.forEach((conflict) => {
      const existing = grouped.get(conflict.userId);
      if (existing) {
        existing.conflicts.push(conflict);
        return;
      }
      grouped.set(conflict.userId, {
        userId: conflict.userId,
        userName: conflict.userName,
        username: conflict.username,
        email: conflict.email,
        avatarUrl: conflict.avatarUrl,
        conflicts: [conflict],
      });
    });
    return Array.from(grouped.values()).filter((group) =>
      organizerUserId === null ? true : Number(group.userId) !== Number(organizerUserId),
    );
  }, [availabilityResult, organizerUserId]);

  const availabilityConflictMeta = useMemo(() => {
    const nameCounts = new Map<string, number>();

    groupedAvailabilityConflicts.forEach((group) => {
      const fallbackUser = selectedGuestUsersById.get(group.userId);
      const displayName = (
        group.userName ||
        fallbackUser?.fullName ||
        `User ${group.userId}`
      ).trim();
      nameCounts.set(displayName, (nameCounts.get(displayName) ?? 0) + 1);
    });

    return groupedAvailabilityConflicts.map((group) => {
      const fallbackUser = selectedGuestUsersById.get(group.userId);
      const displayName = (
        group.userName ||
        fallbackUser?.fullName ||
        `User ${group.userId}`
      ).trim();
      const username = group.username || "";
      const email = group.email || fallbackUser?.email || "";
      const identityLine =
        (nameCounts.get(displayName) ?? 0) > 1
          ? [username ? `@${username}` : "", email].filter(Boolean).join(" / ")
          : "";
      const avatarUrl =
        group.avatarUrl ||
        group.conflicts.find((conflict) => conflict.avatarUrl)?.avatarUrl ||
        null;

      return {
        group,
        displayName,
        identityLine,
        avatarUrl,
      };
    });
  }, [groupedAvailabilityConflicts, selectedGuestUsersById]);

  const availabilityTimezone = useMemo(() => {
    const slotTimezone =
      availabilityResult?.suggestedSlots[0]?.timezone ||
      availabilityResult?.partialSuggestedSlots[0]?.timezone;
    return (
      slotTimezone ||
      buildAvailabilityPayload()?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC"
    );
  }, [availabilityResult, buildAvailabilityPayload]);

  const currentAvailabilityPayload = useMemo(
    () => buildAvailabilityPayload(),
    [buildAvailabilityPayload],
  );

  const conflictedUsersCount = useMemo(() => {
    return groupedAvailabilityConflicts.length;
  }, [groupedAvailabilityConflicts]);

  const sortedSuggestedSlots = useMemo(
    () => sortSuggestedSlots(availabilityResult?.suggestedSlots ?? []),
    [availabilityResult],
  );

  const visibleSuggestedSlots = useMemo(
    () =>
      showAllSuggestedSlots
        ? sortedSuggestedSlots
        : sortedSuggestedSlots.slice(0, MAX_VISIBLE_SUGGESTED_SLOTS),
    [showAllSuggestedSlots, sortedSuggestedSlots],
  );

  const hiddenSuggestedSlotsCount = Math.max(
    0,
    sortedSuggestedSlots.length - MAX_VISIBLE_SUGGESTED_SLOTS,
  );

  const selectedSuggestedSlot = useMemo(
    () =>
      sortedSuggestedSlots.find(
        (slot) => getSuggestedSlotKey(slot) === selectedSuggestedSlotKey,
      ) ?? null,
    [selectedSuggestedSlotKey, sortedSuggestedSlots],
  );

  const runAvailabilityCheck = useCallback(
    async (payload: EventAvailabilityPayload) => {
      setAvailabilityLoading(true);
      setAvailabilityError("");
      try {
        const availability =
          await calendarController.checkAvailability(payload);
        setAvailabilityResult(availability);
        return availability;
      } catch (error) {
        setAvailabilityResult(null);
        setAvailabilityError(
          getErrorMessage(
            error,
            tc("errors.checkAvailability"),
          ),
        );
        return null;
      } finally {
        setAvailabilityLoading(false);
      }
    },
    [calendarController],
  );

  const openConflictDialog = useCallback(
    (
      mode: "create" | "update",
      availability: CalendarAvailabilityResponse,
    ) => {
      const sortedSlots = sortSuggestedSlots(availability.suggestedSlots ?? []);
      setConflictActionMode(mode);
      setAvailabilityResult(availability);
      setShowAllSuggestedSlots(false);
      setSelectedSuggestedSlotKey(
        sortedSlots.length ? getSuggestedSlotKey(sortedSlots[0]) : "",
      );
      setIsConflictDialogOpen(true);
    },
    [],
  );

  const waitForMeetingLink = useCallback(
    async (eventId: string) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        try {
          const event = await calendarController.getEvent(eventId);
          if (calendarController.toEventViewModel(event, viewerId).joinUrl) {
            pushToast("success", tc("toast.qmeetReady"));
            await loadCalendar({ force: true });
            return;
          }
          if (event.onlineMeetingStatus === "failed") {
            pushToast(
              "warning",
              tc("errors.qmeetCreate"),
            );
            return;
          }
        } catch {
          return;
        }
      }
    },
    [calendarController, loadCalendar, pushToast, viewerId],
  );

  const submitEventMutation = useCallback(
    async (
      mode: "create" | "update",
      payload: CreateCalendarEventPayload | UpdateCalendarEventPayload,
      options?: { force?: boolean },
    ) => {
      let invitedCount = 0;
      if (mode === "create") {
        const created = await calendarController.createEvent(payload, {
          force: options?.force,
        });
        if (
          payload.isOnline &&
          !calendarController.toEventViewModel(created, viewerId).joinUrl
        ) {
          void waitForMeetingLink(created.id);
        }
        invitedCount = created.attendees.length
          ? created.attendees.filter((item) => item.userId !== created.userId)
              .length
          : new Set(payload.attendeeIds ?? []).size;
      } else {
        if (!selectedEventId) {
          throw new Error(
            tc("errors.noEventSave"),
          );
        }
        await calendarController.updateEvent(selectedEventId, payload);
        if (payload.isOnline && !selectedEvent?.joinUrl) {
          void waitForMeetingLink(selectedEventId);
        }
      }

      setAvailabilityResult(null);
      setAvailabilityError("");
      setIsConflictDialogOpen(false);
      setShowAllSuggestedSlots(false);
      setSelectedSuggestedSlotKey("");
      setActionSuccess(
        mode === "create"
          ? invitedCount > 0
            ? tc("success.createdInvited", { count: invitedCount })
            : tc("success.created")
          : tc("success.updated"),
      );
      setIsEventEditorOpen(false);

      await Promise.all([
        loadCalendar({ force: true }),
        loadSecondaryData(),
        ...(mode === "update" && selectedEventId
          ? [selectEvent(selectedEventId)]
          : []),
      ]);
    },
    [
      calendarController,
      loadCalendar,
      loadSecondaryData,
      selectEvent,
      selectedEventId,
      viewerId,
      selectedEvent?.joinUrl,
      waitForMeetingLink,
    ],
  );

  const applySuggestedSlot = useCallback((slot: CalendarSuggestedSlot) => {
    if (!slot.startTime || !slot.endTime) return;
    setEventForm((prev) => ({
      ...prev,
      startAt: toLocalDateTimeInputValue(slot.startTime, prev.timezone),
      endAt: toLocalDateTimeInputValue(slot.endTime, prev.timezone),
    }));
  }, []);

  const applySuggestedSlotAndSubmit = useCallback(
    async (slot: CalendarSuggestedSlot) => {
      if (!slot.startTime || !slot.endTime) return;

      const payload = toEventPayload();
      if (!payload) return;

      const nextPayload = {
        ...payload,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };

      applySuggestedSlot(slot);
      setSelectedSuggestedSlotKey(getSuggestedSlotKey(slot));
      setActionLoading(true);
      try {
        const availability = await runAvailabilityCheck({
          startTime: slot.startTime,
          endTime: slot.endTime,
          attendeeIds: nextPayload.attendeeIds ?? [],
          excludeEventId:
            conflictActionMode === "update" ? selectedEventId || null : null,
          timezone:
            slot.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC",
        });
        if (!availability) {
          setActionError(
            tc("errors.checkAvailability"),
          );
          return;
        }
        if (!availability.isAvailable) {
          openConflictDialog(conflictActionMode, availability);
          return;
        }

        await submitEventMutation(conflictActionMode, nextPayload);
      } catch (error) {
        setActionError(
          getErrorMessage(error, tc("errors.saveSlot")),
        );
      } finally {
        setActionLoading(false);
      }
    },
    [
      applySuggestedSlot,
      conflictActionMode,
      openConflictDialog,
      runAvailabilityCheck,
      selectedEventId,
      submitEventMutation,
      toEventPayload,
    ],
  );

  const handleSearchNextWeekSuggestions = useCallback(async () => {
    if (!currentAvailabilityPayload) return;
    const start = new Date(currentAvailabilityPayload.startTime);
    const end = new Date(currentAvailabilityPayload.endTime);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return;

    const durationMinutes = Math.max(
      1,
      Math.round((end.valueOf() - start.valueOf()) / 60000),
    );
    const nextWeekStart = new Date(start.valueOf() + 7 * 24 * 60 * 60 * 1000);
    const nextWeekEnd = new Date(
      nextWeekStart.valueOf() + 7 * 24 * 60 * 60 * 1000,
    );

    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      const slots = await calendarController.suggestTimes({
        durationMinutes,
        attendeeIds: currentAvailabilityPayload.attendeeIds,
        preferredStart: nextWeekStart.toISOString(),
        preferredEnd: nextWeekEnd.toISOString(),
        timezone: currentAvailabilityPayload.timezone,
        limit: 5,
      });
      const sortedSlots = sortSuggestedSlots(slots);
      setAvailabilityResult((prev) =>
        prev ? { ...prev, suggestedSlots: sortedSlots } : prev,
      );
      setSelectedSuggestedSlotKey(
        sortedSlots.length ? getSuggestedSlotKey(sortedSlots[0]) : "",
      );
      setShowAllSuggestedSlots(false);
    } catch (error) {
      setAvailabilityError(
        getErrorMessage(
          error,
          tc("errors.nextWeek"),
        ),
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, [calendarController, currentAvailabilityPayload]);

  const isEditingEvent = eventEditorMode === "edit" && Boolean(selectedEventId);
  const isEditingOrganizerEvent =
    isEditingEvent && Boolean(selectedEvent?.isOrganizer);
  const isEditingInviteEvent =
    isEditingEvent && selectedEvent?.isOrganizer === false;

  const showDesktopRightSidebar = isWideRightSidebarLayout && desktopRightSidebarVisible;
  const calendarTimeColumnWidth = isMobile ? (mode === "day" ? 52 : 44) : 60;
  const calendarGridTemplateColumns = `${calendarTimeColumnWidth}px repeat(${visibleDayKeys.length}, minmax(0, 1fr))`;
  visibleDayKeysRef.current = visibleDayKeys;
  calendarTimeColumnWidthRef.current = calendarTimeColumnWidth;

  const showAdvancedEventFields = showMoreEventOptions || eventEditorMode === "edit";

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-[#F8FAFD] text-[#090F28]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="calendar-page-heading shrink-0 px-4 pt-6 pb-4 md:px-6 xl:px-8">
          <PageHeader title={tc("title")} description={tc("subtitle")} actions={<>
            {!isWideRightSidebarLayout ? (
              <AppButton variant="secondary" size="icon" aria-label={rightSidebarOpen ? tc("sidebar.toggleHide") : tc("sidebar.toggleShow")} aria-pressed={rightSidebarOpen} onClick={() => setRightSidebarOpen((open) => !open)}><MaterialSymbol name="side_navigation" size={18} color="currentColor" /></AppButton>
            ) : null}
            <AppButton onClick={openCreateEventEditor} disabled={isReadOnlyExternalCalendar} aria-label={tc("createEvent")}><MaterialSymbol name="add" size={18} color="currentColor" />{tc("newEvent")}</AppButton>
          </>} />
          <div className="ts-toolbar mt-5">
            <AppButton variant="secondary" size="compact" onClick={handleToday}>{tc("today")}</AppButton>
            <div className="flex items-center gap-1">
              <AppButton variant="ghost" size="icon" onClick={handlePrev} aria-label={tc("nav.back")}><MaterialSymbol name="chevron_left" size={20} /></AppButton>
              <AppButton variant="ghost" size="icon" onClick={handleNext} aria-label={tc("nav.forward")}><MaterialSymbol name="chevron_right" size={20} /></AppButton>
            </div>
            <p className="min-w-0 text-sm font-semibold text-[var(--ts-text)]">{range.periodLabel}</p>
            <div className="ts-toolbar__actions">
              <label className="relative min-w-0 w-full sm:w-56">
                <span className="sr-only">{tc("eventSearch.label")}</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ts-text-muted)]"><MaterialSymbol name="search" size={18} /></span>
                <input aria-busy={searchLoading} value={searchTitle} onChange={(event) => setSearchTitle(event.target.value)} placeholder={tc("eventSearch.placeholder")} className="ts-input !min-h-9 !py-1.5 pl-10 pr-9" />
                {searchTitle.trim() && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ts-text-secondary)]" aria-label={tc("clearSearch")} onClick={() => setSearchTitle('')}><MaterialSymbol name="close" size={16} /></button>}
              </label>
              <CalendarModeSwitch mode={mode} onChange={setMode} />
            </div>
          </div>
          {hostError && <p role="alert" className="mt-3 text-sm text-[var(--ts-danger)]">{hostError}</p>}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3 pt-2">
          <aside className="hidden w-70 shrink-0 border-r border-[#E9EEF6] bg-[#F7F9FD] lg:hidden lg:flex-col">
            <div className="p-4">
              <button
                type="button"
                onClick={() => {
                  openCreateEventEditor();
                }}
                disabled={isReadOnlyExternalCalendar}
                className="ts-button ts-button--primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#2458D3] text-white text-sm font-semibold shadow-[0_5px_14px_rgba(49,88,255,0.18)] hover:bg-[#1D49B3] transition active:scale-[0.98] duration-200"
              >
                <MaterialSymbol name="add" size={18} color="currentColor" />
                {tc("create")}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar transition-all duration-300">
              <div className="px-4 pb-4">
                <div className="rounded-[15px] border border-[#E9EEF6] bg-white p-3.5 shadow-[0_6px_18px_rgba(69,87,116,0.04)]">
                  <div className="mb-3.5 flex items-center justify-between px-1">
                    <p className="text-sm font-bold tracking-tight text-[#1F2E45]">
                      {formatMonthTitle(anchorDate)}
                    </p>
                  </div>
                  <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#A0B1C6]">
                    {weekdayLabels().map((day) => (
                      <span key={day} className="uppercase tracking-wider">
                        {day}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {miniCalendarCells.map((cell) => (
                      <button
                        key={`mini-${cell.dateKey}`}
                        type="button"
                        aria-label={cell.events.length > 0 ? tc("grid.dayEvents", { date: cell.dateKey, count: cell.events.length }) : cell.dateKey}
                        onClick={() => {
                          setSelectedDayKey(cell.dateKey);
                          setAnchorDate(parseDayKey(cell.dateKey));
                        }}
                        className={[
                          "flex flex-col items-center justify-center py-1 text-xs transition relative rounded-xl w-full",
                          cell.inCurrentMonth ? "" : "opacity-40",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "flex h-7 w-7 items-center justify-center text-[13px] font-bold rounded-full transition-all duration-200",
                            cell.isSelected
                              ? "bg-[#2458D3] text-white shadow-[0_4px_12px_rgba(47,75,226),0.3)] scale-110"
                              : cell.isToday
                                ? "bg-[#EEF2FF] text-[#2458D3] font-extrabold"
                                : "text-[#2D3F58] hover:bg-[#F2F6FC]",
                          ].join(" ")}
                        >
                          {cell.dayNumber}
                        </span>
                        <span className="mt-1 flex min-h-1 items-center justify-center gap-0.75">
                          {getMiniCalendarEventDots(cell.events).map((dot) => (
                            <span
                              key={dot.key}
                              className="h-1 w-1 rounded-full"
                              style={{
                                backgroundColor: cell.isSelected
                                  ? "#A5B7D6"
                                  : dot.color,
                              }}
                              aria-hidden
                            />
                          ))}
                          {cell.events.length > MINI_CALENDAR_MAX_DOTS ? (
                            <span
                              className="h-1 w-1 rounded-full bg-[#9DB0C9]"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 px-4 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8A9BB4]">
                  {tc("users.searchUser")}
                </p>
              </div>
              <div className="px-4 pb-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={tc("users.searchUserPlaceholder")}
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full rounded-lg border border-[#DDE5F2] bg-[#F8FAFD] py-1.5 pl-8 pr-3 text-sm focus:border-[#2458D3] focus:outline-none focus:ring-1 focus:ring-[#2458D3]"
                  />
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                    <MaterialSymbol name="search" size={16} color="#8A9BB4" />
                  </div>
                </div>
              </div>

              <div className="px-1 pb-4">
                {targetUserId ? (
                  <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 border border-blue-100">
                    <div className="flex-1 truncate">
                      <p className="text-xs font-bold text-blue-800">
                        {tc("users.viewing", { name: targetUser?.fullName ?? "" })}
                      </p>
                    </div>
                    <button
                      onClick={() => setTargetUserId(null)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <MaterialSymbol
                        name="close"
                        size={16}
                        color="currentColor"
                      />
                    </button>
                  </div>
                ) : null}

                {filteredUsers.length > 0 ? (
                  <div className="mx-2 space-y-1">
                    {filteredUsers.slice(0, 8).map((user) => (
                      <button
                        key={`search-user-${user.id}`}
                        onClick={() => {
                          setTargetUserId(user.id);
                          setUserSearch("");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[#29405F] transition hover:bg-[#F4F7FD]"
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                          {user.fullName.substring(0, 1)}
                        </div>
                        <span className="truncate">{user.fullName}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  userSearch.trim() && (
                    <p className="px-4 py-2 text-xs text-[#8A9BB4]">
                      {tc("nothingFound")}
                    </p>
                  )
                )}
              </div>
            </div>
          </aside>

          {sidebarOpen ? (
            <div className="fixed inset-0 z-260 lg:hidden">
              <div
                className="absolute inset-0 bg-black/20"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              <aside className="absolute inset-y-0 left-0 w-73 overflow-y-auto border-r border-[#DDE5F2] bg-white">
                <div className="flex items-center justify-between border-b border-[#E5ECF7] p-4">
                  <p className="text-sm font-semibold text-[#2A4263]">
                    {tc("calendars.title")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8E2F0] text-[#4D6486]"
                    aria-label={tc("sidebar.close")}
                  >
                    <MaterialSymbol
                      name="close"
                      size={16}
                      color="currentColor"
                    />
                  </button>
                </div>
              </aside>
            </div>
          ) : null}

          <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {isLoading ? <CalendarSkeletons /> : null}

            {!isLoading && hasFullError ? (
              <div className="rounded-2xl border border-[#F4C8C8] bg-[#FFF6F6] p-5">
                <div className="mb-2 flex items-center gap-2 text-[#C53030]">
                  <MaterialSymbol name="error" size={18} color="#C53030" />
                  <span className="text-sm font-semibold">
                    {tc("errors.loadCalendar")}
                  </span>
                </div>
                <p className="mb-4 text-sm text-[#B44A4A]">{eventsError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void loadCalendar({ force: true });
                  }}
                  className="ts-button ts-button--primary ts-button--compact inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2458D3] px-3 text-xs font-semibold text-white hover:bg-[#1565C0]"
                >
                  <MaterialSymbol name="refresh" size={14} color="#fff" />
                  {tc("retry")}
                </button>
              </div>
            ) : null}

            {!isLoading && !hasFullError ? (
              <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-[28px] bg-white">
                {mode === "month" ? (
                  <div className="h-full min-h-0 overflow-hidden">
                    <CalendarMonthGrid
                      cells={monthCells}
                      onSelectDay={(dayKey) => {
                        setSelectedDayKey(dayKey);
                      }}
                      onOpenDay={(dayKey) => {
                        setSelectedDayKey(dayKey);
                        setAnchorDate(parseDayKey(dayKey));
                        setMode("day");
                      }}
                      onSelectEvent={openEventPreview}
                    />
                  </div>
                ) : null}

                {mode === "week" || mode === "day" ? (
                  isMobile ? (
                    <div className="flex h-full min-h-0 flex-col bg-[#F9FBFC] rounded-3xl overflow-hidden">
                      {/* Horizontal Week Strip */}
                      <div className="bg-white border-b border-[#EAF0F6] px-4 py-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.01)]">
                        <div className="flex items-center justify-between mb-3.5">
                          <span className="text-sm font-bold text-[#1F2E45]">
                            {formatMonthTitle(anchorDate)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handlePrev}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7A8FA6] hover:bg-[#F2F6FC] transition"
                            >
                              <MaterialSymbol
                                name="chevron_left"
                                size={16}
                                color="currentColor"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={handleToday}
                              className="text-xs font-semibold text-[#2458D3] px-2 py-1 rounded-md hover:bg-[#EEF2FF] transition"
                            >
                              {tc("today")}
                            </button>
                            <button
                              type="button"
                              onClick={handleNext}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7A8FA6] hover:bg-[#F2F6FC] transition"
                            >
                              <MaterialSymbol
                                name="chevron_right"
                                size={16}
                                color="currentColor"
                              />
                            </button>
                          </div>
                        </div>

                        {/* Horizontal Week Picker */}
                        <div className="flex justify-between items-center gap-1">
                          {(() => {
                            const start = getStartOfWeek(anchorDate);
                            return Array.from({ length: 7 }).map((_, index) => {
                              const date = addDays(start, index);
                              const dayKey = toDayKey(date);
                              const isSelected =
                                dayKey === normalizedSelectedDayKey;
                              const isToday = dayKey === toDayKey(new Date());
                              const weekdayStr = formatDate(date, { weekday: "short" });
                              const capitalizedWeekday =
                                weekdayStr.charAt(0).toUpperCase() +
                                weekdayStr.slice(1);

                              return (
                                <button
                                  key={`mob-week-${dayKey}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDayKey(dayKey);
                                    setAnchorDate(date);
                                  }}
                                  className="flex flex-col items-center flex-1 py-1 relative group"
                                >
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider mb-2 transition-colors ${isSelected ? "text-[#2458D3]" : "text-[#A0B1C6]"}`}
                                  >
                                    {capitalizedWeekday}
                                  </span>
                                  <span
                                    className={`flex h-8 w-8 items-center justify-center text-sm font-bold rounded-full transition-all duration-300 ${
                                      isSelected
                                        ? "bg-[#2458D3] text-white shadow-[0_6px_16px_rgba(47,75,226),0.3)] scale-110"
                                        : isToday
                                          ? "border border-[#2458D3]/30 text-[#2458D3] font-extrabold bg-[#EEF2FF]/40"
                                          : "text-[#2D3F58] hover:bg-[#F2F6FC]"
                                    }`}
                                  >
                                    {date.getDate()}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        </div>

                        {/* Slide Indicator Line */}
                        <div className="flex justify-center mt-3">
                          <div className="w-9 h-1 rounded-full bg-[#E2EAF1]" />
                        </div>
                      </div>

                      {/* Scrollable Timeline Agenda */}
                      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar relative bg-[#FAFCFD]">
                        <div className="relative flex min-w-0 w-full py-4 pr-4 pl-1">
                          {/* Timeline Hours Column */}
                          <div className="w-13 shrink-0 relative">
                            {HOURS.map((hour) => (
                              <div
                                key={`mob-time-${hour}`}
                                className="relative border-r border-[#EBF0F6]/70"
                                style={{ height: "85px" }}
                              >
                                <span className="absolute right-3.5 -top-2 text-[10px] font-bold text-[#A5B5C9] bg-[#FAFCFD] px-1">
                                  {toHourLabel(hour)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Events Cards Area */}
                          <div className="flex-1 relative">
                            {/* Horizontal Dotted Lines matching hours */}
                            {HOURS.map((hour) => (
                              <div
                                key={`mob-grid-line-${hour}`}
                                className="absolute left-0 right-0 border-t border-[#EDF2F7] border-dashed pointer-events-none"
                                style={{ top: `${hour * 85}px`, height: "1px" }}
                              />
                            ))}

                            {/* Current Time Line Indicator */}
                            {(() => {
                              const isToday =
                                normalizedSelectedDayKey === toDayKey(now);
                              if (!isToday) return null;
                              const nowMinutes =
                                now.getHours() * 60 + now.getMinutes();
                              const lineTop = (nowMinutes / 60) * 85;

                              return (
                                <div
                                  className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                                  style={{ top: `${lineTop}px` }}
                                >
                                  <span className="h-2.5 w-2.5 rounded-full bg-[#2458D3] shadow-[0_0_8px_rgba(47,75,226),0.6)] -ml-1.25" />
                                  <div className="flex-1 h-0.5 bg-[#2458D3] opacity-75 shadow-[0_1px_3px_rgba(47,75,226),0.2)]" />
                                </div>
                              );
                            })()}

                            {/* Event Cards */}
                            {(() => {
                              const dayEvents = mobilePositionedEvents;
                              if (dayEvents.length === 0) {
                                return (
                                  <div className="flex flex-col items-center justify-center pt-24 text-center px-4">
                                    <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-[#90A3BF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] mb-3">
                                      <MaterialSymbol
                                        name="event_busy"
                                        size={24}
                                        color="currentColor"
                                      />
                                    </div>
                                    <p className="text-sm font-semibold text-[#5C728E]">
                                      {tc("grid.noEventsToday")}
                                    </p>
                                    <p className="text-xs text-[#90A3BF] mt-1">
                                      {tc("grid.freeDayHint")}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={openCreateEventEditor}
                                      className="ts-button ts-button--primary mt-4 px-4 py-2 bg-[#2458D3] text-white text-xs font-bold rounded-xl shadow-[0_4px_12px_rgba(47,75,226),0.2)] active:scale-[0.97] transition"
                                    >
                                      {tc("createEvent")}
                                    </button>
                                  </div>
                                );
                              }

                              return dayEvents.map((item) => {
                                const widthPercent = 100 / item.lanes;
                                const leftPercent = item.lane * widthPercent;
                                const baseColor = item.event.color || "#2458D3";
                                const isDeclined =
                                  item.event.myRsvpStatus === "declined";
                                const isPending =
                                  item.event.myRsvpStatus === "needs_action" &&
                                  !item.event.isOrganizer;

                                const scaledTop = (item.top / 60) * 85;
                                const scaledHeight = (item.height / 60) * 85;

                                return (
                                  <article
                                    key={`mob-event-${item.event.id}-${item.event.dayKey}-${item.event.startTime}`}
                                    onClick={(clickEvent) => {
                                      openEventPreview(
                                        item.event,
                                        clickEvent.clientX,
                                        clickEvent.clientY,
                                      );
                                    }}
                                    className={`absolute z-10 flex flex-col justify-between overflow-hidden rounded-[20px] bg-white p-3 border border-[#E9F0F8] shadow-[0_6px_16px_rgba(28,45,70,0.02)] hover:shadow-[0_10px_24px_rgba(28,45,70,0.06)] active:scale-[0.98] transition-all duration-200 cursor-pointer ${
                                      isDeclined
                                        ? "opacity-60 grayscale-30"
                                        : ""
                                    }`}
                                    style={{
                                      top: `${scaledTop + 2}px`,
                                      height: `${scaledHeight - 4}px`,
                                      left: `calc(${leftPercent}% + 4px)`,
                                      width: `calc(${widthPercent}% - 8px)`,
                                      borderLeft: `4px solid ${isDeclined ? "#9CA3AF" : baseColor}`,
                                    }}
                                  >
                                    <div className="flex flex-col gap-1 min-h-0 overflow-hidden">
                                      <div className="flex items-start justify-between gap-1.5">
                                        <h4
                                          className={`text-xs font-bold leading-snug tracking-tight text-[#1F2E45] line-clamp-2 ${isDeclined ? "line-through text-gray-400" : ""}`}
                                        >
                                          {item.event.title}
                                        </h4>
                                        {isPending && (
                                          <span className="shrink-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2458D3]/10 text-[#2458D3]">
                                            <MaterialSymbol
                                              name="mail"
                                              size={9}
                                              color="currentColor"
                                            />
                                          </span>
                                        )}
                                      </div>
                                      {item.event.description && (
                                        <p className="text-[10px] text-[#7A8FA6] truncate leading-tight">
                                          {item.event.description}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-end justify-between mt-1">
                                      <span className="text-[9px] font-bold text-[#A0B1C6] tracking-wider uppercase">
                                        {toTimeRangeLabel(
                                          item.event.startTime,
                                          item.event.endTime,
                                          item.event.isAllDay,
                                        )}
                                      </span>

                                      <div className="h-5 w-5 rounded-full bg-[#F2F6FC] flex items-center justify-center text-[#7A8FA6] hover:bg-[#EEF2FF] hover:text-[#2458D3] transition">
                                        <MaterialSymbol
                                          name="north_east"
                                          size={10}
                                          color="currentColor"
                                        />
                                      </div>
                                    </div>
                                  </article>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={weekTimeScrollContainerRef}
                      className="h-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar"
                    >
                      <div className="sticky top-0 z-10 border-b border-[#E5ECF7] bg-white/90 backdrop-blur-md">
                        <div
                          className="grid"
                          style={{
                            gridTemplateColumns: calendarGridTemplateColumns,
                          }}
                        >
                          <div className="border-r border-[#E5ECF7]" />
                          {visibleDayKeys.map((dayKey) => {
                            const date = parseDayKey(dayKey);
                            const isToday = dayKey === toDayKey(new Date());
                            const selected =
                              dayKey === normalizedSelectedDayKey;
                            return (
                              <button
                                key={`head-${dayKey}`}
                                type="button"
                                onClick={() => setSelectedDayKey(dayKey)}
                                className={`min-w-0 border-r border-[#E5ECF7] px-1 pb-2 pt-3 text-center transition-all duration-200 md:px-2 ${selected && !isToday ? "bg-[#2458D3]/5" : "hover:bg-[#2458D3]/3"}`}
                              >
                                <div className={`truncate text-[11px] font-medium uppercase tracking-[0.08em] ${isToday ? "text-[#2458D3]" : "text-[#444746]"}`}>
                                  {formatDate(date, {
                                    weekday: "short",
                                  })}
                                </div>
                                <div
                                  className={`mx-auto mt-1 inline-flex h-[46px] w-[46px] items-center justify-center rounded-full text-[26px] font-normal leading-none ${isToday ? "bg-[#2458D3] text-white" : "text-[#1F1F1F]"}`}
                                >
                                  {date.getDate()}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div
                          className="grid min-h-8.5"
                          style={{
                            gridTemplateColumns: calendarGridTemplateColumns,
                          }}
                        >
                          <div className="border-r border-[#E5ECF7] px-1 py-1 text-right text-[10px] font-semibold text-[#8EA0BA] md:px-2">
                            {tc("allDay")}
                          </div>
                          {visibleDayKeys.map((dayKey) => {
                            const dayAllDayEvents =
                              allDayEventsByDay[dayKey] ?? [];
                            return (
                              <div
                                key={`all-day-${dayKey}`}
                                className="min-w-0 border-r border-[#E5ECF7] px-1 py-1"
                              >
                                <div className="flex min-h-6 flex-wrap gap-1">
                                  {dayAllDayEvents.slice(0, 3).map((event) => {
                                    const isAllDayDeclined =
                                      event.myRsvpStatus === "declined";
                                    const isAllDayPending =
                                      event.myRsvpStatus === "needs_action" &&
                                      !event.isOrganizer;
                                    const adBaseColor =
                                      event.color || "#2458D3";
                                    return (
                                      <button
                                        key={`all-day-chip-${event.id}-${event.dayKey}`}
                                        type="button"
                                        onClick={(clickEvent) => {
                                          openEventPreview(
                                            event,
                                            clickEvent.clientX,
                                            clickEvent.clientY,
                                          );
                                        }}
                                        className={`inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition hover:scale-[1.01] ${
                                          isAllDayDeclined
                                            ? "opacity-65 grayscale bg-gray-100 border-gray-300 text-gray-500 line-through"
                                            : ""
                                        } ${
                                          isAllDayPending ? "border-dashed" : ""
                                        }`}
                                        style={
                                          isAllDayDeclined
                                            ? {}
                                            : {
                                                backgroundColor: `${adBaseColor}12`,
                                                borderColor: `${adBaseColor}30`,
                                                color: adBaseColor,
                                              }
                                        }
                                        title={`${event.title} · ${event.timeLabel}`}
                                      >
                                        <span
                                          className="h-2 w-2 shrink-0 rounded-full"
                                          style={{
                                            backgroundColor: adBaseColor,
                                          }}
                                        />
                                        <span className="truncate">
                                          {event.title}
                                        </span>
                                      </button>
                                    );
                                  })}
                                  {dayAllDayEvents.length > 3 ? (
                                    <span className="inline-flex h-6 items-center rounded-md bg-[#F2F6FD] px-1.5 text-[11px] font-semibold text-[#5B7190]">
                                      +{dayAllDayEvents.length - 3}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div
                        ref={calendarBodyGridRef}
                        className="grid"
                        style={{
                          gridTemplateColumns: calendarGridTemplateColumns,
                        }}
                      >
                        <div className="relative border-r border-[#E5ECF7] bg-white">
                          {HOURS.map((hour) => (
                            <div
                              key={`time-${hour}`}
                              className="relative border-b border-[#EEF2F8]"
                              style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                            >
                              <span
                                className={[
                                  "absolute right-1 text-[10px] text-[#444746] md:right-2 md:text-[11px]",
                                  hour === 0 ? "top-1" : "-top-2",
                                ].join(" ")}
                              >
                                {toHourLabel(hour)}
                              </span>
                              {/* 30 min dash marker */}
                              <div className="absolute top-1/2 right-0 w-1 border-t border-[#EEF2F8]" />
                            </div>
                          ))}
                        </div>

                        {visibleDayKeys.map((dayKey) => {
                          const isToday = dayKey === toDayKey(new Date());
                          const now = new Date();
                          const nowMinutes =
                            now.getHours() * 60 + now.getMinutes();
                          return (
                            <div
                              key={`column-${dayKey}`}
                              className="relative min-w-0 border-r border-[#E5ECF7] bg-white transition-colors duration-200 select-none"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e) => void handleDrop(e, dayKey)}
                              onPointerDown={(e) =>
                                handleColumnPointerDown(e, dayKey)
                              }
                            >
                              {HOURS.map((hour) => (
                                <div
                                  key={`${dayKey}-hour-${hour}`}
                                  className="relative border-b border-[#EEF2F8] transition-colors hover:bg-[#F8FBFF]/50"
                                  style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                                >
                                  {/* Middle hour dash line */}
                                  <div className="absolute top-1/2 left-0 right-0 border-t border-[#F1F5F9] border-dashed" />
                                </div>
                              ))}

                              {dragSelection &&
                              dragSelection.dayKey === dayKey ? (
                                <div
                                  className="absolute left-0.75 right-0.75 z-8 flex flex-col justify-between rounded-xl border border-[#2458D3] bg-[#2458D3]/10 px-2 py-1 text-[11px] font-semibold text-[#2458D3] shadow-[0_4px_16px_rgba(47,75,226),0.12)] pointer-events-none transition-all"
                                  style={{
                                    top: `${dragSelection.startMinutes + 1}px`,
                                    height: `${dragSelection.endMinutes - dragSelection.startMinutes - 2}px`,
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="truncate">
                                      {tc("newEvent")}
                                    </span>
                                    <span className="shrink-0 font-medium opacity-85 text-[10px]">
                                      {(() => {
                                        const formatMinutes = (
                                          minutes: number,
                                        ): string => {
                                          const h = Math.floor(minutes / 60);
                                          const m = minutes % 60;
                                          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                                        };
                                        return `${formatMinutes(dragSelection.startMinutes)} - ${formatMinutes(dragSelection.endMinutes)}`;
                                      })()}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              {isToday ? (
                                <div
                                  className="pointer-events-none absolute left-0 right-0 z-5"
                                  style={{
                                    top: `${(nowMinutes / 60) * HOUR_ROW_HEIGHT}px`,
                                  }}
                                >
                                  <div className="relative h-0.5 bg-[#2458D3] shadow-[0_0_8px_rgba(47,75,226),0.3)]">
                                    <span className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-[#2458D3] border-2 border-white shadow-[0_0_10px_rgba(47,75,226),0.5)]" />
                                  </div>
                                </div>
                              ) : null}

                              {(positionedByDay[dayKey] ?? []).map((item) => {
                                const widthPercent = 100 / item.lanes;
                                const leftPercent = item.lane * widthPercent;
                                const isEditing =
                                  activeEdit?.occurrenceKey ===
                                  toOccurrenceKey(item.event);

                                const isDeclined =
                                  item.event.myRsvpStatus === "declined";
                                const isPending =
                                  item.event.myRsvpStatus === "needs_action" &&
                                  !item.event.isOrganizer;

                                const baseColor = item.event.color || "#2458D3";
                                const bgCol = isDeclined
                                  ? "#F7F8FA"
                                  : `color-mix(in srgb, ${baseColor} 9%, white)`;
                                const borderCol = isDeclined
                                  ? "#E2E8F0"
                                  : "#E9F0F8";

                                return (
                                  <article
                                    key={`${dayKey}__${item.event.id}__${item.event.startTime}`}
                                    draggable={false}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      if (item.event.isOrganizer) {
                                        startPointerEdit(
                                          e,
                                          item.event,
                                          "move",
                                          dayKey,
                                        );
                                      }
                                    }}
                                    className={`group/event absolute z-6 overflow-hidden rounded-[7px] border p-2 text-xs transition-all duration-200 shadow-[0_2px_7px_rgba(28,45,70,0.035)] hover:shadow-[0_5px_14px_rgba(28,45,70,0.08)] ${
                                      item.event.isOrganizer
                                        ? "cursor-grab active:cursor-grabbing"
                                        : "cursor-pointer"
                                    } ${isEditing ? "ring-2 ring-[#2458D3]/35" : ""} ${
                                      isDeclined
                                        ? "opacity-60 grayscale-30"
                                        : ""
                                    } ${isPending ? "border-dashed" : ""}`}
                                    style={{
                                      top: `${item.top + 1}px`,
                                      height: `${item.height - 2}px`,
                                      left: `calc(${leftPercent}% + 3px)`,
                                      width: `calc(${widthPercent}% - 6px)`,
                                      backgroundColor: bgCol,
                                      borderColor: borderCol,
                                      borderLeft: `3px solid ${isDeclined ? "#9CA3AF" : baseColor}`,
                                      color: isDeclined ? "#6B7280" : "#1F2E45",
                                    }}
                                    onClick={(clickEvent) => {
                                      if (suppressNextPreviewRef.current) {
                                        suppressNextPreviewRef.current = false;
                                        return;
                                      }
                                      openEventPreview(
                                        item.event,
                                        clickEvent.clientX,
                                        clickEvent.clientY,
                                      );
                                    }}
                                    title={`${item.event.title} · ${item.event.timeLabel}`}
                                  >
                                    {item.event.isOrganizer &&
                                    !item.event.isAllDay ? (
                                      <>
                                        <button
                                          type="button"
                                          aria-label={tc("grid.resizeStart")}
                                          onPointerDown={(e) =>
                                            startPointerEdit(
                                              e,
                                              item.event,
                                              "resize-start",
                                              dayKey,
                                            )
                                          }
                                          className="absolute left-0 right-0 top-0 h-3 cursor-ns-resize rounded-t-md bg-transparent flex items-center justify-center"
                                          style={{ pointerEvents: "auto" }}
                                        >
                                          <div className="w-8 h-0.75 rounded-full bg-slate-300 opacity-0 group-hover/event:opacity-100 transition-opacity mt-0.5" />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={tc("grid.resizeEnd")}
                                          onPointerDown={(e) =>
                                            startPointerEdit(
                                              e,
                                              item.event,
                                              "resize-end",
                                              dayKey,
                                            )
                                          }
                                          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize rounded-b-md bg-transparent flex items-center justify-center"
                                          style={{ pointerEvents: "auto" }}
                                        >
                                          <div className="w-8 h-0.75 rounded-full bg-slate-300 opacity-0 group-hover/event:opacity-100 transition-opacity mb-0.5" />
                                        </button>
                                      </>
                                    ) : null}
                                    <div className="flex items-center justify-between gap-1">
                                      <p
                                        className={`truncate font-bold leading-tight ${isDeclined ? "line-through text-gray-400" : "text-[#1F2937]"}`}
                                      >
                                        {item.event.title}
                                      </p>
                                      {isPending && (
                                        <span
                                          className="shrink-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2458D3]/10 text-[#2458D3]"
                                          title={tc("grid.awaiting")}
                                        >
                                          <MaterialSymbol
                                            name="mail"
                                            size={9}
                                            color="currentColor"
                                          />
                                        </span>
                                      )}
                                      {isDeclined && (
                                        <span
                                          className="shrink-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-200 text-gray-500"
                                          title={tc("grid.declined")}
                                        >
                                          <MaterialSymbol
                                            name="close"
                                            size={9}
                                            color="currentColor"
                                          />
                                        </span>
                                      )}
                                    </div>
                                    <p
                                      className={`truncate text-[10px] mt-0.5 ${isDeclined ? "text-gray-400" : "text-[#64748B]"}`}
                                    >
                                      {item.event.timeLabel}
                                    </p>
                                  </article>
                                );
                              })}

                              {activeEdit &&
                              activeEdit.mode === "move" &&
                              activeEdit.draftDayKey === dayKey &&
                              activeEdit.originalDayKey !== dayKey ? (
                                <article
                                  key={`draft-${activeEdit.event.id}`}
                                  className="pointer-events-none absolute z-8 overflow-hidden rounded-lg border border-[#90CAF9] bg-[#EEF2FF]/95 p-1.5 text-xs text-[#1F4F8A] shadow-[0_8px_20px_rgba(47,75,226),0.28)] ring-2 ring-[#2458D3]/35"
                                  style={{
                                    top: `${(activeEdit.draftStartMinutes / 60) * HOUR_ROW_HEIGHT + 1}px`,
                                    height: `${((activeEdit.draftEndMinutes - activeEdit.draftStartMinutes) / 60) * HOUR_ROW_HEIGHT - 2}px`,
                                    left: "3px",
                                    width: "calc(100% - 6px)",
                                    borderLeft: `3px solid ${activeEdit.event.color || "#2458D3"}`,
                                  }}
                                  title={`${activeEdit.event.title} · ${activeEdit.event.timeLabel}`}
                                >
                                  <p className="truncate font-semibold">
                                    {activeEdit.event.title}
                                  </p>
                                  <p className="truncate text-[11px] text-[#3F679A]">
                                    {toTimeRangeLabel(
                                      new Date(
                                        parseDayKey(
                                          activeEdit.draftDayKey,
                                        ).setHours(
                                          Math.floor(
                                            activeEdit.draftStartMinutes / 60,
                                          ),
                                          activeEdit.draftStartMinutes % 60,
                                          0,
                                          0,
                                        ),
                                      ).toISOString(),
                                      new Date(
                                        parseDayKey(
                                          activeEdit.draftDayKey,
                                        ).setHours(
                                          Math.floor(
                                            activeEdit.draftEndMinutes / 60,
                                          ),
                                          activeEdit.draftEndMinutes % 60,
                                          0,
                                          0,
                                        ),
                                      ).toISOString(),
                                      activeEdit.event.isAllDay,
                                    )}
                                  </p>
                                </article>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
          </section>

          {isWideRightSidebarLayout ? (
            <aside
              data-no-tooltip
              className={`relative order-first h-full min-w-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none ${showDesktopRightSidebar ? "w-[272px]" : "w-10"}`}
            >
              <div
                aria-hidden={!showDesktopRightSidebar}
                inert={!showDesktopRightSidebar}
                className={`custom-scrollbar h-full w-[272px] overflow-x-hidden overflow-y-auto pr-1 transition-opacity duration-150 ${showDesktopRightSidebar ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                {rightSidebarContent}
              </div>
              {!showDesktopRightSidebar ? (
                <button
                  type="button"
                  onClick={() => setDesktopRightSidebarVisible(true)}
                  className={`absolute left-0 top-3 ${CALENDAR_PANEL_TOGGLE}`}
                  aria-label={tc("sidebar.toggleShow")}
                  aria-expanded={false}
                >
                  <MaterialSymbol name="side_navigation" size={18} color="currentColor" />
                </button>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>

      {rightSidebarOpen ? (
        <div className="fixed inset-0 z-[1000]">
          <div
            className="absolute inset-0 bg-black/20"
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-90 flex-col overflow-hidden border-l border-[#DDE5F2] bg-[#F4F7FC] shadow-[-12px_0_36px_rgba(27,43,72,0.12)]">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5">
              {rightSidebarContent}
            </div>
          </aside>
        </div>
      ) : null}

      {eventPreview
        ? (() => {
            const activePreviewEvent =
              selectedEvent && selectedEvent.id === eventPreview.event.id
                ? selectedEvent
                : eventPreview.event;
            const viewportHeight =
              typeof window !== "undefined" ? window.innerHeight : 800;
            const previewTop = Math.max(
              24,
              Math.min(eventPreview.y - 180, viewportHeight - 24 - 420),
            );
            const previewMaxHeight = Math.max(240, viewportHeight - previewTop - 24);
            return (
              <div className="fixed inset-0 z-560 flex items-center justify-center p-4">
                <div
                  className={`absolute inset-0 ${isMobile ? "bg-black/15" : "bg-transparent"}`}
                  onClick={() => setEventPreview(null)}
                  aria-hidden="true"
                />
                <article
                  className={`z-361 custom-scrollbar overflow-y-auto overflow-x-hidden overscroll-contain break-words rounded-3xl bg-white p-5 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.15)] border border-[#EDF2F7] transition-all duration-300 ${
                    isMobile
                      ? "fixed bottom-4 left-4 right-4 max-h-[80vh]"
                      : "absolute w-96 max-w-[calc(100vw-32px)]"
                  }`}
                  style={
                    isMobile
                      ? {}
                      : {
                          left: `clamp(200px, ${eventPreview.x}px, calc(100vw - 200px))`,
                          top: `${previewTop}px`,
                          maxHeight: `${previewMaxHeight}px`,
                          transform: "translate(-50%, 0)",
                        }
                  }
                >
                  {/* Drag indicator pill for mobile */}
                  {isMobile && (
                    <div className="flex justify-center mb-4">
                      <div className="w-12 h-1 rounded-full bg-[#E2E8F0]" />
                    </div>
                  )}

                  <div className="mb-4 flex items-center justify-between border-b border-[#F0F4FA] pb-3">
                    {/* Visual Category Label */}
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shadow-sm"
                        style={{
                          backgroundColor:
                            activePreviewEvent.color || "#2458D3",
                        }}
                      />
                      <span className="text-[10px] font-bold text-[#7A8FA6] uppercase tracking-wider">
                        {tc("preview.title")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          openEditEventEditor(activePreviewEvent);
                        }}
                        disabled={isReadOnlyExternalCalendar}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#5C728E] hover:bg-[#F1F5F9] transition disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={tc("preview.edit")}
                      >
                        <MaterialSymbol
                          name="edit"
                          size={18}
                          color="currentColor"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteEvent();
                          setEventPreview(null);
                        }}
                        disabled={isReadOnlyExternalCalendar}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#5C728E] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={tc("deleteEvent")}
                      >
                        <MaterialSymbol
                          name="delete"
                          size={18}
                          color="currentColor"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventPreview(null)}
                        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#1E293B] hover:bg-[#F1F5F9] transition"
                        aria-label={tc("preview.close")}
                      >
                        <MaterialSymbol
                          name="close"
                          size={18}
                          color="currentColor"
                        />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-extrabold leading-snug tracking-tight text-[#1F2E45]">
                        {activePreviewEvent.title}
                      </h2>
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#2458D3] bg-[#EEF2FF]/50 px-2.5 py-1 rounded-lg">
                        <MaterialSymbol
                          name="schedule"
                          size={14}
                          color="currentColor"
                        />
                        {activePreviewEvent.timeLabel}
                      </p>

                      {/* Metadata Container Card */}
                      <div className="mt-4 bg-[#F8FAFC] rounded-2xl p-4 space-y-3.5 border border-[#EDF2F7]">
                        <EventPlaceRow event={activePreviewEvent} />
                        {activePreviewEvent.isOnline && (
                          <div className="flex items-start gap-3.5 text-[#5C728E]">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#90A3BF] shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#EBF0F6]">
                              <MaterialSymbol
                                name="videocam"
                                size={16}
                                color="currentColor"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-bold text-[#4A5E73]">
                                  {getOnlineMeetingProviderLabel(
                                    activePreviewEvent,
                                  )}
                                </p>
                                <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2458D3]">
                                  {tc("online.online")}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[#6B7F97]">
                                {getOnlineMeetingStatusLabel(
                                  activePreviewEvent,
                                )}
                              </p>
                              {activePreviewEvent.joinUrl ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openMeetingLink(
                                        activePreviewEvent.joinUrl,
                                      )
                                    }
                                    className="ts-button ts-button--primary ts-button--compact inline-flex h-9 items-center justify-center rounded-xl bg-[#2458D3] px-3 text-xs font-semibold text-white transition hover:bg-[#1666CC]"
                                  >
                                    {tc("preview.join")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openMeetingInNewTab(
                                        activePreviewEvent.joinUrl,
                                      )
                                    }
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#D7E2F3] bg-white px-3 text-xs font-semibold text-[#314B6B] transition hover:bg-[#F8FBFF]"
                                  >
                                    {tc("newTab")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void copyMeetingLink(
                                        activePreviewEvent.joinUrl,
                                      );
                                    }}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#D7E2F3] bg-white px-3 text-xs font-semibold text-[#314B6B] transition hover:bg-[#F8FBFF]"
                                  >
                                    {tc("copyLink")}
                                  </button>
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-[#6B7F97]">
                                  {tc("online.linkUnavailable")}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3.5 text-[#5C728E]">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#90A3BF] shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#EBF0F6]">
                            <MaterialSymbol
                              name="notifications"
                              size={16}
                              color="currentColor"
                            />
                          </div>
                          <p className="text-xs font-bold text-[#4A5E73]">
                            {activePreviewEvent.reminderMinutes === null
                              ? tc("reminder.none")
                              : tc("preview.reminder", { minutes: activePreviewEvent.reminderMinutes })}
                          </p>
                        </div>

                        {activePreviewEvent.recurrenceRule && (
                          <div className="flex items-center gap-3.5 text-[#5C728E]">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#90A3BF] shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#EBF0F6]">
                              <MaterialSymbol
                                name="sync"
                                size={16}
                                color="currentColor"
                              />
                            </div>
                            <p className="text-xs font-bold text-[#4A5E73]">
                              {RECURRENCE_OPTIONS.find(
                                (opt) =>
                                  opt.value ===
                                  activePreviewEvent.recurrenceRule,
                              )?.label || tc("preview.repeats")}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-3.5 text-[#5C728E]">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#90A3BF] shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#EBF0F6]">
                            <MaterialSymbol
                              name="calendar_today"
                              size={16}
                              color="currentColor"
                            />
                          </div>
                          <div className="text-xs font-bold text-[#4A5E73]">
                            <p>
                              {activePreviewEvent.organizerName ||
                                viewModel.host?.fullName ||
                                tc("organizer")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {activePreviewEvent.attendees.length > 0 ? (
                        <ParticipantsCard event={activePreviewEvent} loading={selectedEventLoading} />
                      ) : null}

                      {!activePreviewEvent.isOrganizer ? (
                        <div className="mt-5 border-t border-[#F0F4FA] pt-4">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#90A3BF] mb-1">
                            {tc("preview.yourParticipation")}
                          </p>
                          <p className="mb-3 text-xs text-[#5C728E]">
                            {MY_RSVP_LABELS[activePreviewEvent.myRsvpStatus]}
                          </p>
                          <RsvpButtons
                            current={activePreviewEvent.myRsvpStatus}
                            disabled={actionLoading || isReadOnlyExternalCalendar}
                            layout="row"
                            onSelect={(status) => {
                              void handleRsvp(status);
                            }}
                          />
                          {activePreviewEvent.myRsvpStatus !== "declined" && eventHasPlace(activePreviewEvent) && eventHasOnline(activePreviewEvent) ? (
                            <div className="mt-4">
                              <AttendanceChoice
                                value={activePreviewEvent.myAttendance}
                                allowOffline
                                allowOnline
                                disabled={actionLoading || isReadOnlyExternalCalendar}
                                onSelect={(attendance) => {
                                  void handleAttendance(attendance);
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              </div>
            );
          })()
        : null}

      {isCalendarCreatorOpen ? (
        <div className="ts-legacy-backdrop fixed inset-0 z-590 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" onClick={() => setIsCalendarCreatorOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={tc("calendars.newTitle")} className="ts-legacy-dialog w-full max-w-md rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#111A36]">{tc("calendars.newTitle")}</h2>
                <p className="mt-1 text-sm text-[#7890B3]">{tc("calendars.newHint")}</p>
              </div>
              <button type="button" onClick={() => setIsCalendarCreatorOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDE6F3] text-[#587095] hover:bg-[#F5F8FC]" aria-label={tc("close")}><MaterialSymbol name="close" size={19} color="currentColor" /></button>
            </div>
            <label className="mt-5 block text-xs font-semibold text-[#243858]">{tc("calendars.name")}</label>
            <input autoFocus value={newCalendarName} onChange={(event) => setNewCalendarName(event.target.value)} placeholder={tc("calendars.namePlaceholder")} className="mt-1.5 h-11 w-full rounded-xl border border-[#DCE5F2] px-3.5 text-sm text-[#243858] outline-none focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10" />
            <label className="mt-4 block text-xs font-semibold text-[#243858]">{tc("calendars.color")}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {["#2161F5", "#14B873", "#8B3DFF", "#FF9B42", "#EF476F", "#00A6A6"].map((color) => <button key={color} type="button" onClick={() => setNewCalendarColor(color)} className={`h-8 w-8 rounded-full border-2 transition ${newCalendarColor === color ? "scale-110 border-[#17213F]" : "border-white shadow"}`} style={{ backgroundColor: color }} aria-label={tc("calendars.pickColor", { color: color })} />)}
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={() => setIsCalendarCreatorOpen(false)} className="h-10 rounded-xl border border-[#DCE5F2] px-5 text-sm font-semibold text-[#587095]">{tc("cancel")}</button>
              <button type="button" disabled={actionLoading || !newCalendarName.trim()} onClick={async () => {
                setActionLoading(true);
                try {
                  const created = await calendarController.createCalendar({ name: newCalendarName.trim(), color: newCalendarColor });
                  setCalendars((current) => [...current, created]);
                  setVisibleCalendarIds((current) => new Set([...current, created.id]));
                  setNewCalendarName("");
                  setIsCalendarCreatorOpen(false);
                  setActionSuccess(tc("calendars.created"));
                } catch (error) { setActionError(getErrorMessage(error, tc("calendars.createError"))); }
                finally { setActionLoading(false); }
              }} className="h-10 rounded-xl bg-[#2457F5] px-6 text-sm font-bold text-white disabled:opacity-50">{tc("create")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {isEventEditorOpen ? (
        <div
          className="fixed inset-0 z-600 overflow-y-auto overscroll-contain bg-black/15 backdrop-blur-[2px]"
          onClick={handleCloseEventEditor}
        >
          <div className="flex min-h-dvh w-full items-center justify-center p-3 sm:p-5 lg:p-8">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                eventEditorMode === "create"
                  ? tc("editor.creating")
                  : tc("editor.editing")
              }
              className="ts-dialog calendar-event-dialog max-w-[560px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-3 px-5 pb-1 pt-3">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-[#444746]">
                    {eventEditorMode === "create" ? tc("newEvent") : tc("editor.editing")}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCloseEventEditor}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#444746] transition hover:bg-[#E1E7EF]"
                    aria-label={tc("editor.close")}
                  >
                    <MaterialSymbol name="close" size={22} color="currentColor" />
                  </button>

                  <div className="hidden">
                    <input
                      value={eventForm.title}
                      autoFocus
                      onChange={(event) => {
                        setEventForm((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }));
                        if (fieldErrors.title)
                          setFieldErrors((prev) => ({ ...prev, title: false }));
                      }}
                      placeholder={tc("editor.titleLabel")}
                      readOnly={isEditingInviteEvent}
                      className={`peer h-10 w-full bg-transparent text-[22px] sm:text-[26px] font-bold tracking-tight outline-none transition-all placeholder:text-[#94A3B8] ${
                        fieldErrors.title
                          ? "text-[#E53935] placeholder:text-[#EF9A9A]"
                          : "text-[#1E293B]"
                      } ${isEditingInviteEvent ? "cursor-default" : ""}`}
                    />
                    <div
                      className={`absolute -bottom-1 left-0 h-0.5 transition-all duration-300 peer-focus:w-full ${
                        fieldErrors.title
                          ? "w-full bg-[#E53935]"
                          : "w-0 bg-[#2458D3]"
                      }`}
                    />
                    <span
                      title={tc("editor.required")}
                      className={`absolute -right-4 top-1 font-bold text-[#E53935] transition-opacity ${eventForm.title ? "opacity-0" : "opacity-100"}`}
                    >
                      *
                    </span>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto px-5 pb-4 pt-1">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="sr-only">{tc("editor.titleLabel")}</label>
                      <input
                        value={eventForm.title}
                        autoFocus
                        onChange={(event) => {
                          setEventForm((prev) => ({ ...prev, title: event.target.value }));
                          if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: false }));
                        }}
                        placeholder={tc("editor.titlePlaceholder")}
                        readOnly={isEditingInviteEvent}
                        className={`h-12 w-full border-0 border-b-2 bg-transparent px-0 text-[22px] text-[#1F1F1F] outline-none transition placeholder:text-[#444746] focus:border-[#2458D3] ${
                          fieldErrors.title ? "border-[#E53935]" : "border-[#C4C7C5]"
                        } ${isEditingInviteEvent ? "cursor-default opacity-70" : ""}`}
                      />
                    </div>
                    {showAdvancedEventFields ? (
                    <div className="space-y-1.5">
                      <label className="ml-1 text-xs font-semibold text-[#243858]">{tc("title")}</label>
                      <AppSelect
                        value={eventForm.calendarId}
                        options={calendars.map((calendar) => ({ value: calendar.id, label: calendar.name }))}
                        showButtonAvatar={false}
                        showOptionAvatar={false}
                        disabled={isEditingInviteEvent}
                        onChange={(calendarId) => {
                          const calendar = calendars.find((item) => item.id === calendarId);
                          setEventForm((prev) => ({ ...prev, calendarId, color: calendar?.color ?? prev.color }));
                        }}
                        placeholder={tc("editor.calendarPlaceholder")}
                        ariaLabel={tc("editor.calendarSelect")}
                        buttonClassName="h-11 rounded-xl !border !border-[#DCE5F2] !bg-white px-3.5 text-sm hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10"
                        menuClassName="z-[460]"
                      />
                    </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <label className="ml-1 text-xs font-semibold text-[#243858]">
                          {tc("editor.startLabel")}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={eventForm.startAt.slice(0, 10)}
                            disabled={isEditingInviteEvent}
                            onChange={(event) => {
                              setEventForm((prev) =>
                                shiftEventStartPreservingDuration(
                                  prev,
                                  `${event.target.value}T${prev.startAt.slice(11, 16) || "09:00"}`,
                                ),
                              );
                              if (fieldErrors.startAt)
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  startAt: false,
                                }));
                            }}
                            className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-[#243858] outline-none transition focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10 ${
                              fieldErrors.startAt
                                ? "border-[#E53935] bg-[#FFEBEE] ring-4 ring-[#E53935]/10"
                                : "border-[#DCE5F2]"
                            } ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          />
                          <AppTimePicker
                            value={eventForm.startAt.slice(11, 16)}
                            disabled={isEditingInviteEvent}
                            onChange={(val) => {
                              setEventForm((prev) =>
                                shiftEventStartPreservingDuration(
                                  prev,
                                  `${prev.startAt.slice(0, 10) || toDayKey(new Date())}T${val}`,
                                ),
                              );
                              if (fieldErrors.startAt)
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  startAt: false,
                                }));
                            }}
                            error={fieldErrors.startAt}
                            buttonClassName={
                              fieldErrors.startAt
                                ? ""
                                : `!h-11 !rounded-xl !border !border-[#DCE5F2] !bg-white hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="ml-1 text-xs font-semibold text-[#243858]">
                          {tc("editor.endLabel")}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            min={
                              eventForm.startAt.slice(0, 10) ||
                              new Date().toISOString().split("T")[0]
                            }
                            value={eventForm.endAt.slice(0, 10)}
                            disabled={isEditingInviteEvent}
                            onChange={(event) => {
                              setEventForm((prev) => ({
                                ...prev,
                                endAt: `${event.target.value}T${prev.endAt.slice(11, 16) || "10:00"}`,
                              }));
                              if (fieldErrors.endAt)
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  endAt: false,
                                }));
                            }}
                            className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-[#243858] outline-none transition focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10 ${
                              fieldErrors.endAt
                                ? "border-[#E53935] bg-[#FFEBEE] ring-4 ring-[#E53935]/10"
                                : "border-[#DCE5F2]"
                            } ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          />
                          <AppTimePicker
                            value={eventForm.endAt.slice(11, 16)}
                            disabled={isEditingInviteEvent}
                            onChange={(val) => {
                              setEventForm((prev) => ({
                                ...prev,
                                endAt: `${prev.endAt.slice(0, 10) || toDayKey(new Date())}T${val}`,
                              }));
                              if (fieldErrors.endAt)
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  endAt: false,
                                }));
                            }}
                            error={fieldErrors.endAt}
                            buttonClassName={
                              fieldErrors.endAt
                                ? ""
                                : `!h-11 !rounded-xl !border !border-[#DCE5F2] !bg-white hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {!eventForm.isAllDay ? (
                      <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
                        <AppSelect
                          value={eventForm.timezone}
                          options={timeZoneOptions}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          disabled={isEditingInviteEvent}
                          onChange={(value) => {
                            setEventForm((prev) => ({ ...prev, timezone: value }));
                          }}
                          placeholder={tc("editor.timezone")}
                          ariaLabel={tc("editor.timezoneSelect")}
                          className="w-full md:w-72"
                          buttonClassName={`h-9 rounded-xl !border !border-[#DCE5F2] !bg-white px-3 text-xs hover:!bg-[#F8FAFC] ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          menuClassName="z-[460]"
                        />
                        {timeZoneHint ? (
                          <p className="min-w-0 break-words text-[11px] font-semibold text-[#5C728E]">
                            {timeZoneHint}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {roomOptions.length > 0 || roomsError || eventForm.roomId ? (
                      <div className="space-y-1.5">
                        <AppSelect
                          value={eventForm.roomId || ""}
                          options={[
                            { value: "", label: tc("room.none") },
                            ...roomOptions.map((item) => {
                              const isCurrent = item.room.id === (selectedEvent?.id === selectedEventId ? selectedEvent?.roomId : "");
                              const busy = item.isAvailable === false && !isCurrent;
                              const freeAt = busy ? getRoomFreeAt(item.busySlots, roomRangeStartIso, roomRangeEndIso) : null;
                              const meta = [
                                item.room.capacity ? tc("room.capacity", { count: item.room.capacity }) : "",
                                [item.room.siteName, item.room.location || (item.room.floor !== null ? tc("room.floor", { floor: item.room.floor }) : "")].filter(Boolean).join(", "),
                                item.isAvailable === null ? "" : busy ? (freeAt ? tc("room.freeAt", { time: formatRoomFreeAt(freeAt, roomRangeStartIso) }) : tc("room.busy")) : tc("room.free"),
                              ].filter(Boolean).join(" · ");
                              return { value: item.room.id, label: item.room.name, description: meta, disabled: busy };
                            }),
                            ...(eventForm.roomId && !roomOptions.some((item) => item.room.id === eventForm.roomId)
                              ? [{ value: eventForm.roomId, label: selectedEvent?.roomName || tc("room.selected") }]
                              : []),
                          ]}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          disabled={isEditingInviteEvent}
                          onChange={(value) => setEventForm((prev) => ({ ...prev, roomId: value, location: value ? "" : prev.location }))}
                          placeholder={tc("room.label")}
                          ariaLabel={tc("room.label")}
                          className="w-full"
                          buttonClassName={`h-11 rounded-xl !border !border-[#DCE5F2] !bg-white px-3.5 text-sm hover:!bg-[#F8FAFC] ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          menuClassName="z-[460]"
                        />
                        {roomsError ? (
                          <p className="text-[11px] font-semibold text-[#B45309]">{roomsError}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={`grid grid-cols-1 gap-3 ${eventForm.roomId ? "" : "md:grid-cols-2"}`}>
                      {eventForm.roomId ? null : <input
                        value={eventForm.location}
                        disabled={isEditingInviteEvent}
                        onChange={(event) =>
                          setEventForm((prev) => ({
                            ...prev,
                            location: event.target.value,
                          }))
                        }
                        placeholder={tc("editor.locationPlaceholder")}
                        className={`h-11 rounded-xl border border-[#DCE5F2] bg-white px-3.5 text-sm text-[#243858] outline-none transition placeholder:text-[#8DA0BD] focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`}
                      />}
                      <div className="space-y-2">
                        <AppSelect
                          value={isCustomReminder ? REMINDER_CUSTOM_VALUE : eventForm.reminderMinutes}
                          options={REMINDER_PRESET_OPTIONS}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          disabled={isEditingInviteEvent}
                          onChange={(value) => {
                            if (value === REMINDER_CUSTOM_VALUE) {
                              setIsCustomReminder(true);
                              setEventForm((prev) => {
                                const isCurrentCustom =
                                  prev.reminderMinutes !== "" &&
                                  !isReminderPresetValue(prev.reminderMinutes);
                                return {
                                  ...prev,
                                  reminderMinutes: isCurrentCustom
                                    ? prev.reminderMinutes
                                    : "20",
                                };
                              });
                            } else {
                              setIsCustomReminder(false);
                              setEventForm((prev) => ({
                                ...prev,
                                reminderMinutes: value,
                              }));
                            }
                            if (value) void askNotificationPermission();
                          }}
                          placeholder={tc("editor.notification")}
                          ariaLabel={tc("editor.notificationSelect")}
                          buttonClassName={`h-11 rounded-xl !border !border-[#DCE5F2] !bg-white px-3.5 text-sm hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          menuClassName="z-[460]"
                        />
                        {isCustomReminder ? (
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={eventForm.reminderMinutes}
                            onChange={(event) =>
                              setEventForm((prev) => ({
                                ...prev,
                                reminderMinutes: event.target.value.replace(
                                  /[^\d]/g,
                                  "",
                                ),
                              }))
                            }
                            placeholder={tc("editor.customMinutes")}
                            className="h-11 w-full rounded-xl border border-[#DCE5F2] bg-white px-3.5 text-sm text-[#243858] outline-none transition focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10"
                          />
                        ) : null}
                        {eventForm.reminderMinutes && notificationPermission === "denied" ? (
                          <p className="text-[10px] font-semibold leading-snug text-[#9A6700]">
                            {tc("editor.browserNotificationsOff")}
                          </p>
                        ) : null}
                      </div>
                      <AppSelect
                        value={eventForm.recurrenceRule}
                        options={RECURRENCE_OPTIONS}
                        showButtonAvatar={false}
                        showOptionAvatar={false}
                        disabled={isEditingInviteEvent}
                        onChange={(value) => {
                          setEventForm((prev) => ({
                            ...prev,
                            recurrenceRule: value,
                          }));
                        }}
                        placeholder={tc("editor.recurrence")}
                        ariaLabel={tc("editor.recurrenceSelect")}
                        buttonClassName={`h-11 rounded-xl !border !border-[#DCE5F2] !bg-white px-3.5 text-sm hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`}
                        menuClassName="z-[460]"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded-xl border border-[#DCE5F2] bg-[#F8FAFC]/60 p-3">
                        <AppSelect
                          value=""
                          options={guestSelectOptions}
                          onChange={() => {}}
                          searchable
                          onSearchChange={setCalendarGuestSearch}
                          multiple
                          selectedValues={eventForm.attendeeIds.map(String)}
                          onSelectedValuesChange={(values) => {
                            const nextAttendeeIds = values
                              .map((value) => Number(value))
                              .filter(
                                (value) => Number.isFinite(value) && value > 0,
                              );
                            setEventForm((prev) => ({
                              ...prev,
                              attendeeIds: nextAttendeeIds,
                            }));
                          }}
                          selectedSummaryText={(options) => {
                            if (options.length === 1) {
                              return tc("guests.selectedOne");
                            }
                            return tc("guests.selectedMany", { count: options.length });
                          }}
                          searchPlaceholder={tc("guests.search")}
                          placeholder={
                            calendarUsersLoading && calendarGuestSearchResults.length === 0
                              ? tc("guests.loading")
                              : tc("guests.placeholder")
                          }
                          ariaLabel={tc("guests.select")}
                          className="w-full"
                          buttonClassName={`h-11 rounded-xl !border !border-[#DCE5F2] !bg-white px-3.5 text-sm hover:!bg-[#F8FAFC] focus:!border-[#2458D3] focus:!ring-3 focus:!ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`}
                          menuClassName="z-[460]"
                          disabled={
                            (calendarUsersLoading && calendarGuestSearchResults.length === 0) || isEditingInviteEvent
                          }
                          onMenuScrollEnd={loadMoreGuests}
                          loadingMore={calendarGuestLoadingMore}
                          hasMore={calendarGuestHasMore}
                        />
                        <div className="mt-2.5 min-h-12 rounded-xl bg-white border border-[#E2E8F0]/80 p-2 flex flex-wrap items-center">
                          {selectedGuestUsers.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedGuestUsers.map((user) => (
                                <span
                                  key={user.id}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF2FF] border border-[#BBDEFB] pl-2.5 pr-1.5 py-1 text-xs font-semibold text-[#2458D3] hover:bg-[#EEF2FF] transition-all"
                                >
                                  {user.fullName}
                                  {user.id !== organizerUserId ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEventForm((prev) => ({
                                          ...prev,
                                          attendeeIds: prev.attendeeIds.filter(
                                            (id) => id !== user.id,
                                          ),
                                        }));
                                      }}
                                      className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#2458D3]/10 text-[#2458D3] hover:bg-[#2458D3]/20 transition-all font-bold text-[10px] ml-0.5"
                                      aria-label={tc("guests.remove", { name: user.fullName })}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-[#8AA0BF] px-1">
                              {tc("guests.none")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {freeBusyProposal && freeBusyAttendeeIds.length > 0 ? (
                      <CalendarFreeBusy
                        rows={freeBusyRows}
                        dayStartMs={freeBusyProposal.dayStartMs}
                        proposedStartMs={freeBusyProposal.startMs}
                        proposedEndMs={freeBusyProposal.endMs}
                        loading={freeBusyLoading}
                        error={freeBusyError}
                      />
                    ) : null}

                    <div className="flex gap-6 text-sm text-[#475569] px-1 py-1">
                      <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#475569] cursor-pointer hover:text-[#2458D3] transition-colors">
                        <input
                          type="checkbox"
                          checked={eventForm.isAllDay}
                          disabled={isEditingInviteEvent}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setEventForm((prev) =>
                              checked
                                ? normalizeFormForAllDay(prev)
                                : { ...prev, isAllDay: false },
                            );
                          }}
                          className="w-5 h-5 rounded-lg border-2 border-[#CBD5E1] text-[#2458D3] focus:ring-[#2458D3]/20 cursor-pointer transition-all"
                        />
                        {tc("allDay")}
                      </label>
                      <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#475569] cursor-pointer hover:text-[#2458D3] transition-colors">
                        <input
                          type="checkbox"
                          checked={eventForm.isOnline}
                          disabled={isEditingInviteEvent}
                          onChange={(event) =>
                            setEventForm((prev) => ({
                              ...prev,
                              isOnline: event.target.checked,
                            }))
                          }
                          className="w-5 h-5 rounded-lg border-2 border-[#CBD5E1] text-[#2458D3] focus:ring-[#2458D3]/20 cursor-pointer transition-all"
                        />
                        {eventForm.roomId ? tCalendar("event.addOnlineLink") : tc("editor.onlineQmeet")}
                      </label>
                    </div>

                    <textarea
                      rows={4}
                      value={eventForm.description}
                      disabled={isEditingInviteEvent}
                      onChange={(event) =>
                        setEventForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      placeholder={tc("editor.descriptionPlaceholder")}
                      className={`w-full resize-none rounded-xl border border-[#DCE5F2] bg-white px-4 py-3 text-sm text-[#243858] placeholder:text-[#8DA0BD] outline-none transition focus:border-[#2458D3] focus:ring-3 focus:ring-[#2458D3]/10 ${isEditingInviteEvent ? "opacity-70" : ""}`}
                    />
                  </div>

                  <aside className="hidden">
                    <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-1">
                        {tc("guests.title")}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        {selectedGuestUsers.length
                          ? tc("guests.added", { count: selectedGuestUsers.length })
                          : tc("guests.addHint")}
                      </p>
                      {selectedEvent && selectedEvent.attendees.length > 0 ? (
                        <div className="mt-2">
                          <RsvpSummaryLine summary={selectedEvent.rsvpSummary} />
                        </div>
                      ) : null}
                      {selectedGuestUsers.length > 0 && (
                        <div className="mt-3 space-y-2.5 border-t border-[#F1F5F9] pt-3 max-h-55 overflow-y-auto pr-1 custom-scrollbar">
                          {selectedGuestUsers.map((user) => {
                            const initials = user.fullName
                              ? user.fullName.substring(0, 1).toUpperCase()
                              : "?";
                            const attendee = selectedEvent?.attendees.find(
                              (a) => Number(a.id) === Number(user.id),
                            );
                            const isOrganizer = selectedEvent
                              ? Number(user.id) ===
                                Number(selectedEvent.organizerUserId)
                              : organizerUserId
                                ? Number(user.id) === Number(organizerUserId)
                                : false;

                            return (
                              <div
                                key={`edit-sidebar-att-${user.id}`}
                                className="flex items-center justify-between gap-1.5 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-bold text-[#2458D3]">
                                    {initials}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-[#1E293B] truncate leading-tight">
                                      {user.fullName}
                                      {isOrganizer && (
                                        <span className="ml-1.5 inline-flex items-center rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[8px] font-bold text-[#64748B] uppercase tracking-wider">
                                          {tc("organizerShort")}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {selectedEvent && (
                                  <RsvpStatusBadge
                                    status={attendee?.status ?? "needs_action"}
                                    size="sm"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {isEditingOrganizerEvent ? (
                      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                          {tc("editor.manage")}
                        </p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          {tc("editor.organizerHint")}
                        </p>
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedEventId) void handleDeleteEvent();
                            }}
                            className="h-11 w-full rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6]/60 text-xs font-bold text-[#C5221F] hover:bg-[#FCE8E6] transition-all active:scale-[0.98]"
                          >
                            {tc("deleteEvent")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {isEditingInviteEvent && (
                      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                          {tc("editor.rsvpTitle")}
                        </p>
                        <p
                          className="mt-1 text-xs font-semibold"
                          style={{
                            color:
                              RSVP_STATUS_META[selectedEvent?.myRsvpStatus ?? "needs_action"].color,
                          }}
                        >
                          {MY_RSVP_LABELS[selectedEvent?.myRsvpStatus ?? "needs_action"]}
                        </p>
                        <div className="mt-3">
                          <RsvpButtons
                            current={selectedEvent?.myRsvpStatus ?? "needs_action"}
                            disabled={actionLoading || !selectedEventId || isReadOnlyExternalCalendar}
                            layout="stack"
                            onSelect={(status) => {
                              void handleRsvp(status);
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {!isEditingEvent ? (
                      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                          {tc("newEvent")}
                        </p>
                        <p className="mt-1 text-xs text-[#94A3B8] leading-relaxed">
                          {tc("editor.newHint")}
                        </p>
                      </div>
                    ) : null}
                  </aside>
                </div>

                <div className="ts-dialog__footer">
                  {eventEditorMode === "create" ? (
                    <button
                      type="button"
                      onClick={() => setShowMoreEventOptions((prev) => !prev)}
                      className="ts-button ts-button--ghost"
                    >
                      {showMoreEventOptions ? tc("editor.fewerOptions") : tc("editor.moreOptions")}
                    </button>
                  ) : null}
                  <AppButton variant="secondary" disabled={actionLoading} onClick={handleCloseEventEditor}>{tc("cancel")}</AppButton>
                  <button
                    type="button"
                    disabled={
                      actionLoading ||
                      isReadOnlyExternalCalendar ||
                      (eventEditorMode === "edit" && !isEditingOrganizerEvent)
                    }
                    onClick={() => {
                      if (eventEditorMode === "create") {
                        void handleCreateEvent();
                      } else {
                        void handleUpdateEvent();
                      }
                    }}
                    className="ts-button ts-button--primary"
                  >
                    {actionLoading ? tc("saving") : tc("save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isEventEditorOpen && isConflictDialogOpen && availabilityResult ? (
        <div
          className="fixed inset-0 z-650 bg-black/35 backdrop-blur-[1px]"
          onClick={closeConflictDialog}
        >
          <div className="flex min-h-dvh items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={tc("conflicts.title")}
              className="ts-dialog calendar-event-dialog max-w-205"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#EEF3F8] px-5 py-5 sm:px-6">
                <div>
                  <p className="text-[24px] font-extrabold tracking-tight text-[#1F2E45]">
                    {tc("conflicts.title")}
                  </p>
                  <p className="mt-2 text-sm text-[#5C728E]">
                    {tc("conflicts.description")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeConflictDialog}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#2458D3]"
                  aria-label={tc("conflicts.close")}
                >
                  <MaterialSymbol name="close" size={20} color="currentColor" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-[#E5EDF7] bg-[#F8FBFF] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7287A3]">
                      {tc("conflicts.youChose")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#20344D]">
                      {currentAvailabilityPayload
                        ? formatSuggestedSlotLabel(
                            currentAvailabilityPayload.startTime,
                            currentAvailabilityPayload.endTime,
                            availabilityTimezone,
                          )
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#F4D8D8] bg-[#FFF8F8] p-4">
                    <p className="text-sm font-semibold text-[#9F2D2D]">
                      {tc("conflicts.busyCount", { label: formatParticipantCountLabel(conflictedUsersCount) })}
                    </p>
                    <p className="mt-1 text-xs text-[#7A4B4B]">
                      {tc("conflicts.onlyConflicted")}
                    </p>
                  </div>

                  {availabilityLoading ? (
                    <div className="rounded-2xl border border-[#D8E3F2] bg-[#F8FBFF] p-4 text-sm text-[#31507A]">
                      {tc("conflicts.checking")}
                    </div>
                  ) : null}

                  {availabilityError ? (
                    <div className="rounded-2xl border border-[#F2D5D5] bg-[#FFF7F7] p-4 text-sm text-[#9F2D2D]">
                      {availabilityError}
                    </div>
                  ) : null}

                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-[#5B2C2C]">
                        {tc("conflicts.whoBusy")}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {availabilityConflictMeta.map(
                        ({ group, displayName, identityLine, avatarUrl }) => (
                          <div
                            key={group.userId}
                            className="rounded-2xl border border-[#F3E6E6] bg-[#FFFCFC] p-4"
                          >
                            <div className="flex items-start gap-3">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={displayName}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FDECEC] text-xs font-bold text-[#A33A3A]">
                                  {getInitials(displayName)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[#612E2E]">
                                  {displayName}
                                </p>
                                {identityLine ? (
                                  <p className="mt-1 text-xs text-[#7A4B4B]">
                                    {identityLine}
                                  </p>
                                ) : null}
                                <div className="mt-3 space-y-2">
                                  {group.conflicts.map((conflict) => {
                                    const overlapMinutes =
                                      currentAvailabilityPayload
                                        ? getOverlapMinutes(
                                            currentAvailabilityPayload.startTime,
                                            currentAvailabilityPayload.endTime,
                                            conflict.startTime,
                                            conflict.endTime,
                                            conflict.overlapMinutes,
                                          )
                                        : conflict.overlapMinutes ?? 0

                                    return (
                                      <div
                                        key={`${group.userId}-${conflict.eventId}-${conflict.startTime}`}
                                        className="rounded-xl border border-[#F8EAEA] bg-white px-3 py-3 text-xs text-[#7A4B4B]"
                                      >
                                        <p className="font-semibold text-[#6B2C2C]">
                                          {tc("conflicts.busyWith", { title: conflict.eventTitle || tc("conflicts.otherEvent") })}
                                        </p>
                                        <p className="mt-1">
                                          {formatConflictDateTimeRange(
                                            conflict.startTime,
                                            conflict.endTime,
                                            availabilityTimezone,
                                          )}
                                        </p>
                                        <p className="mt-1">
                                          {tc("conflicts.overlap", { minutes: overlapMinutes })}
                                        </p>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </section>

                  {sortedSuggestedSlots.length ? (
                    <section className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-[#23466C]">
                          {tc("conflicts.suitableTitle")}
                        </p>
                        <p className="mt-1 text-xs text-[#58708F]">
                          {tc("conflicts.suitableHint")}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {visibleSuggestedSlots.map((slot) => {
                          const actualIndex = sortedSuggestedSlots.findIndex(
                            (item) =>
                              getSuggestedSlotKey(item) ===
                              getSuggestedSlotKey(slot),
                          )
                          const badgeLabel = getSuggestedSlotBadgeLabel(
                            slot,
                            actualIndex,
                            slot.timezone || availabilityTimezone,
                          )
                          const isSelected =
                            selectedSuggestedSlotKey ===
                            getSuggestedSlotKey(slot)

                          return (
                            <div
                              key={getSuggestedSlotKey(slot)}
                              className={`rounded-2xl border p-4 transition ${
                                isSelected
                                  ? "border-[#2458D3] bg-[#F4F9FF] shadow-[0_8px_24px_rgba(47,75,226),0.12)]"
                                  : "border-[#DCE8F7] bg-white"
                              }`}
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedSuggestedSlotKey(
                                      getSuggestedSlotKey(slot),
                                    )
                                  }
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <span className="inline-flex rounded-full bg-[#EAF3FF] px-3 py-1 text-xs font-bold text-[#1E5FAF]">
                                    {badgeLabel}
                                  </span>
                                  <p className="mt-3 text-sm font-semibold text-[#16324F]">
                                    {formatSuggestedSlotLabel(
                                      slot.startTime,
                                      slot.endTime,
                                      slot.timezone || availabilityTimezone,
                                    )}
                                  </p>
                                  <p className="mt-1 text-xs text-[#58708F]">
                                    {tc("conflicts.allFree")}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    void applySuggestedSlotAndSubmit(slot)
                                  }}
                                  className="h-11 rounded-xl bg-[#0E3CF6] px-4 text-sm font-semibold text-white transition hover:bg-[#0C35DB] disabled:opacity-50"
                                >
                                  {tc("conflicts.pickThis")}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {hiddenSuggestedSlotsCount > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setShowAllSuggestedSlots((prev) => !prev)
                          }
                          className="inline-flex h-10 items-center rounded-xl border border-[#D6E4F5] bg-white px-4 text-sm font-semibold text-[#28527A] transition hover:bg-[#F8FBFF]"
                        >
                          {showAllSuggestedSlots
                            ? tc("hide")
                            : tc("showMore", { count: hiddenSuggestedSlotsCount })}
                        </button>
                      ) : null}
                    </section>
                  ) : (
                    <section className="space-y-3 rounded-2xl border border-[#F5E8C8] bg-[#FFF9ED] p-4">
                      <div>
                        <p className="text-sm font-semibold text-[#8A6B22]">
                          {tc("conflicts.noneFound")}
                        </p>
                        <p className="mt-1 text-xs text-[#9F7A2B]">
                          {tc("conflicts.noneHint")}
                        </p>
                      </div>

                      {availabilityResult.partialSuggestedSlots.length ? (
                        <div className="space-y-2">
                          {sortSuggestedSlots(
                            availabilityResult.partialSuggestedSlots,
                          ).map((slot) => (
                            <div
                              key={getSuggestedSlotKey(slot)}
                              className="rounded-xl border border-[#F2E0AE] bg-white px-3 py-3"
                            >
                              <span className="inline-flex rounded-full bg-[#FFF2CC] px-3 py-1 text-xs font-bold text-[#8A6B22]">
                                {getSuggestedSlotBadgeLabel(
                                  slot,
                                  Number.MAX_SAFE_INTEGER,
                                  slot.timezone || availabilityTimezone,
                                )}
                              </span>
                              <p className="mt-3 text-sm font-semibold text-[#6E5517]">
                                {formatSuggestedSlotLabel(
                                  slot.startTime,
                                  slot.endTime,
                                  slot.timezone || availabilityTimezone,
                                )}
                              </p>
                              <p className="mt-1 text-xs text-[#8A6B22]">
                                {slot.label || tc("conflicts.partlyFree")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSearchNextWeekSuggestions}
                          className="h-10 rounded-xl border border-[#E7C97A] bg-white px-4 text-sm font-semibold text-[#8A6B22] transition hover:bg-[#FFF6DA]"
                        >
                          {tc("conflicts.checkNextWeek")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEventForm((prev) => {
                              const nextStartIso =
                                fromLocalDateTimeInputValue(prev.startAt, prev.timezone)
                              const nextEndIso =
                                fromLocalDateTimeInputValue(prev.endAt, prev.timezone)
                              if (!nextStartIso || !nextEndIso) return prev
                              const shiftedStart = new Date(
                                new Date(nextStartIso).valueOf() +
                                  24 * 60 * 60 * 1000,
                              )
                              const shiftedEnd = new Date(
                                new Date(nextEndIso).valueOf() +
                                  24 * 60 * 60 * 1000,
                              )
                              return {
                                ...prev,
                                startAt: toLocalDateTimeInputValue(
                                  shiftedStart.toISOString(),
                                  prev.timezone,
                                ),
                                endAt: toLocalDateTimeInputValue(
                                  shiftedEnd.toISOString(),
                                  prev.timezone,
                                ),
                              }
                            })
                          }}
                          className="h-10 rounded-xl border border-[#E7C97A] bg-white px-4 text-sm font-semibold text-[#8A6B22] transition hover:bg-[#FFF6DA]"
                        >
                          {tc("conflicts.pickDay")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEventForm((prev) => ({
                              ...prev,
                              endAt: (() => {
                                const startIso = fromLocalDateTimeInputValue(
                                  prev.startAt,
                                  prev.timezone,
                                )
                                const endIso = fromLocalDateTimeInputValue(
                                  prev.endAt,
                                  prev.timezone,
                                )
                                if (!startIso || !endIso) return prev.endAt
                                const start = new Date(startIso)
                                const end = new Date(endIso)
                                const currentMinutes = Math.max(
                                  15,
                                  Math.round(
                                    (end.valueOf() - start.valueOf()) / 60000,
                                  ),
                                )
                                const nextMinutes = Math.max(
                                  15,
                                  currentMinutes - 30,
                                )
                                return toLocalDateTimeInputValue(
                                  new Date(
                                    start.valueOf() + nextMinutes * 60000,
                                  ).toISOString(),
                                  prev.timezone,
                                )
                              })(),
                            }))
                          }}
                          className="h-10 rounded-xl border border-[#E7C97A] bg-white px-4 text-sm font-semibold text-[#8A6B22] transition hover:bg-[#FFF6DA]"
                        >
                          {tc("conflicts.shorten")}
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#EEF3F8] bg-white px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={closeConflictDialog}
                  className="h-11 rounded-2xl border border-[#E2E8F0] bg-white px-5 text-sm font-bold text-[#64748B] transition hover:bg-[#F8FAFC]"
                >
                  {tc("conflicts.backToEdit")}
                </button>
                {conflictActionMode === "create" ? (
                  <button
                    type="button"
                    disabled={actionLoading || isReadOnlyExternalCalendar}
                    onClick={() => {
                      void handleCreateEvent(true)
                    }}
                    className="h-11 rounded-2xl border border-[#FAD2E1] bg-[#FFF0F5] px-5 text-sm font-bold text-[#C52275] transition hover:bg-[#FCDAE6] disabled:opacity-50"
                  >
                    {tc("conflicts.createAnyway")}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!selectedSuggestedSlot || actionLoading}
                  onClick={() => {
                    if (!selectedSuggestedSlot) return
                    void applySuggestedSlotAndSubmit(selectedSuggestedSlot)
                  }}
                  className="ts-button ts-button--primary h-11 rounded-2xl bg-[#2458D3] px-5 text-sm font-bold text-white transition hover:bg-[#1565C0] disabled:opacity-50"
                >
                  {tc("conflicts.pickThis")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastQueue.length > 0 ? (
        <div className="fixed right-4 top-16 z-9999 flex w-[min(460px,calc(100vw-2rem))] flex-col gap-2">
          {toastQueue.map((toast) => (
            <AppToast
              key={toast.id}
              floating={false}
              variant={toast.variant}
              message={toast.message}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}
