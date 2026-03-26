import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// تحميل متغيرات البيئة من مجلد الخادم
const __dirname = path.resolve();
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || !ENCRYPTION_KEY.length || ENCRYPTION_KEY.length !== 64) {
  console.error('ENCRYPTION_KEY missing or invalid (expect 64 hex chars)');
  process.exit(1);
}

const generateIV = () => crypto.randomBytes(12);
const encryptAES = (text) => {
  if (text === null || text === undefined) return null;
  const iv = generateIV();
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedData: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

const isDigits = (s) => typeof s === 'string' && /^\d{6,}$/.test(s);

const inspectAndFix = async ({ table, apply = false }) => {
  console.log(`\nInspecting table: ${table} (apply=${apply})`);
  const { data, error } = await supabase.from(table).select('id, imei');
  if (error) {
    console.error('Error fetching rows for', table, error);
    return;
  }

  const needsManual = [];
  const willReencrypt = [];

  for (const row of data) {
    const raw = row.imei;
    if (raw === null || raw === undefined) continue;

    // If it's an object with missing authTag -> needs manual
    if (typeof raw === 'object') {
      if (!raw.encryptedData || !raw.iv || !raw.authTag) {
        needsManual.push({ id: row.id, reason: 'object_missing_fields', value: raw });
      }
      continue;
    }

    // If it's a string: try parse JSON
    if (typeof raw === 'string') {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        // not JSON -> could be plaintext IMEI
      }

      if (parsed && typeof parsed === 'object') {
        if (!parsed.encryptedData || !parsed.iv || !parsed.authTag) {
          needsManual.push({ id: row.id, reason: 'json_missing_fields', value: parsed });
        }
        continue;
      }

      // If it's plain digits, we can re-encrypt
      if (isDigits(raw)) {
        willReencrypt.push({ id: row.id, plain: raw });
        if (apply) {
          const enc = encryptAES(raw);
          const upd = JSON.stringify({ encryptedData: enc.encryptedData, iv: enc.iv, authTag: enc.authTag });
          const { error: upErr } = await supabase.from(table).update({ imei: upd }).eq('id', row.id);
          if (upErr) console.error('Failed to update row', row.id, upErr);
          else console.log(`Updated ${table} id=${row.id} (re-encrypted)`);
        }
      }
    }
  }

  console.log(`Table ${table} summary: needsManual=${needsManual.length} willReencrypt=${willReencrypt.length}`);
  if (needsManual.length > 0) console.table(needsManual.slice(0,50));
  if (willReencrypt.length > 0) console.table(willReencrypt.slice(0,50));
};

const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  await inspectAndFix({ table: 'registered_phones', apply });
  await inspectAndFix({ table: 'phone_reports', apply });
  console.log('\nDone.');
  process.exit(0);
};

main().catch(err => { console.error(err); process.exit(1); });
