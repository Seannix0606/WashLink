// Shared helper for the local API smokes (W13, D-70): super_admin audit reads go only through the audited
// admin_workforce_audit_log RPC. The W3 raw select policy is gone, so a raw `workforce_audit_events` select returns 0 rows
// for every client role and the review-log view is denied (42501).
//
//   const { data, error, calls } = await adminAuditRows(superAdminClient, { action: 'job_opening.deleted', subjectId })
//
// Filters (all optional): action (exact; a string or an array), actionPrefix, subjectType, subjectId (a uuid or an
// array), profileId, actorId, limit (page size 1..200, default 200). For each (action, subjectId) pair the helper PAGES
// with p_before_id (fix cycle 1, W13 N4) until a page is shorter than the page size, so an "event absent" check sees
// every matching row, not only the newest 200. It stops with an error after maxPages pages (default 50) instead of
// returning a silently truncated list. Every RPC call writes one workforce_audit.log_searched event after it reads its
// rows; `calls` is the number of RPC calls made (local stack only; the w14 smoke counts them). Returns
// { data, error, calls }: rows with `id` = event_id plus every RPC column, de-duplicated and ordered by id ascending (the
// order of the old raw reads); data is null when any call fails. Talks to nothing but the client it is given.

export async function adminAuditRows(client, filters = {}) {
  const { action, actionPrefix, subjectType, subjectId, profileId, actorId, limit = 200, maxPages = 50 } = filters
  const actions = action === undefined || action === null ? [null] : [action].flat()
  const subjectIds = subjectId === undefined || subjectId === null ? [null] : [subjectId].flat()
  const byId = new Map()
  let calls = 0
  for (const exactAction of actions) {
    for (const oneSubjectId of subjectIds) {
      let beforeId = null
      for (let page = 0; ; page += 1) {
        if (page >= maxPages) {
          return { data: null, error: { message: `adminAuditRows: more than ${maxPages} pages of ${limit}; narrow the filters` }, calls }
        }
        calls += 1
        const { data, error } = await client.rpc('admin_workforce_audit_log', {
          p_action_prefix: exactAction ?? actionPrefix ?? null,
          p_subject_type: subjectType ?? null,
          p_subject_id: oneSubjectId,
          p_profile_id: profileId ?? null,
          p_actor_id: actorId ?? null,
          p_before_id: beforeId,
          p_limit: limit,
        })
        if (error) return { data: null, error, calls }
        const pageRows = data ?? []
        for (const row of pageRows) {
          if (exactAction === null || row.action === exactAction) byId.set(row.event_id, { id: row.event_id, ...row })
        }
        if (pageRows.length < limit) break
        beforeId = Math.min(...pageRows.map((row) => Number(row.event_id)))
      }
    }
  }
  return { data: [...byId.values()].sort((a, b) => a.id - b.id), error: null, calls }
}
