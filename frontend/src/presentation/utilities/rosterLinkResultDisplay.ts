import type {
  RosterLinkPreviewResult,
  RosterLinkResult,
} from '../../domain/models/RosterLink'

type RosterLinkOutcome = RosterLinkPreviewResult | RosterLinkResult

const rosterLinkOutcomeMessages: Readonly<Record<RosterLinkOutcome, string>> = {
  valid: 'Code found. Check the shop details before you link your account.',
  linked: 'Your account is now linked to this shop roster.',
  invalid_or_expired:
    'This code is not valid or has expired. Ask the shop owner for a new code.',
  rate_limited: 'Too many attempts. Please wait an hour, then try again.',
  already_linked_to_owner:
    'Your account is already linked to a roster entry of this shop owner.',
}

export function describeRosterLinkOutcome(rosterLinkOutcome: RosterLinkOutcome): string {
  return rosterLinkOutcomeMessages[rosterLinkOutcome]
}

export const rosterLinkConsentNotice =
  'Linking lets this shop assign bookings to you in WashLink. WashLink does not record this link as a contract or employment agreement. You can unlink at any time.'

export const rosterLinkRecordNotice =
  'These shops can assign bookings to you. WashLink does not record a roster link as a contract or employment agreement.'
