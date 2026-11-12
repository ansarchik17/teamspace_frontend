import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Mail,
  CalendarDays,
  Menu,
  Pencil,
  Minus,
  Maximize2,
  Minimize2,
  Inbox,
  Send,
  FileText,
  Archive,
  Trash2,
  Star,
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  Building2,
  Users,
  ShieldCheck,
  Globe,
  Settings,
  LogOut,
  Bell,
  Paperclip,
  X,
  Check,
  RefreshCw,
  MoreHorizontal,
  Reply,
  Forward,
  Sparkles,
  LockKeyhole,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Contact,
  SlidersHorizontal,
  Download,
  BookOpen,
  PanelLeft,
  MessageSquare,
  HardDrive,
  ShieldAlert,
} from "lucide-react";
import { api, setCsrf, bytes, date, roleName, RequestError } from "./api";
import "./styles.css";
import CalendarPage from "./CalendarPage";
import "./styles/teamspace-theme.css";

type Session = any;
type Message = any;
const folders = [
  ["inbox", "Входящие", Inbox],
  ["starred", "Избранное", Star],
  ["sent", "Отправленные", Send],
  ["drafts", "Черновики", FileText],
  ["archive", "Архив", Archive],
  ["spam", "Спам", ShieldAlert],
  ["trash", "Корзина", Trash2],
] as const;
function Spinner() {
  return <LoaderCircle className="spin" size={20} />;
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      <AlertCircle size={17} />
      {message}
    </div>
  ) : null;
}
function Empty({
  title,
  text,
  icon: Icon = Inbox,
}: {
  title: string;
  text: string;
  icon?: any;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const colors = ["#e6edff", "#e6f4ef", "#fff0dc", "#eee7fa", "#fbe8ef"];
  return (
    <span
      className={"avatar " + (small ? "small" : "")}
      style={{ background: colors[(name.charCodeAt(0) || 0) % colors.length] }}
    >
      {name
        .split(/[ @]/)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className={wide ? "compose-dock" : "modal-backdrop"}
      onMouseDown={(e) => {
        if (!wide && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={
          "modal " +
          (wide ? "wide " : "") +
          (expanded ? "expanded " : "") +
          (minimized ? "minimized" : "")
        }
        role="dialog"
        aria-modal={!wide}
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <div className="window-actions">
            {wide && (
              <>
                <button
                  className="icon-button"
                  aria-label={
                    minimized ? "Развернуть письмо" : "Свернуть письмо"
                  }
                  onClick={() => setMinimized(!minimized)}
                >
                  {minimized ? <Maximize2 size={15} /> : <Minus size={17} />}
                </button>
                <button
                  className="icon-button"
                  aria-label={expanded ? "Обычный размер" : "На весь экран"}
                  onClick={() => {
                    setExpanded(!expanded);
                    setMinimized(false);
                  }}
                >
                  {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="dialog-content" hidden={minimized}>
          {children}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", "POST", { login, password });
      onLogin();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-symbol">
            <Mail size={32} />
          </span>
          Mail
        </div>
        <div className="login-copy">
          <h1>Вход</h1>
          <p>Используйте свой аккаунт Mail</p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-form">
          <form onSubmit={submit}>
            <Field label="Логин / ИИН">
              <input
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Введите 12 цифр"
                required
                maxLength={128}
              />
            </Field>
            <Field label="Пароль">
              <div className="password-input">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <ErrorBox message={error} />
            <button className="primary full" disabled={busy}>
              {busy ? <Spinner /> : <>Войти</>}
            </button>
          </form>
          <div className="auth-note">
            <LockKeyhole size={17} />
            <span>Корпоративный аккаунт вашей компании</span>
          </div>
          <p className="help-note">
            Первый вход? Используйте временный пароль,
            <br />
            выданный администратором компании.
          </p>
        </div>
        <div className="login-bottom">Mail · Корпоративная почта</div>
      </div>
    </main>
  );
}
function Onboarding({
  session,
  reload,
}: {
  session: Session;
  reload: () => void;
}) {
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [agree, setAgree] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change = session.passwordRequired;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (change) {
        if (password !== repeat) throw new Error("Пароли не совпадают");
        await api("/auth/password", "POST", {
          currentPassword: current,
          password,
        });
      } else
        await api("/consent", "POST", {
          version: session.tenant.consent_version,
          accepted: true,
        });
      reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand">
          <span className="brand-symbol">
            <Mail />
          </span>
          Mail
        </div>
        <div className="steps">
          <span className={change ? "active" : "done"}>1. Защита аккаунта</span>
          <span className={!change ? "active" : ""}>2. Условия работы</span>
        </div>
        <div className="onboarding-icon">
          {change ? <LockKeyhole /> : <ShieldCheck />}
        </div>
        <h1>
          {change ? "Установите новый пароль" : "Добро пожаловать в команду"}
        </h1>
        <p>
          {change
            ? "Для продолжения необходимо заменить временный или истёкший пароль."
            : session.tenant.name +
              " · ознакомьтесь с условиями обработки данных"}
        </p>
        <form onSubmit={submit}>
          {change ? (
            <>
              <Field label="Текущий / временный пароль">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </Field>
              <Field label="Новый пароль">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Field label="Повторите новый пароль">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                />
              </Field>
              <p className="caption">
                От 8 символов, минимум одна буква и цифра. Последние пять
                паролей нельзя использовать повторно.
              </p>
            </>
          ) : (
            <>
              <div className="consent-text">{session.tenant.consent_text}</div>
              <span className="caption">
                Версия {session.tenant.consent_version}
              </span>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                Я ознакомился и принимаю указанные условия
              </label>
            </>
          )}
          <ErrorBox message={error} />
          <button
            className="primary full"
            disabled={busy || (!change && !agree)}
          >
            {busy ? (
              <Spinner />
            ) : change ? (
              "Сохранить пароль"
            ) : (
              "Продолжить в почту"
            )}
          </button>
        </form>
        <button
          className="text-button"
          onClick={async () => {
            await api("/auth/logout", "POST");
            reload();
          }}
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}

function Compose({
  initial,
  onClose,
  onSent,
  signature,
}: {
  initial?: any;
  onClose: () => void;
  onSent: (message?: string) => void;
  signature: string;
}) {
  const [to, setTo] = useState(initial?.to ?? ""),
    [cc, setCc] = useState(initial?.cc ?? ""),
    [bcc, setBcc] = useState(initial?.bcc ?? ""),
    [extra, setExtra] = useState(false),
    [subject, setSubject] = useState(initial?.subject ?? ""),
    [body, setBody] = useState(
      initial?.body ?? (signature ? "\n\n" + signature : ""),
    ),
    [files, setFiles] = useState<any[]>(initial?.attachments ?? []),
    [draft, setDraft] = useState<string | undefined>(initial?.draftId),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [meeting, setMeeting] = useState<any>(initial?.meeting ?? null);
  const meetingKey = useRef(crypto.randomUUID());
  function toggleMeeting() {
    if (meeting) {
      setMeeting(null);
      dirty.current = true;
      return;
    }
    if (files.length || bcc.trim()) {
      setError(
        "Для встречи сначала уберите вложения и скрытых получателей. Участники видят адреса друг друга.",
      );
      return;
    }
    const next = new Date(Date.now() + 3600000);
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(next)
      .replace(" ", "T");
    setMeeting({
      start: parts + ":00",
      timeZone: "Asia/Almaty",
      durationMinutes: 60,
      location: "",
    });
    dirty.current = true;
    setError("");
  }
  function changeMeeting(field: string, value: any) {
    setMeeting((m: any) => ({ ...m, [field]: value }));
    dirty.current = true;
  }
  const dirty = useRef(false);
  const key = useRef(crypto.randomUUID()),
    fileInput = useRef<HTMLInputElement>(null),
    saving = useRef(false),
    draftRef = useRef(draft),
    busyRef = useRef(false),
    latest = useRef<any>(null),
    savePromise = useRef<Promise<void> | null>(null);
  const addresses = (v: string) =>
    v
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  latest.current = {
    to: addresses(to),
    cc: addresses(cc),
    bcc: addresses(bcc),
    subject,
    body,
    attachmentIds: files.map((f) => f.id),
    meeting,
  };
  async function save() {
    if (saving.current || busyRef.current || !dirty.current) return;
    const valid = [
      ...latest.current.to,
      ...latest.current.cc,
      ...latest.current.bcc,
    ].every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (!valid) return;
    saving.current = true;
    const snapshot = JSON.stringify(latest.current);
    try {
      setStatus("Сохранение…");
      const result = await api("/mail/drafts", "POST", {
        ...latest.current,
        draftId: draftRef.current,
      });
      draftRef.current = result.id;
      setDraft(result.id);
      if (snapshot === JSON.stringify(latest.current)) dirty.current = false;
      setStatus("Черновик сохранён");
    } catch (e: any) {
      setStatus("Черновик не сохранён");
      setError(e.message);
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (!saving.current && !busyRef.current) savePromise.current = save();
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const a = await api("/mail/attachments", "POST", fd);
      setFiles((x) => [...x, a]);
      // Mutable autosave ref; the compiler incorrectly freezes refs captured by save().
      // eslint-disable-next-line react-hooks/immutability
      dirty.current = true;
    } catch (e: any) {
      setError(e.message);
    }
    e.target.value = "";
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    busyRef.current = true;
    setError("");
    try {
      await savePromise.current;
      const result = await api(
        meeting ? "/mail/meeting" : "/mail/send",
        "POST",
        { ...latest.current, draftId: draftRef.current },
        { "Idempotency-Key": meeting ? meetingKey.current : key.current },
      );
      // Mutable autosave ref, also used by the interval callback.
      // eslint-disable-next-line react-hooks/immutability
      dirty.current = false;
      onSent(
        meeting
          ? result.draftCleanupPending
            ? "Встреча создана. Приглашение в очереди отправки; оставшийся черновик можно удалить."
            : "Встреча создана, приглашение в очереди отправки"
          : undefined,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const changed = (fn: any) => (e: any) => {
    fn(e.target.value);
    dirty.current = true;
    key.current = crypto.randomUUID();
  };
  return (
    <Modal
      title="Новое письмо"
      onClose={() => {
        if (busy) return;
        if (
          dirty.current &&
          !confirm("Есть несохранённые изменения. Закрыть письмо?")
        )
          return;
        onClose();
      }}
      wide
    >
      <form onSubmit={submit} className="compose">
        <div className="compose-line">
          <label htmlFor="to">Кому</label>
          <input
            id="to"
            value={to}
            onChange={changed(setTo)}
            placeholder="colleague@company.kz"
            required
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setExtra(!extra)}
          >
            Копия / скрытая
          </button>
        </div>
        {extra && (
          <>
            <div className="compose-line">
              <label htmlFor="cc">Копия</label>
              <input id="cc" value={cc} onChange={changed(setCc)} />
            </div>
            <div className="compose-line">
              <label htmlFor="bcc">Скрытая</label>
              <input
                id="bcc"
                value={bcc}
                onChange={changed(setBcc)}
                disabled={!!meeting}
              />
            </div>
          </>
        )}
        <div className="compose-line">
          <label htmlFor="subject">Тема</label>
          <input
            id="subject"
            value={subject}
            onChange={changed(setSubject)}
            placeholder={meeting ? "Название встречи" : "О чём ваше письмо?"}
            required={!!meeting}
            maxLength={meeting ? 300 : 998}
          />
        </div>
        {meeting && (
          <fieldset className="compose-meeting" disabled={busy}>
            <legend>
              <CalendarDays size={17} />
              Приглашение на встречу
            </legend>
            <div className="compose-meeting-fields">
              <label>
                Дата и время
                <input
                  aria-label="Дата и время встречи"
                  type="datetime-local"
                  required
                  value={meeting.start.slice(0, 16)}
                  onInput={(e) =>
                    changeMeeting("start", e.currentTarget.value + ":00")
                  }
                />
              </label>
              <label>
                Длительность, мин
                <input
                  type="number"
                  min={5}
                  max={10080}
                  step={5}
                  required
                  value={meeting.durationMinutes}
                  onInput={(e) =>
                    changeMeeting(
                      "durationMinutes",
                      Number(e.currentTarget.value),
                    )
                  }
                />
              </label>
              <label>
                Часовой пояс
                <select
                  value={meeting.timeZone}
                  onChange={(e) => changeMeeting("timeZone", e.target.value)}
                >
                  {Array.from(
                    new Set([
                      "Asia/Almaty",
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                      "Europe/Moscow",
                      "Europe/London",
                      "America/New_York",
                      "Etc/UTC",
                      meeting.timeZone,
                    ]),
                  ).map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <label>
                Место или видеозвонок
                <input
                  maxLength={500}
                  value={meeting.location}
                  onChange={(e) => changeMeeting("location", e.target.value)}
                  placeholder="Переговорная или ссылка"
                />
              </label>
            </div>
            <p>
              «Кому» и «Копия» — участники, тема — название, текст — описание
              встречи. При отправке создадим событие в календаре и отправим
              приглашение.
            </p>
          </fieldset>
        )}
        <textarea
          aria-label="Текст письма"
          value={body}
          onChange={changed(setBody)}
          placeholder="Напишите сообщение…"
          rows={13}
        />
        <div className="file-chips">
          {files.map((f) => (
            <span key={f.id}>
              <Paperclip size={14} />
              {f.name} <small>{bytes(f.size)}</small>
              <button
                type="button"
                aria-label={"Удалить " + f.name}
                onClick={() => {
                  setFiles(files.filter((x) => x.id !== f.id));
                  dirty.current = true;
                  key.current = crypto.randomUUID();
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <ErrorBox message={error} />
        <footer>
          <button className="primary" disabled={busy}>
            {busy ? <Spinner /> : <Send size={17} />}
            {meeting ? "Отправить приглашение" : "Отправить"}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
            disabled={!!meeting || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={20} />
          </button>
          <button
            type="button"
            className={
              "icon-button compose-meeting-toggle " + (meeting ? "active" : "")
            }
            title={meeting ? "Убрать встречу" : "Назначить встречу"}
            aria-label={meeting ? "Убрать встречу" : "Назначить встречу"}
            aria-pressed={!!meeting}
            disabled={busy}
            onClick={toggleMeeting}
          >
            <CalendarDays size={20} />
            <span>Встреча</span>
          </button>
          <input ref={fileInput} type="file" hidden onChange={upload} />
          <span className="caption">{status}</span>
          <button
            type="button"
            className="text-button push-right"
            onClick={async () => {
              // Mutable autosave ref; changing it does not mutate React state.
              // eslint-disable-next-line react-hooks/immutability
              dirty.current = true;
              if (!saving.current) savePromise.current = save();
              await savePromise.current;
            }}
          >
            Сохранить
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function MailView({
  folder,
  search,
  onCounts,
  notify,
  session,
}: {
  folder: string;
  search: string;
  onCounts: (v: any[]) => void;
  notify: (s: string) => void;
  session: Session;
}) {
  const [data, setData] = useState<any>({ items: [], total: 0 }),
    [selected, setSelected] = useState<Message | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [compose, setCompose] = useState<any>(null),
    [ai, setAi] = useState<any>(null),
    [refresh, setRefresh] = useState(0),
    [checked, setChecked] = useState<string[]>([]);
  const requestVersion = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [syncError, setSyncError] = useState("");
  const load = useCallback(
    async (silent = false) => {
      const version = ++requestVersion.current;
      if (!silent) setLoading(true);
      try {
        const d = await api(
          `/mail/messages?folder=${folder}&search=${encodeURIComponent(search)}&page=${page}`,
        );
        if (version !== requestVersion.current) return false;
        setData(d);
        onCounts(d.counts);
        setError("");
        return true;
      } catch (e: any) {
        if (version === requestVersion.current) setError(e.message);
        return false;
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [folder, search, page, refresh],
  );
  useEffect(() => {
    setSelected(null);
    setChecked([]);
    setPage(1);
  }, [folder, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => {
      clearTimeout(timer);
      requestVersion.current++;
    };
  }, [load]);
  useEffect(() => {
    let stopped = false,
      busy = false;
    let timer: ReturnType<typeof setTimeout>;
    let cursor: { emailState?: string; mailboxState?: string } = {};
    const poll = async () => {
      if (stopped || busy) return;
      clearTimeout(timer);
      if (document.hidden) return;
      busy = true;
      try {
        const query = new URLSearchParams();
        if (cursor.emailState) query.set("emailState", cursor.emailState);
        if (cursor.mailboxState) query.set("mailboxState", cursor.mailboxState);
        const next = await api("/mail/changes?" + query);
        if (stopped) return;
        if (next.changed) {
          if (!(await load(true)) || stopped) return;
          const id = selectedRef.current?.id;
          if (id) {
            try {
              const updated = await api(
                "/mail/messages/" + encodeURIComponent(id),
              );
              if (!stopped)
                setSelected((current: Message | null) =>
                  current?.id === id ? updated : current,
                );
            } catch (e: any) {
              if (e.code === "NOT_FOUND") {
                if (!stopped)
                  setSelected((current: Message | null) =>
                    current?.id === id ? null : current,
                  );
              } else throw e;
            }
          }
        }
        if (!stopped) {
          // Only acknowledge the cursor after successfully refreshing the view.
          cursor = next;
          setSyncError("");
        }
      } catch {
        if (!stopped)
          setSyncError("Не удалось обновить почту. Повторим автоматически.");
      } finally {
        busy = false;
        if (!stopped) timer = setTimeout(() => void poll(), 15000);
      }
    };
    const wake = () => {
      if (!document.hidden) void poll();
    };
    timer = setTimeout(() => void poll(), 1000);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [load, session.member.id, session.member.mail_connected]);
  useEffect(() => {
    const h = () => setCompose({});
    window.addEventListener("compose", h);
    return () => window.removeEventListener("compose", h);
  }, []);
  async function open(m: Message) {
    try {
      const full = await api("/mail/messages/" + m.id);
      if (folder === "drafts") {
        setCompose({
          draftId: full.id,
          to: full.recipients.join(", "),
          cc: (full.cc ?? []).join(", "),
          bcc: (full.bcc ?? []).join(", "),
          subject: full.subject,
          body: full.body,
          attachments: full.attachments,
          meeting: full.meeting,
        });
        return;
      }
      setSelected(full);
      setAi(null);
      if (!m.read) {
        await api("/mail/messages/" + m.id, "PATCH", { read: true });
        setData((d: any) => ({
          ...d,
          items: d.items.map((x: any) =>
            x.id === m.id ? { ...x, read: true } : x,
          ),
        }));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function action(id: string, patch: any) {
    try {
      await api("/mail/messages/" + id, "PATCH", patch);
      if (selected?.id === id) setSelected({ ...selected, ...patch });
      if (patch.folder) setSelected(null);
      setRefresh((x) => x + 1);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function aiRun(kind: string) {
    if (!selected) return;
    setAi({ status: "pending" });
    try {
      const j = await api("/ai/jobs", "POST", { messageId: selected.id, kind });
      setAi({ ...j, kind });
    } catch (e: any) {
      setAi({ status: "failed", error: e.message });
    }
  }
  useEffect(() => {
    if (!ai?.id || !["pending", "running"].includes(ai.status)) return;
    const timer = setInterval(async () => {
      try {
        const j = await api("/ai/jobs/" + ai.id);
        setAi(j);
      } catch (e: any) {
        setAi({ status: "failed", error: e.message });
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [ai?.id, ai?.status]);
  const name = folders.find((x) => x[0] === folder)?.[1] ?? "Почта";
  return (
    <div className={"mail-workspace " + (selected ? "reading" : "")}>
      <section className={"mail-list " + (selected ? "has-selection" : "")}>
        <header className="mail-page-heading">
          <div><h1>{search ? "Результаты поиска" : name}</h1><p>Письма и общение с командой</p></div>
          <button className="primary" type="button" onClick={() => setCompose({})}><Pencil size={18} /> Написать</button>
        </header>
        <div className="list-toolbar">
          <label className="select-all">
            <input
              type="checkbox"
              aria-label="Выбрать все письма"
              checked={
                data.items.length > 0 && checked.length === data.items.length
              }
              onChange={(e) =>
                setChecked(
                  e.target.checked ? data.items.map((m: any) => m.id) : [],
                )
              }
            />
          </label>
          <button
            className="icon-button"
            aria-label="Обновить письма"
            title="Обновить"
            onClick={() => setRefresh((x) => x + 1)}
          >
            <RefreshCw size={18} />
          </button>
          {checked.length > 0 ? (
            <>
              <span>{checked.length} выбрано</span>
              <button
                className="icon-button"
                aria-label="Архивировать выбранные"
                onClick={async () => {
                  for (const id of checked)
                    await action(id, { folder: "archive" });
                  setChecked([]);
                }}
              >
                <Archive size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Удалить выбранные в корзину"
                onClick={async () => {
                  for (const id of checked)
                    await action(id, { folder: "trash" });
                  setChecked([]);
                }}
              >
                <Trash2 size={17} />
              </button>
            </>
          ) : (
            <span className="folder-label">
              {search ? "Результаты поиска" : name}
            </span>
          )}
          <span className="push-right caption">
            {data.total
              ? `${(page - 1) * 40 + 1}–${Math.min(page * 40, data.total)} из ${data.total}`
              : "0 писем"}
          </span>
          <button
            className="icon-button"
            aria-label="Предыдущая страница"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Следующая страница"
            disabled={page * 40 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <ErrorBox message={error} />
        {syncError && (
          <p className="caption" role="status">
            {syncError}
          </p>
        )}
        <div className="messages-scroll">
          {loading ? (
            <div className="loading">
              <Spinner />
              Загружаем письма
            </div>
          ) : !data.items.length ? (
            <Empty
              title={search ? "Ничего не найдено" : "Здесь пока нет писем"}
              text={
                search
                  ? "Попробуйте другой запрос."
                  : "Новые сообщения появятся здесь."
              }
            />
          ) : (
            data.items.map((m: Message) => (
              <article
                className={
                  "message-row " +
                  (!m.read ? "unread " : "") +
                  (checked.includes(m.id) ? "checked" : "")
                }
                key={m.id}
              >
                <input
                  type="checkbox"
                  aria-label={"Выбрать " + m.subject}
                  checked={checked.includes(m.id)}
                  onChange={(e) =>
                    setChecked(
                      e.target.checked
                        ? [...checked, m.id]
                        : checked.filter((x) => x !== m.id),
                    )
                  }
                />
                <button
                  className={"star-button " + (m.starred ? "on" : "")}
                  aria-label={
                    m.starred ? "Убрать из избранного" : "В избранное"
                  }
                  onClick={() => action(m.id, { starred: !m.starred })}
                >
                  <Star size={17} fill={m.starred ? "currentColor" : "none"} />
                </button>
                <button className="message-content" onClick={() => open(m)}>
                  <span className="message-sender">
                    {folder === "sent" || folder === "drafts"
                      ? "Кому: " + m.recipients.join(", ")
                      : m.sender.split("@")[0]}
                  </span>
                  <span className="message-excerpt">
                    <span className="message-subject">
                      {m.subject || "(Без темы)"}
                    </span>
                    <span className="message-preview">
                      {" "}
                      — {m.preview || "Нет текста"}
                    </span>
                  </span>
                  {m.attachments?.length > 0 && (
                    <Paperclip size={16} className="message-attachment" />
                  )}
                  <time className="message-date">{date(m.created_at)}</time>
                </button>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={"Архивировать: " + m.subject}
                    title="Архивировать"
                    onClick={() => action(m.id, { folder: "archive" })}
                  >
                    <Archive size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"В корзину: " + m.subject}
                    title="В корзину"
                    onClick={() => action(m.id, { folder: "trash" })}
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={
                      (m.read ? "Не прочитано: " : "Прочитано: ") + m.subject
                    }
                    title={
                      m.read ? "Отметить непрочитанным" : "Отметить прочитанным"
                    }
                    onClick={() => action(m.id, { read: !m.read })}
                  >
                    <Mail size={18} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <footer className="list-footer">
          <span>Mail</span>
          <span>Рабочая почта · {session.tenant.name}</span>
        </footer>
      </section>
      {selected ? (
        <section className="reader">
          <div className="reader-toolbar">
            <button
              className="icon-button"
              aria-label="Закрыть письмо"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft size={19} />
            </button>
            <div className="divider" />
            <button
              className="icon-button"
              title="В архив"
              aria-label="В архив"
              onClick={() => action(selected.id, { folder: "archive" })}
            >
              <Archive size={19} />
            </button>
            <button
              className="icon-button"
              title="В корзину"
              aria-label="В корзину"
              onClick={() => action(selected.id, { folder: "trash" })}
            >
              <Trash2 size={19} />
            </button>
            <button
              className="icon-button"
              title="Отметить непрочитанным"
              aria-label="Отметить непрочитанным"
              onClick={() => action(selected.id, { read: false })}
            >
              <Mail size={19} />
            </button>
            {selected.folder === "trash" && (
              <>
                <button
                  className="text-button"
                  onClick={() => action(selected.id, { folder: "inbox" })}
                >
                  Восстановить
                </button>
                <button
                  className="text-button danger"
                  onClick={async () => {
                    if (confirm("Удалить письмо безвозвратно?")) {
                      await api("/mail/messages/" + selected.id, "DELETE");
                      setSelected(null);
                      setRefresh((x) => x + 1);
                    }
                  }}
                >
                  Удалить навсегда
                </button>
              </>
            )}
            <span className="push-right pill">
              {selected.delivery_status === "queued"
                ? "В очереди"
                : selected.delivery_status === "failed"
                  ? "Ошибка отправки"
                  : selected.delivery_status === "accepted"
                    ? "Принято SMTP"
                    : "Письмо"}
            </span>
          </div>
          <div className="reader-scroll">
            <ErrorBox message={error} />
            <h2>{selected.subject || "(Без темы)"}</h2>
            <div className="sender-line">
              <Avatar name={selected.sender} />
              <div>
                <strong>{selected.sender}</strong>
                <p>
                  Кому: {selected.recipients.join(", ")}
                  {selected.cc?.length
                    ? " · Копия: " + selected.cc.join(", ")
                    : ""}
                </p>
              </div>
              <time>
                {new Date(selected.created_at).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <div className="mail-body">{selected.body}</div>
            {selected.attachments?.length > 0 && (
              <div className="attachment-grid">
                {selected.attachments.map((a: any) => (
                  <a
                    href={"/api/mail/attachments/" + a.id}
                    key={a.id}
                    className="attachment"
                  >
                    <FileText size={24} />
                    <span>
                      <strong>{a.name}</strong>
                      <small>{bytes(a.size)}</small>
                    </span>
                    <Download size={17} />
                  </a>
                ))}
              </div>
            )}
            <div className="reply-actions">
              <button
                className="secondary"
                onClick={() =>
                  setCompose({
                    to: selected.sender,
                    subject: "Re: " + selected.subject,
                    body:
                      "\n\n" +
                      (session.member.signature ?? "") +
                      "\n\n—— Исходное письмо ——\n" +
                      selected.body,
                  })
                }
              >
                <Reply size={17} />
                Ответить
              </button>
              <button
                className="secondary"
                onClick={() =>
                  setCompose({
                    subject: "Fwd: " + selected.subject,
                    body:
                      "\n\n—— Пересланное письмо ——\nОт: " +
                      selected.sender +
                      "\n" +
                      selected.body,
                    attachments: selected.attachments,
                  })
                }
              >
                <Forward size={17} />
                Переслать
              </button>
            </div>
            <div className="ai-card">
              <div>
                <span className="ai-icon">
                  <Sparkles size={19} />
                </span>
                <div>
                  <strong>Помощник UniteSpace</strong>
                  <p>
                    {!session.tenant.ai_enabled
                      ? "AI отключён для вашей компании"
                      : !session.aiAvailable
                        ? "Подключите AI-провайдер на сервере"
                        : "Сэкономьте время на работе с письмом"}
                  </p>
                </div>
              </div>
              <div className="ai-actions">
                <button
                  disabled={
                    !session.aiAvailable ||
                    !session.tenant.ai_enabled ||
                    ai?.status === "pending" ||
                    ai?.status === "running"
                  }
                  onClick={() => aiRun("summary")}
                >
                  Краткое содержание
                </button>
                <button
                  disabled={
                    !session.aiAvailable ||
                    !session.tenant.ai_enabled ||
                    ai?.status === "pending" ||
                    ai?.status === "running"
                  }
                  onClick={() => aiRun("reply")}
                >
                  Черновик ответа
                </button>
              </div>
              {ai && (
                <div className="ai-result">
                  {["pending", "running"].includes(ai.status) ? (
                    <>
                      <Spinner /> Готовим ответ…
                    </>
                  ) : ai.status === "failed" ? (
                    <ErrorBox message={ai.error} />
                  ) : (
                    <>
                      <span className="caption">
                        Сгенерировано AI · проверьте перед использованием
                      </span>
                      <p>{ai.result}</p>
                      {ai.kind === "reply" && (
                        <button
                          className="secondary"
                          onClick={() =>
                            setCompose({
                              to: selected.sender,
                              subject: "Re: " + selected.subject,
                              body: ai.result,
                            })
                          }
                        >
                          Открыть в редакторе
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
      {compose && (
        <Compose
          initial={compose}
          signature={session.member.signature}
          onClose={() => {
            setCompose(null);
            setRefresh((x) => x + 1);
          }}
          onSent={(message) => {
            setCompose(null);
            setRefresh((x) => x + 1);
            notify(message ?? "Письмо принято к отправке");
          }}
        />
      )}
    </div>
  );
}

const mailboxLabels: Record<string, string> = {
  ready: "Почта готова",
  pending: "Почта создаётся",
  error: "Ошибка подключения почты",
  unconnected: "Почта не подключена",
  local: "Локальный ящик",
};
function MemberForm({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (status: string) => void;
}) {
  const [b, setB] = useState({
      name: "",
      login: "",
      email: "",
      password: "",
      role: "user",
      quota_mb: 5120,
      department: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Добавить сотрудника" onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await api("/members", "POST", b);
            onDone(result.mailbox.status);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="ФИО">
          <input
            required
            value={b.name}
            onChange={(e) => setB({ ...b, name: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Логин / ИИН">
            <input
              required
              pattern="[0-9]{12}"
              maxLength={12}
              value={b.login}
              onChange={(e) => setB({ ...b, login: e.target.value })}
            />
          </Field>
          <Field label="Почтовый адрес">
            <input
              type="email"
              required
              value={b.email}
              onChange={(e) => setB({ ...b, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Временный пароль">
          <input
            type="password"
            required
            minLength={8}
            value={b.password}
            onChange={(e) => setB({ ...b, password: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Роль">
            <select
              value={b.role}
              onChange={(e) => setB({ ...b, role: e.target.value })}
            >
              <option value="user">Сотрудник</option>
              <option value="hr">Кадровик</option>
              <option value="tenant_admin">Администратор компании</option>
            </select>
          </Field>
          <Field label="Квота, МБ">
            <input
              type="number"
              min={1}
              required
              value={b.quota_mb}
              onChange={(e) => setB({ ...b, quota_mb: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Подразделение">
          <input
            value={b.department}
            onChange={(e) => setB({ ...b, department: e.target.value })}
          />
        </Field>
        <p className="caption">
          Домен должен быть подтверждён. Существующий человек получит новое
          членство; его общий пароль не изменится.
        </p>
        <ErrorBox message={error} />
        <button className="primary full" disabled={busy}>
          {busy ? <Spinner /> : "Создать сотрудника"}
        </button>
      </form>
    </Modal>
  );
}
function Members({
  session,
  notify,
}: {
  session: Session;
  notify: (s: string) => void;
}) {
  const [list, setList] = useState<any[]>([]),
    [error, setError] = useState(""),
    [add, setAdd] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [addressCheck, setAddressCheck] = useState<any>(null),
    [addressBusy, setAddressBusy] = useState(false),
    [q, setQ] = useState(""),
    [retrying, setRetrying] = useState<string | null>(null);
  const load = () =>
    api("/members")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const filtered = list.filter((x) =>
    (x.name + x.email + x.department).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">КОМАНДА</span>
          <h1>
            Сотрудники <span className="total-badge">{list.length}</span>
          </h1>
          <p>Люди, роли и почтовые ящики вашей компании</p>
        </div>
        <button className="primary" onClick={() => setAdd(true)}>
          <Plus size={18} />
          Добавить сотрудника
        </button>
      </div>
      <div className="stat-grid">
        <Stat label="Всего сотрудников" value={list.length} icon={Users} />
        <Stat
          label="Активные аккаунты"
          value={list.filter((x) => x.status === "active").length}
          icon={ShieldCheck}
        />
        <Stat
          label="Выделено пространства"
          value={bytes(list.reduce((n, x) => n + x.quota_mb, 0) * 1048576)}
          icon={HardDrive}
        />
      </div>
      <div className="table-card">
        <div className="table-toolbar">
          <Search size={18} />
          <input
            placeholder="Поиск по имени, почте, отделу"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ErrorBox message={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Роль</th>
                <th>Подразделение</th>
                <th>Хранилище</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={m.name} />
                      <span>
                        <strong>{m.name}</strong>
                        <small>{m.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{roleName(m.role)}</td>
                  <td>{m.department || "—"}</td>
                  <td>
                    <small>
                      {bytes(Number(m.used_bytes))} /{" "}
                      {bytes(m.quota_mb * 1048576)}
                    </small>
                    {m.quota_pending && <small className="block muted">Квота ожидает применения</small>}
                  </td>
                  <td>
                    <span
                      className={
                        "pill " + (m.status === "active" ? "green" : "gray")
                      }
                    >
                      {m.status === "active" ? "Активен" : "Заблокирован"}
                    </span>
                    <small
                      className={
                        "block " +
                        (m.mailbox?.status === "error" ? "danger" : "muted")
                      }
                    >
                      {mailboxLabels[m.mailbox?.status]}
                    </small>
                    {m.mail_managed &&
                      ["error", "pending"].includes(m.mailbox?.status) && (
                        <button
                          className="secondary"
                          disabled={retrying === m.id}
                          onClick={async () => {
                            setRetrying(m.id);
                            try {
                              const result = await api(
                                `/members/${m.id}/provision`,
                                "POST",
                                {},
                              );
                              notify(mailboxLabels[result.mailbox.status]);
                              await load();
                            } catch (e: any) {
                              setError(e.message);
                            } finally {
                              setRetrying(null);
                            }
                          }}
                        >
                          {retrying === m.id
                            ? "Подключаем…"
                            : "Повторить подключение"}
                        </button>
                      )}
                    {m.must_change && (
                      <small className="block muted">Нужна смена пароля</small>
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"Настроить " + m.name}
                      onClick={() => { setAddressCheck(null); setError(""); setEdit(m); }}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty
            title="Сотрудники не найдены"
            text="Добавьте человека или измените запрос."
            icon={Users}
          />
        )}
      </div>
      {add && (
        <MemberForm
          onClose={() => setAdd(false)}
          onDone={(status) => {
            setAdd(false);
            void load();
            notify("Сотрудник добавлен. " + mailboxLabels[status]);
          }}
        />
      )}
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/members/" + edit.id, "PATCH", {
                  status: edit.status,
                  ...(session.member.role === "tenant_admin"
                    ? { role: edit.role, quota_mb: Number(edit.quota_mb) }
                    : {}),
                  department: edit.department,
                });
                setEdit(null);
                void load();
                notify("Изменения сохранены. Почтовая квота применяется сервером автоматически.");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <ErrorBox message={error} />
            {session.member.role === "tenant_admin" && edit.workspace_user_id && (
              <Field label="Почтовый адрес">
                <div>{edit.email}</div>
                {edit.mail_pending_email && <small>Обновляется на {edit.mail_pending_email}. Письма и ящик сохраняются.</small>}
                <button type="button" className="secondary full" disabled={addressBusy} onClick={async () => {
                  setAddressBusy(true); setError("");
                  try {
                    const checked = await api(`/members/${edit.id}/address`);
                    setAddressCheck(checked);
                    setEdit((current: any) => current?.id === edit.id ? { ...current, email: checked.email, mail_pending_email: checked.pending_email } : current);
                  }
                  catch (e: any) { setError(e.message); }
                  finally { setAddressBusy(false); }
                }}>Проверить адрес Workspace</button>
                {addressCheck && <>
                  <div>Адрес в Workspace: <strong>{addressCheck.workspace_email}</strong></div>
                  {addressCheck.email === addressCheck.workspace_email && !addressCheck.pending_email ? <small>Адреса совпадают.</small> : <>
                    <small>Изменится адрес существующего ящика. Письма, папки и квота сохранятся; старый адрес освободится.</small>
                    <button type="button" className="primary full" disabled={addressBusy} onClick={async () => {
                      setAddressBusy(true); setError("");
                      try {
                        const result = await api(`/members/${edit.id}/address`, "POST", { expected_email: addressCheck.email, email: addressCheck.workspace_email });
                        setEdit({ ...edit, email: result.email, mail_pending_email: result.pending_email });
                        setAddressCheck(null); void load();
                        if (result.pending_email) setError(result.error || "Адрес обновляется. Повторите проверку через несколько секунд.");
                        else notify("Почтовый адрес приведён к Workspace. Письма сохранены.");
                      } catch (e: any) { setError(e.message); }
                      finally { setAddressBusy(false); }
                    }}>Применить адрес Workspace</button>
                  </>}
                </>}
              </Field>
            )}
            <Field label="Статус">
              <select
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              >
                <option value="active">Активен</option>
                <option value="suspended">Заблокирован</option>
              </select>
            </Field>
            {session.member.role === "tenant_admin" && (
              <>
                <Field label="Роль">
                  <select
                    value={edit.role}
                    onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  >
                    {["user", "hr", "tenant_admin"].map((r) => (
                      <option value={r} key={r}>
                        {roleName(r)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Квота, МБ">
                  <input
                    type="number"
                    min={1}
                    value={edit.quota_mb}
                    onChange={(e) =>
                      setEdit({ ...edit, quota_mb: e.target.value })
                    }
                  />
                  <small>Новая квота применяется почтовым сервером автоматически. Пока снижение не применено, прежний объём остаётся зарезервированным.</small>
                </Field>
              </>
            )}
            <Field label="Подразделение">
              <input
                value={edit.department}
                onChange={(e) =>
                  setEdit({ ...edit, department: e.target.value })
                }
              />
            </Field>
            <button className="primary full">Сохранить</button>
            <button
              className="secondary full"
              type="button"
              onClick={async () => {
                const password = prompt(
                  "Новый временный пароль (минимум 8 символов):",
                );
                if (!password) return;
                try {
                  await api("/members/" + edit.id + "/reset-password", "POST", {
                    password,
                  });
                  notify("Временный пароль установлен");
                  setEdit(null);
                } catch (e: any) {
                  setError(e.message);
                  setEdit(null);
                }
              }}
            >
              Сбросить пароль
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: any;
  icon: any;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="stat-icon">
        <Icon size={22} />
      </span>
    </div>
  );
}

function Domains() {
  const [list, setList] = useState<any[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/domains")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ИНФРАСТРУКТУРА</span>
          <h1>Почтовые домены</h1>
          <p>Каждый домен принадлежит только вашей компании</p>
        </div>
        <Globe className="page-symbol" size={34} />
      </div>
      <div className="settings-card">
        <h2>Подключить домен</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/domains", "POST", { name });
              setName("");
              void load();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Домен"
            placeholder="company.kz"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            <Plus size={18} />
            Добавить
          </button>
        </form>
        <p className="caption">
          Домен .test автоматически подтверждается только в локальном режиме.
          Для публичного домена добавьте TXT-запись в DNS.
        </p>
        <ErrorBox message={error} />
      </div>
      {list.map((d) => (
        <div className="settings-card domain-card" key={d.id}>
          <div className="split">
            <div className="inline">
              <Globe size={22} />
              <h2>{d.name}</h2>
            </div>
            <span className={"pill " + (d.verified ? "green" : "amber")}>
              {d.verified ? "Подтверждён" : "Ожидает проверки"}
            </span>
          </div>
          {!d.verified ? (
            <>
              <p>Добавьте TXT-запись у DNS-провайдера:</p>
              <div className="code-block">
                Имя: _teamspace-verify.{d.name}
                <br />
                Значение: teamspace-verification={d.verification_token}
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api("/domains/" + d.id + "/verify", "POST");
                    void load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <RefreshCw size={16} />
                Проверить DNS
              </button>
            </>
          ) : (
            <p className="caption">
              Можно создавать пользователей с адресами @{d.name}. Подтверждение
              владения не заменяет настройку MX, SPF и DKIM.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MailConnection({
  session,
  reload,
  notify,
}: {
  session: Session;
  reload: () => void;
  notify: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="settings-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/integrations/stalwart", "POST", { password });
          notify("Почтовый ящик подключён");
          reload();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setPassword("");
          setBusy(false);
        }
      }}
    >
      <h2>Почтовый ящик</h2>
      <p>{session.member.email}</p>
      <p>{session.member.mail_connected ? "Подключён" : "Ещё не подключён"}</p>
      {session.member.mail_link_available ? (
        <>
          <p className="caption">
            Подключите существующий ящик с этим адресом. Письма и пароль на
            почтовом сервере сохранятся.
          </p>
          {session.member.mail_connected && (
            <p className="caption">
              Квота и доступ через другие почтовые приложения управляются на
              почтовом сервере отдельно.
            </p>
          )}
          <Field label="Пароль почтового ящика или пароль приложения">
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </Field>
          <ErrorBox message={error} />
          <button className="primary" disabled={busy || !password}>
            {busy
              ? "Подключаем…"
              : session.member.mail_connected
                ? "Обновить подключение"
                : "Подключить ящик"}
          </button>
        </>
      ) : (
        <p className="caption">
          Ящик создаётся и управляется администратором вашей компании.
        </p>
      )}
    </form>
  );
}

function SettingsPage({
  session,
  reload,
  notify,
}: {
  session: Session;
  reload: () => void;
  notify: (s: string) => void;
}) {
  const [settings, setSettings] = useState<any>(null),
    [error, setError] = useState(""),
    [signature, setSignature] = useState(session.member.signature),
    [passwordModal, setPasswordModal] = useState(false),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    if (session.member.role === "tenant_admin")
      api("/settings")
        .then(setSettings)
        .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПАРАМЕТРЫ</span>
          <h1>Настройки</h1>
          <p>Ваш профиль и правила рабочего пространства</p>
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="settings-columns">
        <div>
          <MailConnection
            key={session.member.id}
            session={session}
            reload={reload}
            notify={notify}
          />
          <div className="settings-card">
            <h2>Профиль</h2>
            <div className="person-cell">
              <Avatar name={session.user.name} />
              <span>
                <strong>{session.user.name}</strong>
                <small>{session.member.email}</small>
              </span>
            </div>
            <Field label="Подпись в письмах">
              <textarea
                rows={4}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              />
            </Field>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api("/profile", "PATCH", { signature });
                  notify("Подпись сохранена");
                  reload();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Сохранить подпись
            </button>
          </div>
          <div className="settings-card">
            <h2>Безопасность</h2>
            <p>Вход по паролю. ЭЦП не включена в этой версии.</p>
            <button
              className="secondary"
              onClick={() => setPasswordModal(true)}
            >
              <LockKeyhole size={17} />
              Сменить пароль
            </button>
          </div>
        </div>
        {settings && (
          <form
            className="settings-card"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/settings", "PATCH", {
                  password_days: Number(settings.password_days),
                  ai_enabled: settings.ai_enabled,
                  consent_text: settings.consent_text,
                });
                notify("Политики обновлены");
                reload();
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <h2>Политики компании</h2>
            <Field label="Срок действия пароля, дней">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.password_days}
                onChange={(e) =>
                  setSettings({ ...settings, password_days: e.target.value })
                }
              />
            </Field>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={settings.ai_enabled}
                onChange={(e) =>
                  setSettings({ ...settings, ai_enabled: e.target.checked })
                }
              />
              Разрешить AI-функции компании
            </label>
            <p className="caption">
              {session.aiAvailable
                ? "AI-провайдер настроен. Содержимое выбранных писем передаётся ему по запросу пользователя."
                : "AI-провайдер не подключён. Для работы нужны AI_BASE_URL и AI_MODEL на сервере."}
            </p>
            <Field
              label={"Текст согласия · версия " + settings.consent_version}
            >
              <textarea
                rows={9}
                minLength={30}
                value={settings.consent_text}
                onChange={(e) =>
                  setSettings({ ...settings, consent_text: e.target.value })
                }
              />
            </Field>
            <p className="caption">
              Изменение текста создаёт новую версию и требует повторного
              согласия сотрудников.
            </p>
            <button className="primary">Сохранить политики</button>
          </form>
        )}
      </div>
      {passwordModal && (
        <Modal title="Смена пароля" onClose={() => setPasswordModal(false)}>
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/auth/password", "POST", {
                  currentPassword: current,
                  password,
                });
                setPasswordModal(false);
                notify("Пароль изменён, другие сессии завершены");
              } catch (e: any) {
                setError(e.message);
                setPasswordModal(false);
              }
            }}
          >
            <Field label="Текущий пароль">
              <input
                type="password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="Новый пароль">
              <input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="primary full">Сменить пароль</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/audit")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  const labels: any = {
    "auth.login": "Вход в систему",
    "auth.password_changed": "Смена пароля",
    "member.created": "Создание сотрудника",
    "member.updated": "Изменение сотрудника",
    "consent.accepted": "Принятие согласия",
    "mail.sent": "Отправка письма",
    "policy.updated": "Обновление политики",
    "domain.created": "Добавление домена",
    "member.password_reset": "Сброс пароля",
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">БЕЗОПАСНОСТЬ</span>
          <h1>Журнал действий</h1>
          <p>Последние 200 событий в пределах ваших полномочий</p>
        </div>
        <ShieldCheck size={34} className="page-symbol" />
      </div>
      <ErrorBox message={error} />
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Событие</th>
                <th>Пользователь</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="audit-event">
                      <CheckCircle2 size={17} />
                      {labels[r.action] ?? r.action}
                    </span>
                  </td>
                  <td>{r.actor_name ?? "Система"}</td>
                  <td className="muted">
                    {new Date(r.created_at).toLocaleString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="Пока нет событий"
            text="Здесь появятся действия пользователей."
            icon={BookOpen}
          />
        )}
      </div>
    </div>
  );
}

function Companies({ notify }: { notify: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]),
    [error, setError] = useState(""),
    [form, setForm] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [domains, setDomains] = useState<any[]>([]),
    [people, setPeople] = useState<any[]>([]),
    [reset, setReset] = useState<any>(null),
    [temporary, setTemporary] = useState(""),
    [domain, setDomain] = useState(""),
    [admin, setAdmin] = useState({
      login: "",
      name: "",
      email: "",
      password: "",
      quota_mb: 5120,
    });
  const load = () =>
    api("/platform/tenants")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПЛАТФОРМА</span>
          <h1>Компании</h1>
          <p>Управление независимыми рабочими пространствами</p>
        </div>
        <button
          className="primary"
          onClick={() => setForm({ name: "", slug: "", quota_mb: 102400 })}
        >
          <Plus size={18} />
          Новая компания
        </button>
      </div>
      <div className="stat-grid">
        <Stat label="Компаний" value={list.length} icon={Building2} />
        <Stat
          label="Активных"
          value={list.filter((x) => x.status === "active").length}
          icon={ShieldCheck}
        />
        <Stat
          label="Почтовых аккаунтов"
          value={list.reduce((n, x) => n + x.users, 0)}
          icon={Users}
        />
      </div>
      <ErrorBox message={error} />
      <div className="companies-grid">
        {list.map((t) => (
          <div className="company-card" key={t.id}>
            <div className="split">
              <span className="company-symbol">
                <Building2 size={27} />
              </span>
              <span
                className={"pill " + (t.status === "active" ? "green" : "gray")}
              >
                {t.status === "active" ? "Активна" : "Приостановлена"}
              </span>
            </div>
            <h2>{t.name}</h2>
            <p>
              {t.users} сотрудников · {t.slug}
            </p>
            <div className="allocation">
              <span>Выделено {bytes(t.allocated_mb * 1048576)}</span>
              <span>{bytes(t.quota_mb * 1048576)}</span>
            </div>
            <div className="progress">
              <i
                style={{
                  width:
                    Math.min(100, (t.allocated_mb / t.quota_mb) * 100) + "%",
                }}
              />
            </div>
            <footer>
              <button
                className="text-button"
                onClick={async () => {
                  setSelected(t);
                  setPeople(
                    await api("/platform/tenants/" + t.id + "/members"),
                  );
                  setDomains(
                    await api("/platform/tenants/" + t.id + "/domains"),
                  );
                }}
              >
                Управление <ArrowUpRight size={15} />
              </button>
              <button
                className="text-button muted"
                onClick={async () => {
                  if (
                    confirm(
                      (t.status === "active"
                        ? "Приостановить"
                        : "Активировать") + " компанию?",
                    )
                  ) {
                    try {
                      await api("/platform/tenants/" + t.id, "PATCH", {
                        status: t.status === "active" ? "suspended" : "active",
                      });
                      void load();
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }
                }}
              >
                {t.status === "active" ? "Приостановить" : "Активировать"}
              </button>
            </footer>
          </div>
        ))}
      </div>
      {form && (
        <Modal title="Новая компания" onClose={() => setForm(null)}>
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/platform/tenants", "POST", form);
                setForm(null);
                void load();
                notify("Компания создана");
              } catch (e: any) {
                setError(e.message);
                setForm(null);
              }
            }}
          >
            <Field label="Название">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Код компании (латиницей)">
              <input
                required
                pattern="[a-z0-9-]{2,50}"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>
            <Field label="Общий бюджет квоты, МБ">
              <input
                type="number"
                min={100}
                value={form.quota_mb}
                onChange={(e) =>
                  setForm({ ...form, quota_mb: Number(e.target.value) })
                }
              />
            </Field>
            <button className="primary full">Создать компанию</button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="form-body">
            <h3>Домены</h3>
            {domains.map((d) => (
              <p key={d.id}>
                {d.name}{" "}
                <span className={"pill " + (d.verified ? "green" : "amber")}>
                  {d.verified ? "Подтверждён" : "Ожидает DNS"}
                </span>
                {!d.verified && (
                  <>
                    <code className="block">
                      _teamspace-verify.{d.name} TXT teamspace-verification=
                      {d.verification_token}
                    </code>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await api(
                            "/platform/tenants/" +
                              selected.id +
                              "/domains/" +
                              d.id +
                              "/verify",
                            "POST",
                          );
                          setDomains(
                            await api(
                              "/platform/tenants/" + selected.id + "/domains",
                            ),
                          );
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      Проверить DNS
                    </button>
                  </>
                )}
              </p>
            ))}
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    "/platform/tenants/" + selected.id + "/domains",
                    "POST",
                    { name: domain },
                  );
                  setDomain("");
                  setDomains(
                    await api("/platform/tenants/" + selected.id + "/domains"),
                  );
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <input
                aria-label="Домен компании"
                placeholder="company.test"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              <button className="secondary">Добавить</button>
            </form>
            <h3>Учётные записи</h3>
            {people.map((p) => (
              <div className="split" key={p.id}>
                <span>
                  {p.name}
                  <small className="block muted">
                    {p.email} · {roleName(p.role)}
                  </small>
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setReset(p);
                    setTemporary("");
                  }}
                >
                  Сбросить пароль
                </button>
              </div>
            ))}
            {reset && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api(
                      "/platform/identities/" +
                        reset.user_id +
                        "/reset-password",
                      "POST",
                      { password: temporary },
                    );
                    setReset(null);
                    setTemporary("");
                    notify(
                      "Сессии отозваны; при входе потребуется смена пароля",
                    );
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <p className="caption">
                  Сброс общего пароля {reset.name} затронет вход во все
                  компании.
                </p>
                <Field label="Новый временный пароль">
                  <input
                    type="password"
                    minLength={8}
                    required
                    value={temporary}
                    onChange={(e) => setTemporary(e.target.value)}
                  />
                </Field>
                <button className="secondary">Сбросить общий пароль</button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setReset(null)}
                >
                  Отмена
                </button>
              </form>
            )}
            <h3>Создать администратора</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    "/platform/tenants/" + selected.id + "/admin",
                    "POST",
                    admin,
                  );
                  setSelected(null);
                  void load();
                  notify("Администратор добавлен");
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <Field label="ФИО">
                <input
                  required
                  value={admin.name}
                  onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
                />
              </Field>
              <Field label="Логин / ИИН">
                <input
                  required
                  pattern="[0-9]{12}"
                  value={admin.login}
                  onChange={(e) =>
                    setAdmin({ ...admin, login: e.target.value })
                  }
                />
              </Field>
              <Field label="Почта">
                <input
                  type="email"
                  required
                  value={admin.email}
                  onChange={(e) =>
                    setAdmin({ ...admin, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Временный пароль">
                <input
                  type="password"
                  minLength={8}
                  required
                  value={admin.password}
                  onChange={(e) =>
                    setAdmin({ ...admin, password: e.target.value })
                  }
                />
              </Field>
              <button className="primary full">Создать администратора</button>
            </form>
            <ErrorBox message={error} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [view, setView] = useState("inbox"),
    [search, setSearch] = useState(""),
    [counts, setCounts] = useState<any[]>([]),
    [q, setQ] = useState<any>(null),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState<any[] | null>(null),
    [side, setSide] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const reload = useCallback(async () => {
    try {
      const s = await api("/session");
      setCsrf(s.csrf);
      setSession(s);
      setFatal("");
    } catch (e: any) {
      if (e.code === "UNAUTHENTICATED") setSession(null);
      else setFatal(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    window.addEventListener("session-check", reload);
    return () => window.removeEventListener("session-check", reload);
  }, [reload]);
  useEffect(() => {
    if (!session?.member || session.passwordRequired || session.consentRequired)
      return;
    const poll = () =>
      api("/mail/quota")
        .then(setQ)
        .catch(() => {});
    void poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key?.toLowerCase() === "n" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) &&
        session?.member &&
        !session.passwordRequired &&
        !session.consentRequired
      ) {
        e.preventDefault();
        if (!folders.some((f) => f[0] === view)) setView("inbox");
        setTimeout(() => window.dispatchEvent(new Event("compose")), 50);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session, view]);
  if (loading)
    return (
      <div className="app-loading">
        <Spinner />
        Запускаем Mail…
      </div>
    );
  if (!session)
    return (
      <>
        {fatal && (
          <div className="fatal">
            <ErrorBox message={fatal} />
            <button onClick={reload}>Повторить</button>
          </div>
        )}
        <Login onLogin={reload} />
      </>
    );
  if (session.passwordRequired || session.consentRequired)
    return <Onboarding session={session} reload={reload} />;
  const mail = folders.some((f) => f[0] === view),
    admin = session.member?.role === "tenant_admin",
    hr = admin || session.member?.role === "hr";
  function navigate(v: string) {
    setView(v);
    setSearch("");
    setSide(false);
  }
  return (
    <div className={"app-shell " + (collapsed ? "sidebar-collapsed" : "")}>
      {side && (
        <button
          className="sidebar-scrim"
          aria-label="Закрыть меню"
          onClick={() => setSide(false)}
        />
      )}
      <aside className={"sidebar " + (side ? "open" : "")}>
        <div className="brand-row">
          <button
            className="icon-button"
            aria-label="Свернуть или развернуть меню"
            title="Главное меню"
            onClick={() => {
              setCollapsed(!collapsed);
              setSide(false);
            }}
          >
            <Menu size={22} />
          </button>
          <div className="brand">
            <span className="brand-symbol">
              <Mail size={32} />
            </span>
            <span className="brand-name">Mail</span>
          </div>
        </div>
        {session.member && (
          <button
            className="compose-button"
            title="Написать письмо"
            onClick={() => {
              if (!mail) setView("inbox");
              setSide(false);
              setTimeout(() => window.dispatchEvent(new Event("compose")), 50);
            }}
          >
            <Pencil size={24} />
            <span>Написать</span>
          </button>
        )}
        <div className="sidebar-navigation">
          {session.member && (
            <nav aria-label="Почтовые папки">
              {folders.map(([id, label, Icon]) => (
                <button
                  key={id}
                  title={label}
                  aria-label={label}
                  aria-current={view === id ? "page" : undefined}
                  className={view === id ? "active" : ""}
                  onClick={() => navigate(id)}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                  {counts.find((x) => x.folder === id)?.unread > 0 &&
                    id === "inbox" && (
                      <b>{counts.find((x) => x.folder === id).unread}</b>
                    )}
                </button>
              ))}
            </nav>
          )}
          <div className="nav-label">Рабочее пространство</div>
          <nav aria-label="Управление">
            {session.member && (
              <button
                title="Календарь"
                aria-label="Календарь"
                className={view === "calendar" ? "active" : ""}
                onClick={() => navigate("calendar")}
              >
                <CalendarDays size={20} />
                <span>Календарь</span>
              </button>
            )}
            {session.user.platformAdmin && (
              <button
                title="Компании"
                aria-label="Компании"
                className={view === "companies" ? "active" : ""}
                onClick={() => navigate("companies")}
              >
                <Building2 size={20} />
                <span>Компании</span>
              </button>
            )}
            {hr && (
              <button
                title="Сотрудники"
                aria-label="Сотрудники"
                className={view === "members" ? "active" : ""}
                onClick={() => navigate("members")}
              >
                <Users size={20} />
                <span>Сотрудники</span>
              </button>
            )}
            {admin && (
              <button
                title="Домены"
                aria-label="Домены"
                className={view === "domains" ? "active" : ""}
                onClick={() => navigate("domains")}
              >
                <Globe size={20} />
                <span>Домены</span>
              </button>
            )}
            {hr && (
              <button
                title="Журнал действий"
                aria-label="Журнал действий"
                className={view === "audit" ? "active" : ""}
                onClick={() => navigate("audit")}
              >
                <ShieldCheck size={20} />
                <span>Журнал действий</span>
              </button>
            )}
            {session.member && (
              <button
                title="Настройки"
                aria-label="Настройки"
                className={view === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <Settings size={20} />
                <span>Настройки</span>
              </button>
            )}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div
            className="workspace-switch"
            title={session.tenant?.name ?? "Платформа"}
          >
            <span className="workspace-logo">
              {(session.tenant?.name ?? "Платформа")[0]}
            </span>
            <div>
              <strong>{session.tenant?.name ?? "Платформа"}</strong>
              <span>Рабочее пространство</span>
            </div>
            {session.memberships.length > 1 && (
              <>
                <ChevronDown size={15} />
                <select
                  aria-label="Выбрать компанию"
                  value={session.tenant?.id ?? ""}
                  onChange={async (e) => {
                    await api("/session/tenant", "POST", {
                      tenantId: e.target.value,
                    });
                    setView("inbox");
                    setQ(null);
                    setCounts([]);
                    await reload();
                  }}
                >
                  {session.memberships.map((m: any) => (
                    <option key={m.id} value={m.tenant_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {q && (
            <div className="storage">
              <div className="progress">
                <i
                  className={q.used / q.limit > 0.8 ? "warning" : ""}
                  style={{
                    width:
                      Math.max(1, Math.min(100, (q.used / q.limit) * 100)) +
                      "%",
                  }}
                />
              </div>
              <small>
                Занято {bytes(q.used)} из {bytes(q.limit)}
              </small>
            </div>
          )}
          <div className="user-card">
            <Avatar name={session.user.name} small />
            <div>
              <strong>{session.user.name}</strong>
              <span>
                {session.user.platformAdmin
                  ? "Администратор платформы"
                  : roleName(session.member?.role)}
              </span>
            </div>
            <button
              className="icon-button"
              title="Выйти"
              aria-label="Выйти"
              onClick={async () => {
                await api("/auth/logout", "POST");
                await reload();
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label="Меню"
            onClick={() => setSide(!side)}
          >
            <PanelLeft size={20} />
          </button>
          <div className="global-search">
            <Search size={19} />
            <input
              aria-label="Поиск писем"
              placeholder="Поиск в почте"
              value={search}
              disabled={!mail}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Очистить поиск"
                onClick={() => setSearch("")}
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className={"icon-button " + (notifications ? "active" : "")}
              aria-label="Уведомления"
              onClick={async () => {
                if (notifications) {
                  setNotifications(null);
                  return;
                }
                try {
                  setNotifications(await api("/notifications"));
                } catch (e: any) {
                  setToast(e.message);
                }
              }}
            >
              <Bell size={20} />
            </button>
            {session.member && (
              <button
                className="icon-button"
                aria-label="Открыть настройки"
                title="Настройки"
                onClick={() => navigate("settings")}
              >
                <Settings size={22} />
              </button>
            )}
            <span className="header-company">
              {session.tenant?.name ?? "Платформа"}
            </span>
            <Avatar name={session.user.name} small />
          </div>
        </header>
        {session.member && mail ? (
          <MailView
            key={session.tenant.id}
            session={session}
            folder={view}
            search={search}
            onCounts={setCounts}
            notify={setToast}
          />
        ) : view === "companies" || !session.member ? (
          <Companies notify={setToast} />
        ) : view === "calendar" ? (
          <CalendarPage
            key={session.member.id}
            session={session}
            notify={setToast}
          />
        ) : view === "members" ? (
          <Members session={session} notify={setToast} />
        ) : view === "domains" ? (
          <Domains />
        ) : view === "audit" ? (
          <Audit />
        ) : (
          <SettingsPage session={session} reload={reload} notify={setToast} />
        )}
      </div>
      {notifications && (
        <div className="notifications-panel">
          <header>
            <h2>Уведомления</h2>
            <button
              className="icon-button"
              aria-label="Закрыть уведомления"
              onClick={() => setNotifications(null)}
            >
              <X size={19} />
            </button>
          </header>
          {notifications.length ? (
            <>
              <button
                className="text-button"
                onClick={async () => {
                  await api("/notifications/read", "POST");
                  setNotifications(
                    notifications.map((n) => ({ ...n, read: true })),
                  );
                }}
              >
                Прочитать все
              </button>
              {notifications.map((n) => (
                <article key={n.id} className={n.read ? "" : "unread"}>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{date(n.created_at)}</small>
                </article>
              ))}
            </>
          ) : (
            <Empty
              title="Всё спокойно"
              text="Здесь появятся важные события и предупреждения о квоте."
              icon={Bell}
            />
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
