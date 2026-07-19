# Business Verification Notifications Implementation

## Overview
تم تحديث مسارات قبول ورفض التحقق من الشركات لإرسال:
1. **إشعارات قاعدة البيانات** - تسجيل الإشعار في جدول `notifications`
2. **إشعارات FCM** - إرسال إشعارات فورية عبر Firebase Cloud Messaging
3. **رسائل بريد إلكترونية** - إرسال رسائل بريد إلكترونية عبر Resend

---

## Implementation Details

### 1. Endpoints Updated

#### **POST /admin/businesses/:userId/approve**
- **الوظيفة**: الموافقة على طلب التحقق من الشركة
- **الإجراءات المتخذة**:
  - تحديث حالة الشركة إلى `approved`
  - إدراج إشعار في جدول `notifications`
  - إرسال إشعار FCM عند توفر FCM token
  - إرسال بريد إلكتروني عند توفر عنوان البريد

#### **POST /admin/businesses/:userId/reject**
- **الوظيفة**: رفض طلب التحقق من الشركة مع إعطاء السبب
- **المتطلبات**: 
  - `reason` في body (سبب الرفض مطلوب)
- **الإجراءات المتخذة**:
  - تحديث حالة الشركة إلى `rejected` مع حفظ السبب
  - إدراج إشعار في جدول `notifications`
  - إرسال إشعار FCM عند توفر FCM token
  - إرسال بريد إلكتروني عند توفر عنوان البريد

---

## Notification Types

### Database Notifications (جدول notifications)
```javascript
{
  user_id: userId,
  title: "تمت الموافقة على تسجيل نشاطك التجاري",  // Arabic/English
  body: "Your business registration has been approved. You can now access all features.",
  type: "business_approved" or "business_rejected",
  is_read: false,
  created_at: ISO8601 timestamp
}
```

### FCM Notifications (Firebase Cloud Messaging)
- **الأولوية**: `high` على Android, `10` على Apple
- **العنوان والنص**: يتم ترجمتهما حسب لغة المستخدم
- **التصرف**: يوقظ الجهاز ويعرض الإشعار حتى لو كان التطبيق مغلقاً

### Email Notifications (Resend)
- **البريد من**: `process.env.RESEND_FROM_EMAIL` أو `onboarding@resend.dev`
- **المحتوى**: بريد HTML مع الرسالة المترجمة
- **اللغة**: تتبع تفضيل لغة المستخدم المحفوظ

---

## Integration Changes

### Backend (paymop-server/server.js)
تم تحديث استدعاء `registerAdminRoutes` لتمرير:
```javascript
registerAdminRoutes({
  app,
  supabase,
  decryptField,
  verifyJwtToken,
  logAudit,
  csrfProtection,
  resend,              // ✅ جديد
  sendFCMNotificationV1 // ✅ جديد
});
```

### Admin Routes (paymop-server/routes/adminRoutes.js)
- تم قبول `resend` و `sendFCMNotificationV1` كمعاملات
- تم إضافة دالة `sendEmail` لإرسال رسائل البريد الإلكتروني عبر Resend
- تم تحديث مسارات الموافقة والرفض بالكامل

---

## Dependencies

### Required
- **Resend** - بالفعل مثبتة في `package.json`
- **Firebase Admin SDK** - لإرسال إشعارات FCM
- **Supabase** - لقاعدة البيانات

### Environment Variables Required
```
RESEND_API_KEY=... 
RESEND_FROM_EMAIL=... (اختياري)
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PROJECT_ID=...
```

---

## Testing

### Test Approve
```bash
curl -X POST http://localhost:3000/admin/businesses/{userId}/approve \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json"
```

### Test Reject
```bash
curl -X POST http://localhost:3000/admin/businesses/{userId}/reject \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "صورة رخصة غير واضحة"}'
```

---

## Flow Chart

```
Admin Action (Approve/Reject)
    ↓
Update Database (status + reason)
    ↓
    ├→ Insert Notification in DB
    ├→ Send FCM (if fcm_token exists)
    └→ Send Email (if email exists)
    ↓
Return Success Response
```

---

## Translation Keys
الرسائل المستخدمة في الإشعارات:
- `business.approved_title` / `business.approved_body`
- `business.approved_fcm_title` / `business.approved_fcm_body`
- `business.approved_email_subject` / `business.approved_email_body`
- `business.rejected_title` / `business.rejected_body`
- `business.rejected_fcm_title` / `business.rejected_fcm_body`
- `business.rejected_email_subject` / `business.rejected_email_body`

---

## Error Handling
- **إذا فشل إرسال البريد**: يتم تسجيل التحذير فقط، لا يؤثر على رد الاستجابة الرئيسي
- **إذا فشل إرسال FCM**: يتم تسجيل التحذير فقط
- **إذا فشل إدراج الإشعار في DB**: يتم تسجيل التحذير فقط
- **لا تؤثر الأخطاء على العملية الرئيسية (تحديث الحالة)**

---

## Implementation Summary
✅ **تم تحديث المسارات التالية:**
- `POST /admin/businesses/:userId/approve`
- `POST /admin/businesses/:userId/reject`

✅ **الميزات المضافة:**
- إشعارات قاعدة البيانات في الجدول `notifications`
- إشعارات FCM عبر Firebase
- رسائل بريد إلكترونية عبر Resend
- دعم الترجمة (عربي/إنجليزي) في جميع الرسائل
- معالجة الأخطاء والتسجيل الكامل

✅ **نمط متسق:**
- يتبع نفس النمط المستخدم مع `/admin/approve-phone` و `/admin/reject-phone`
