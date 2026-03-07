import { verifyToken } from './_lib/token.mjs';
import { deleteSubscriber, getStats, saveStats } from './_lib/db.mjs';

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET;

/**
 * GET /unsubscribe?token=xxx
 * Unsubscribe via HMAC token
 */
export const handler = async (event) => {
  // Only accept GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'text/html' },
      body: '<h1>Method not allowed</h1>',
    };
  }

  const token = event.queryStringParameters?.token;

  if (!token) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Request</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>❌ Invalid Request</h1>
          <p>Missing unsubscribe token.</p>
        </body>
        </html>
      `,
    };
  }

  try {
    // Verify token
    const email = verifyToken(token, UNSUBSCRIBE_SECRET);
    
    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <!DOCTYPE html>
          <html>
          <head><title>Invalid Token</title></head>
          <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1>❌ Invalid Token</h1>
            <p>The unsubscribe link is invalid or has expired.</p>
          </body>
          </html>
        `,
      };
    }

    // Delete subscriber
    const deleted = await deleteSubscriber(email);
    
    if (deleted) {
      // Update stats
      const stats = await getStats();
      await saveStats({
        totalSubscribers: Math.max(0, stats.totalSubscribers - 1),
        lastDigestSentAt: stats.lastDigestSentAt,
      });

      console.info(`[UNSUBSCRIBE] Unsubscribed: ${email}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #333; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <h1>✓ Successfully Unsubscribed</h1>
          <p>You have been removed from the AI Early Signal Intelligence Newsletter.</p>
          <p>Email: <strong>${email}</strong></p>
          <p>You will no longer receive emails from us.</p>
          <p style="margin-top: 40px; font-size: 14px; color: #999;">
            Changed your mind? Visit our homepage to subscribe again.
          </p>
        </body>
        </html>
      `,
    };
  } catch (error) {
    console.error('[UNSUBSCRIBE] Error:', error.message);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>❌ Error</h1>
          <p>An error occurred while processing your request.</p>
        </body>
        </html>
      `,
    };
  }
};
