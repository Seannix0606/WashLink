import * as Location from 'expo-location'
import { useEffect, useState, type ReactElement } from 'react'
import type { CatalogService, WorkerVerificationStatus } from '@washlink/shared'
import { useUserId } from '../../src/lib/AuthProvider'
import { api, errorMessage } from '../../src/lib/api'
import { Body, Button, Card, Choice, Field, Heading, Notice, Row, Screen, Title } from '../../src/ui'
import { PinMap } from '../../src/ui/PinMap'
import { WorkerDocumentsSection } from '../../src/features/worker/WorkerDocumentsSection'

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayHours {
  readonly isWorking: boolean
  readonly startHour: number
  readonly endHour: number
}

const defaultDay: DayHours = { isWorking: false, startHour: 8, endHour: 17 }

function HourStepper({ label, value, min, max, onChange }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly onChange: (next: number) => void }): ReactElement {
  return (
    <Row>
      <Body>{label} {String(value).padStart(2, '0')}:00</Body>
      <Button label={`Earlier ${label}`} variant="secondary" isDisabled={value <= min} onPress={(): void => { onChange(value - 1) }} />
      <Button label={`Later ${label}`} variant="secondary" isDisabled={value >= max} onPress={(): void => { onChange(value + 1) }} />
    </Row>
  )
}

export default function WorkerSetup(): ReactElement {
  const workerId = useUserId()
  const [bio, setBio] = useState('')
  const [skills, setSkills] = useState('')
  const [radius, setRadius] = useState('10')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [services, setServices] = useState<readonly CatalogService[]>([])
  const [offered, setOffered] = useState<readonly string[]>([])
  const [hours, setHours] = useState<readonly DayHours[]>(weekdayNames.map(() => defaultDay))
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Undefined until the account has loaded, so the section can't claim that no profile exists.
  const [accountStatus, setAccountStatus] = useState<WorkerVerificationStatus | null | undefined>(undefined)
  const [isPlatformOperator, setIsPlatformOperator] = useState(false)

  useEffect(() => {
    // The session loads after the first render, and an empty id is not a washer with no profile.
    if (workerId === '') {
      return
    }
    void (async (): Promise<void> => {
      setServices(await api.listServices())
      const account = await api.workerAccount(workerId)
      setAccountStatus(account?.verificationStatus ?? null)
      setIsPlatformOperator(account?.isPlatformOperator === true)
      if (account === null) {
        return
      }
      setBio(account.bio)
      setSkills(account.skills.join(', '))
      setRadius(String(account.serviceRadiusKm))
      setLatitude(account.baseLatitude)
      setLongitude(account.baseLongitude)
      const [ids, rows] = await Promise.all([api.workerServiceIds(), api.workerHours()])
      setOffered(ids)
      setHours(weekdayNames.map((_name, weekday) => {
        const row = rows.find((candidate) => candidate.weekday === weekday)
        return row ? { isWorking: true, startHour: Math.floor(row.startMinute / 60), endHour: Math.floor(row.endMinute / 60) } : defaultDay
      }))
    })().catch((caught: unknown) => { setError(errorMessage(caught)) })
  }, [workerId])

  const useMyLocation = async (): Promise<void> => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) {
      setNotice('Location permission was not given. Pin your starting point on the map instead.')
      return
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLatitude(position.coords.latitude)
      setLongitude(position.coords.longitude)
    } catch {
      setNotice('Your location could not be found. Pin your starting point on the map instead.')
    }
  }

  const save = async (): Promise<void> => {
    const radiusKm = Number(radius)
    if (latitude === null) {
      setError('Pin your starting point on the map so WashLink can match nearby bookings.')
      return
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 200) {
      setError('Enter a service radius from 1 to 200 km.')
      return
    }
    if (hours.some((day) => day.isWorking && day.endHour <= day.startHour)) {
      setError('Each working day must end after it starts.')
      return
    }
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      await api.saveWorkerProfile({ bio: bio.trim(), skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean), latitude, longitude, radiusKm })
      await Promise.all(hours.map((day, weekday) => api.saveWorkerDay(workerId, weekday, day.isWorking ? { startMinute: day.startHour * 60, endMinute: day.endHour * 60 } : null)))
      const current = await api.workerServiceIds()
      await Promise.all([
        ...offered.filter((id) => !current.includes(id)).map((id) => api.setWorkerService(workerId, id, true)),
        ...current.filter((id) => !offered.includes(id)).map((id) => api.setWorkerService(workerId, id, false)),
      ])
      setAccountStatus((await api.workerAccount(workerId))?.verificationStatus ?? null)
      setNotice('Profile saved.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Screen>
      <Title>Profile and hours</Title>
      {isPlatformOperator ? (
        <Body>This is a WashLink operator account, so it needs no verification documents. You can accept, run and cancel bookings.</Body>
      ) : accountStatus !== undefined ? <WorkerDocumentsSection verificationStatus={accountStatus} /> : null}
      <Field label="Short bio" value={bio} maxLength={500} onChangeText={setBio} />
      <Field label="Skills and experience" helper="Separate with commas." value={skills} onChangeText={setSkills} />
      <Heading>Service area</Heading>
      <Body muted>Pin where you usually start from. Customers never see this.</Body>
      <PinMap latitude={latitude} longitude={longitude} onPick={(nextLatitude, nextLongitude): void => { setLatitude(nextLatitude); setLongitude(nextLongitude) }} />
      <Button label="Use my location" variant="secondary" onPress={(): void => void useMyLocation()} />
      <Field label="How far will you travel (km)?" keyboardType="number-pad" value={radius} onChangeText={setRadius} />
      <Heading>Services you offer</Heading>
      {services.map((service) => {
        const isOffered = offered.includes(service.id)
        return <Choice key={service.id} isCheckbox label={service.name} isSelected={isOffered} onPress={(): void => { setOffered(isOffered ? offered.filter((id) => id !== service.id) : [...offered, service.id]) }} />
      })}
      <Heading>Working hours</Heading>
      {hours.map((day, weekday) => {
        const change = (patch: Partial<DayHours>): void => { setHours(hours.map((item, index) => (index === weekday ? { ...item, ...patch } : item))) }
        return (
          <Card key={weekdayNames[weekday]}>
            <Choice isCheckbox label={weekdayNames[weekday]} isSelected={day.isWorking} onPress={(): void => { change({ isWorking: !day.isWorking }) }} />
            {day.isWorking ? (
              <>
                <HourStepper label="start" value={day.startHour} min={0} max={23} onChange={(startHour): void => { change({ startHour }) }} />
                <HourStepper label="end" value={day.endHour} min={1} max={24} onChange={(endHour): void => { change({ endHour }) }} />
              </>
            ) : null}
          </Card>
        )
      })}
      <Notice tone="error" message={error} />
      <Notice message={notice} />
      <Button label="Save profile" isLoading={isBusy} onPress={(): void => void save()} />
    </Screen>
  )
}
