import {
  useEffect,
  useState,
} from 'react';

import type {
  ChangeEvent,
} from 'react';

import { api } from './services/api';

import type {
  ScheduleEmailRequest,
  ScheduledEmail,
} from './types/email';

import './App.css';

type Tab = 'scheduled' | 'sent';

interface AuthUser {
  id: number;
  googleId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

const API_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000/api';

function App() {
  /*
   * ==================================================
   * Authentication state
   * ==================================================
   */
  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  const [authLoading, setAuthLoading] =
    useState(true);

  const [authenticated, setAuthenticated] =
    useState(false);

  const [user, setUser] =
    useState<AuthUser | null>(null);

  /*
   * ==================================================
   * Dashboard state
   * ==================================================
   */

  const [activeTab, setActiveTab] =
    useState<Tab>('scheduled');

  const [showCompose, setShowCompose] =
    useState(false);

  const [scheduledEmails, setScheduledEmails] =
    useState<ScheduledEmail[]>([]);

  const [sentEmails, setSentEmails] =
    useState<ScheduledEmail[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  /*
   * ==================================================
   * Compose form state
   * ==================================================
   */

  const [subject, setSubject] =
    useState('');

  const [body, setBody] =
    useState('');

  const [recipientsText, setRecipientsText] =
    useState('');

  const [startTime, setStartTime] =
    useState('');

  const [delaySeconds, setDelaySeconds] =
    useState('2');

  const [hourlyLimit, setHourlyLimit] =
    useState('200');

  const [submitting, setSubmitting] =
    useState(false);

  /*
   * ==================================================
   * Authentication
   * ==================================================
   */

  async function checkAuthentication() {
    try {
      setAuthLoading(true);

      const response =
        await api.get<{
          authenticated: boolean;
          user: AuthUser | null;
        }>('/auth/me');

      if (
        response.data.authenticated &&
        response.data.user
      ) {
        setAuthenticated(true);
        setUser(response.data.user);
      } else {
        setAuthenticated(false);
        setUser(null);
      }
    } catch (err) {
      console.error(
        'Authentication check failed:',
        err
      );

      setAuthenticated(false);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  function loginWithGoogle() {
    window.location.href =
      'https://reachinbox-scheduler-ms2m.onrender.com/api/auth/google';
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout');

      setAuthenticated(false);
      setUser(null);

      setScheduledEmails([]);
      setSentEmails([]);

      setShowCompose(false);

      setSuccess('');
      setError('');
    } catch (err) {
      console.error(
        'Logout failed:',
        err
      );

      setError(
        'Unable to logout. Please try again.'
      );
    }
  }

  /*
   * ==================================================
   * Fetch scheduled emails
   * ==================================================
   */

  async function fetchScheduledEmails() {
    try {
      const response =
        await api.get<{
          emails: ScheduledEmail[];
        }>('/emails/scheduled');

      setScheduledEmails(
        response.data.emails
      );
    } catch (err) {
      console.error(
        'Failed to load scheduled emails:',
        err
      );

      setError(
        'Unable to load scheduled emails.'
      );
    }
  }

  /*
   * ==================================================
   * Fetch sent emails
   * ==================================================
   */

  async function fetchSentEmails() {
    try {
      const response =
        await api.get<{
          emails: ScheduledEmail[];
        }>('/emails/sent');

      setSentEmails(
        response.data.emails
      );
    } catch (err) {
      console.error(
        'Failed to load sent emails:',
        err
      );

      setError(
        'Unable to load sent emails.'
      );
    }
  }

  /*
   * ==================================================
   * Load dashboard data
   *
   * showLoading = true for manual/initial refresh
   * showLoading = false for background polling
   * ==================================================
   */

  async function refreshData(
    showLoading = true
  ) {
    try {
      if (showLoading) {
        setLoading(true);
      }

      setError('');

      await Promise.all([
        fetchScheduledEmails(),
        fetchSentEmails(),
      ]);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  /*
   * ==================================================
   * Authentication initialization
   * ==================================================
   */

  useEffect(() => {
    checkAuthentication();
  }, []);

  /*
   * ==================================================
   * Load emails after authentication
   *
   * Also automatically refresh every 5 seconds.
   * This makes sent emails appear without manually
   * clicking Refresh.
   * ==================================================
   */

  useEffect(() => {
    if (
      authLoading ||
      !authenticated
    ) {
      return;
    }

    // Initial load
    refreshData();

    // Background refresh every 5 seconds
    const interval =
      window.setInterval(() => {
        refreshData(false);
      }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    authLoading,
    authenticated,
  ]);

  /*
   * ==================================================
   * Parse manually entered recipients
   *
   * Supports:
   *
   * email1@example.com
   * email2@example.com
   *
   * OR
   *
   * email1@example.com,email2@example.com
   *
   * OR
   *
   * email1@example.com;email2@example.com
   * ==================================================
   */

  function parseRecipients(): string[] {
    return Array.from(
      new Set(
        recipientsText
          .split(/[\n,;]+/)
          .map((email) =>
            email
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      )
    );
  }

  /*
   * ==================================================
   * Extract emails from CSV / TXT
   * ==================================================
   */

  function extractEmailsFromText(
    text: string
  ): string[] {
    const emailRegex =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

    const matches =
      text.match(emailRegex) ?? [];

    return Array.from(
      new Set(
        matches.map((email) =>
          email
            .trim()
            .toLowerCase()
        )
      )
    );
  }

  /*
   * ==================================================
   * Handle CSV / TXT upload
   * ==================================================
   */

  function handleRecipientFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileName =
      file.name.toLowerCase();

    const isAllowed =
      fileName.endsWith('.csv') ||
      fileName.endsWith('.txt');

    if (!isAllowed) {
      setError(
        'Please upload a CSV or TXT file.'
      );

      setSuccess('');

      event.target.value = '';

      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {
      const text =
        typeof reader.result === 'string'
          ? reader.result
          : '';

      const emails =
        extractEmailsFromText(text);

      if (emails.length === 0) {
        setError(
          'No valid email addresses were found in the file.'
        );

        setSuccess('');

        return;
      }

      setRecipientsText(
        emails.join('\n')
      );

      setError('');

      setSuccess(
        `${emails.length} email address${
          emails.length === 1
            ? ''
            : 'es'
        } detected from ${file.name}.`
      );
    };

    reader.onerror = () => {
      setError(
        'Unable to read the selected file.'
      );

      setSuccess('');
    };

    reader.readAsText(file);

    event.target.value = '';
  }

  /*
   * ==================================================
   * Email validation
   * ==================================================
   */

  function isValidEmail(
    email: string
  ): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    );
  }

  /*
   * ==================================================
   * Reset compose form
   * ==================================================
   */

  function resetComposeForm() {
    setSubject('');
    setBody('');
    setRecipientsText('');
    setStartTime('');
    setDelaySeconds('2');
    setHourlyLimit('200');
  }

  /*
   * ==================================================
   * Open compose modal
   * ==================================================
   */

  function openCompose() {
    setError('');
    setSuccess('');
    setShowCompose(true);
  }

  /*
   * ==================================================
   * Close compose modal
   * ==================================================
   */

  function closeCompose() {
    if (submitting) {
      return;
    }

    setShowCompose(false);
  }

  /*
   * ==================================================
   * Schedule emails
   * ==================================================
   */

  async function handleSchedule() {
    setError('');
    setSuccess('');

    /*
     * Parse recipients.
     */

    const recipients =
      parseRecipients();

    /*
     * Subject validation.
     */

    if (!subject.trim()) {
      setError(
        'Please enter an email subject.'
      );

      return;
    }

    /*
     * Body validation.
     */

    if (!body.trim()) {
      setError(
        'Please enter an email body.'
      );

      return;
    }

    /*
     * Recipient validation.
     */

    if (recipients.length === 0) {
      setError(
        'Please add at least one recipient.'
      );

      return;
    }

    /*
     * Validate every email.
     */

    const invalidRecipient =
      recipients.find(
        (email) =>
          !isValidEmail(email)
      );

    if (invalidRecipient) {
      setError(
        `Invalid email address: ${invalidRecipient}`
      );

      return;
    }

    /*
     * Start-time validation.
     */

    if (!startTime) {
      setError(
        'Please select a start time.'
      );

      return;
    }

    const selectedTime =
      new Date(startTime);

    if (
      Number.isNaN(
        selectedTime.getTime()
      )
    ) {
      setError(
        'Invalid start time.'
      );

      return;
    }

    if (
      selectedTime.getTime() <=
      Date.now()
    ) {
      setError(
        'Start time must be in the future.'
      );

      return;
    }

    /*
     * Delay validation.
     */

    const delay =
      Number(delaySeconds);

    if (
      !Number.isFinite(delay) ||
      delay < 0
    ) {
      setError(
        'Delay must be zero or greater.'
      );

      return;
    }

    /*
     * Hourly limit validation.
     */

    const limit =
      Number(hourlyLimit);

    if (
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      setError(
        'Hourly limit must be a positive integer.'
      );

      return;
    }

    /*
     * Backend expects delay in milliseconds.
     */

    const payload:
      ScheduleEmailRequest = {
      subject:
        subject.trim(),

      body:
        body.trim(),

      recipients,

      startTime:
        selectedTime.toISOString(),

      delayBetweenEmails:
        delay * 1000,

      hourlyLimit:
        limit,
    };

    try {
      setSubmitting(true);

      const response =
        await api.post(
          '/emails/schedule',
          payload
        );

      console.log(
        'Schedule response:',
        response.data
      );

      /*
       * Close and reset form.
       */

      setShowCompose(false);

      resetComposeForm();

      /*
       * Show success message.
       */

      setSuccess(
        `Successfully scheduled ${recipients.length} email${
          recipients.length === 1
            ? ''
            : 's'
        }.`
      );

      /*
       * Immediately refresh after scheduling.
       */

      await refreshData(false);
    } catch (err: any) {
      console.error(
        'Schedule request failed:',
        err
      );

      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Unable to schedule emails. Please try again.';

      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * ==================================================
   * Authentication loading screen
   * ==================================================
   */

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">

          <div className="brand-logo">
            R
          </div>

          <h1>
            ReachInbox
          </h1>

          <p className="auth-subtitle">
            Email Scheduler
          </p>

          <p className="auth-description">
            Checking your authentication...
          </p>

          <div className="spinner auth-spinner" />

        </div>
      </div>
    );
  }

  /*
   * ==================================================
   * Login screen
   * ==================================================
   */

  if (
    !authenticated ||
    !user
  ) {
    return (
      <div className="auth-screen">
        <div className="auth-card">

          <div className="brand-logo">
            R
          </div>

          <h1>
            ReachInbox
          </h1>

          <p className="auth-subtitle">
            Email Scheduler
          </p>

          <p className="auth-description">
            Sign in with your Google account
            to schedule and manage email
            campaigns.
          </p>

          <button
            type="button"
            className="google-login-button"
            onClick={loginWithGoogle}
          >
            <span className="google-icon">
              G
            </span>

            Continue with Google
          </button>

        </div>
      </div>
    );
  }

  /*
   * ==================================================
   * Main application
   * ==================================================
   */

  return (
    <div className="app">

      {/* ========================================== */}
      {/* HEADER */}
      {/* ========================================== */}

      <header className="header">

        <div className="brand">

          <div className="brand-logo">
            R
          </div>

          <div className="brand-text">

            <h1>
              ReachInbox
            </h1>

            <span>
              Email Scheduler
            </span>

          </div>

        </div>

        <div className="user-section">

          <div className="avatar">

            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
              />
            ) : (
              user.name
                .charAt(0)
                .toUpperCase()
            )}

          </div>

          <div className="user-info">

            <strong>
              {user.name}
            </strong>

            <span>
              {user.email}
            </span>

          </div>

          <button
            className="logout-button"
            type="button"
            onClick={handleLogout}
          >
            Logout
          </button>

        </div>

      </header>

      {/* ========================================== */}
      {/* MAIN */}
      {/* ========================================== */}

      <main className="main">

        <div className="page-heading">

          <div>

            <h2>
              Email Campaigns
            </h2>

            <p>
              Schedule and manage your
              outbound emails.
            </p>

          </div>

          <div className="heading-actions">

            <button
              className="refresh-button"
              type="button"
              onClick={() => refreshData(true)}
              disabled={loading}
            >
              ↻ Refresh
            </button>

            <button
              className="compose-button"
              type="button"
              onClick={openCompose}
            >
              + Compose New Email
            </button>

          </div>

        </div>

        {/* ====================================== */}
        {/* ALERTS */}
        {/* ====================================== */}

        {error && (
          <div className="alert error">
            <span>
              ⚠
            </span>

            {error}
          </div>
        )}

        {success && (
          <div className="alert success">
            <span>
              ✓
            </span>

            {success}
          </div>
        )}

        {/* ====================================== */}
        {/* TABS */}
        {/* ====================================== */}

        <div className="tabs">

          <button
            type="button"
            className={
              activeTab === 'scheduled'
                ? 'tab active'
                : 'tab'
            }
            onClick={() =>
              setActiveTab('scheduled')
            }
          >
            Scheduled Emails

            <span className="tab-count">
              {scheduledEmails.length}
            </span>

          </button>

          <button
            type="button"
            className={
              activeTab === 'sent'
                ? 'tab active'
                : 'tab'
            }
            onClick={() =>
              setActiveTab('sent')
            }
          >
            Sent Emails

            <span className="tab-count">
              {sentEmails.length}
            </span>

          </button>

        </div>

        {/* ====================================== */}
        {/* TABLE CONTENT */}
        {/* ====================================== */}

        <section className="content-card">

          {activeTab === 'scheduled' ? (
            <>

              <div className="section-title">

                <div>
                  Scheduled Emails
                </div>

                <span className="section-count">
                  {scheduledEmails.length}
                </span>

              </div>

              {loading ? (
                <LoadingState />
              ) : scheduledEmails.length === 0 ? (
                <EmptyState
                  icon="✉"
                  title="No scheduled emails"
                  description="Create a new email campaign to get started."
                  actionLabel="Compose New Email"
                  onAction={openCompose}
                />
              ) : (
                <EmailTable
                  emails={scheduledEmails}
                  type="scheduled"
                />
              )}

            </>
          ) : (
            <>

              <div className="section-title">

                <div>
                  Sent Emails
                </div>

                <span className="section-count">
                  {sentEmails.length}
                </span>

              </div>

              {loading ? (
                <LoadingState />
              ) : sentEmails.length === 0 ? (
                <EmptyState
                  icon="✓"
                  title="No sent emails"
                  description="Successfully sent emails will appear here."
                />
              ) : (
                <EmailTable
                  emails={sentEmails}
                  type="sent"
                />
              )}

            </>
          )}

        </section>

      </main>

      {/* ========================================== */}
      {/* COMPOSE MODAL */}
      {/* ========================================== */}

      {showCompose && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeCompose();
            }
          }}
        >

          <div className="modal">

            {/* Modal header */}

            <div className="modal-header">

              <div>

                <h2>
                  Compose New Email
                </h2>

                <p>
                  Create and schedule an
                  email campaign.
                </p>

              </div>

              <button
                className="close-button"
                type="button"
                onClick={closeCompose}
                disabled={submitting}
              >
                ×
              </button>

            </div>

            {/* Modal body */}

            <div className="modal-body">

              {/* Subject */}

              <label>

                <span>
                  Subject
                </span>

                <input
                  type="text"
                  value={subject}
                  onChange={(event) =>
                    setSubject(
                      event.target.value
                    )
                  }
                  placeholder="Enter email subject"
                />

              </label>

              {/* Body */}

              <label>

                <span>
                  Email Body
                </span>

                <textarea
                  rows={6}
                  value={body}
                  onChange={(event) =>
                    setBody(
                      event.target.value
                    )
                  }
                  placeholder="Write your email..."
                />

              </label>

              {/* Recipients */}

              <label>

                <span>
                  Recipients
                </span>

                {/* File upload */}

                <div className="upload-box">

                  <input
                    id="recipient-file"
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    onChange={
                      handleRecipientFile
                    }
                  />

                  <label
                    htmlFor="recipient-file"
                    className="file-upload-button"
                  >
                    📁 Upload CSV / TXT
                  </label>

                  <span className="upload-help">
                    Upload a CSV or TXT file
                    containing email
                    addresses.
                  </span>

                </div>

                {/* Manual recipients */}

                <textarea
                  rows={5}
                  value={recipientsText}
                  onChange={(event) =>
                    setRecipientsText(
                      event.target.value
                    )
                  }
                  placeholder={
                    'Or enter email addresses separated by commas or new lines'
                  }
                />

                <span className="field-help">
                  {parseRecipients().length}{' '}
                  recipient
                  {parseRecipients().length === 1
                    ? ''
                    : 's'} detected
                </span>

              </label>

              {/* Start time + delay */}

              <div className="form-row">

                <label>

                  <span>
                    Start Time
                  </span>

                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) =>
                      setStartTime(
                        event.target.value
                      )
                    }
                  />

