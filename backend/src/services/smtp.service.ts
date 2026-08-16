import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPassword,
  },
});

export async function sendEmailViaSmtp({
  to,
  subject,
  body,
  from,
}: {
  to: string;
  subject: string;
  body: string;
  from: string;
}) {
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });

  console.log('=================================');
  console.log('Email sent successfully');
  console.log('Message ID:', info.messageId);
  console.log('Accepted:', info.accepted);
  console.log('Rejected:', info.rejected);

  if (info.messageId) {
    console.log(
      'Ethereal preview:',
      `https://ethereal.email/message/${info.messageId}`
    );
  }

  console.log('=================================');

  return info;
}