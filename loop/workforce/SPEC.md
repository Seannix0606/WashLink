## 7A. NEW PRODUCT MODULE — WASHLINK WORKFORCE, JOB OPENINGS, TRAINING, CERTIFICATION & CONTRACTS

### Business objective

Extend WashLink beyond customer bookings into a workforce marketplace connecting car wash owners with qualified workers.

Build this as a properly integrated, secure, maintainable feature within the existing monorepo. Inspect the existing architecture first and reuse existing authentication, UI components, database conventions, and business logic wherever appropriate.

Do not implement this as disconnected mockup pages or placeholder buttons. Build complete workflows with persistent data, authorization, validation, clear statuses, and appropriate tests.

### A. User roles and registration

Audit the current authentication and user-role architecture before introducing changes.

Support the following roles, subject to the existing account model:

1. **Customer:** Books car wash services and manages their bookings.
2. **Car wash owner:** Manages a verified shop, creates job openings, reviews applicants, conducts or records training, issues certifications, and creates worker contracts.
3. **Worker:** Creates a worker profile, discovers job openings, applies for opportunities, completes required training, obtains certifications, and manages contractual relationships with car wash owners.
4. **Administrator:** If supported by the existing architecture, reviews reports, handles disputes, and manages appropriate platform-level moderation.

Registration requirements:

- Provide appropriate registration and onboarding flows for workers and car wash owners.
- Reuse the existing authentication provider wherever possible; do not create a competing authentication system.
- Store role-specific profile information separately from core authentication identities where appropriate.
- Support form validation, loading states, error recovery, duplicate-account handling, and email verification when supported by the current authentication system.
- Car wash owners must complete the applicable shop registration and verification process before publishing job openings or issuing official shop certifications.
- Workers should be able to create and update a professional profile with relevant experience, skills, preferred work locations, availability, and contact information.
- Collect only necessary personal information. Protect identity documents and private contact information.
- Enforce role permissions on the server or database, not just by hiding frontend controls.
- Prevent users from obtaining owner or administrator privileges simply by modifying client-side data.

### B. Car wash owner job-opening management

Create a complete job-opening management workflow for eligible car wash owners.

Owners should be able to:

- Create, edit, preview, publish, pause, close, and archive job openings for their own shop.
- Specify a job title, job description, duties, work location, number of openings, required skills, experience, availability, schedule, compensation, benefits, and other lawful employment terms as applicable.
- Define minimum qualifications, preferred qualifications, required training, and certification expectations.
- Specify whether applicants must already be certified or can apply as trainees.
- Set application deadlines and provide clear application instructions.
- Review applicants, view appropriate worker profiles, shortlist applicants, accept or reject applications, and record decisions.
- Communicate application status and next steps through an appropriate notification system if one exists.
- Track each opening's status and applicant pipeline.

Implement validation so owners cannot modify another owner's job openings or applicant records.

Display accurate job information to workers. Do not invent salaries, benefits, schedules, or employment guarantees.

### C. Worker job discovery and applications

Build a professional worker-facing job marketplace.

Workers should be able to:

- Browse available openings and view full job details.
- Search and filter by location, job type, schedule, compensation, required skills, certification status, and other available attributes.
- View required qualifications and training expectations before applying.
- Apply to an opening and provide relevant information.
- Track submitted applications and their statuses.
- Withdraw an application when permitted by the workflow.
- Avoid accidental duplicate applications.
- Receive clear feedback when an opening closes or an application cannot proceed.
- View their accepted offers, required training, certifications, and active contractual relationships.

Use explicit, auditable application states, such as draft, submitted, under review, shortlisted, accepted, rejected, withdrawn, and closed where appropriate. Define and validate permitted transitions.

Do not allow a worker to claim a qualification or certification that has not been verified.

### D. Minimum three-day training and certification

Implement a structured training and certification workflow.

Business requirement: workers must complete at least three days of required training before receiving the relevant car wash certification.

The training module should support:

- Training enrollment and acceptance.
- A training plan with a minimum duration of three days.
- Training objectives, skills to learn, schedules, trainer or responsible owner, attendance records, and completion evidence.
- Per-day attendance and progress tracking.
- Trainer or authorized owner confirmation of completion.
- A final competency assessment or checklist appropriate to the role.
- A clear training status, such as not enrolled, scheduled, in progress, awaiting assessment, completed, failed, or cancelled.
- A certification decision based on the actual required training and assessment, not merely the passage of three calendar days.
- A record of who approved the certification and when.
- Certification issuance and expiration or renewal rules when applicable.
- A way to revoke or suspend a certification when justified, with an audit trail and an appropriate review process.

Training must not be marked complete just because a worker enrolled or an owner clicked a generic completion button. Record the required attendance and assessment evidence.

#### Free-training requirement

The intended product rule is that the required minimum three-day training is free to the worker.

