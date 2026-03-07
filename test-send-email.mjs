import { Resend } from 'resend';
import { readFileSync } from 'fs';

// Load .env manually before anything else
try {
  const env = readFileSync(new URL('.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const TO = process.argv[2];
if (!TO) { console.error('Usage: node test-send-email.mjs your@email.com'); process.exit(1); }

const resend = new Resend(process.env.EMAIL_API_KEY);

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #6366f1;">🚨 AI Early Signal Intelligence — Test Edition</h1>
  <p>This is a test email to verify the newsletter pipeline is working.</p>

  <h2>📰 Early Bird Signals</h2>
  <ul>
    <li><strong>[SEC EDGAR]</strong> Microsoft filed 8-K with material event disclosure. <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT">[Source]</a></li>
    <li><strong>[FRED]</strong> US CPI data released — 3.2% YoY. <a href="https://fred.stlouisfed.org">[Source]</a></li>
  </ul>

  <h2>📊 Stock Signals</h2>
  <ul>
    <li><strong>PLTR</strong> — $142.50 (+2.3%) | Analyst target: $160 | Signal: upward momentum</li>
    <li><strong>MSFT</strong> — $398.20 (-0.5%) | Analyst target: $450 | Signal: neutral</li>
    <li><strong>LMT</strong> — $512.80 (+1.1%) | Analyst target: $560 | Signal: defence sector strength</li>
  </ul>
  <p><em>For informational purposes only. Not financial advice. Do your own research.</em></p>

  <h2>🌍 Regional Intelligence</h2>
  <h3>🇧🇬 Bulgaria</h3>
  <p>EU funds absorption rate at 67% for 2025 budget cycle.</p>
  <h3>🛡️ NATO &amp; Defence</h3>
  <p>NATO summit communiqué emphasises eastern flank reinforcement.</p>

  <hr style="border: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999; text-align: center;">
    AI Early Signal Intelligence Newsletter — Daily digest test<br>
    <a href="#">Unsubscribe</a>
  </p>
</body>
</html>`;

console.log(`Sending test email to ${TO}...`);

const { data, error } = await resend.emails.send({
  from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  to: TO,
  subject: `🧪 Newsletter Pipeline Test — ${new Date().toISOString().split('T')[0]}`,
  html,
});

if (error) {
  console.error('❌ Send failed:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('✅ Email sent! ID:', data.id);
console.log('Check your inbox at', TO);
