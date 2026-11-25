import {getSupabaseClient} from './supabaseClient';

export type RecoveryEventType =
  | 'recovery_requested'
  | 'otp_verified'
  | 'password_changed';

export interface SupabaseWriteResult {
  ok: boolean;
  error?: string;
}

interface PostgrestErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

function formatWriteError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const err = error as PostgrestErrorLike;
  const code = typeof err.code === 'string' ? err.code.trim() : '';
  const message = typeof err.message === 'string' ? err.message.trim() : '';
  const details = typeof err.details === 'string' ? err.details.trim() : '';
  const hint = typeof err.hint === 'string' ? err.hint.trim() : '';

  if (!code && !details && !hint) {
    return message || fallback;
  }

  const parts: string[] = [];
  if (code) parts.push(`[${code}]`);
  if (message) parts.push(message);
  if (details && details !== message) parts.push(details);
  if (hint) parts.push(`Hint: ${hint}`);
  return parts.join(' — ') || fallback;
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
      const error = 'Supabase client is not configured';
      console.error('[supabase] recovery_events write skipped:', error);
      return {ok: false, error};
    }

    let resolvedUserId = input.userId ?? null;
    if (
      resolvedUserId === null &&
      typeof supabase.auth?.getSession === 'function'
    ) {
      const {data: sessionData} = await supabase.auth.getSession();
      resolvedUserId = sessionData?.session?.user?.id ?? null;
    }

    const {error} = await supabase.from('recovery_events').insert([
      {
        user_id: resolvedUserId,
        email: trimmedEmail,
        event_type: input.eventType,
      },
    ]);

    if (error) {
      const formatted = formatWriteError(
        error,
        'Unable to record recovery event.',
      );
      console.error('[supabase] recovery_events insert failed:', formatted);
      return {ok: false, error: formatted};
    }

    return {ok: true};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.error('[supabase] recovery_events insert exception:', message);
    return {
      ok: false,
      error: message,
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
      const error = 'Supabase client is not configured';
      console.error('[supabase] profiles sync skipped:', error);
      return {ok: false, error};
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
      const formatted = formatWriteError(
        updateError,
        'Unable to update profile.',
      );
      console.error('[supabase] profiles update failed:', formatted);
      return {ok: false, error: formatted};
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
      const formatted = formatWriteError(
        insertError,
        'Unable to insert profile.',
      );
      console.error('[supabase] profiles insert failed:', formatted);
      return {ok: false, error: formatted};
    }

    return {ok: true};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.error('[supabase] profiles sync exception:', message);
    return {
      ok: false,
      error: message,
    };
  }
}
