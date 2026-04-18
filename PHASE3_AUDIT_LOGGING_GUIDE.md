# 📋 المرحلة الثالثة: تطبيق Audit Logging

## 🎯 الهدف
إضافة تسجيل شامل للعمليات الحساسة لأغراض الأمان والامتثال.

---

## 📍 الخطوات

### 1. تثبيت Database Schema ✅ (تم مسبقاً)
```bash
# الملف موجود بالفعل: paymop-server/sql/audit_logs.sql
# يحتوي على:
- جدول audit_logs مع جميع الحقول المطلوبة
- Indexes على user_id, created_at, action
- RLS policies للأمان
```

### 2. تشغيل SQL Migration على Supabase
```sql
-- ستحتاج إلى:
1. الدخول إلى Supabase Dashboard
2. الذهاب إلى SQL Editor
3. نسخ محتوى: paymop-server/sql/audit_logs.sql
4. تشغيل الـ query
```

### 3. استخدام logAudit() في الـ Code
```javascript
import { logAudit } from './utils/auditLogger.js';

// في أي endpoint حساس:
logAudit({
  userId: req.user.id,
  action: 'transfer_ownership',           // الإجراء
  resourceType: 'phone',                  // نوع المورد
  resourceId: phone.id,                   // معرف المورد
  oldValues: { owner: 'Ahmed' },         // البيانات السابقة
  newValues: { owner: 'Mohamed' },       // البيانات الجديدة
  ip: req.ip,                            // IP العميل
  userAgent: req.headers['user-agent']   // بيانات المتصفح
});
```

---

## 🔍 الـ Endpoints التي تحتاج logAudit()