                </label>

                <label>

                  <span>
                    Delay Between Emails
                  </span>

                  <div className="input-with-suffix">

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={delaySeconds}
                      onChange={(event) =>
                        setDelaySeconds(
                          event.target.value
                        )
                      }
                    />

                    <span>
                      sec
                    </span>

                  </div>

                </label>

              </div>

              {/* Hourly limit */}

              <label>

                <span>
                  Hourly Limit
                </span>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={hourlyLimit}
                  onChange={(event) =>
                    setHourlyLimit(
                      event.target.value
                    )
                  }
                />

                <span className="field-help">
                  Maximum number of emails
                  this campaign can send
                  per hour.
                </span>

              </label>

            </div>

            {/* Modal footer */}

            <div className="modal-footer">

              <button
                className="cancel-button"
                type="button"
                onClick={closeCompose}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                className="compose-button"
                type="button"
                onClick={handleSchedule}
                disabled={submitting}
              >
                {submitting
                  ? 'Scheduling...'
                  : 'Schedule Emails'}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

/*
 * ==================================================
 * Loading State
 * ==================================================
 */

function LoadingState() {
  return (
    <div className="loading-state">

      <div className="spinner" />

      <span>
        Loading emails...
      </span>

    </div>
  );
}

/*
 * ==================================================
 * Empty State
 * ==================================================
 */

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state">

