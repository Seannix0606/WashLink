import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CatalogService, WorkerAccount } from '@washlink/shared'
import { LocationPickerMap, type PickedLocationValue } from '../../../presentation/components/shared/LocationPickerMap'
import { Button, Input, Section, Select } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { hourLabel } from './hourLabel'

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** Shown Monday first, like the calendar; the stored weekday numbers stay Sunday = 0. */
const mondayFirst = [1, 2, 3, 4, 5, 6, 0]
const hourOptions = Array.from({ length: 25 }, (_unused, hour) => ({ value: String(hour * 60), label: hourLabel(hour) }))

interface DayHours {
  readonly isWorking: boolean
  readonly startMinute: number
  readonly endMinute: number
}

interface WorkerSetupPanelProps {
  readonly workerId: string
  readonly account: WorkerAccount | null
  readonly onSaved: () => Promise<void>
}

export function WorkerSetupPanel({ workerId, account, onSaved }: WorkerSetupPanelProps): ReactElement {
  const [bio, setBio] = useState(account?.bio ?? '')
  const [skills, setSkills] = useState((account?.skills ?? []).join(', '))
  const [radius, setRadius] = useState(String(account?.serviceRadiusKm ?? 10))
  const [base, setBase] = useState<PickedLocationValue | null>(
    account?.baseLatitude != null && account.baseLongitude != null ? { latitude: account.baseLatitude, longitude: account.baseLongitude } : null,
  )
  const [services, setServices] = useState<readonly CatalogService[]>([])
  const [offered, setOffered] = useState<readonly string[]>([])
  const [hours, setHours] = useState<readonly DayHours[]>(weekdayNames.map(() => ({ isWorking: false, startMinute: 480, endMinute: 1020 })))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAccount = account !== null

  useEffect(() => {
    const api = getB2cApi()
    api.listServices().then(setServices).catch(() => undefined)
    if (hasAccount) {
      api.workerServiceIds().then(setOffered).catch(() => undefined)
      api.workerHours().then((rows) => {
        setHours(weekdayNames.map((_name, weekday) => {
          const row = rows.find((candidate) => candidate.weekday === weekday)
          return row ? { isWorking: true, startMinute: row.startMinute, endMinute: row.endMinute } : { isWorking: false, startMinute: 480, endMinute: 1020 }
        }))
      }).catch(() => undefined)
    }
  }, [hasAccount])

  const save = async (): Promise<void> => {
    const radiusKm = Number(radius)
    if (base === null) {
      setError('Pin your starting point on the map so WashLink can match nearby bookings.')
      return
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 200) {
      setError('Enter a service radius from 1 to 200 km.')
      return
    }
    if (hours.some((day) => day.isWorking && day.endMinute <= day.startMinute)) {
      setError('Each working day must end after it starts.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const api = getB2cApi()
      await api.saveWorkerProfile({ bio: bio.trim(), skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean), latitude: base.latitude, longitude: base.longitude, radiusKm })
      await Promise.all(hours.map((day, weekday) => api.saveWorkerDay(workerId, weekday, day.isWorking ? day : null)))
      const current = await api.workerServiceIds()
      await Promise.all([
        ...offered.filter((id) => !current.includes(id)).map((id) => api.setWorkerService(workerId, id, true)),
        ...current.filter((id) => !offered.includes(id)).map((id) => api.setWorkerService(workerId, id, false)),
      ])
      toast.success('Profile saved')
      await onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Section title="About you">
        <Input label="Short bio" value={bio} maxLength={500} onChange={(event): void => { setBio(event.target.value) }} />
        <Input label="Skills and experience" helperText="Separate with commas." value={skills} onChange={(event): void => { setSkills(event.target.value) }} />
      </Section>
      <Section title="Service area" description="Pin where you usually start from. Customers never see this.">
        <LocationPickerMap pickedLocation={base} onPickedLocationChanged={setBase} heightClassName="h-60" overlayTitle="Choose your starting point" />
        <Input label="How far will you travel (km)?" inputMode="numeric" value={radius} onChange={(event): void => { setRadius(event.target.value) }} />
      </Section>
      <Section title="Services you offer">
        {services.map((service) => (
          <label key={service.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--color-ink-900)]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand-700)]" checked={offered.includes(service.id)}
              onChange={(event): void => { setOffered(event.target.checked ? [...offered, service.id] : offered.filter((id) => id !== service.id)) }} />
            {service.name}
          </label>
        ))}
      </Section>
      <Section title="Working hours" description="Customers can only book times inside these hours.">
        {mondayFirst.map((weekday) => {
          const day = hours[weekday]
          const change = (patch: Partial<DayHours>): void => { setHours(hours.map((item, index) => (index === weekday ? { ...item, ...patch } : item))) }
          return (
            <div key={weekdayNames[weekday]} className="grid grid-cols-2 items-end gap-2 border-b border-[var(--color-card-border)] pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_1fr_1fr]">
              <label className="col-span-2 flex min-h-11 sm:col-span-1 cursor-pointer items-center gap-3 text-sm text-[var(--color-ink-900)]">
                <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand-700)]" checked={day.isWorking} onChange={(event): void => { change({ isWorking: event.target.checked }) }} />
                {weekdayNames[weekday]}
              </label>
              {day.isWorking ? (
                <>
                  <Select label="From" options={hourOptions.slice(0, -1)} value={String(day.startMinute)} onChange={(event): void => { change({ startMinute: Number(event.target.value) }) }} />
                  <Select label="To" options={hourOptions.slice(1)} value={String(day.endMinute)} onChange={(event): void => { change({ endMinute: Number(event.target.value) }) }} />
                </>
              ) : null}
            </div>
          )
        })}
      </Section>
      {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
      <Button isLoading={isSaving} onClick={(): void => void save()}>Save profile</Button>
    </div>
  )
}
