export function normalizeImei(value) {
  return String(value ?? '')
    .replace(/[٠-٩۰-۹０-９]/g, (digit) => {
      const code = digit.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      return String(code - 0xff10);
    })
    .replace(/\D/g, '');
}

export function isValidImei(value) {
  const imei = normalizeImei(value);
  if (!/^\d{15}$/.test(imei) || /^([0-9])\1{14}$/.test(imei)) return false;

  let sum = 0;
  for (let index = 0; index < imei.length; index += 1) {
    let digit = Number(imei[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

export function isImeiAllowed(value, role) {
  if (String(role || '').trim().toLowerCase().includes('admin')) {
    return /^\d{15}$/.test(normalizeImei(value));
  }
  return isValidImei(value);
}