import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminText } from '../../../shared/i18n/adminText'
import { Building2, Check, DoorOpen, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import AppButton from '../../../shared/ui/AppButton'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import {
  HttpMeetingRoomRepository,
  MeetingRoomApiError,
  type MeetingRoom,
  type MeetingSite,
} from '../../../infrastructure/repositories/HttpMeetingRoomRepository'
import { HttpOrganizationRepository } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { ADMIN_PAGE_SIZE, AdminFormDialog, AdminPager, AdminPanel, AdminRowAction, AdminStatus, type AdminForm } from './administrationUi'

const TIMEZONES = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Oral', 'Asia/Qyzylorda', 'Asia/Tashkent', 'Asia/Bishkek', 'Europe/Moscow', 'UTC']
const KNOWN_ERRORS = ['SITE_HAS_ROOMS', 'ROOM_HAS_BOOKINGS', 'ROOM_NAME_TAKEN'] as const

const parseEquipment = (value: string): string[] =>
  value.split(',').map((item) => item.trim()).filter(Boolean)

const ROOM_ICON_BUTTON = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5F6368] transition-colors hover:bg-[#F1F3F4] hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] disabled:cursor-not-allowed disabled:opacity-40'

export default function MeetingRoomsAdminSection() {
  const { t } = useTranslation('calendar')
  const store = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const repo = useMemo(() => new HttpMeetingRoomRepository(store), [store])
  const orgRepo = useMemo(() => new HttpOrganizationRepository(store), [store])
  const [canManage, setCanManage] = useState(false)
  const [sites, setSites] = useState<MeetingSite[]>([])
  const [rooms, setRooms] = useState<MeetingRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [form, setForm] = useState<AdminForm | null>(null)
  const [version, setVersion] = useState(0)
  const [roomPages, setRoomPages] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true
    Promise.all([
      repo.listSites(),
      repo.listRooms({ includeInactive: true }),
      orgRepo.getCurrent().then((organization) => Boolean(organization?.can_manage_structure)).catch(() => false),
    ])
      .then(([nextSites, nextRooms, nextCanManage]) => {
        if (!active) return
        setCanManage(nextCanManage)
        setSites(nextSites)
        setRooms(nextRooms)
        setLoadError('')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setLoadError(cause instanceof Error && cause.message ? cause.message : t('rooms.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [orgRepo, repo, t, version])

  const errorMessage = useCallback((cause: unknown): string => {
    if (cause instanceof MeetingRoomApiError) {
      const known = KNOWN_ERRORS.find((code) => code === cause.code)
      if (known) return t(`rooms.errors.${known}`)
      if (cause.status === 403) return t('rooms.errors.forbidden')
    }
    return cause instanceof Error && cause.message ? cause.message : t('rooms.errors.generic')
  }, [t])

  const mutate = async (run: () => Promise<void>): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await run()
      setNotice(t('rooms.saved'))
      setVersion((value) => value + 1)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const openForm = (next: AdminForm) => {
    setError('')
    setForm(next)
  }

  const siteForm = (site?: MeetingSite) => {
    const timezone = site?.timezone || 'Asia/Almaty'
    const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]
    openForm({
      title: site ? t('rooms.siteForm.editTitle', { name: site.name }) : t('rooms.siteForm.createTitle'),
      description: t('rooms.siteForm.description'),
      fields: [
        { key: 'name', label: t('rooms.siteForm.name'), value: site?.name ?? '', maxLength: 120 },
        { key: 'address', label: t('rooms.siteForm.address'), value: site?.address ?? '', optional: true, maxLength: 255 },
        { key: 'city', label: t('rooms.siteForm.city'), value: site?.city ?? '', optional: true, maxLength: 120 },
        { key: 'timezone', label: t('rooms.siteForm.timezone'), value: timezone, options: timezones.map((zone) => ({ value: zone, label: zone })) },
        { key: 'workingHours', label: t('rooms.siteForm.workingHours'), value: site?.workingHours ?? '', optional: true, maxLength: 40, hint: t('rooms.siteForm.workingHoursHint') },
      ],
      save: async (values) => {
        const payload = {
          name: values.name.trim(),
          address: values.address.trim(),
          city: values.city.trim(),
          timezone: values.timezone,
          working_hours: values.workingHours.trim(),
        }
        if (site) await repo.updateSite(site.id, payload)
        else await repo.createSite(payload)
      },
    })
  }

  const roomForm = (room?: MeetingRoom, siteId?: string) => {
    const defaultSite = room?.siteId || siteId || sites.find((site) => site.isActive)?.id || sites[0]?.id || ''
    openForm({
      title: room ? t('rooms.roomForm.editTitle', { name: room.name }) : t('rooms.roomForm.createTitle'),
      description: t('rooms.roomForm.description'),
      fields: [
        { key: 'siteId', label: t('rooms.roomForm.site'), value: defaultSite, options: sites.map((site) => ({ value: site.id, label: site.name })) },
        { key: 'name', label: t('rooms.roomForm.name'), value: room?.name ?? '', maxLength: 120 },
        { key: 'floor', label: t('rooms.roomForm.floor'), value: room?.floor != null ? String(room.floor) : '', optional: true, maxLength: 4 },
        { key: 'location', label: t('rooms.roomForm.location'), value: room?.location ?? '', optional: true, maxLength: 160, hint: t('rooms.roomForm.locationHint') },
        { key: 'capacity', label: t('rooms.roomForm.capacity'), value: room?.capacity ? String(room.capacity) : '', maxLength: 3 },
        { key: 'equipment', label: t('rooms.roomForm.equipment'), value: room?.equipment.join(', ') ?? '', optional: true, maxLength: 255, hint: t('rooms.roomForm.equipmentHint') },
        { key: 'description', label: t('rooms.roomForm.descriptionField'), value: room?.description ?? '', optional: true, maxLength: 500 },
      ],
      save: async (values) => {
        const capacity = Number(values.capacity.trim())
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new Error(t('rooms.roomForm.invalidCapacity'))
        const floorText = values.floor.trim()
        const floor = floorText ? Number(floorText) : null
        if (floor !== null && !Number.isInteger(floor)) throw new Error(t('rooms.roomForm.invalidFloor'))
        const payload = {
          site_id: values.siteId,
          name: values.name.trim(),
          floor,
          location: values.location.trim(),
          capacity,
          equipment: parseEquipment(values.equipment),
          description: values.description.trim(),
        }
        if (room) await repo.updateRoom(room.id, payload)
        else await repo.createRoom(payload)
      },
    })
  }

  const confirm = (title: string, description: string, submit: string, run: () => Promise<void>, danger = true) => {
    openForm({ title, description, fields: [], danger, submit, save: run })
  }

  const toggleRoom = (room: MeetingRoom) => {
    if (!room.isActive) {
      void mutate(() => repo.updateRoom(room.id, { is_active: true }).then(() => undefined))
      return
    }
    confirm(t('rooms.confirm.disableRoomTitle'), t('rooms.confirm.disableRoomText', { name: room.name }), t('rooms.disable'), async () => {
      await repo.updateRoom(room.id, { is_active: false })
    })
  }

  const toggleSite = (site: MeetingSite) => {
    if (!site.isActive) {
      void mutate(() => repo.updateSite(site.id, { is_active: true }).then(() => undefined))
      return
    }
    confirm(t('rooms.confirm.disableSiteTitle'), t('rooms.confirm.disableSiteText', { name: site.name }), t('rooms.disable'), async () => {
      await repo.updateSite(site.id, { is_active: false })
    })
  }

  const roomsBySite = useMemo(() => {
    const map = new Map<string, MeetingRoom[]>()
    for (const room of rooms) {
      const list = map.get(room.siteId) ?? []
      list.push(room)
      map.set(room.siteId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [rooms])

  const orphanRooms = rooms.filter((room) => !sites.some((site) => site.id === room.siteId))

  const renderRooms = (allRooms: MeetingRoom[], pageKey: string) => {
    const pageCount = Math.max(1, Math.ceil(allRooms.length / ADMIN_PAGE_SIZE))
    const page = Math.min(roomPages[pageKey] ?? 0, pageCount - 1)
    const list = allRooms.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE)
    const setPage = (next: number) => setRoomPages((current) => ({ ...current, [pageKey]: next }))
    return allRooms.length ? (<>
      <div className="company-admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('rooms.columns.name')}</th>
              <th>{t('rooms.columns.place')}</th>
              <th>{t('rooms.columns.capacity')}</th>
              <th>{t('rooms.columns.equipment')}</th>
              <th>{t('rooms.columns.status')}</th>
              {canManage ? <th>{t('rooms.columns.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((room) => (
              <tr key={room.id}>
                <td>
                  <strong>{room.name}</strong>
                  {room.description ? <small>{room.description}</small> : null}
                </td>
                <td>{[room.floor != null ? t('rooms.floorValue', { floor: room.floor }) : '', room.location].filter(Boolean).join(', ') || t('rooms.noValue')}</td>
                <td>{room.capacity ? t('rooms.capacityValue', { count: room.capacity }) : t('rooms.noValue')}</td>
                <td>{room.equipment.length ? room.equipment.join(', ') : t('rooms.noValue')}</td>
                <td><AdminStatus warning={!room.isActive}>{room.isActive ? t('rooms.active') : t('rooms.inactive')}</AdminStatus></td>
                {canManage ? (
                <td>
                  <div className="flex flex-nowrap items-center gap-0.5">
                    <button type="button" className={ROOM_ICON_BUTTON} disabled={busy} onClick={() => roomForm(room)} title={t('rooms.edit')} aria-label={t('rooms.edit')}><Pencil size={18} strokeWidth={1.75} /></button>
                    <label className="company-admin-toggle !w-auto px-1.5" title={room.isActive ? t('rooms.disable') : t('rooms.enable')}><input role="switch" type="checkbox" checked={room.isActive} disabled={busy} onChange={() => toggleRoom(room)} aria-label={room.isActive ? t('rooms.disable') : t('rooms.enable')} /></label>
                    <button type="button" className={`${ROOM_ICON_BUTTON} hover:!bg-[#FCE8E6] hover:!text-[#C5221F]`} disabled={busy} onClick={() => confirm(t('rooms.confirm.deleteRoomTitle'), t('rooms.confirm.deleteRoomText', { name: room.name }), t('rooms.delete'), () => repo.deleteRoom(room.id))} title={t('rooms.delete')} aria-label={t('rooms.delete')}><Trash2 size={18} strokeWidth={1.75} /></button>
                  </div>
                </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminPager
        label={adminText('template1', { p0: page * ADMIN_PAGE_SIZE + 1, p1: page * ADMIN_PAGE_SIZE + list.length, p2: allRooms.length })}
        page={page + 1}
        canPrev={page > 0}
        canNext={page + 1 < pageCount}
        onPrev={() => setPage(page - 1)}
        onNext={() => setPage(page + 1)}
      />
    </>) : (
      <p className="company-admin-empty">{t('rooms.emptyRooms')}</p>
    )
  }

  return (
    <>
      {notice ? <div className="company-admin-notice" role="status"><Check size={17} />{notice}</div> : null}
      {error && !form ? <div className="company-admin-form-error" role="alert">{error}</div> : null}
      <AdminPanel
        title={t('rooms.title')}
        action={canManage ? (
          <div className="company-admin-inline">
            <AppButton variant="secondary" disabled={busy || loading} onClick={() => siteForm()}><Building2 size={17} />{t('rooms.addSite')}</AppButton>
            <AppButton disabled={busy || loading || !sites.length} onClick={() => roomForm()}><Plus size={17} />{t('rooms.addRoom')}</AppButton>
          </div>
        ) : undefined}
      >
        <p className="company-admin-description">{t('rooms.description')}</p>
        {!loading && !loadError && !canManage ? <p className="company-admin-warning">{t('rooms.readOnly')}</p> : null}
        {loading ? <p className="company-admin-description" role="status">{t('rooms.loading')}</p> : null}
        {!loading && loadError ? (
          <div className="company-admin-form-error" role="alert">
            {loadError}{' '}
            <AppButton variant="secondary" onClick={() => { setLoading(true); setVersion((value) => value + 1) }}>{t('rooms.retry')}</AppButton>
          </div>
        ) : null}
        {!loading && !loadError && !sites.length ? <p className="company-admin-empty">{t('rooms.emptySites')}</p> : null}
      </AdminPanel>

      {!loading && !loadError ? sites.map((site) => (
        <AdminPanel
          key={site.id}
          title={site.name}
          action={
            <div className="company-admin-inline">
              <AdminStatus warning={!site.isActive}>{site.isActive ? t('rooms.siteActive') : t('rooms.siteInactive')}</AdminStatus>
              {canManage ? <>
              <AdminRowAction disabled={busy} onClick={() => roomForm(undefined, site.id)}><DoorOpen size={14} />{t('rooms.addRoomHere')}</AdminRowAction>
              <AdminRowAction disabled={busy} onClick={() => siteForm(site)}>{t('rooms.edit')}</AdminRowAction>
              <AdminRowAction disabled={busy} onClick={() => toggleSite(site)}>{site.isActive ? t('rooms.disable') : t('rooms.enable')}</AdminRowAction>
              <AdminRowAction danger disabled={busy} onClick={() => confirm(t('rooms.confirm.deleteSiteTitle'), t('rooms.confirm.deleteSiteText', { name: site.name }), t('rooms.delete'), () => repo.deleteSite(site.id))}>{t('rooms.delete')}</AdminRowAction>
              </> : null}
            </div>
          }
        >
          {[site.city, site.address].filter(Boolean).length || site.workingHours ? (
            <p className="company-admin-description flex flex-wrap items-center gap-x-4 gap-y-1">
              {[site.city, site.address].filter(Boolean).length ? <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{[site.city, site.address].filter(Boolean).join(', ')}</span> : null}
              {site.workingHours ? <span>{site.workingHours} · {site.timezone}</span> : null}
            </p>
          ) : null}
          {renderRooms(roomsBySite.get(site.id) ?? [], site.id)}
        </AdminPanel>
      )) : null}

      {!loading && !loadError && orphanRooms.length ? (
        <AdminPanel title={t('rooms.title')}>{renderRooms(orphanRooms, 'orphan')}</AdminPanel>
      ) : null}

      {form ? (
        <AdminFormDialog form={form} serverError={error} busy={busy} onSave={mutate} onClose={() => { setForm(null); setError('') }} />
      ) : null}
    </>
  )
}
