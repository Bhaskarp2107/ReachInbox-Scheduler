import { env } from '../config/env';

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
  console.log('=================================');
  console.log('Sending email through Brevo API');
  console.log('To:', to);
  console.log('From:', from);
  console.log('Subject:', subject);

  const response = await fetch(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: from,
        },
        to: [
          {
            email: to,
          },
        ],
        subject,
        textContent: body,
      }),
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error('Brevo API error:', response.status);
    console.error('Brevo response:', responseText);

    throw new Error(
      `Brevo API error ${response.status}: ${responseText}`
    );
  }

  let result: { messageId?: string };

  try {
    result = JSON.parse(responseText);
  } catch {
    result = {};
  }

  console.log('Email sent successfully through Brevo');
  console.log('Message ID:', result.messageId);
  console.log('=================================');

  return result;
}