- Display this requirement clearly before a worker enrolls.
- Do not charge the worker a platform fee or training fee for the required initial training.
- Do not implement a payment or deduction mechanism that circumvents this rule.
- Do not introduce an unpaid labor arrangement disguised as training.
- Clearly distinguish supervised training and competency assessment from productive work.
- Have the system record the training arrangement, dates, responsible shop, and agreed terms.
- Allow lawful compensation or reimbursement where applicable, rather than hardcoding that all training must be unpaid.
- Flag any proposed training arrangement or contract terms requiring legal review.

Before launch in the Philippines, verify that the proposed training model, duration, compensation treatment, and certification process comply with applicable labor, wage, occupational safety, and training requirements. Do not represent a platform-issued or shop-issued certificate as a government-recognized credential unless that recognition has been verified.

### E. Editable standard contract templates

Build a reusable contract-template feature for car wash owners.

Create a professionally structured, editable starter template that owners can review and customize for each worker relationship. The template should be a draft for legal review, not a claim that the document is already legally compliant.

The template should include appropriate sections for:

1. Parties and verified identities.
2. Car wash business and work location.
3. Role, responsibilities, and scope of work.
4. Contract type and legal classification, to be selected only when appropriate.
5. Start date, duration, and renewal terms.
6. Work schedule and availability.
7. Compensation, payment frequency, and lawful deductions, if any.
8. Training requirements, the minimum three-day training process, and certification conditions.
9. Worker and owner obligations.
10. Occupational safety, protective equipment, and workplace rules.
11. Customer privacy, confidential information, and responsible data handling.
12. Leave, absences, termination, notice, and dispute resolution as applicable.
13. Applicable statutory benefits, contributions, and other mandatory rights when legally required.
14. Acknowledgment, acceptance, signatures, and dated copies.
15. Attachments or shop-specific terms.

Owners must be able to:

- Preview the template before using it.
- Customize editable clauses and add appropriate shop-specific terms.
- Save their own reusable template versions.
- Create a contract draft for a specific worker and shop.
- Compare the final draft with the standard template.
- Record the parties' review and acceptance.
- Track draft, sent for review, accepted, declined, active, expired, and terminated statuses as appropriate.
- Retain an immutable copy or version snapshot of each accepted agreement.
- Access the contract history and audit trail, subject to authorization.

Protect workers from silent contract modifications. Once a contract has been accepted, changes must create a new version or amendment and require the applicable parties' consent.

Do not fabricate electronic signatures or claim that clicking a checkbox always satisfies applicable electronic-signature requirements. If a compliant signature provider is not configured, implement a clearly labeled draft-and-acceptance workflow and document the remaining integration requirement.

#### Contract safety and legal review

- Clearly identify the starter document as a template requiring review.
- Do not silently classify every worker as an independent contractor.
- Support the correct relationship type only after appropriate legal and business requirements are established.
- Do not generate unlawful waivers of mandatory worker rights.
- Do not permit owners to edit system safeguards or platform rules through custom clauses.
- Keep contract contents private to authorized parties.
- Require explicit consent to applicable final terms.
- Flag potentially problematic terms for review rather than claiming automatic legal validation.
- Ensure the final template and workflow are reviewed by a qualified Philippine labor-law professional before production use.

### F. Workers may contract with at least three car wash owners

Business requirement: a worker should be able to establish contractual relationships with a minimum of three different car wash owners.

Design this carefully. Do not implement the requirement by allowing duplicate contracts with the same owner to count as separate relationships.

Requirements:

- Track worker-to-owner contractual relationships independently from job applications.
- Count distinct eligible car wash owners, not contract documents, shops, job openings, or individual contract amendments.
- Ensure the three-owner count uses unique verified owner identities and the appropriate qualifying relationship status.
- Make the current count and remaining number of required owner relationships visible to the worker.
- Provide a workflow for discovering additional eligible owners and managing contract offers.
- Allow owners to manage their own agreements without accessing unrelated owners' contracts.
- Prevent duplicate or conflicting records from inflating the count.
- Define the effect of declined, expired, suspended, terminated, and revoked agreements on the count.
- Maintain an audit trail for relationship status changes.
- Do not fabricate agreements, automatically sign contracts, or mark an owner relationship active without the required acceptance and verification.

Before implementing this rule, inspect the existing product requirements and determine what the three-owner minimum is intended to mean operationally and legally.

Model the minimum-three-owner rule as a configurable business policy where appropriate, but do not silently change the specified default of three.

Do not prevent a worker from exercising lawful rights to leave a relationship, decline an offer, or terminate an agreement in accordance with applicable law. If the minimum cannot lawfully or practically be enforced as a condition of employment or platform participation, flag that limitation and propose a compliant alternative rather than implementing a coercive restriction.

Distinguish the business goal of maintaining relationships with three owners from any legally enforceable obligation to work for three employers simultaneously.

### G. Database, API, and authorization architecture

Before implementing this module, inspect the existing Supabase schema, migrations, authentication model, backend service, and authorization policies.

Design a normalized, maintainable data model for the new workflows. Depending on the existing architecture, entities may include:

