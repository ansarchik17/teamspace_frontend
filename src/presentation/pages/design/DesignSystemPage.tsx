import { useState } from 'react'
import { ArrowUpRight, Check, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import PageHeader from '../../../shared/ui/PageHeader'
import ViewToggle from '../../../shared/ui/ViewToggle'

const sections = [
  ['Главная', 'Обзор задач, событий и сервисов', '/workspace'],
  ['Лента', 'Новости и объявления команды', '/news'],
  ['Работа', 'Доски, задачи, цели и аналитика', '/board'],
  ['Drive', 'Файлы, папки и общий доступ', '/drive'],
  ['Deep Research', 'Исследования по документам', '/drive/notebook'],
  ['CRM', 'Лиды, контакты, сделки и задачи', '/crm'],
  ['Люди', 'Сотрудники и контакты', '/team-contact'],
  ['Структура', 'Подразделения и команды', '/organization'],
  ['Права доступа', 'Роли и доступ к приложениям', '/organization/access'],
  ['Календарь', 'Встречи, события и приглашения', '/calendar'],
  ['Meet', 'Видеовстречи и история', '/meet'],
  ['Заметки', 'Страницы и записи совещаний', '/notes'],
  ['Whiteboard', 'Схемы и совместная работа', '/whiteboard'],
  ['AI', 'Ассистент и история диалогов', '/team-rag'],
  ['Сервисы', 'Каталог приложений', '/teamstore'],
  ['Профиль', 'Личные данные и настройки', '/profile'],
  ['iForm', 'Формы, процессы и заявки', '/iform'],
] as const

const colors = [
  ['Действие', '--ts-action', '#2458D3'], ['Выбор', '--ts-selection', '#EDF2FF'],
  ['Фон', '--ts-bg', '#F6F7F9'], ['Поверхность', '--ts-surface', '#FFFFFF'],
  ['Текст', '--ts-text', '#17202E'], ['Граница', '--ts-border', '#E2E5EA'],
  ['Успех', '--ts-success', '#16734B'], ['Внимание', '--ts-warning', '#946000'],
  ['Ошибка', '--ts-danger', '#C03437'],
] as const

/** Development-only visual reference. These controls never write to the backend. */
export default function DesignSystemPage() {
  const [modal, setModal] = useState(false)
  const [title, setTitle] = useState('')
  const [tab, setTab] = useState('Все')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const visible = sections.filter(([name, description]) => `${name} ${description}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <main className="h-full overflow-y-auto bg-[var(--ts-bg)] px-4 py-8 text-[var(--ts-text)] sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8">
        <div>
          <div className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--ts-text-secondary)]">UniteSpace / Локальная дизайн-система</div>
          <PageHeader title="Один стиль. Всё рабочее пространство." description="Общие правила для страниц, действий, форм и модальных окон." actions={<AppButton onClick={() => setModal(true)}><Plus size={18} />Пример диалога</AppButton>} />
        </div>

        <section className="ts-panel p-6" aria-label="Палитра">
          <h2 className="mb-5 text-lg font-semibold">Цвет и типографика</h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
            {colors.map(([label, token, hex]) => <div key={token}><div className="mb-3 h-16 rounded-lg border border-[var(--ts-border)]" style={{ background: `var(${token})` }} /><div className="text-sm font-medium">{label}</div><div className="mt-1 text-xs text-[var(--ts-text-secondary)]">{hex}</div></div>)}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--ts-border)] pt-5 text-sm text-[var(--ts-text-secondary)]">
            <span>Inter · 14 / 20 px</span><span>Заголовок · 28 / 36 px</span><span>Кнопка · 40 px</span><span>Панель инструментов · 36 px</span><span>Радиусы · 8 / 12 / 16 px</span>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="ts-panel p-6">
            <h2 className="mb-5 text-lg font-semibold">Действия</h2>
            <div className="flex flex-wrap items-center gap-3"><AppButton><Plus size={18} />Создать</AppButton><AppButton variant="secondary">Отмена</AppButton><AppButton variant="ghost">Подробнее<ArrowUpRight size={16} /></AppButton><AppButton disabled>Недоступно</AppButton><AppButton variant="danger" size="compact">Удалить</AppButton></div>
            <p className="mt-5 text-sm leading-6 text-[var(--ts-text-secondary)]">Главное действие — справа в шапке. Поиск и фильтры — ниже. В диалоге отмена предшествует подтверждению.</p>
          </section>
          <section className="ts-panel p-6">
            <h2 className="mb-5 text-lg font-semibold">Формы и состояния</h2>
            <label className="ts-field"><span>Название</span><input className="ts-input" placeholder="Введите название…" /></label>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium"><span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ts-success-bg)] px-2.5 py-1.5 text-[var(--ts-success)]"><Check size={14} />Завершено</span><span className="rounded-md bg-[var(--ts-warning-bg)] px-2.5 py-1.5 text-[var(--ts-warning)]">Требует внимания</span><span className="rounded-md bg-[var(--ts-danger-bg)] px-2.5 py-1.5 text-[var(--ts-danger)]">Ошибка</span></div>
          </section>
        </div>

        <section aria-label="Разделы проекта" className="flex flex-col gap-5">
          <PageHeader title="Разделы проекта" description="Откройте локальные страницы, чтобы проверить общий стиль." meta={<span className="ts-count">{sections.length}</span>} />
          <div className="ts-tabs" role="tablist" aria-label="Пример вкладок">{['Все', 'Рабочие разделы', 'Приложения'].map((label) => <button key={label} role="tab" aria-selected={tab === label} className={`ts-tab ${tab === label ? 'ts-tab--active' : ''}`} onClick={() => setTab(label)}>{label}</button>)}</div>
          <div className="ts-toolbar"><label className="ts-toolbar__search relative"><span className="sr-only">Найти раздел</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ts-text-muted)]" /><input className="ts-input !min-h-9 !py-1.5 pl-10" placeholder="Найти раздел…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><AppButton variant="secondary" size="compact" onClick={() => { setQuery(''); setNotice('Фильтры сброшены') }}><SlidersHorizontal size={16} />Сбросить</AppButton><ViewToggle value={view} onChange={setView} options={[{ value: 'grid', icon: 'grid_view', label: 'Плитка' }, { value: 'list', icon: 'list', label: 'Список' }]} /></div>
          <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-3'}>
            {visible.filter(([name]) => tab === 'Все' || (tab === 'Приложения' ? ['CRM', 'iForm', 'Meet', 'AI', 'Сервисы'].includes(name) : !['CRM', 'iForm', 'Meet', 'AI', 'Сервисы'].includes(name))).map(([name, description, route]) => <a key={route} href={`/web${route}`} className="ts-panel flex items-center justify-between gap-4 p-5 transition-colors hover:border-[var(--ts-action)]"><div><h3 className="text-sm font-semibold">{name}</h3><p className="mt-1 text-sm text-[var(--ts-text-secondary)]">{description}</p></div><ArrowUpRight size={18} className="shrink-0 text-[var(--ts-action)]" /></a>)}
          </div>
        </section>
        {notice && <div role="status" className="flex items-center justify-between rounded-lg bg-[var(--ts-success-bg)] px-4 py-3 text-sm text-[var(--ts-success)]">{notice}<button aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={16} /></button></div>}
      </div>
      {modal && <AppModal title="Создать элемент" onClose={() => setModal(false)} footer={<><AppButton variant="secondary" onClick={() => setModal(false)}>Отмена</AppButton><AppButton disabled={!title.trim()} onClick={() => { setModal(false); setNotice('Пример сохранён локально'); setTitle('') }}>Создать</AppButton></>}>
        <p className="mb-5 text-sm leading-6 text-[var(--ts-text-secondary)]">Пример общего диалога. Он показывает расположение полей и действий.</p>
        <label className="ts-field"><span>Название <span className="text-[var(--ts-danger)]">*</span></span><input className="ts-input" placeholder="Например, План команды" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <label className="ts-field mt-4"><span>Описание</span><textarea className="ts-input" placeholder="Добавьте описание…" /></label>
      </AppModal>}
    </main>
  )
}
