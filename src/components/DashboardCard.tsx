import {FormEvent, useCallback, useEffect, useState} from 'react';
import {
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  Trash2,
  User,
} from 'lucide-react';
import {validateContactSubmission} from '../utils/recovery';
import {
  SUPABASE_NOT_CONFIGURED_ERROR,
  getSupabaseClient,
} from '../utils/supabaseClient';

export interface ContactSubmissionRecord {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone_number: string;
  message: string;
  created_at: string;
}

interface DashboardCardProps {
  userId: string;
  userEmail: string;
  onLoggedOut: () => void;
  onResetPassword: () => void;
  onNotify?: (message: string, title?: string) => void;
}

export function DashboardCard({
  userId,
  userEmail,
  onLoggedOut,
  onResetPassword,
  onNotify,
}: DashboardCardProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');

  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneNumberError, setPhoneNumberError] = useState('');
  const [messageError, setMessageError] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submissions, setSubmissions] = useState<ContactSubmissionRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setIsLoadingList(true);
    setListError('');
    const supabase = await getSupabaseClient();
    if (!supabase) {
      setListError(SUPABASE_NOT_CONFIGURED_ERROR);
      setIsLoadingList(false);
      return;
    }

    try {
      const {data, error} = await supabase
        .from('contact_submissions')
        .select('id, user_id, name, email, phone_number, message, created_at')
        .order('created_at', {ascending: false});

      if (error) {
        setListError(error.message || 'Unable to load your submissions.');
        return;
      }

      setSubmissions((data as ContactSubmissionRecord[]) || []);
    } catch {
      setListError('Network error while loading submissions.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    setEmail(userEmail);
    void loadSubmissions();
  }, [userEmail, loadSubmissions]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const validation = validateContactSubmission({
      name,
      email,
      phoneNumber,
      message,
    });
    setNameError(validation.nameError);
    setEmailError(validation.emailError);
    setPhoneNumberError(validation.phoneNumberError);
    setMessageError(validation.messageError);
    setFormError('');
    setFormSuccess('');

    if (!validation.isValid) {
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setFormError(SUPABASE_NOT_CONFIGURED_ERROR);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        user_id: userId,
        name: name.trim(),
        email: email.trim(),
        phone_number: phoneNumber.trim(),
        message: message.trim(),
      };

      const {data, error} = await supabase
        .from('contact_submissions')
        .insert([payload])
        .select('id, user_id, name, email, phone_number, message, created_at')
        .single();

      if (error) {
        setFormError(
          error.message ||
            'Unable to save submission. Ensure the contact_submissions table and RLS policies exist.',
        );
        return;
      }

      if (data) {
        setSubmissions((prev) => [data as ContactSubmissionRecord, ...prev]);
      }

      setName('');
      setPhoneNumber('');
      setMessage('');
      setFormSuccess('Your form submission has been saved securely.');
      onNotify?.('Your message was saved to Supabase.', 'Submission saved');
    } catch {
      setFormError('Network error while saving submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    setDeletingId(id);
    try {
      const {error} = await supabase
        .from('contact_submissions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        setListError(error.message || 'Unable to delete submission.');
        return;
      }

      setSubmissions((prev) => prev.filter((item) => item.id !== id));
      onNotify?.('Submission deleted.', 'Deleted');
    } catch {
      setListError('Network error while deleting submission.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    const supabase = await getSupabaseClient();
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
      onNotify?.('You have been logged out.', 'Signed out');
      onLoggedOut();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[45px] px-[20px] max-[480px]:py-[30px]">
      <div className="w-full max-w-[540px] space-y-6">
        <section className="border border-[#dbdbdb] rounded-[8px] p-5 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="text-left">
            <h2 className="text-[20px] font-bold text-[#262626]">
              User Dashboard
            </h2>
            <p className="text-[13px] text-[#737373] mt-1">
              Signed in as{' '}
              <span
                data-testid="dashboard-user-email"
                className="font-semibold text-[#262626]"
              >
                {userEmail}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetPassword}
              className="px-3 py-2 text-[13px] font-semibold text-[#0095f6] hover:text-[#1877f2] bg-[#fafafa] border border-[#dbdbdb] rounded-[5px] cursor-pointer"
            >
              Reset password
            </button>

            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="px-3 py-2 text-[13px] font-bold text-[#262626] hover:bg-[#fafafa] bg-white border border-[#dbdbdb] rounded-[5px] cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
            </button>
          </div>
        </section>

        <section className="border border-[#dbdbdb] rounded-[8px] p-6 bg-white">
          <h3 className="text-[18px] font-bold text-[#262626] mb-1">
            Submit an inquiry
          </h3>
          <p className="text-[13px] text-[#737373] mb-5">
            Send a message tied securely to your authenticated account.
          </p>

          {formSuccess && (
            <div
              role="status"
              className="flex items-start gap-2 text-[13px] text-[#16803c] bg-[#f0fdf4] border border-[#bbf7d0] rounded-[5px] p-3 mb-4"
            >
              <CheckCircle2
                className="w-4 h-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <div>
              <div className="relative">
                <input
                  type="text"
                  id="submission-name"
                  aria-label="Full name"
                  aria-invalid={Boolean(nameError)}
                  placeholder="Full name"
                  readOnly={isSubmitting}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError('');
                    if (formError) setFormError('');
                  }}
                  required
                  className={`peer w-full py-[12px] pr-[14px] pl-[40px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                    nameError
                      ? 'border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <User
                  className="w-[17px] h-[17px] pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-[#737373]"
                  aria-hidden="true"
                />
              </div>
              {nameError && (
                <p role="alert" className="text-[#ed4956] text-[12px] mt-1">
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <div className="relative">
                <input
                  type="email"
                  id="submission-email"
                  aria-label="Contact email"
                  aria-invalid={Boolean(emailError)}
                  placeholder="Contact email"
                  readOnly={isSubmitting}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                    if (formError) setFormError('');
                  }}
                  required
                  className={`peer w-full py-[12px] pr-[14px] pl-[40px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                    emailError
                      ? 'border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <Mail
                  className="w-[17px] h-[17px] pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-[#737373]"
                  aria-hidden="true"
                />
              </div>
              {emailError && (
                <p role="alert" className="text-[#ed4956] text-[12px] mt-1">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <div className="relative">
                <input
                  type="tel"
                  id="submission-phone"
                  aria-label="Phone number"
                  aria-invalid={Boolean(phoneNumberError)}
                  placeholder="Phone number (optional)"
                  readOnly={isSubmitting}
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (phoneNumberError) setPhoneNumberError('');
                    if (formError) setFormError('');
                  }}
                  className={`peer w-full py-[12px] pr-[14px] pl-[40px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                    phoneNumberError
                      ? 'border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <Phone
                  className="w-[17px] h-[17px] pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-[#737373]"
                  aria-hidden="true"
                />
              </div>
              {phoneNumberError && (
                <p role="alert" className="text-[#ed4956] text-[12px] mt-1">
                  {phoneNumberError}
                </p>
              )}
            </div>

            <div>
              <div className="relative">
                <textarea
                  id="submission-message"
                  aria-label="Message"
                  aria-invalid={Boolean(messageError)}
                  placeholder="How can we help?"
                  rows={4}
                  readOnly={isSubmitting}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (messageError) setMessageError('');
                    if (formError) setFormError('');
                  }}
                  required
                  className={`peer w-full py-[12px] pr-[14px] pl-[40px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none resize-y ${
                    messageError
                      ? 'border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <MessageSquare
                  className="w-[17px] h-[17px] pointer-events-none absolute left-[13px] top-[14px] text-[#737373]"
                  aria-hidden="true"
                />
              </div>
              {messageError && (
                <p role="alert" className="text-[#ed4956] text-[12px] mt-1">
                  {messageError}
                </p>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-[#ed4956] text-[13px] text-left">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Submitting...</span>
                </>
              ) : (
                'Submit Form'
              )}
            </button>
          </form>
        </section>

        <section className="border border-[#dbdbdb] rounded-[8px] p-6 bg-white">
          <h3 className="text-[16px] font-bold text-[#262626] mb-3">
            Your submissions
          </h3>

          {isLoadingList ? (
            <div className="flex items-center gap-2 text-[13px] text-[#737373]">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Loading submissions...</span>
            </div>
          ) : listError ? (
            <p role="alert" className="text-[13px] text-[#ed4956]">
              {listError}
            </p>
          ) : submissions.length === 0 ? (
            <p className="text-[13px] text-[#737373]">
              No submissions yet. Use the form above to submit an inquiry.
            </p>
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {submissions.map((item) => (
                <li
                  key={item.id}
                  className="border border-[#efefef] bg-[#fafafa] rounded-[5px] p-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold text-[#262626]">
                        {item.name}
                      </p>
                      <p className="text-[12px] text-[#737373]">
                        {item.email}
                        {item.phone_number ? ` · ${item.phone_number}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      aria-label={`Delete submission from ${item.name}`}
                      onClick={() => handleDelete(item.id)}
                      className="text-[#737373] hover:text-[#ed4956] bg-transparent border-0 p-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-[13px] text-[#262626] mt-2 whitespace-pre-wrap">
                    {item.message}
                  </p>
                  <p className="text-[11px] text-[#737373] mt-2">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
