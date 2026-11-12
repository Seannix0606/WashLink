-- =============================================================
-- WashLink notification reference fix (NFA-1): booking status notifications no longer drop for digit-heavy references.
-- A booking reference is 'WL-' + 8 hex characters. When all 8 are digits (about 1 booking in 20), the title
-- 'Booking WL-81904306' holds a 7+ digit run, which notification_text_is_safe treats as a phone number. The
-- notifications CHECK then failed (23514), enqueue_notification_safely turned that into a warning, and the customer
-- and washer never heard about the status change.
-- Fix: service_booking_record_transition keeps 'Booking <reference>' when that text is safe and otherwise names the
-- service instead ('Your <service name> booking', the service name passed through notification_safe_label).
-- notification_text_is_safe is unchanged: it still keeps phone numbers out of every notification.
-- Body text, idempotency keys, the search_path pin and the grants (none: internal only) are as in b2ch.
-- Additive: no committed migration changes.
-- =============================================================

create or replace function public.service_booking_record_transition(p_booking uuid, p_to text, p_actor_kind text,
  p_reason text default null)
returns public.service_bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.service_bookings;
  after_row public.service_bookings;
  label text;
  notice_title text;
begin
  select * into before_row from public.service_bookings where id = p_booking for update;
  update public.service_bookings set status = p_to,
    completed_at = case when p_to = 'completed' then now() else completed_at end,
    worker_id = case when p_to = 'searching_for_worker' then null else worker_id end
    where id = p_booking returning * into after_row;
  insert into public.service_booking_status_events (booking_id, from_status, to_status, actor_id, actor_kind, reason)
    values (p_booking, before_row.status, p_to, case when p_actor_kind = 'system' then null else auth.uid() end, p_actor_kind, p_reason);
  perform public.record_workforce_audit_event('service_booking.status_changed', 'service_booking', p_booking,
    after_row.customer_id, jsonb_build_object('from_status', before_row.status, 'to_status', p_to, 'changed_by', p_actor_kind));
  label := case p_to
    when 'searching_for_worker' then 'We are finding a washer for your booking.'
    when 'accepted' then 'A washer accepted your booking.'
    when 'worker_on_the_way' then 'Your washer is on the way.'
    when 'arrived' then 'Your washer has arrived.'
    when 'in_progress' then 'Your wash has started.'
    when 'completed' then 'Your wash is complete. You can rate it now.'
    when 'cancelled' then 'Your booking was cancelled.'
    when 'expired' then 'Your booking expired.'
    when 'no_worker_available' then 'No washer is available yet. You can search again or cancel.'
  end;
  -- A reference whose hex part is all digits reads as a phone number; name the service instead.
  notice_title := case
    when public.notification_text_is_safe('Booking ' || after_row.reference) then 'Booking ' || after_row.reference
    else 'Your ' || public.notification_safe_label(after_row.service_name, 'car wash') || ' booking'
  end;
  if label is not null and after_row.customer_id is not null and p_actor_kind <> 'customer' then
    perform public.enqueue_notification_safely(after_row.customer_id, 'service_booking.update', notice_title,
      label, 'service_booking:' || p_booking || ':' || after_row.revision, 'service_booking', p_booking);
  end if;
  if p_to in ('cancelled', 'searching_for_worker') and before_row.worker_id is not null and p_actor_kind <> 'worker' then
    perform public.enqueue_notification_safely(before_row.worker_id, 'service_booking.update', notice_title,
      'This booking is no longer assigned to you.', 'service_booking:' || p_booking || ':' || after_row.revision || ':worker',
      'service_booking', p_booking);
  end if;
  return after_row;
end;
$$;

revoke all on function public.service_booking_record_transition(uuid, text, text, text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ROLLBACK: re-run the service_booking_record_transition definition from 2026_11_06_b2ch_search_rounds_and_dispatch.sql.
