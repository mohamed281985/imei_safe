# نظام إدارة حملات الإشعارات - دليل شامل

## نظرة عامة
نظام متكامل لإدارة حملات الإشعارات مع نموذج موافقة متعدد المستويات وفحوصات أمنية صارمة.

---

## حالات الحملة (Campaign Statuses)

```
┌─────────────────────────────────────────────────┐
│ draft                                           │ (الحالة الأولية)
│ ↓                                               │
│ pending_approval ← ← ← ← ← → cancelled          │ (في انتظار الموافقة)
│ ↓                                               │
│ approved          ← ← → cancelled               │ (تم الموافقة)
│ ↓                                               │
│ sending                                         │ (قيد الإرسال)
│ ├─→ completed (if FCM enabled)                  │
│ └─→ failed                                      │
│ ↑ can retry if failed                           │
│                                                 │
│ cancelled (final - no further changes)          │
│ completed (final - no further changes)          │
└─────────────────────────────────────────────────┘
```

### الحالات الكاملة:
- **draft**: الحملة مسودة، قابلة للتعديل والإلغاء
- **pending_approval**: في انتظار موافقة مسؤول آخر
- **approved**: تم الموافقة، جاهزة للإرسال
- **sending**: قيد الإرسال الفعلي عبر FCM
- **completed**: تم إكمال الإرسال بنجاح
- **failed**: فشل الإرسال
- **cancelled**: تم الإلغاء (نهائي)

---

## الصلاحيات المطلوبة

### 1. `can_send_notifications`
- إنشاء حملات جديدة
- عرض الحملات
- اختبار الحملات
- إرسال الحملة للموافقة

### 2. `can_approve_notifications`
- الموافقة على الحملات
- إلغاء الحملات
- إرسال الحملات الموافق عليها

### قاعدة مهمة:
⚠️ **لا يمكن لمنشئ الحملة الموافقة عليها أو إرسالها** (لضمان الفصل بين الأدوار)

---

## Endpoints الكاملة

### 1. إنشاء حملة جديدة
```http
POST /admin/notification-campaigns
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "title": "عنوان الحملة",
  "message": "نص الرسالة",
  "audience": "all", // اختياري: niche, segment, all
  "metadata": { "campaign_type": "promotion" }, // اختياري
  "scheduled_at": "2026-06-20T10:00:00Z" // اختياري
}
```

**الشروط:**
- صلاحية `can_send_notifications` مطلوبة
- title و message مطلوبان

**الاستجابة:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "عنوان الحملة",
    "message": "نص الرسالة",
    "status": "draft",
    "created_by": "admin_user_id",
    "created_at": "2026-06-19T...",
    "updated_at": "2026-06-19T..."
  }
}
```

---

### 2. عرض الحملات (بسيط)
```http
GET /admin/notification-campaigns?page=1&limit=20&status=draft&sort_order=desc
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_send_notifications` مطلوبة

**الفلاتر المدعومة:**
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد النتائج (افتراضي: 20، أقصى: 200)
- `status`: حالة الحملة (draft, pending_approval, etc.)
- `sort_order`: asc أو desc (افتراضي: desc)

---

### 3. عرض الحملات (متقدم)
```http
GET /admin/notification-campaigns/enhanced
  ?search=keyword
  &status=approved
  &created_by=admin_id
  &audience=all
  &campaign_type=promotion
  &date_from=2026-01-01T00:00:00Z
  &date_to=2026-12-31T23:59:59Z
  &page=1
  &limit=20
  &sort_order=desc

Authorization: Bearer <JWT_TOKEN>
```

**الفلاتر الإضافية:**
- `search`: البحث في العنوان والرسالة
- `created_by`: معرف منشئ الحملة
- `audience`: الجمهور المستهدف
- `campaign_type`: نوع الحملة
- `date_from`: من تاريخ
- `date_to`: إلى تاريخ

**الاستجابة تتضمن:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "summary": {
    "totalRecords": 100,
    "pageRecords": 20,
    "statusCounts": {
      "draft": 10,
      "pending_approval": 5,
      "approved": 20,
      "sending": 2,
      "completed": 50,
      "failed": 10,
      "cancelled": 3
    },
    "filtersApplied": {...}
  },
  "permissions": {
    "can_send_notifications": true,
    "can_approve_notifications": true,
    "user_id": "admin_id"
  }
}
```

