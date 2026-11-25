import {getSupabaseClient} from './supabaseClient';

export type RecoveryEventType =
  | 'recovery_requested'
  | 'otp_verified'
  | 'password_changed';

export interface SupabaseWriteResult {
  ok: boolean;
  error?: string;
}

export async function recordRecoveryEvent(input: {
  email: string;
  eventType: RecoveryEventType;
  userId?: string | null;
}): Promise<SupabaseWriteResult> {
  const trimmedEmail = input.email.trim();
  if (!trimmedEmail) {
    return {ok: false, error: 'Missing email'};
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase || typeof supabase.from !== 'function') {
      return {ok: false, error: 'Supabase client is not configured'};
    }

    const {error} = await supabase.from('recovery_events').insert([
      {
        user_id: input.userId ?? null,
        email: trimmedEmail,
        event_type: input.eventType,
      },
    ]);

    if (error) {
      return {ok: false, error: error.message};
    }

    return {ok: true};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export async function syncUserProfile(input: {
  userId: string;
  email: string;
}): Promise<SupabaseWriteResult> {
  const trimmedEmail = input.email.trim();
  if (!input.userId || !trimmedEmail) {
    return {ok: false, error: 'Missing userId or email'};
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase || typeof supabase.from !== 'function') {
      return {ok: false, error: 'Supabase client is not configured'};
    }

    const now = new Date().toISOString();
    const {data: updatedRows, error: updateError} = await supabase
      .from('profiles')
      .update({
        email: trimmedEmail,
        updated_at: now,
      })
      .eq('id', input.userId)
      .select('id');

    if (updateError) {
      return {ok: false, error: updateError.message};
    }

    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      return {ok: true};
    }

    const {error: insertError} = await supabase.from('profiles').insert([
      {
        id: input.userId,
        email: trimmedEmail,
        updated_at: now,
      },
    ]);

    if (insertError) {
      return {ok: false, error: insertError.message};
    }

    return {ok: true};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}
