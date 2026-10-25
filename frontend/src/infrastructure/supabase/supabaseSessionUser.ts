import { getSupabaseClient } from './supabaseClient'

/** The signed-in user's id, used only to filter reads (RLS still decides what is returned). */
export async function readSessionUserIdentifier(signInAgainMessage: string): Promise<string> {
  const {
    data: { session },
    error,
  } = await getSupabaseClient().auth.getSession()
  if (error || !session?.user) {
    throw new Error(signInAgainMessage)
  }
  return session.user.id
}
