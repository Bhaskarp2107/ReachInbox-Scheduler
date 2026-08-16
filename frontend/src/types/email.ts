export type EmailStatus =
  | 'scheduled'
  | 'processing'
  | 'sent'
  | 'failed';

export interface ScheduledEmail {
  id: number;
  campaign_id: number;

  recipient: string;

  subject: string;
  body: string;
  sender_email: string;

  scheduled_at: string;
  sent_at: string | null;

  status: EmailStatus;

  attempts: number;

  job_id: string | null;

  failure_reason: string | null;

  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: number;
  user_id: number;

  subject: string;
  body: string;

  start_time: string;

  delay_ms: number;

  hourly_limit: number;

  sender_email: string;

  created_at: string;
  updated_at: string;
}

export interface ScheduleEmailRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
}

export interface ScheduleEmailResponse {
  success: boolean;
  campaign: Campaign;
  emails: ScheduledEmail[];
}