---

### 4. عرض حملة واحدة
```http
GET /admin/notification-campaigns/:id
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_send_notifications` مطلوبة

**الاستجابة:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "...",
    "message": "...",
    "status": "draft",
    "created_by": "...",
    "created_at": "...",
    ...
  }
}
```

---

### 5. إرسال الحملة للموافقة
```http
PATCH /admin/notification-campaigns/:id/submit
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_send_notifications` مطلوبة
- الحملة يجب أن تكون `status='draft'`

**التحديثات:**
- `status` → `pending_approval`
- حفظ `submitted_by` و `submitted_at`

**Audit Logging:**
```
action: 'submit_notification_campaign'
resourceType: 'notification_campaign'
```

---

### 6. الموافقة على الحملة
```http
PATCH /admin/notification-campaigns/:id/approve
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_approve_notifications` مطلوبة
- الحملة يجب أن تكون `status='pending_approval'`
- **لا يمكن لمنشئ الحملة (created_by) الموافقة عليها**

**التحديثات:**
- `status` → `approved`
- حفظ `approved_by` و `approved_at`

**رسالة الخطأ إذا حاول المنشئ:**
```json
{
  "success": false,
  "error": "Cannot approve your own campaign"
}
```

**Audit Logging:**
```
action: 'approve_notification_campaign'
```

---

### 7. إلغاء الحملة
```http
PATCH /admin/notification-campaigns/:id/cancel
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "reason": "سبب الإلغاء (اختياري)"
}
```

**الشروط:**
- صلاحية `can_approve_notifications` مطلوبة
- **لا يمكن إلغاء حملة بحالة `completed`**

**التحديثات:**
- `status` → `cancelled`
- حفظ `cancelled_by` و `cancelled_at` و `cancel_reason`

**Audit Logging:**
```
action: 'cancel_notification_campaign'
```

---

### 8. إرسال الحملة الموافق عليها
```http
POST /admin/notification-campaigns/:id/send
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_approve_notifications` مطلوبة
- الحملة يجب أن تكون `status='approved'`
- يجب أن يكون هناك `approved_by` (بيانات موافقة)
- **لا يمكن لمنشئ الحملة إرسالها**

**الخطوات:**
1. تحديث `status` → `sending`
2. حفظ `started_at`
3. التحقق من تفعيل Firebase Admin SDK:
   - إذا **مفعل**: الانتظار لإرسال FCM (ميزة مستقبلية)
   - إذا **معطل**: تحديث `status` → `completed` فوراً

**Transaction Protection:**
```javascript
.eq('status', 'approved')  // فقط إذا كانت الحالة لم تتغير
```

**الاستجابة (FCM معطل):**
```json
{
  "success": true,
  "data": {...},
  "note": "Campaign marked as completed (Firebase Admin SDK not enabled)"
}
```

**Audit Logging:**
```
action: 'send_notification_campaign'
details: { sent_by, fcm_enabled }
```

---

### 9. اختبار الحملة
```http
POST /admin/notification-campaigns/:id/test
Authorization: Bearer <JWT_TOKEN>
```

**الشروط:**
- صلاحية `can_send_notifications` مطلوبة
- **لا تؤثر على حالة الحملة**

**العملية:**
1. جلب FCM token الخاص بالأدمن الحالي
2. إرسال الرسالة كإشعار اختبار فقط
3. تسجيل في audit logs

**الاستجابة:**
```json
{
  "success": true,
  "message": "Test notification sent",
  "data": {
    "campaignId": "uuid",
    "testSentTo": "admin_user_id",
    "fcmSent": true,
    "campaignStatus": "draft"
  }
}
```

**Audit Logging:**
```
action: 'test_notification_campaign'
details: { test_sent_to, fcm_sent, campaign_status }
```

---

## رسم تدفق العملية الكاملة

```
┌─────────────────────────────────┐
│ 1. Admin A ينشئ الحملة         │
│ POST /admin/notification-...    │
│ صلاحية: can_send_notifications │
│ الحالة: draft                   │
└────────────────┬────────────────┘
                 │
