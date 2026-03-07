import { getStore } from '@netlify/blobs';

/**
 * Get subscriber by email
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export const getSubscriber = async (email) => {
  try {
    const store = getStore('subscribers');
    const data = await store.get(`subscriber:${email}`, { type: 'json' });
    return data;
  } catch (error) {
    console.error('[DB] Get subscriber failed:', error.message, error.stack);
    return null;
  }
};

/**
 * Save subscriber
 * @param {string} email
 * @param {object} data - { email, subscribedAt, active }
 * @returns {Promise<boolean>}
 */
export const saveSubscriber = async (email, data) => {
  const store = getStore('subscribers');
  await store.setJSON(`subscriber:${email}`, data);
  return true;
};

/**
 * Delete subscriber
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export const deleteSubscriber = async (email) => {
  try {
    const store = getStore('subscribers');
    await store.delete(`subscriber:${email}`);
    return true;
  } catch (error) {
    console.error('[DB] Delete subscriber failed:', error.message);
    return false;
  }
};

/**
 * List all active subscribers
 * @returns {Promise<Array>}
 */
export const listSubscribers = async () => {
  try {
    const store = getStore('subscribers');
    const { blobs } = await store.list({ prefix: 'subscriber:' });
    
    const subscribers = [];
    for (const blob of blobs) {
      const data = await store.get(blob.key, { type: 'json' });
      if (data && data.active) {
        subscribers.push(data);
      }
    }
    
    return subscribers;
  } catch (error) {
    console.error('[DB] List subscribers failed:', error.message);
    return [];
  }
};

/**
 * Get stats
 * @returns {Promise<object>}
 */
export const getStats = async () => {
  try {
    const store = getStore('subscribers');
    const data = await store.get('meta:stats', { type: 'json' });
    return data || { totalSubscribers: 0, lastDigestSentAt: null };
  } catch (error) {
    console.error('[DB] Get stats failed:', error.message);
    return { totalSubscribers: 0, lastDigestSentAt: null };
  }
};

/**
 * Save stats
 * @param {object} stats
 * @returns {Promise<boolean>}
 */
export const saveStats = async (stats) => {
  const store = getStore('subscribers');
  await store.setJSON('meta:stats', stats);
  return true;
};
