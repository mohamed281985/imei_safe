// src/lib/imeiCrypto.ts
// بسيط: تشفير وفك تشفير نصي (للاستخدام التجريبي فقط)
// في الإنتاج استخدم مكتبة تشفير قوية

export function encryptIMEI(plain: string): string {
  // مثال: تشفير بسيط (لا تستخدمه للإنتاج)
  return btoa(plain.split('').reverse().join(''));
}

export function decryptIMEI(enc: string): string {
  // مثال: فك التشفير البسيط
  return atob(enc).split('').reverse().join('');
}
