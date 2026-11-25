import {getSupabaseClient} from './supabaseClient';

export type RecoveryEventType =
  | 'recovery_requested'
  | 'otp_verified'
  | 'password_changed';

export async function recordRecoveryEvent(input: {
  email: string;
  eventType: RecoveryEventType;
  userId?: string | null;
}): Promise<void> {
  const trimmedEmail = input.email.trim();
  if (!trimmedEmail) {
    return;
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase || typeof supabase.from !== 'function') {
      return;
    }

    await supabase.from('recovery_events').insert([
      {
        user_id: input.userId ?? null,
        email: trimmedEmail,
        event_type: input.eventType,
      },
    ]);
  } catch {
    // Never interrupt recovery flow if optional audit table has not been created yet
  }
}

export async function syncUserProfile(input: {
  userId: string;
  email: string;
}): Promise<void> {
  const trimmedEmail = input.email.trim();
  if (!input.userId || !trimmedEmail) {
    return;
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase || typeof supabase.from !== 'function') {
      return;
    }

    await supabase.from('profiles').upsert(
      {
        id: input.userId,
        email: trimmedEmail,
        updated_at: new Date().toISOString(),
      },
      {onConflict: 'id'},
    );
  } catch {
    // Non-blocking profile sync
  }
}
