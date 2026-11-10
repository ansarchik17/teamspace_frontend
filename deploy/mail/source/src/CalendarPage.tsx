import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  X,
  Clock,
  MapPin,
  Users,
  Download,
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import { api } from "./api";
import "./calendar.css";

type Event = any;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateLabel = (d: Date) =>
  d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const zones = Array.from(
  new Set([
    "Asia/Almaty",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "Europe/Moscow",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "Asia/Dubai",
    "Etc/UTC",
  ]),
);
const statusText: Record<string, string> = {
  "needs-action": "Ожидает ответа",
  accepted: "Принято",
  declined: "Отказ",
  tentative: "Возможно",
};
function localInZone(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}
function eventDay(e: Event, zone: string) {
  return e.showWithoutTime
    ? e.start.slice(0, 10)
    : localInZone(e.utcStart, zone).slice(0, 10);
}
function timeLabel(e: Event, zone: string) {
  return e.showWithoutTime
    ? "Весь день"
    : new Date(e.utcStart).toLocaleTimeString("ru-RU", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
      });
}
function onDay(e: Event, key: string, zone: string) {
  const end = e.showWithoutTime
    ? new Date(
        Date.parse(e.start.slice(0, 10) + "T00:00:00Z") +
          Math.round(
            (Date.parse(e.utcEnd) - Date.parse(e.utcStart)) / 86400000,
          ) *
            86400000,
      )
        .toISOString()
        .slice(0, 10)
    : localInZone(new Date(Date.parse(e.utcEnd) - 1).toISOString(), zone).slice(
        0,
        10,
      );
  return (
    eventDay(e, zone) <= key && (e.showWithoutTime ? end > key : end >= key)
  );
}
const organizer = (e: Event, email: string) =>
  !e.organizerCalendarAddress ||
  (e.isOrigin &&
    e.organizerCalendarAddress.toLowerCase() ===
      "mailto:" + email.toLowerCase());

function modalKeys(ev: React.KeyboardEvent, close: () => void) {
  if (ev.key === "Escape") {
    ev.stopPropagation();
    close();
    return;
  }
  if (ev.key !== "Tab") return;
  const items = Array.from(
    ev.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
    ),
  );
  if (!items.length) return;
  if (ev.shiftKey && document.activeElement === items[0]) {
    ev.preventDefault();
    items.at(-1)!.focus();
  } else if (!ev.shiftKey && document.activeElement === items.at(-1)) {
    ev.preventDefault();
    items[0].focus();
  }
}

