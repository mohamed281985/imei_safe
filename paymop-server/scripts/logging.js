import util from 'util';

const maskString = (s, opts = {}) => {
  if (s === null || s === undefined) return s;
  const str = String(s);
  if (opts.keepLast === '6') {
    if (str.length <= 6) return '*'.repeat(str.length);
    return '*'.repeat(Math.max(0, str.length - 6)) + str.slice(-6);
  }
  if (str.length <= 4) return '*'.repeat(str.length);
  return str.slice(0, 2) + '*'.repeat(Math.max(0, str.length - 4)) + str.slice(-2);
};

const maskEmail = (e) => {
  if (!e || typeof e !== 'string') return e;
  const [local, domain] = e.split('@');
  if (!domain) return maskString(e);
  return maskString(local) + '@' + domain;
};

const redactObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const lk = k.toLowerCase();
    if (lk.includes('imei') || lk.includes('serial') || lk === 'imei') copy[k] = maskString(v, { keepLast: '6' });
    else if (lk.includes('email')) copy[k] = maskEmail(v);
    else if (lk.includes('token') || lk.includes('auth') || lk.includes('key') || lk.includes('secret')) copy[k] = typeof v === 'string' ? maskString(v) : v;
    else if (lk === 'encrypteddata' || lk === 'authtag' || lk === 'iv') copy[k] = 'REDACTED';
    else copy[k] = v;
  }
  return copy;
};

export const safeLog = (...args) => {
  if (args.length === 1) {
    const a = args[0];
    if (typeof a === 'object') return console.log(util.format('%s', JSON.stringify(redactObject(a))));
    return console.log(a);
  }
  // tag, obj
  const [tag, obj] = args;
  if (typeof obj === 'object') return console.log(`${tag} ` + JSON.stringify(redactObject(obj)));
  return console.log(tag, obj);
};

export const safeError = (...args) => {
  if (args.length === 1) {
    const a = args[0];
    if (typeof a === 'object') return console.error(util.format('%s', JSON.stringify(redactObject(a))));
    return console.error(a);
  }
  const [tag, obj] = args;
  if (typeof obj === 'object') return console.error(`${tag} ` + JSON.stringify(redactObject(obj)));
  return console.error(tag, obj);
};

export default { safeLog, safeError, redactObject };
