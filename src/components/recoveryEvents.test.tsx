import {beforeEach, describe, expect, it, vi} from 'vitest';

const {fromMock, insertMock, getSupabaseClientMock} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  getSupabaseClientMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

import {recordRecoveryEvent} from '../utils/recoveryEvents';

describe('recordRecoveryEvent', () => {
  beforeEach(() => {
    fromMock.mockReset();
    insertMock.mockReset();
    getSupabaseClientMock.mockReset();
    fromMock.mockReturnValue({insert: insertMock});
    getSupabaseClientMock.mockResolvedValue({from: fromMock});
  });

  it('inserts trimmed email, event_type, and user_id into recovery_events', async () => {
    insertMock.mockResolvedValueOnce({error: null});

    const result = await recordRecoveryEvent({
      email: '  user@example.com  ',
      eventType: 'recovery_requested',
      userId: 'user-123',
    });

    expect(result).toEqual({ok: true});
    expect(fromMock).toHaveBeenCalledWith('recovery_events');
    expect(insertMock).toHaveBeenCalledWith([
      {
        user_id: 'user-123',
        email: 'user@example.com',
        event_type: 'recovery_requested',
      },
    ]);
  });

  it('ignores blank emails and reports database errors without throwing', async () => {
    const blankResult = await recordRecoveryEvent({
      email: '   ',
      eventType: 'otp_verified',
    });
    expect(blankResult).toEqual({ok: false, error: 'Missing email'});
    expect(fromMock).not.toHaveBeenCalled();

    insertMock.mockResolvedValueOnce({error: {message: 'permission denied'}});
    const dbErrResult = await recordRecoveryEvent({
      email: 'user@example.com',
      eventType: 'password_changed',
    });
    expect(dbErrResult).toEqual({ok: false, error: 'permission denied'});

    insertMock.mockRejectedValueOnce(new Error('relation does not exist'));
    const throwResult = await recordRecoveryEvent({
      email: 'user@example.com',
      eventType: 'password_changed',
    });
    expect(throwResult).toEqual({ok: false, error: 'relation does not exist'});
  });
});
