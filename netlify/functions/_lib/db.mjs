import { Resend } from 'resend';

// Lazy-initialize so a missing EMAIL_API_KEY doesn't crash the module at load
// time (which causes Netlify to return 500 before the handler even runs).
let _resend;
const getResend = () => {
  if (!_resend) _resend = new Resend(process.env.EMAIL_API_KEY);
  return _resend;
};

const getAudienceId = () => {
  const id = process.env.RESEND_AUDIENCE_ID;
  if (!id) throw new Error('RESEND_AUDIENCE_ID environment variable is not set');
  return id;
};

const listAllContacts = async (audienceId) => {
  const { data, error } = await getResend().contacts.list({ audienceId });
  if (error) throw new Error(`Resend list contacts failed: ${JSON.stringify(error)}`);
  const contacts = Array.isArray(data) ? data : (data?.data ?? []);
  return contacts;
};

// Single API call � returns subscriber info + active count together
export const getSubscriberAndStats = async (email) => {
  const audienceId = getAudienceId();
  const contacts = await listAllContacts(audienceId);
  const contact = contacts.find(c => c.email === email);
  const totalSubscribers = contacts.filter(c => !c.unsubscribed).length;
  const subscriber = contact
    ? { email: contact.email, active: !contact.unsubscribed, subscribedAt: contact.created_at, id: contact.id }
    : null;
  return { subscriber, stats: { totalSubscribers, lastDigestSentAt: null } };
};

export const getSubscriber = async (email) => {
  try {
    const audienceId = getAudienceId();
    const contacts = await listAllContacts(audienceId);
    const contact = contacts.find(c => c.email === email);
    if (!contact) return null;
    return {
      email: contact.email,
      active: !contact.unsubscribed,
      subscribedAt: contact.created_at,
      id: contact.id,
    };
  } catch (error) {
    console.error('[DB] Get subscriber failed:', error.message, error.stack);
    return null;
  }
};

export const saveSubscriber = async (email, _data) => {
  const audienceId = getAudienceId();
  const { data, error } = await getResend().contacts.create({ audienceId, email, unsubscribed: false });
  if (error) throw new Error(`Resend contacts.create failed: ${JSON.stringify(error)}`);
  console.info('[DB] Contact created:', JSON.stringify(data));
  return true;
};

export const deleteSubscriber = async (email) => {
  try {
    const audienceId = getAudienceId();
    const contacts = await listAllContacts(audienceId);
    const contact = contacts.find(c => c.email === email);
    if (!contact) return true;
    const { error } = await getResend().contacts.remove({ audienceId, id: contact.id });
    if (error) throw new Error(JSON.stringify(error));
    return true;
  } catch (error) {
    console.error('[DB] Delete subscriber failed:', error.message);
    return false;
  }
};

export const listSubscribers = async () => {
  try {
    const audienceId = getAudienceId();
    const contacts = await listAllContacts(audienceId);
    return contacts
      .filter(c => !c.unsubscribed)
      .map(c => ({ email: c.email, active: true, subscribedAt: c.created_at }));
  } catch (error) {
    console.error('[DB] List subscribers failed:', error.message);
    return [];
  }
};

export const getStats = async () => {
  try {
    const audienceId = getAudienceId();
    const contacts = await listAllContacts(audienceId);
    const totalSubscribers = contacts.filter(c => !c.unsubscribed).length;
    return { totalSubscribers, lastDigestSentAt: null };
  } catch (error) {
    console.error('[DB] Get stats failed:', error.message);
    return { totalSubscribers: 0, lastDigestSentAt: null };
  }
};

export const saveStats = async (_stats) => true;
