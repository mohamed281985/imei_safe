import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeLog, safeError } from './scripts/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  safeError('env_missing', { message: 'Supabase config missing in .env' });
  process.exit(1);
}
if (!ENCRYPTION_KEY) {
  safeError('env_missing', { message: 'ENCRYPTION_KEY missing in .env' });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const decryptGCM = (encryptedDataHex, ivHex, authTagHex) => {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedDataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
};

const decryptCBC = (encryptedDataHex, ivHex) => {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedDataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
};

const tryDecryptField = (field) => {
  if (!field) return null;
  if (typeof field === 'string' && field.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(field);
      if (parsed.encryptedData && parsed.iv && parsed.authTag) {
        const g = decryptGCM(parsed.encryptedData, parsed.iv, parsed.authTag);
        if (g) return g;
      }
      if (parsed.encryptedData && parsed.iv && !parsed.authTag) {
        // Try older CBC-style decryption if authTag missing
        const c = decryptCBC(parsed.encryptedData, parsed.iv);
        if (c) return c;
      }
    } catch (e) {
      return null;
    }
  }
  return field;
};

(async () => {
  try {
    const { data, error } = await supabase
      .from('registered_phones')
      .select('id, imei, user_id, status, phone_image_url, receipt_image_url')
      .limit(200);
    if (error) throw error;

    safeLog('fetched_rows', { table: 'registered_phones', count: data.length, note: 'attempting_decrypt' });

    const results = data.map(row => {
      const decrypted = tryDecryptField(row.imei);
      return { id: row.id, decryptedImei: decrypted, status: row.status, user_id: row.user_id };
    });

    // Print first 50 results (redacted)
    safeLog('result_preview', results.slice(0,50));

    // Also ask user for an IMEI to search (via env var TEST_IMEI)
    const testImei = process.env.TEST_IMEI;
    if (testImei) {
      const found = results.find(r => r.decryptedImei === testImei);
      if (found) {
        safeLog('found_match', found);
      } else {
        safeLog('no_match', { testImei });
      }
    }

    process.exit(0);
  } catch (e) {
    safeError('inspect_error', { message: e.message || String(e) });
    process.exit(1);
  }
})();
