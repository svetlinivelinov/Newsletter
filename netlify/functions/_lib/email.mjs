import { Resend } from 'resend';
import { signToken } from './token.mjs';

const resend = new Resend(process.env.EMAIL_API_KEY);
const FROM_EMAIL = process.env.EMAIL_FROM;
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET;

/**
 * Send digest email
 * @param {string} to - Recipient email
 * @param {string} htmlContent - Generated HTML from AI
 * @returns {Promise<object>} { success, error }
 */
export const sendDigest = async (to, htmlContent) => {
  const date = new Date().toISOString().split('T')[0];
  const subject = `📰 Morning Intelligence — ${date}`;
  
  const siteUrl = process.env.URL;
  if (!siteUrl) console.error('[EMAIL] URL env var not set — unsubscribe links will be broken');
  const unsubscribeToken = signToken(to, UNSUBSCRIBE_SECRET);
  const unsubscribeUrl = `${siteUrl || 'http://localhost:8888'}/.netlify/functions/unsubscribe?token=${unsubscribeToken}`;
  
  const fullHtml = wrapTemplate(htmlContent, unsubscribeUrl);
  const plainText = htmlToPlainText(htmlContent);
  
  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: fullHtml,
      text: plainText,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    });
    
    return { success: true, id: response.id };
  } catch (error) {
    console.error('[EMAIL] Send digest failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send breaking alert email
 * @param {string} to - Recipient email
 * @param {string} htmlContent - Generated HTML from AI
 * @param {string} signalType - Type of signal for subject line
 * @param {string} headline - Headline for subject
 * @returns {Promise<object>}
 */
export const sendAlert = async (to, htmlContent, signalType, headline) => {
  const subject = `🚨 Breaking: ${signalType} — ${headline}`;
  
  const unsubscribeToken = signToken(to, UNSUBSCRIBE_SECRET);
  const unsubscribeUrl = `${process.env.URL || 'http://localhost:8888'}/.netlify/functions/unsubscribe?token=${unsubscribeToken}`;
  
  const fullHtml = wrapTemplate(htmlContent, unsubscribeUrl);
  const plainText = htmlToPlainText(htmlContent);
  
  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: fullHtml,
      text: plainText,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    });
    
    return { success: true, id: response.id };
  } catch (error) {
    console.error('[EMAIL] Send alert failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send midday bundle email
 * @param {string} to - Recipient email
 * @param {string} htmlContent - Generated HTML from AI
 * @returns {Promise<object>}
 */
export const sendMidday = async (to, htmlContent) => {
  const date = new Date().toISOString().split('T')[0];
  const subject = `📡 Midday Signals — ${date}`;
  
  const unsubscribeToken = signToken(to, UNSUBSCRIBE_SECRET);
  const unsubscribeUrl = `${process.env.URL || 'http://localhost:8888'}/.netlify/functions/unsubscribe?token=${unsubscribeToken}`;
  
  const fullHtml = wrapTemplate(htmlContent, unsubscribeUrl);
  const plainText = htmlToPlainText(htmlContent);
  
  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: fullHtml,
      text: plainText,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    });
    
    return { success: true, id: response.id };
  } catch (error) {
    console.error('[EMAIL] Send midday failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Wrap content in email template
 */
function wrapTemplate(content, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intelligence Newsletter</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${content}
  
  <hr style="border: none; border-top: 1px solid #ddd; margin: 40px 0 20px 0;">
  
  <p style="font-size: 12px; color: #666; text-align: center;">
    AI Early Signal Intelligence Newsletter<br>
    <a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

/**
 * Convert HTML to plain text (basic)
 */
function htmlToPlainText(html) {
  return html
    .replace(/<h2[^>]*>/gi, '\n\n')
    .replace(/<h3[^>]*>/gi, '\n\n  ')
    .replace(/<\/h[23]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
