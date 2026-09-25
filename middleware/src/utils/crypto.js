'use strict';

const crypto = require('node:crypto');

function generateUserHash(uuid, secretKey) {
  if (!uuid || typeof uuid !== 'string') {
    throw new TypeError('UUID wajib berupa string non-kosong.');
  }

  const key = secretKey || process.env.SALT_SECRET || process.env.SECRET_KEY || 'ezsign_default_salt';
  const hash = crypto.createHmac('sha256', key).update(uuid.trim()).digest('hex');

  return `0x${hash}`;
}

function generateSimulatedSignature(dataPayload, secretKey) {
  const key = secretKey || process.env.SALT_SECRET || process.env.SECRET_KEY || 'ezsign_default_salt';

  const r = crypto.createHmac('sha256', `${key}:r`).update(String(dataPayload)).digest('hex');
  const s = crypto.createHmac('sha256', `${key}:s`).update(String(dataPayload)).digest('hex');
  const v = '1b';

  return `0x${r}${s}${v}`;
}

module.exports = {
  generateUserHash,
  generateSimulatedSignature
};
