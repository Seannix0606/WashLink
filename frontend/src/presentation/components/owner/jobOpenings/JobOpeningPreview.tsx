import type { ReactElement, ReactNode } from 'react'
import { Briefcase, CalendarDays, Eye, MapPin, Users } from 'lucide-react'
import type { JobOpeningContent } from '../../../../domain/models/JobOpening'
import {
  applicantRequirementLabels,
  formatCalendarDate,
  formatCompensationAsEntered,
  formatMinimumYearsExperience,
  jobOpeningDetailsDisclaimer,
  jobTypeLabels,
  notSpecifiedByShopText,
} from '../../../utilities/jobOpeningDisplay'

interface JobOpeningPreviewProps {
  readonly jobOpeningContent: JobOpeningContent
  readonly shopName: string
  /** Owner preview banner; W5 reuses this view for workers without it. */
  readonly isOwnerPreview: boolean
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

export function JobOpeningPreview({
  jobOpeningContent: content,
  shopName,
  isOwnerPreview,
}: JobOpeningPreviewProps): ReactElement {
  const compensationLines = formatCompensationAsEntered(content)

  return (
    <article aria-label="Job opening preview" className="space-y-4">
      {isOwnerPreview ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] px-3 py-2 text-xs font-medium text-[var(--color-brand-800)]">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview - workers see this after you publish
        </p>
      ) : null}

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
    </article>
  )
}
