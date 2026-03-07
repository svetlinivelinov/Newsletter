import crypto from 'crypto';

/**
 * Sign an email address into an HMAC token
 * @param {string} email - Email address to sign
 * @param {string} secret - HMAC secret key
 * @returns {string} Base64-encoded token: base64(email):hmac
 */
export const signToken = (email, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(email);
  const signature = hmac.digest('hex');
  const payload = Buffer.from(email).toString('base64');
  return `${payload}.${signature}`;
};

/**
 * Verify and extract email from an HMAC token
 * @param {string} token - Token to verify
 * @param {string} secret - HMAC secret key
 * @returns {string|null} Email if valid, null if invalid
 */
export const verifyToken = (token, secret) => {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    
    const email = Buffer.from(payload, 'base64').toString('utf8');
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(email);
    const expectedSignature = hmac.digest('hex');

    // Use constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    return email;
  } catch (error) {
    console.error('[TOKEN] Verification failed:', error.message);
    return null;
  }
};
