import { getSubscriber, saveSubscriber, getStats, saveStats } from './_lib/db.mjs';

const MAX_SUBSCRIBERS = parseInt(process.env.MAX_SUBSCRIBERS || '500', 10);

/**
 * POST /subscribe
 * Accept new subscriber
 */
export const handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON', code: 'INVALID_JSON' }),
    };
  }

  const { email, preferences } = body;

  // Validate email
  if (!email || typeof email !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email is required', code: 'EMAIL_REQUIRED' }),
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid email format', code: 'INVALID_EMAIL' }),
    };
  }

  // Sanitize email
  const sanitizedEmail = email.trim().toLowerCase();

  try {
    // Check if already subscribed
    const existing = await getSubscriber(sanitizedEmail);
    if (existing && existing.active) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Email already subscribed', code: 'ALREADY_SUBSCRIBED' }),
      };
    }

    // Check subscriber cap
    const stats = await getStats();
    if (stats.totalSubscribers >= MAX_SUBSCRIBERS) {
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Subscriber limit reached', 
          code: 'LIMIT_REACHED',
          limit: MAX_SUBSCRIBERS,
        }),
      };
    }

    // Create subscriber record
    const subscriberData = {
      email: sanitizedEmail,
      subscribedAt: new Date().toISOString(),
      active: true,
      preferences: preferences || { tiers: ['digest'] }, // Phase 1: digest only
    };

    const saved = await saveSubscriber(sanitizedEmail, subscriberData);
    
    if (!saved) {
      throw new Error('Failed to save subscriber');
    }

    // Update stats
    await saveStats({
      totalSubscribers: stats.totalSubscribers + 1,
      lastDigestSentAt: stats.lastDigestSentAt,
    });

    console.info(`[SUBSCRIBE] New subscriber: ${sanitizedEmail}`);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Successfully subscribed',
        email: sanitizedEmail,
      }),
    };
  } catch (error) {
    console.error('[SUBSCRIBE] Error:', error.message);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        code: 'INTERNAL_ERROR',
      }),
    };
  }
};