┌─────────────────▼────────────────────────┐
│ 2. Admin A يرسل للموافقة                │
│ PATCH /admin/notification-.../submit     │
│ صلاحية: can_send_notifications          │
│ الشرط: status = draft                    │
│ الحالة الجديدة: pending_approval         │
└────────────────┬───────────────────────┘
                 │
┌─────────────────▼────────────────────────────┐
│ 3. Admin B يوافق (يجب أن يكون B ≠ A)        │
│ PATCH /admin/notification-.../approve       │
│ صلاحية: can_approve_notifications          │
│ الشرط: status = pending_approval            │
│ الحالة الجديدة: approved                    │
└────────────────┬──────────────────────────┘
                 │
┌─────────────────▼────────────────────────────┐
│ 4. Admin B يرسل الحملة                      │
│ POST /admin/notification-.../send            │
│ صلاحية: can_approve_notifications           │
│ الشرط: status = approved                     │
│ الحالة الجديدة: sending → completed          │
└────────────────┬──────────────────────────┘
                 │
┌─────────────────▼──────────────────────────┐
│ ✓ اكتملت عملية الإرسال بنجاح              │
│ تم إرسال الإشعارات عبر FCM (إذا مفعل)    │
└────────────────────────────────────────────┘
```

---

## سيناريوهات الاستخدام

### السيناريو 1: تطبيق كامل
```bash
# 1. الإنشاء
curl -X POST https://api/admin/notification-campaigns \
  -H "Authorization: Bearer TOKEN_A" \
  -d '{"title":"عرض خاص","message":"اغتنم الفرصة"}'

# 2. الإرسال للموافقة
curl -X PATCH https://api/admin/notification-campaigns/{id}/submit \
  -H "Authorization: Bearer TOKEN_A"

# 3. الموافقة (من أدمن آخر)
curl -X PATCH https://api/admin/notification-campaigns/{id}/approve \
  -H "Authorization: Bearer TOKEN_B"

# 4. الإرسال الفعلي
curl -X POST https://api/admin/notification-campaigns/{id}/send \
  -H "Authorization: Bearer TOKEN_B"

# 5. النتيجة: حملة بحالة completed مع إشعارات مُرسَلة
```

### السيناريو 2: الاختبار قبل الإرسال
```bash
# بعد الموافقة مباشرة قبل الإرسال الفعلي
curl -X POST https://api/admin/notification-campaigns/{id}/test \
  -H "Authorization: Bearer TOKEN_A"

# يتم إرسال الرسالة إلى الأدمن فقط
# الحالة تبقى approved
```

### السيناريو 3: الإلغاء
```bash
# إلغاء حملة في أي حالة (ما عدا completed)
curl -X PATCH https://api/admin/notification-campaigns/{id}/cancel \
  -H "Authorization: Bearer TOKEN_B" \
  -d '{"reason":"لم نُرسل البيانات الصحيحة"}'