### Priority 1: عمليات مالية (CRITICAL)
```javascript
// 1. /api/transfer-ownership
logAudit({
  userId: req.user.id,
  action: 'transfer_ownership',
  resourceType: 'phone',
  resourceId: targetPhone.id,
  details: { 
    fromUser: req.user.id, 
    toUser: newOwner.email 
  },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Priority 2: عمليات تعديل البيانات (HIGH)
```javascript
// 2. /api/reset-phone-password
logAudit({
  userId: req.user.id,
  action: 'reset_phone_password',
  resourceType: 'phone',
  resourceId: targetPhone.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 3. /api/reset-registered-phone-password
logAudit({
  userId: req.user.id,
  action: 'reset_registered_phone_password',
  resourceType: 'registered_phone',
  resourceId: phone.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 4. /api/verify-seller-password
logAudit({
  userId: req.user.id,
  action: 'verify_seller_password_attempt',
  resourceType: 'phone',
  resourceId: foundPhone.id,
  oldValues: { verified: false },
  newValues: { verified: true },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Priority 3: عمليات التقارير (HIGH)
```javascript
// 5. /api/report-lost-phone
logAudit({
  userId: req.user.id,
  action: 'report_lost_phone',
  resourceType: 'phone_report',
  resourceId: insertedReport.id,
  details: { 
    imei: decryptField(insertedReport.imei),
    status: 'active'
  },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 6. /api/resolve-report
logAudit({
  userId: req.user.id,
  action: 'resolve_report',
  resourceType: 'phone_report',
  resourceId: targetReport.id,
  oldValues: { status: 'active' },
  newValues: { status: 'resolved' },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 7. /api/verify-and-resolve-report
logAudit({
  userId: req.user.id,
  action: 'verify_and_resolve_report',
  resourceType: 'phone_report',
  resourceId: report.id,
  oldValues: { status: 'active' },
  newValues: { status: 'resolved' },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Priority 4: عمليات التسجيل والمطالبة (MEDIUM)
```javascript
// 8. /api/register-phone
logAudit({
  userId: req.user.id,
  action: 'register_phone',
  resourceType: 'registered_phone',
  resourceId: insertedPhone.id,
  details: { 
    imei: decryptField(insertedPhone.imei),
    status: 'pending'
  },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 9. /api/claim-phone-by-email
logAudit({
  userId: req.user.id,
  action: 'claim_phone_by_email',
  resourceType: 'registered_phone',
  resourceId: targetPhone.id,
  oldValues: { user_id: null },
  newValues: { user_id: user.id },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Priority 5: عمليات كشف البيانات (MEDIUM)
```javascript
// 10. /api/reveal-imei
logAudit({
  userId: req.user.id,
  action: 'reveal_imei',
  resourceType: 'imei_reveal',
  details: { 
    maskedImei: maskedWithSpaces
  },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// 11. /api/imei-masked-info
logAudit({
  userId: req.user.id,
  action: 'view_masked_imei_info',
  resourceType: 'phone',
  resourceId: foundPhone.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Priority 6: عمليات الدفع (CRITICAL)
```javascript
// 12. Payment-related endpoints
// /paymob/callback, /paymob/success, /paymob/error

logAudit({
  userId: userId,
  action: 'payment_processed',
  resourceType: 'payment',
  resourceId: paymentId,
  oldValues: { status: 'pending' },
  newValues: { status: 'completed', amount: amount },
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

---

## 🔒 الحقول التي يتم تصفيتها تلقائياً

الـ `logAudit()` يصفي الحقول التالية تلقائياً:
- `password` ❌
- `token` ❌
- `secret` ❌
- `key` ❌
- `apiKey` ❌
- أي حقل يحتوي على كلمات حساسة

---

## ✅ قائمة التحقق

### قبل البدء
- [ ] SQL schema نُشر على Supabase
- [ ] Module `utils/auditLogger.js` يعمل بشكل صحيح
- [ ] `logAudit()` يمكن استيرادها بدون أخطاء

### أثناء التطبيق
- [ ] أضف `import { logAudit }` في أعلى server.js
- [ ] أضف 3-5 أسطر `logAudit()` في كل endpoint حساس
- [ ] تحقق من الـ Syntax بـ `node -c paymop-server/server.js`

### بعد التطبيق
- [ ] اختبر endpoint واحد يسجل بنجاح
- [ ] تحقق من جدول `audit_logs` في Supabase
- [ ] تأكد من تصفية كلمات المرور والـ tokens

---

## 🧪 اختبار Audit Logging

```bash
# 1. اتصل بـ endpoint حساس
POST /api/transfer-ownership
Authorization: Bearer token123
{
  "imei": "123456789012345",
  "sellerPassword": "pass123",
  "newOwner": { "email": "new@user.com" }
}

# 2. تحقق من السجل في Supabase
SELECT * FROM audit_logs 
WHERE action = 'transfer_ownership' 
ORDER BY created_at DESC 
LIMIT 1;

# 3. يجب أن ترى:
- user_id: المستخدم الذي أجرى العملية
- action: 'transfer_ownership'
- resource_type: 'phone'
- old_values: البيانات السابقة
- new_values: البيانات الجديدة
- ip_address: IP العميل
- user_agent: معلومات المتصفح
- created_at: وقت العملية
```

---

## 🚀 أوامر بسيطة للتطبيق

### 1. استيراد الـ Module
```javascript
import { logAudit } from './utils/auditLogger.js';
```

### 2. إضافة السجل (نموذج سريع)
```javascript
// بعد العملية مباشرة
await logAudit({
  userId: req.user.id,
  action: 'operation_name',
  resourceType: 'resource_type',
  resourceId: resource.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

---

## 📊 التأثير المتوقع

بعد تطبيق Audit Logging:
- ✅ تسجيل شامل لجميع العمليات الحساسة
- ✅ إمكانية تتبع من أجرى ماذا ومتى
- ✅ دليل فني في حالة الحوادث الأمنية
- ✅ الامتثال لمتطلبات الحماية والخصوصية

---

## ⚠️ ملاحظات مهمة

1. **لا تسجل كلمات المرور أو الـ tokens**: يتم تصفيتها تلقائياً
2. **استخدم أسماء إجراءات واضحة**: `transfer_ownership` لا `op_1`
3. **أضف التفاصيل ذات الصلة فقط**: لا تسجل بيانات غير ضرورية
4. **تحقق من الـ IP والـ User-Agent**: للتحقق من صحة الجلسة

---

## 🎯 الخطوة التالية بعد Audit Logging

بعد إكمال Audit Logging، ستكون الخطوة التالية:
### **Phase 4: Frontend CSRF Integration**
- جلب CSRF token من الخادم
- إرسال token مع جميع الطلبات

---
