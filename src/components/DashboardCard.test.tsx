import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MESSAGE_ERROR, NAME_ERROR} from '../utils/recovery';

const {apiRequestMock} = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('../utils/apiClient', () => ({
  apiRequest: apiRequestMock,
}));

import {DashboardCard} from './DashboardCard';

describe('DashboardCard', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      ok: true,
      data: {submissions: []},
    });
  });

  it('displays logged-in user email and logs out cleanly', async () => {
    const user = userEvent.setup();
    const onLoggedOut = vi.fn();

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        accessToken="jwt-123"
        onLoggedOut={onLoggedOut}
        onResetPassword={vi.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-user-email')).toHaveTextContent(
      'alex@example.com',
    );
    expect(await screen.findByText(/No submissions yet/i)).toBeInTheDocument();

    apiRequestMock.mockResolvedValueOnce({ok: true, data: {ok: true}});
    await user.click(screen.getByRole('button', {name: 'Log out'}));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        token: 'jwt-123',
      });
    });
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('validates and saves legitimate contact form submissions to Formspark backend', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        accessToken="jwt-123"
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
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const savedRow = {
      id: 'sub-1',
      user_id: 'user-123',
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone_number: '555-0100',
      message: 'Please send my invoice receipt.',
      created_at: '2026-11-24T12:00:00Z',
    };
    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      data: {ok: true, formId: 'zp1JrNZlu', submission: savedRow},
    });

    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');
    await user.type(screen.getByLabelText('Phone number'), '555-0100');
    await user.type(
      screen.getByLabelText('Message'),
      'Please send my invoice receipt.',
    );
    await user.click(screen.getByRole('button', {name: 'Submit Form'}));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/submissions', {
        method: 'POST',
        token: 'jwt-123',
        body: {
          name: 'Alex Morgan',
          email: 'alex@example.com',
          phoneNumber: '555-0100',
          message: 'Please send my invoice receipt.',
        },
      });
    });
    expect(
      await screen.findByText('Please send my invoice receipt.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your form submission has been saved to Formspark securely.'),
    ).toBeInTheDocument();
  });

  it('surfaces backend Formspark errors without claiming success', async () => {
    const user = userEvent.setup();

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        accessToken="jwt-123"
        onLoggedOut={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await screen.findByText(/No submissions yet/i);
    apiRequestMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      error: 'Formspark rejected the submission (HTTP 502).',
    });

    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');
    await user.type(
      screen.getByLabelText('Message'),
      'Testing Formspark error visibility.',
    );
    await user.click(screen.getByRole('button', {name: 'Submit Form'}));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Formspark rejected the submission (HTTP 502).',
    );
    expect(
      screen.queryByText(/Your form submission has been saved to Formspark/i),
    ).not.toBeInTheDocument();
  });

  it('deletes a submission via /api/submissions/:id', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      data: {
        submissions: [
          {
            id: 'sub-99',
            user_id: 'user-123',
            name: 'Alex Morgan',
            email: 'alex@example.com',
            phone_number: '',
            message: 'Removable inquiry message.',
            created_at: '2026-11-24T12:00:00Z',
          },
        ],
      },
    });

    render(
      <DashboardCard
        userId="user-123"
        userEmail="alex@example.com"
        accessToken="jwt-123"
        onLoggedOut={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Removable inquiry message.'),
    ).toBeInTheDocument();

    apiRequestMock.mockResolvedValueOnce({ok: true, data: {ok: true}});
    await user.click(
      screen.getByRole('button', {name: 'Delete submission from Alex Morgan'}),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/submissions/sub-99', {
        method: 'DELETE',
        token: 'jwt-123',
      });
    });
    expect(
      screen.queryByText('Removable inquiry message.'),
    ).not.toBeInTheDocument();
  });
});