- Worker profiles.
- Owner and shop relationships.
- Job openings.
- Job applications.
- Training programs and sessions.
- Training attendance and assessment records.
- Certification records.
- Contract templates and template versions.
- Worker contracts and contract amendments.
- Contract acceptance records.
- Notifications.
- Audit events.

These are conceptual entities, not a requirement to create a table for every item without justification.

Requirements:

- Define primary keys, foreign keys, uniqueness constraints, indexes, timestamps, and lifecycle statuses appropriately.
- Enforce tenant and record-level access controls.
- Apply server-side validation and database constraints where appropriate.
- Preserve the existing booking system and historical data.
- Follow the repository's migration naming and ordering conventions.
- Add new migrations instead of rewriting already-applied historical migrations.
- Inspect Supabase RLS policies for every new sensitive table and storage resource.
- Prevent unauthorized workers or owners from reading or modifying other parties' private information.
- Validate authorization in backend operations as well as frontend routes.
- Avoid duplicating authentication identities across systems.
- Keep migrations reversible where practical and provide a documented rollback or recovery strategy.
- Use test data only in local or isolated test environments.

If the FastAPI service remains a scaffold and Supabase currently owns the relevant application data, follow the actual source-of-truth architecture. Do not create a second, conflicting workforce database simply because the backend supports SQLAlchemy.

### H. UI/UX and navigation integration

Integrate workforce features into WashLink's existing visual system.

Create appropriate role-aware navigation and dashboards.

Worker dashboard:
- Profile completion.
- Recommended and available jobs.
- Application pipeline.
- Training schedule and attendance.
- Certification status.
- Contract offers and active relationships.
- Progress toward the three-distinct-owner business requirement.

Car wash owner dashboard:
- Shop verification status.
- Job-opening management.
- Applicant pipeline.
- Worker profiles and qualifications.
- Training schedules and completion records.
- Certification decisions.
- Contract-template management.
- Contract drafts, acceptance, and active relationships.

Administrator dashboard, if supported:
- Appropriate review queues.
- Reported or disputed relationships.
- Certification and document review where authorized.
- Audit logs and platform-policy enforcement.

Make each dashboard useful rather than overcrowded. Prioritize the next action, show accurate counts, and provide complete loading, empty, success, and error states.

Use responsive layouts, accessible forms, clear status indicators, and reusable components. Hide irrelevant actions from the UI, but always enforce permissions in the data and service layers.

### I. Notifications and auditability

If the existing application supports notifications, extend the established system. Otherwise, implement a minimal reliable notification mechanism only if it fits the current architecture.

Notify the appropriate parties of relevant events, including:
- Application status changes.
- Interview or training scheduling.
- Training completion and assessment results.
- Certification issuance, expiration, or revocation.
- Contract offers and responses.
- Contract amendments requiring consent.
- Contract expiration and termination events.

Avoid duplicate notifications and do not expose private contract details through insecure notification channels.

Record sensitive actions such as contract acceptance, amendments, certification issuance, revocation, and owner verification in an appropriate audit trail.

### J. Workforce acceptance tests

Create automated tests for at least these scenarios:

1. A worker can register and manage an authorized worker profile.
2. A car wash owner can create and manage only their own job openings.
3. An unverified or unauthorized owner cannot publish restricted openings or issue official shop certifications.
4. A worker can browse openings and apply without creating duplicate applications.
5. Application status transitions are validated.
6. A worker cannot receive certification without the required minimum three-day training and required assessment evidence.
7. Required initial training does not charge the worker a training fee.
8. Unauthorized users cannot alter training attendance, assessment results, or certification records.
9. An owner can customize a contract draft and save a reusable template version.
10. Accepted contract contents remain historically preserved after a later template change.
11. Material contract amendments require the appropriate acceptance.
12. Worker and owner permissions prevent cross-account access to private contracts.
13. Three separate qualifying owner relationships are counted correctly.
14. Multiple contracts or amendments with the same owner count as one distinct owner relationship.
15. Declined, expired, suspended, and terminated agreements follow the explicitly defined counting policy.
16. A worker's lawful ability to decline or terminate a contract is not bypassed by the three-owner business rule.
17. Database constraints and authorization policies prevent unauthorized data access.
18. Existing customer booking, shop pricing, verification, and rating workflows continue to work.

Adapt test names and implementation details to the actual codebase. Use isolated test data and mocks for external services when necessary.

### K. Workforce module definition of done

The module is not complete merely because registration and job-opening screens exist.

It must have:
- Complete role-aware frontend flows.
- Persistent data and validated lifecycle transitions.
- Appropriate database migrations and authorization policies.
- Working job-opening and application workflows.
- Training records with a minimum three-day requirement.
- Evidence-based certification issuance.
- Editable, versioned contract templates and contract records.
- Correct distinct-owner relationship counting.
- Tests for access control, business rules, and regressions.
- Documented limitations and outstanding legal review requirements.

Do not deploy this feature or apply migrations to a shared or production database without explicit authorization.

Integrate this module into the existing Loop Engineering task plan. Implement it in small, independently verifiable increments, preserve the existing booking functionality, and report actual test results.