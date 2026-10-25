import type { ReactElement, ReactNode } from 'react'
import { Briefcase, CalendarDays, MapPin, Users } from 'lucide-react'
import type { JobOpeningContent } from '../../../domain/models/JobOpening'
import {
  applicantRequirementLabels,
  formatCalendarDate,
  formatCompensationAsEntered,
  formatMinimumYearsExperience,
  jobOpeningDetailsDisclaimer,
  jobTypeLabels,
  notSpecifiedByShopText,
} from '../../utilities/jobOpeningDisplay'

interface JobOpeningDetailsViewProps {
  readonly jobOpeningContent: JobOpeningContent
  readonly shopName: string
}

function PreviewSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}): ReactElement {
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{title}</h4>
      <div className="space-y-1 text-sm text-[var(--color-ink-700)]">{children}</div>
    </section>
  )
}

/** Owner text is rendered as plain text (never HTML), keeping its line breaks. */
function PlainText({ text }: { readonly text: string | null }): ReactElement {
  return (
    <p className="whitespace-pre-line break-words">{text ?? notSpecifiedByShopText}</p>
  )
}

function PlainList({
  items,
  accessibleLabel,
}: {
  readonly items: readonly string[]
  readonly accessibleLabel: string
}): ReactElement {
  if (items.length === 0) {
    return <p>{notSpecifiedByShopText}</p>
  }
  return (
    <ul aria-label={accessibleLabel} className="list-disc space-y-0.5 pl-5">
      {items.map((listItem) => (
        <li key={listItem} className="break-words">
          {listItem}
        </li>
      ))}
    </ul>
  )
}

function FactLine({ icon, text }: { readonly icon: ReactNode; readonly text: string }): ReactElement {
  return (
    <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-700)]">
      <span aria-hidden="true" className="text-[var(--color-ink-500)]">
        {icon}
      </span>
      <span className="break-words">{text}</span>
    </p>
  )
}

/**
 * Read-only opening content, shared by the owner preview, the worker marketplace detail
 * and the application snapshot. Every value is shown as entered; missing ones read
 * "Not specified by the shop".
 */
export function JobOpeningDetailsView({
  jobOpeningContent: content,
  shopName,
}: JobOpeningDetailsViewProps): ReactElement {
  const compensationLines = formatCompensationAsEntered(content)

  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <h3 className="text-lg font-semibold break-words text-[var(--color-ink-900)]">
          {content.title.length > 0 ? content.title : 'Untitled job opening'}
        </h3>
        <p className="text-sm font-medium text-[var(--color-ink-700)]">{shopName}</p>
        <FactLine
          icon={<Briefcase className="h-4 w-4" />}
          text={content.jobType === null ? `Job type: ${notSpecifiedByShopText}` : jobTypeLabels[content.jobType]}
        />
        <FactLine
          icon={<MapPin className="h-4 w-4" />}
          text={content.workLocation ?? `Work location: ${notSpecifiedByShopText}`}
        />
        <FactLine
          icon={<Users className="h-4 w-4" />}
          text={
            content.openingsCount === null
              ? `Openings: ${notSpecifiedByShopText}`
              : `${String(content.openingsCount)} ${content.openingsCount === 1 ? 'opening' : 'openings'}`
          }
        />
      </header>

      <PreviewSection title="About the job">
        <PlainText text={content.description} />
      </PreviewSection>
      <PreviewSection title="Duties">
        <PlainList items={content.duties} accessibleLabel="Duties" />
      </PreviewSection>

      <PreviewSection title="Pay">
        {compensationLines.map((compensationLine) => (
          <p key={compensationLine} className="whitespace-pre-line break-words">
            {compensationLine}
          </p>
        ))}
      </PreviewSection>
      <PreviewSection title="Schedule">
        <PlainText text={content.scheduleDetails} />
      </PreviewSection>
      <PreviewSection title="Benefits">
        <PlainText text={content.benefits} />
      </PreviewSection>
      <PreviewSection title="Other terms">
        <PlainText text={content.otherTerms} />
      </PreviewSection>
      <p className="text-xs text-[var(--color-ink-500)]">{jobOpeningDetailsDisclaimer}</p>

      <PreviewSection title="Who can apply">
        <p>
          {content.applicantRequirement === null
            ? notSpecifiedByShopText
            : applicantRequirementLabels[content.applicantRequirement]}
        </p>
        {content.certificationExpectations !== null ? (
          <PlainText text={content.certificationExpectations} />
        ) : null}
      </PreviewSection>
      <PreviewSection title="Required skills">
        <PlainList items={content.requiredSkills} accessibleLabel="Required skills" />
      </PreviewSection>
      <PreviewSection title="Experience">
        {content.minimumYearsExperience !== null ? (
          <p>{formatMinimumYearsExperience(content.minimumYearsExperience)}</p>
        ) : null}
        <PlainText text={content.experienceRequirement} />
      </PreviewSection>
      <PreviewSection title="Availability">
        <PlainText text={content.availabilityRequirement} />
      </PreviewSection>
      <PreviewSection title="Minimum qualifications">
        <PlainList items={content.minimumQualifications} accessibleLabel="Minimum qualifications" />
      </PreviewSection>
      <PreviewSection title="Preferred qualifications">
        <PlainList items={content.preferredQualifications} accessibleLabel="Preferred qualifications" />
      </PreviewSection>
      <PreviewSection title="Required training">
        <PlainText text={content.requiredTraining} />
      </PreviewSection>

      <PreviewSection title="How to apply">
        <FactLine
          icon={<CalendarDays className="h-4 w-4" />}
          text={
            content.applicationDeadline === null
              ? `Deadline: ${notSpecifiedByShopText}`
              : `Applications accepted through ${formatCalendarDate(content.applicationDeadline)} (Philippine time)`
          }
        />
        <PlainText text={content.applicationInstructions} />
      </PreviewSection>
    </div>
  )
}
