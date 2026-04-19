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

export function encryptPhoneNumber(plain: string): string {
  // تشفير رقم الهاتف بنفس الطريقة
  return btoa(plain.split('').reverse().join(''));
}

export function decryptPhoneNumber(enc: string): string {
  // فك التشفير رقم الهاتف بنفس الطريقة
  return atob(enc).split('').reverse().join('');
}

// دالة لفك تشفير البيانات المشفرة على جانب الخادم (AES-GCM)
// لاحظ: هذه دالة توضيحية، التشفير الحقيقي يجب أن يتم على الخادم فقط
export function tryDecryptAESGCMJson(value: any): string {
  if (!value) return '';
  
  // إذا كانت قيمة نصية عادية، أرجعها
  if (typeof value === 'string' && !value.includes('encryptedData')) {
    return value;
  }
  
  // إذا كانت كائن JSON مع encryptedData
  if (typeof value === 'object' && value.encryptedData && value.iv && value.authTag) {
    // لا يمكن فك التشفير من جانب العميل بدون المفتاح
    // هذا يجب أن يتم على الخادم فقط
    console.warn('Encrypted data received on client - this should be decrypted on server');
    return JSON.stringify(value);
  }
  
  // إذا كانت سلسلة JSON
  if (typeof value === 'string' && value.includes('encryptedData')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed.encryptedData && parsed.iv && parsed.authTag) {
        return JSON.stringify(parsed);
      }
    } catch (e) {
      // تجاهل أخطاء التحليل
    }
  }
  
  return String(value);
}
