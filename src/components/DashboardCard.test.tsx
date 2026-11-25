import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MESSAGE_ERROR, NAME_ERROR} from '../utils/recovery';

const {
  orderMock,
  selectListMock,
  singleMock,
  selectInsertMock,
  insertMock,
  deleteEqUserMock,
  deleteEqIdMock,
  deleteMock,
  getSessionMock,
  signOutMock,
} = vi.hoisted(() => {
  const order = vi.fn();
  const selectList = vi.fn(() => ({order}));
  const single = vi.fn();
  const selectInsert = vi.fn(() => ({single}));
  const insert = vi.fn(() => ({select: selectInsert}));
  const deleteEqUser = vi.fn();
  const deleteEqId = vi.fn(() => ({eq: deleteEqUser}));
  const del = vi.fn(() => ({eq: deleteEqId}));
  const getSession = vi.fn();
  const signOut = vi.fn();
  return {
    orderMock: order,
    selectListMock: selectList,
    singleMock: single,
    selectInsertMock: selectInsert,
    insertMock: insert,
    deleteEqUserMock: deleteEqUser,
    deleteEqIdMock: deleteEqId,
    deleteMock: del,
    getSessionMock: getSession,
    signOutMock: signOut,
  };
});

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
    },
    from: vi.fn(() => ({
      select: selectListMock,
      insert: insertMock,
      delete: deleteMock,
    })),
  })),
}));

import {DashboardCard} from './DashboardCard';

describe('DashboardCard', () => {
  beforeEach(() => {
    orderMock.mockReset();
    singleMock.mockReset();
    insertMock.mockClear();
    deleteEqUserMock.mockReset();
    getSessionMock.mockReset();
    signOutMock.mockReset();
    orderMock.mockResolvedValue({data: [], error: null});
    getSessionMock.mockResolvedValue({
      data: {session: {user: {id: 'user-123'}}},
      error: null,
    });
  });

  it('displays logged-in user email and logs out securely', async () => {
    const user = userEvent.setup();
    const onLoggedOut = vi.fn();
    signOutMock.mockResolvedValueOnce({error: null});

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        onLoggedOut={onLoggedOut}
        onResetPassword={vi.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-user-email')).toHaveTextContent(
      'alex@example.com',
    );
    expect(await screen.findByText(/No submissions yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Log out'}));
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('validates and saves legitimate contact form submissions to contact_submissions', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    render(
      <DashboardCard
        userId="stale-user-id"
        userEmail="alex@example.com"
        onLoggedOut={vi.fn()}
        onResetPassword={vi.fn()}
        onNotify={onNotify}
      />,
    );

    await screen.findByText(/No submissions yet/i);

    await user.click(screen.getByRole('button', {name: 'Submit Form'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(NAME_ERROR);
    expect(alerts[1]).toHaveTextContent(MESSAGE_ERROR);
    expect(insertMock).not.toHaveBeenCalled();

    const savedRow = {
      id: 'sub-1',
      user_id: 'user-123',
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone_number: '555-0100',
      message: 'Please send my invoice receipt.',
      created_at: '2026-11-24T12:00:00Z',
    };
    singleMock.mockResolvedValueOnce({data: savedRow, error: null});

    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');
    await user.type(screen.getByLabelText('Phone number'), '555-0100');
    await user.type(
      screen.getByLabelText('Message'),
      'Please send my invoice receipt.',
    );
    await user.click(screen.getByRole('button', {name: 'Submit Form'}));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith([
        {
          user_id: 'user-123',
          name: 'Alex Morgan',
          email: 'alex@example.com',
          phone_number: '555-0100',
          message: 'Please send my invoice receipt.',
        },
      ]);
    });
    expect(
      await screen.findByText('Please send my invoice receipt.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your form submission has been saved securely.'),
    ).toBeInTheDocument();
  });

  it('surfaces Supabase insert error code, details, and hint without claiming success', async () => {
    const user = userEvent.setup();
    singleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy',
        details: 'Failing row contains (user_id).',
        hint: 'Ensure authenticated role has INSERT privilege.',
      },
    });

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        onLoggedOut={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await screen.findByText(/No submissions yet/i);
    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');
    await user.type(
      screen.getByLabelText('Message'),
      'Testing database error visibility.',
    );
    await user.click(screen.getByRole('button', {name: 'Submit Form'}));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('[42501]');
    expect(alert).toHaveTextContent('new row violates row-level security policy');
    expect(alert).toHaveTextContent('Failing row contains (user_id).');
    expect(alert).toHaveTextContent(
      'Hint: Ensure authenticated role has INSERT privilege.',
    );
    expect(
      screen.queryByText(/Your form submission has been saved securely/i),
    ).not.toBeInTheDocument();
  });

  it('blocks submission and surfaces a clear error when the Supabase session has expired', async () => {
    const user = userEvent.setup();

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        onLoggedOut={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await screen.findByText(/No submissions yet/i);
    getSessionMock.mockResolvedValueOnce({data: {session: null}, error: null});

    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');
    await user.type(
      screen.getByLabelText('Message'),
      'Testing expired session handling.',
    );
    await user.click(screen.getByRole('button', {name: 'Submit Form'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has expired. Please sign in again before submitting.',
    );
    expect(insertMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Your form submission has been saved securely/i),
    ).not.toBeInTheDocument();
  });
});
