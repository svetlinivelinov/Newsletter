import { Resend } from 'resend';

const apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY;
if (!apiKey) { console.error('Set EMAIL_API_KEY env var'); process.exit(1); }

const resend = new Resend(apiKey);

const { data, error } = await resend.audiences.list();
if (error) { console.error('Error:', error); process.exit(1); }

for (const a of data.data) {
  console.log(`ID: ${a.id}  Name: ${a.name}`);
}