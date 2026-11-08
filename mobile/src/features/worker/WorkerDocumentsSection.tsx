import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  WORKER_DOCUMENT_NOTICE,
  formatManilaDateTime,
  workerCanUploadDocuments,
  workerDocumentApprovedCopyNote,
  workerDocumentHeicMessage,
  workerDocumentStatusLabel,
  type WorkerDocumentSlot,
  type WorkerVerificationStatus,
} from '@washlink/shared'
import { api, errorMessage } from '../../lib/api'
import { Badge, Body, Button, Card, Heading, Notice, Row } from '../../ui'
import { pickWorkerDocumentPhoto, type PhotoSource } from './workerDocumentPicker'

function DocumentCard({ slot, canUpload, onChanged }: { readonly slot: WorkerDocumentSlot; readonly canUpload: boolean; readonly onChanged: () => Promise<void> }): ReactElement {
  const [busySource, setBusySource] = useState<PhotoSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const approvedCopyNote = workerDocumentApprovedCopyNote(slot)
  const tone = slot.status === 'approved' ? 'success' : slot.status === 'rejected' ? 'warning' : 'info'

  const send = async (source: PhotoSource): Promise<void> => {
    setBusySource(source)
    setError(null)
    setNotice(null)
    try {
      const picked = await pickWorkerDocumentPhoto(source)
      if (picked.kind === 'problem') {
        setError(picked.message)
      }
      if (picked.kind === 'picked') {
        await api.uploadWorkerDocument(slot.documentType, picked.bytes)
        setNotice(`${slot.label} sent for review.`)
        await onChanged()
      }
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message === workerDocumentHeicMessage ? `${message} You can also use Take photo.` : message)
    } finally {
      setBusySource(null)
    }
  }

  return (
    <Card>
      <Heading>{slot.label}</Heading>
      <Badge label={workerDocumentStatusLabel(slot.status)} tone={tone} />
      <Body>{slot.instructions}</Body>
      {slot.isRequired ? <Body muted>WashLink needs this before it can verify your account.</Body> : null}
      {slot.submittedAt !== null ? <Body muted>Sent {formatManilaDateTime(slot.submittedAt)}</Body> : null}
      {slot.status === 'rejected' && slot.reviewReason !== null ? <Body>WashLink&apos;s reason: {slot.reviewReason}</Body> : null}
      {approvedCopyNote !== null ? <Body muted>{approvedCopyNote}</Body> : null}
      <Notice tone="error" message={error} />
      <Notice message={notice} />
      {canUpload ? (
        <Row>
          <Button label={`Take photo of ${slot.label}`} isLoading={busySource === 'camera'} isDisabled={busySource !== null} onPress={(): void => void send('camera')} />
          <Button label={`Choose photo of ${slot.label}`} variant="secondary" isLoading={busySource === 'library'} isDisabled={busySource !== null} onPress={(): void => void send('library')} />
        </Row>
      ) : null}
    </Card>
  )
}

/** Shows status only and never the file: a washer can't read an upload back (D-119). The server decides who can upload (D-111). */
export function WorkerDocumentsSection({ verificationStatus }: { readonly verificationStatus: WorkerVerificationStatus | null }): ReactElement {
  const [slots, setSlots] = useState<readonly WorkerDocumentSlot[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setSlots(await api.myWorkerDocuments())
      setLoadError(null)
    } catch (caught) {
      setLoadError(errorMessage(caught))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const canUpload = workerCanUploadDocuments(verificationStatus)

  return (
    <>
      <Heading>Verification photos</Heading>
      <Body muted>{WORKER_DOCUMENT_NOTICE}</Body>
      {verificationStatus === null ? <Notice message="Save your washer profile below first. You can upload these photos after that." /> : null}
      {verificationStatus === 'suspended' ? <Notice message="WashLink has paused your account, so you can't upload photos right now." /> : null}
      {slots === null && loadError === null ? <Body muted>Loading your photos…</Body> : null}
      <Notice tone="error" message={loadError} />
      {loadError !== null ? <Button label="Try again" variant="secondary" onPress={(): void => void load()} /> : null}
      {slots !== null && slots.length === 0 ? <Body muted>WashLink isn&apos;t asking for any photos right now.</Body> : null}
      {slots?.map((slot) => <DocumentCard key={slot.documentType} slot={slot} canUpload={canUpload} onChanged={load} />)}
    </>
  )
}
