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

    await recordRecoveryEvent({
      email: '  user@example.com  ',
      eventType: 'recovery_requested',
      userId: 'user-123',
    });

    expect(fromMock).toHaveBeenCalledWith('recovery_events');
    expect(insertMock).toHaveBeenCalledWith([
      {
        user_id: 'user-123',
        email: 'user@example.com',
        event_type: 'recovery_requested',
      },
    ]);
  });

  it('ignores blank emails and safely swallows database errors', async () => {
    await recordRecoveryEvent({
      email: '   ',
      eventType: 'otp_verified',
    });
    expect(fromMock).not.toHaveBeenCalled();

    insertMock.mockRejectedValueOnce(new Error('relation does not exist'));
    await expect(
      recordRecoveryEvent({
        email: 'user@example.com',
        eventType: 'password_changed',
      }),
    ).resolves.toBeUndefined();
  });
});