# الحالة الجديدة: cancelled (نهائي)
```

---

## Audit Logging

جميع العمليات يتم تسجيلها في جدول `audit_logs`:

| Action | Resource Type | المتغيرات المحفوظة |
|--------|---------------|-------------------|
| `admin_create_notification_campaign` | notification_campaign | title, status, created_by |
| `submit_notification_campaign` | notification_campaign | status (draft→pending_approval), submitted_by |
| `approve_notification_campaign` | notification_campaign | status (pending_approval→approved), approved_by |
| `cancel_notification_campaign` | notification_campaign | status→cancelled, cancel_reason, cancelled_by |
| `send_notification_campaign` | notification_campaign | status (approved→sending/completed), sent_by, fcm_enabled |
| `test_notification_campaign` | notification_campaign | test_sent_to, fcm_sent, campaign_status |

---

## جدول Notification Campaigns

### الأعمدة المطلوبة:
```sql
CREATE TABLE notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audience TEXT,
  metadata JSONB,
  scheduled_at TIMESTAMP,
  
  -- التتبع
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- المراحل
  submitted_by UUID,
  submitted_at TIMESTAMP,
  
  approved_by UUID,
  approved_at TIMESTAMP,
  
  cancelled_by UUID,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- البيانات الإضافية (حسب الحاجة)
  campaign_type TEXT,
  
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (cancelled_by) REFERENCES users(id)
);

CREATE INDEX idx_notification_campaigns_status ON notification_campaigns(status);
CREATE INDEX idx_notification_campaigns_created_by ON notification_campaigns(created_by);
CREATE INDEX idx_notification_campaigns_created_at ON notification_campaigns(created_at DESC);
```

---

## ملاحظات أمنية

✅ **التحقق من JWT Token** على جميع الـ endpoints
✅ **فحص الصلاحيات** (can_send_notifications, can_approve_notifications)
✅ **منع تضارب الأدوار** (منع المنشئ من الموافقة/الإرسال)
✅ **Transaction Protection** عند الإرسال لمنع الإرسال المكرر
✅ **Audit Logging** لجميع العمليات الحساسة
✅ **IP Address & User Agent** التقاط في السجلات

---

## ملاحظات Firebase Admin SDK

عند تفعيل Firebase:
1. تعيين `FIREBASE_ADMIN_SDK_ENABLED=true` في environment
2. توفير بيانات الاعتماد الصحيحة
3. تنفيذ آلية إعادة المحاولة عند الفشل
4. تحديث حالة الحملة بناءً على نتائج الإرسال

الآن يتم حفظ الحالة كـ `completed` فوراً عند تعطيل Firebase.

---

## مثال عملي كامل

```javascript
// 1. الإنشاء من قبل محرر الحملات
const createResp = await fetch('http://localhost:3000/admin/notification-campaigns', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token_editor',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'عرض الصيف الكبير',
    message: 'احصل على خصم 50% على كل المنتجات',
    audience: 'all',
    metadata: { campaign_type: 'seasonal' }
  })
});
const campaign = await createResp.json();
const campaignId = campaign.data.id;

// 2. إرسال للموافقة
await fetch(`http://localhost:3000/admin/notification-campaigns/${campaignId}/submit`, {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer token_editor' }
});

// 3. الموافقة من مسؤول
await fetch(`http://localhost:3000/admin/notification-campaigns/${campaignId}/approve`, {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer token_admin' }
});

// 4. الاختبار قبل الإرسال
await fetch(`http://localhost:3000/admin/notification-campaigns/${campaignId}/test`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer token_editor' }
});

// 5. الإرسال الفعلي
await fetch(`http://localhost:3000/admin/notification-campaigns/${campaignId}/send`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer token_admin' }
});

// 6. عرض سجل العمليات
const logsResp = await fetch('http://localhost:3000/admin/audit-logs?resource_type=notification_campaign', {
  headers: { 'Authorization': 'Bearer token_admin' }
});
const logs = await logsResp.json();
console.log(logs);
```

---

## التحديثات المستقبلية

- [ ] تطبيق إرسال Firebase Admin SDK الفعلي
- [ ] إعادة محاولة الإرسال للحملات الفاشلة
- [ ] جدولة الحملات (scheduled_at)
- [ ] تقسيم الجمهور (audience segmentation)
- [ ] تتبع معدلات التسليم والقراءة
- [ ] نماذج رسائل مسبقة (templates)
- [ ] A/B testing للحملات

---

**آخر تحديث:** 2026-06-19
**الإصدار:** 1.0.0 (كامل)