export default function CalendarPage({
  session,
  notify,
}: {
  session: any;
  notify: (s: string) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [day, setDay] = useState(dayKey(new Date()));
  const [zone, setZone] = useState("Asia/Almaty");
  const [data, setData] = useState<any>({ items: [], calendars: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [layout, setLayout] = useState("month");
  const [selected, setSelected] = useState<Event | null>(null),
    [editing, setEditing] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const generation = useRef(0);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 42);
  const after = new Date(+start - 86400000).toISOString(),
    before = new Date(+end + 86400000).toISOString();
  const load = useCallback(
    async (quiet = false) => {
      const g = ++generation.current;
      if (!quiet) setLoading(true);
      try {
        const d = await api(
          "/calendar/events?" +
            new URLSearchParams({ after, before, timeZone: zone }),
        );
        if (g === generation.current) {
          setData(d);
          setError("");
        }
      } catch (e: any) {
        if (g === generation.current) setError(e.message);
      } finally {
        if (g === generation.current) setLoading(false);
      }
    },
    [after, before, zone],
  );
  useEffect(() => {
    setData({ items: [], calendars: [] });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [load]);
  async function open(e: Event) {
    setBusy(true);
    setError("");
    try {
      setSelected(await api("/calendar/events/" + encodeURIComponent(e.id)));
      setConfirmDelete(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setDay(dayKey(next));
  }
  function create() {
    setEditing({
      day,
      calendarId: (
        data.calendars.find((c: any) => c.isDefault) ?? data.calendars[0]
      )?.id,
      timeZone: zone,
    });
  }
  async function remove() {
    setBusy(true);
    try {
      await api(
        "/calendar/events/" + encodeURIComponent(selected!.event.id),
        "DELETE",
        { state: selected!.state },
      );
      setSelected(null);
      setConfirmDelete(false);
      notify("Встреча удалена. Участникам отправляется отмена.");
      await load(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function rsvp(status: string) {
    setBusy(true);
    try {
      await api(
        "/calendar/events/" + encodeURIComponent(selected!.event.id) + "/rsvp",
        "POST",
        { status, state: selected!.state },
      );
      setSelected(null);
      notify("Ответ организатору в очереди отправки");
      await load(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const writable = data.calendars.filter(
    (c: any) => c.myRights?.mayWriteAll || c.myRights?.mayWriteOwn,
  );
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = dayKey(new Date());
  const dayItems = data.items.filter((e: Event) => onDay(e, day, zone));
  const monthItems = data.items.filter(
    (e: Event) => eventDay(e, zone).slice(0, 7) === dayKey(month).slice(0, 7),
  );
  const e = selected?.event;
  const owned = e && organizer(e, session.member.email),
    recurring = e && (e.baseEventId || e.recurrenceRule);
  return (
    <section className="calendar-page" aria-label="Календарь">
      <div className="cal-toolbar">
        <div className="cal-heading">
          <CalendarDays size={27} />
          <div>
            <h1>Календарь</h1>
            <span>Встречи и планы команды</span>
          </div>
        </div>
        <div className="cal-actions">
          <button
            className="icon-button"
            aria-label="Обновить календарь"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="primary"
            disabled={!writable.length || loading}
            onClick={create}
          >
            <Plus size={18} />
            Создать встречу
          </button>
        </div>
      </div>
      <div className="cal-navigation">
        <div className="cal-month">
          <button
            className="icon-button"
            aria-label="Предыдущий месяц"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <h2>
            {month.toLocaleDateString("ru-RU", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <button
            className="icon-button"
            aria-label="Следующий месяц"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="secondary"
            onClick={() => {
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              );
              setDay(today);
            }}
          >
            Сегодня
          </button>
        </div>
        <div className="cal-actions">
          <select
            aria-label="Часовой пояс календаря"
            value={zone}
            onChange={(ev) => setZone(ev.target.value)}
          >
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
          <div className="cal-tabs">
            <button
              aria-pressed={layout === "month"}
              onClick={() => setLayout("month")}
            >
              Месяц
            </button>
            <button
              aria-pressed={layout === "agenda"}
              onClick={() => setLayout("agenda")}
            >
              Расписание
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div role="alert" className="cal-error">
          {error} <button onClick={() => void load()}>Повторить</button>
        </div>
      )}
      {data.truncated && (
        <p role="status">
          Событий слишком много: показаны первые 500 за период.
        </p>
      )}
      {loading ? (
        <div className="cal-empty" role="status">
          Загружаем календарь…
        </div>
      ) : layout === "month" ? (
        <div className="cal-workspace">
          <div className="cal-grid">
            <div className="cal-weekdays">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="cal-days">
              {days.map((d) => {
                const key = dayKey(d),
                  events = data.items.filter((e: Event) => onDay(e, key, zone));
                return (
                  <div
                    className={
                      "cal-day " +
                      (d.getMonth() !== month.getMonth() ? "outside " : "") +
                      (day === key ? "selected" : "")
                    }
                    key={key}
                  >
                    <button
                      className={
                        "cal-day-number " + (key === today ? "today" : "")
                      }
                      aria-label={dateLabel(d)}
                      aria-pressed={day === key}
                      onClick={() => setDay(key)}
                    >
                      {d.getDate()}
                    </button>
                    {events.slice(0, 3).map((e: Event) => (
                      <button
                        key={e.id}
                        className={
                          "cal-chip " +
                          (e.status === "cancelled" ? "cancelled" : "")
                        }
                        onClick={() => void open(e)}
                        title={e.title}
                      >
                        <span>{timeLabel(e, zone)}</span>{" "}
                        {e.title || "Без названия"}
                      </button>
                    ))}
                    {events.length > 3 && (
                      <button className="cal-more" onClick={() => setDay(key)}>
                        Ещё {events.length - 3}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <aside className="cal-agenda">
            <span className="cal-eyebrow">РАСПИСАНИЕ НА ДЕНЬ</span>
            <h2>{dateLabel(new Date(day + "T12:00:00"))}</h2>
            {dayItems.length ? (
              dayItems.map((e: Event) => (
                <button
                  key={e.id}
                  className="cal-agenda-item"
                  onClick={() => void open(e)}
                >
                  <span>{timeLabel(e, zone)}</span>
                  <strong>{e.title || "Без названия"}</strong>
                  <small>
                    {(Object.values(e.locations ?? {}) as any[])[0]?.name ??
                      (e.status === "cancelled" ? "Отменена" : "Встреча")}
                  </small>
                </button>
              ))
            ) : (
              <div className="cal-day-empty">
                <CalendarDays size={30} />
                <p>Пока нет встреч</p>
                <span>Выберите время для новых планов.</span>
              </div>
            )}
            <button
              className="cal-add-day"
              disabled={!writable.length}
              onClick={create}
            >
              <Plus size={16} />
              Встреча в этот день
            </button>
          </aside>
        </div>
      ) : (
        <div className="cal-list">
          {monthItems.length ? (
            monthItems.map((e: Event) => (
              <button
                className="cal-list-item"
                key={e.id}
                onClick={() => void open(e)}
              >
                <span>{eventDay(e, zone).split("-").reverse().join(".")}</span>
                <b>{timeLabel(e, zone)}</b>
                <strong>{e.title || "Без названия"}</strong>
                <small>
                  {e.status === "cancelled"
                    ? "Отменена"
                    : Object.keys(e.participants ?? {}).length + " участн."}
                </small>
              </button>
            ))
          ) : (
            <div className="cal-empty">В этом месяце пока нет встреч</div>
          )}
        </div>
      )}
      <p className="cal-footnote">
        Календарь {session.member.email} · Автообновление каждые 30 секунд
      </p>
      {e && (
        <div
          className="cal-overlay"
          onClick={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div
            className="cal-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Детали встречи"
            onKeyDown={(ev) =>
              modalKeys(ev, () => {
                if (!busy) setSelected(null);
              })
            }
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="cal-dialog-top">
              <span className="cal-eyebrow">
                {e.status === "cancelled"
                  ? "ОТМЕНЕНА"
                  : owned
                    ? "ВАША ВСТРЕЧА"
                    : "ПРИГЛАШЕНИЕ"}
              </span>
              <button
                autoFocus
                className="icon-button"
                aria-label="Закрыть встречу"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <h2>{e.title}</h2>
            <p className="cal-detail-line">
              <Clock size={18} />
              {e.showWithoutTime
                ? e.start.slice(0, 10)
                : new Date(e.utcStart).toLocaleString("ru-RU", {
                    timeZone: zone,
                  })}{" "}
              —{" "}
              {e.showWithoutTime
                ? "Весь день"
                : new Date(e.utcEnd).toLocaleTimeString("ru-RU", {
                    timeZone: zone,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
            </p>
            <p className="muted">
              {zone}
              {recurring ? " · Повторяющаяся встреча" : ""}
            </p>
            {e.locations && (
              <p className="cal-detail-line">
                <MapPin size={18} />
                {(Object.values(e.locations) as any[])
                  .map((l) => l.name)
                  .join(", ")}
              </p>
            )}
            {e.description && (
              <p className="cal-description">{e.description}</p>
            )}
            <h3 className="cal-detail-line">
              <Users size={18} />
              Участники
            </h3>
            <div className="cal-participants">
              {(Object.entries(e.participants ?? {}) as [string, any][]).map(
                ([id, p]) => (
                  <div key={id}>
                    <span>
                      {p.name || p.calendarAddress?.replace(/^mailto:/, "")}
                      <small>
                        {p.calendarAddress?.replace(/^mailto:/, "")}
                      </small>
                    </span>
                    <b>
                      {p.roles?.owner
                        ? "Организатор"
                        : (statusText[p.participationStatus] ??
                          "Ожидает ответа")}
                    </b>
                  </div>
                ),
              )}
            </div>
            {!owned && !recurring && e.status !== "cancelled" && (
              <div className="cal-rsvp">
                <span>Вы придёте?</span>
                {(["accepted", "tentative", "declined"] as const).map((s) => (
                  <button
                    className="secondary"
                    disabled={busy}
                    key={s}
                    onClick={() => void rsvp(s)}
                  >
                    {s === "accepted"
                      ? "Да"
                      : s === "tentative"
                        ? "Возможно"
                        : "Нет"}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="cal-error">
                {error}
              </p>
            )}
            <div className="cal-dialog-actions">
              <a
                className="secondary"
                href={
                  "/api/calendar/events/" + encodeURIComponent(e.id) + "/ics"
                }
              >
                <Download size={16} />
                Скачать .ics
              </a>
              {owned && !recurring && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditing({ event: e, state: selected!.state });
                      setSelected(null);
                    }}
                  >
                    <Pencil size={16} />
                    Изменить
                  </button>
                  <button
                    className="cal-danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={16} />
                    Удалить
                  </button>
                </>
              )}
            </div>
            {confirmDelete && (
              <div className="cal-confirm">
                <p>Удалить встречу? Участникам будет отправлена отмена.</p>
                <button
                  className="cal-danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Удалить и уведомить
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Назад
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {editing && (
        <EventEditor
          initial={editing}
          calendars={writable}
          email={session.member.email}
          onClose={() => setEditing(null)}
          onSaved={(date: string) => {
            setEditing(null);
            setDay(date);
            const d = new Date(date + "T12:00:00");
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            notify("Встреча сохранена");
            void load(true);
          }}
        />
      )}
    </section>
  );
}
function EventEditor({
  initial,
  calendars,
  email,
  onClose,
  onSaved,
}: {
  initial: any;
  calendars: any[];
  email: string;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  const e = initial.event;
  const [title, setTitle] = useState(e?.title ?? ""),
    [description, setDescription] = useState(e?.description ?? ""),
    [location, setLocation] = useState(
      (Object.values(e?.locations ?? {}) as any[])[0]?.name ?? "",
    );
  const [start, setStart] = useState(
      e?.start?.slice(0, 16) ?? initial.day + "T10:00",
    ),
    [zone, setZone] = useState(
      e?.timeZone ?? initial.timeZone ?? "Asia/Almaty",
    );
  const [duration, setDuration] = useState(
      e
        ? Math.max(
            5,
            Math.round((Date.parse(e.utcEnd) - Date.parse(e.utcStart)) / 60000),
          )
        : 60,
    ),
    [allDay, setAllDay] = useState(!!e?.showWithoutTime);
  const [calendarId, setCalendarId] = useState(
    e ? Object.keys(e.calendarIds)[0] : initial.calendarId,
  );
  const [guests, setGuests] = useState(
    (Object.values(e?.participants ?? {}) as any[])
      .map((p) => p.calendarAddress?.replace(/^mailto:/i, ""))
      .filter((a) => a && a.toLowerCase() !== email.toLowerCase())
      .join(", "),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const event = {
        calendarId,
        title,
        description,
        location,
        start: allDay ? start.slice(0, 10) + "T00:00:00" : start + ":00",
        timeZone: zone,
        durationMinutes: duration,
        allDay,
        attendees: [...new Set(guests.split(/[\s,;]+/).filter(Boolean))],
      };
      await api(
        "/calendar/events" + (e ? "/" + encodeURIComponent(e.id) : ""),
        e ? "PUT" : "POST",
        e ? { event, state: initial.state } : event,
        e ? {} : { "Idempotency-Key": requestId.current },
      );
      onSaved(start.slice(0, 10));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cal-overlay">
      <form
        className="cal-dialog cal-editor"
        role="dialog"
        aria-modal="true"
        aria-label={e ? "Изменить встречу" : "Новая встреча"}
        onKeyDown={(ev) =>
          modalKeys(ev, () => {
            if (!busy) onClose();
          })
        }
        onSubmit={save}
      >
        <div className="cal-dialog-top">
          <h2>{e ? "Изменить встречу" : "Новая встреча"}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Закрыть редактор"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Название встречи
          <input
            autoFocus
            required
            maxLength={300}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder="Например, планирование недели"
          />
        </label>
        <label>
          Календарь
          <select
            value={calendarId}
            onChange={(ev) => setCalendarId(ev.target.value)}
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.isDefault ? "Мой календарь" : c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="cal-checkbox">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(ev) => {
              setAllDay(ev.target.checked);
              setDuration(ev.target.checked ? 1440 : 60);
            }}
          />
          Весь день
        </label>
        <div className="cal-form-row">
          <label>
            {allDay ? "Дата" : "Начало"}
            <input
              required
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? start.slice(0, 10) : start}
              onInput={(ev) =>
                setStart(
                  allDay
                    ? ev.currentTarget.value + "T00:00"
                    : ev.currentTarget.value,
                )
              }
            />
          </label>
          {
            <label>
              {allDay ? "Длительность, дней" : "Длительность, минут"}
              <input
                required
                type="number"
                min={allDay ? 1 : 5}
                max={allDay ? 7 : 10080}
                step={allDay ? 1 : 5}
                value={allDay ? duration / 1440 : duration}
                onInput={(ev) =>
                  setDuration(
                    Number(ev.currentTarget.value) * (allDay ? 1440 : 1),
                  )
                }
              />
            </label>
          }
        </div>
        {!allDay && (
          <label>
            Часовой пояс
            <select value={zone} onChange={(ev) => setZone(ev.target.value)}>
              {Array.from(new Set([...zones, zone])).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Участники
          <input
            value={guests}
            onChange={(ev) => setGuests(ev.target.value)}
            placeholder="colleague@company.kz, name@gmail.com"
          />
          <small>
            До 19 адресов через запятую. При сохранении отправим приглашения.
          </small>
        </label>
        <label>
          Место или ссылка на видеозвонок
          <input
            maxLength={500}
            value={location}
            onChange={(ev) => setLocation(ev.target.value)}
            placeholder="Переговорная или https://…"
          />
        </label>
        <label>
          Описание
          <textarea
            rows={3}
            maxLength={10000}
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            placeholder="Повестка и материалы встречи"
          />
        </label>
        {error && (
          <div className="cal-error" role="alert">
            {error}
          </div>
        )}
        <div className="cal-dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            <Check size={17} />
            {busy
              ? "Сохраняем…"
              : guests.trim()
                ? "Сохранить и пригласить"
                : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
