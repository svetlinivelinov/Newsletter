import { Resend } from 'resend';

const resend = new Resend(process.env.EMAIL_API_KEY);

const getAudienceId = () => {
  const id = process.env.RESEND_AUDIENCE_ID;
  if (!id) throw new Error('RESEND_AUDIENCE_ID environment variable is not set');
  return id;
};

const listAllContacts = async (audienceId) => {
  const { data, error } = await resend.contacts.list({ audienceId });
  if (error) throw new Error(`Resend API error: ${error.message}`);
  return data?.data || [];
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
  const { error } = await resend.contacts.create({ audienceId, email, unsubscribed: false });
  if (error) throw new Error(`Resend contacts.create failed: ${error.message}`);
  return true;
};

export const deleteSubscriber = async (email) => {
  try {
    const audienceId = getAudienceId();
    const contacts = await listAllContacts(audienceId);
    const contact = contacts.find(c => c.email === email);
    if (!contact) return true;
    const { error } = await resend.contacts.remove({ audienceId, id: contact.id });
    if (error) throw new Error(error.message);
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

// Stats are now derived dynamically from Resend Contacts — nothing to persist.
export const saveStats = async (_stats) => true;