      <div className="empty-icon">
        {icon}
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          className="compose-button secondary"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}

    </div>
  );
}

/*
 * ==================================================
 * Email Table
 * ==================================================
 */

interface EmailTableProps {
  emails: ScheduledEmail[];
  type: Tab;
}

function EmailTable({
  emails,
  type,
}: EmailTableProps) {
  return (
    <div className="table-wrapper">

      <table className="email-table">

        <thead>

          <tr>

            <th>
              Email
            </th>

            <th>
              Subject
            </th>

            <th>
              {type === 'scheduled'
                ? 'Scheduled Time'
                : 'Sent Time'}
            </th>

            <th>
              Attempts
            </th>

            <th>
              Status
            </th>

          </tr>

        </thead>

        <tbody>

          {emails.map((email) => (
            <tr key={email.id}>

              <td>

                <div className="recipient-cell">

                  <span className="recipient-icon">
                    @
                  </span>

                  <span>
                    {email.recipient}
                  </span>

                </div>

              </td>

              <td>

                <div className="subject-cell">
                  {email.subject}
                </div>

              </td>

              <td>
                {formatDate(
                  type === 'scheduled'
                    ? email.scheduled_at
                    : email.sent_at
                )}
              </td>

              <td>
                {email.attempts}
              </td>

              <td>

                <StatusBadge
                  status={email.status}
                />

              </td>

            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}

/*
 * ==================================================
 * Status Badge
 * ==================================================
 */

function StatusBadge({
  status,
}: {
  status: ScheduledEmail['status'];
}) {
  return (
    <span
      className={`status-badge status-${status}`}
    >
      <span className="status-dot" />

      {status}
    </span>
  );
}

/*
 * ==================================================
 * Date formatter
 * ==================================================
 */

function formatDate(
  value: string | null
): string {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date.toLocaleString(
    'en-IN',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  );
}

export default App;
