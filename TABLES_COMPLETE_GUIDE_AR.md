# 📋 دليل الجداول الشامل - IMEI APP

**التاريخ:** 19 أبريل 2026  
**الإصدار:** 1.0  
**الحالة:** ✅ نهائي

---

## 🗂️ جدول المحتويات

1. [الجداول الأساسية](#الجداول-الأساسية)
2. [جداول المنتجات](#جداول-المنتجات)
3. [جداول المعاملات](#جداول-المعاملات)
4. [جداول الأمان](#جداول-الأمان)
5. [جداول السجلات](#جداول-السجلات)

---

# الجداول الأساسية

## 1. جدول USERS
**الوظيفة:** بيانات المستخدمين الأساسية  
**الملكية:** كل مستخدم يمتلك صفه فقط  
**حجم البيانات:** المتوسط (بيانات شخصية محدودة)

### الأعمدة الرئيسية:
```
id (UUID)           - معرف المستخدم الفريد
email (text)        - البريد الإلكتروني (مفتاح تسجيل الدخول)
phone_number        - رقم الهاتف (مشفر)
full_name          - الاسم الكامل (مشفر)
role               - الدور (user, seller, admin, super_admin)
status             - الحالة (active, disabled, banned)
created_at         - تاريخ الإنشاء
```

### العلاقات:
```
has many → businesses (1-to-many)
has many → registered_phones (1-to-many)
has many → payments (1-to-many)
has many → notifications (1-to-many)
has many → phone_reports (1-to-many)
has many → users_plans (1-to-many)
has many → audit_logs (1-to-many)
```

### سياسات الأمان:
```
✅ SELECT: كل مستخدم يرى بيانته الخاصة فقط
✅ UPDATE: كل مستخدم يحدّث بيانته الخاصة
✅ DELETE: ممنوع (تعطيل الحساب فقط)
✅ ADMIN: المسؤولون يرون الكل
```

### مثال الاستخدام في الخادم:
```javascript
// SELECT
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .maybeSingle();

// UPDATE (تحديث النهاية فقط)
const { error } = await supabase
  .from('users')
  .update({ full_name: newName })
  .eq('id', userId);
```

---

## 2. جدول BUSINESSES
**الوظيفة:** معلومات الشركات والمتاجر  
**الملكية:** المستخدم الذي أنشأ الشركة (user_id)  
**حجم البيانات:** المتوسط

### الأعمدة الرئيسية:
```
id (UUID)           - معرف الشركة الفريد
user_id (UUID)      - معرف المالك (foreign key → users)
business_name       - اسم الشركة
description         - وصف الشركة
city                - المدينة
phone              - رقم الهاتف
verified           - هل تم التحقق من الشركة
rating             - التقييم (0-5)
created_at         - تاريخ الإنشاء
```

### العلاقات:
```
belongs to → users (many-to-one)
has many → phones (1-to-many)
has many → advertisements (1-to-many)
```

### سياسات الأمان:
```
✅ SELECT: 
   - المالك يرى شركته
   - الجميع يرون الشركات المتحققة (verified = true)
   - المسؤولون يرون الكل

✅ INSERT: فقط صاحب الشركة
✅ UPDATE: فقط صاحب الشركة
✅ DELETE: فقط صاحب الشركة
✅ VERIFY: المسؤولون فقط
```

### مثال الاستخدام:
```javascript
// إنشاء شركة جديدة
const { data: business } = await supabase
  .from('businesses')
  .insert({
    user_id: userId,
    business_name: 'متجري',
    city: 'الرياض'
  })
  .select();

// عرض الشركات المتحققة للجميع
const { data: shops } = await supabase
  .from('businesses')
  .select('*')
  .eq('verified', true);
```

---

# جداول المنتجات

## 3. جدول REGISTERED_PHONES
**الوظيفة:** الهواتف المسجلة في النظام  
**الملكية:** المستخدم الذي سجل الهاتف (user_id)  
**حجم البيانات:** كبير (بيانات حساسة مشفرة)

### الأعمدة الرئيسية:
```
id (UUID)           - معرف الهاتف الفريد
user_id (UUID)      - معرف المالك
imei (bytea)        - رقم IMEI (مشفر)
phone_number (bytea)- رقم الهاتف (مشفر)
owner_name (bytea)  - اسم المالك (مشفر)
email (bytea)       - البريد الإلكتروني (مشفر)
id_last6 (bytea)    - آخر 6 أرقام الهوية (مشفر)
brand               - العلامة التجارية
model               - الموديل
status              - الحالة (active, lost, stolen, inactive)
registration_date   - تاريخ التسجيل
```

### العلاقات:
```
belongs to → users (many-to-one)
has many → phone_reports (1-to-many)
has many → transfer_records (1-to-many)
```

### سياسات الأمان:
```
✅ SELECT: 
   - المالك يرى هواتفه
   - المسؤولون يرون الكل

✅ INSERT: فقط المالك
✅ UPDATE: فقط المالك
✅ DELETE: فقط المالك
```

### ملاحظات الأمان:
```
🔐 البيانات مشفرة بـ AES-256-GCM
🔐 IV عشوائي لكل عملية تشفير
🔐 Authentication tag للتحقق من سلامة البيانات
```

### مثال الاستخدام:
```javascript
// تسجيل هاتف جديد
const { data: phone } = await supabase
  .from('registered_phones')
  .insert({
    user_id: userId,
    imei: encryptAES(imei),
    phone_number: encryptAES(phoneNumber),
    owner_name: encryptAES(ownerName),
    brand: 'iPhone',
    model: '14 Pro',
    status: 'active'
  })
  .select();
```

---

## 4. جدول PHONES (للبيع)
**الوظيفة:** الهواتف المعروضة للبيع  
**الملكية:** البائع الذي أضاف الهاتف (seller_id)  
**حجم البيانات:** كبير

### الأعمدة الرئيسية:
```
id (UUID)           - معرف الهاتف الفريد
seller_id (UUID)    - معرف البائع
title              - عنوان الإعلان
brand              - العلامة التجارية
model              - الموديل
description        - الوصف التفصيلي
price              - السعر
condition          - الحالة (new, used, refurbished)
city               - المدينة
status             - الحالة (active, sold, inactive)
featured           - هل مميز؟
views_count        - عدد المشاهدات
created_at         - تاريخ الإنشاء
```

### العلاقات:
```
belongs to → users (seller_id)
has many → phone_images (1-to-many)
has many → phones_for_sale (1-to-many)
```

### سياسات الأمان:
```
✅ SELECT: 
   - الجميع يرون الهواتف المنشورة (status = active)
   - البائع يرى جميع هواتفه (بما فيها المخفية)
   - المسؤولون يرون الكل

✅ INSERT: فقط البائع
✅ UPDATE: فقط البائع (أو المسؤولون يغيرون الحالة)
✅ DELETE: فقط البائع
```

### مثال الاستخدام:
```javascript
// إضافة هاتف للبيع
const { data: phone } = await supabase
  .from('phones')
  .insert({
    seller_id: userId,
    title: 'iPhone 14 Pro أسود',
    brand: 'Apple',
    price: 3500,
    condition: 'used',
    city: 'الرياض',
    status: 'active'
  })
  .select();

// البحث عن هواتف
const { data: phones } = await supabase
  .from('phones')
  .select('*')
  .eq('status', 'active')
  .eq('city', 'الرياض');
```

---

## 5. جدول PHONE_IMAGES
**الوظيفة:** صور الهواتف المعروضة  
**الملكية:** صاحب الهاتف (من خلال phone_id)  
**حجم البيانات:** كبير جداً

### الأعمدة الرئيسية:
```
id (UUID)           - معرف الصورة الفريد
phone_id (UUID)     - معرف الهاتف
image_path (text)   - مسار الصورة (URL)
main_image          - هل صورة رئيسية؟
order               - ترتيب الصورة
created_at          - تاريخ الإنشاء
```

### العلاقات:
```
belongs to → phones (many-to-one)
```

### سياسات الأمان:
```
✅ SELECT: 
   - الجميع يرون صور الهواتف المنشورة
   - البائع يرى جميع صوره

✅ INSERT: فقط البائع
✅ UPDATE: فقط البائع
✅ DELETE: فقط البائع
```

---

## 6. جدول ACCESSORIES (الملحقات)
**الوظيفة:** ملحقات الهواتف (شاحن، كابل، إلخ)  
**الملكية:** البائع (seller_id)  
**حجم البيانات:** كبير

### مشابه لـ PHONES:
```
- نفس البنية تقريباً
- نفس السياسات الأمنية
- له جدول images خاص به (accessory_images)
```

---

## 7. جدول PHONES_FOR_SALE
**الوظيفة:** جدول وسيط يربط الهواتف بالدفعات  
**الملكية:** تابع للهاتف (من خلال phone_id)  
**حجم البيانات:** المتوسط

### الأعمدة:
```
id (UUID)           - معرف الإعلان الفريد
phone_id (UUID)     - معرف الهاتف
asking_price        - السعر المطلوب
availability        - التوفر (available, sold, pending)
created_at          - تاريخ الإنشاء
```

---

# جداول المعاملات

## 8. جدول PAYMENTS
**الوظيفة:** سجل جميع الدفعات والمعاملات المالية  
**الملكية:** المستخدم الذي قام بالدفع (user_id)  
**حجم البيانات:** كبير جداً

### الأعمدة الرئيسية:
```
id (UUID)           - معرف الدفعة الفريد
user_id (UUID)      - معرف المستخدم
amount              - المبلغ
currency            - العملة (SAR, USD, etc.)
payment_method      - طريقة الدفع (card, bank, wallet)
status              - الحالة (completed, failed, pending)
transaction_id      - معرف المعاملة الخارجي
created_at          - تاريخ الدفع
```

### العلاقات:
```
belongs to → users (many-to-one)
```

### سياسات الأمان:
```
✅ SELECT: 
   - المستخدم يرى دفعاته
   - المسؤولون يرون الكل

✅ INSERT: من الخادم فقط (RPC)
✅ UPDATE: ممنوع (سجل دائم)
✅ DELETE: ممنوع (سجل دائم)
```

### ملاحظات:
```
📌 هذا الجدول سجل غير قابل للتعديل
📌 كل دفعة يجب أن تكون موثقة
📌 للحصول على تاريخ جميع الدفعات للمستخدم
```

---

## 9. جدول ADS_PAYMENT (دفعات الإعلانات)
**الوظيفة:** سجل دفعات الإعلانات  
**الملكية:** المعلن (advertiser_id)  
**حجم البيانات:** كبير

### الأعمدة:
```
id (UUID)           - معرف الدفعة
advertiser_id (UUID)- معرف المعلن
ad_type             - نوع الإعلان (banner, featured, etc.)
amount              - المبلغ
status              - الحالة (completed, pending, failed)
valid_from          - تاريخ البداية
valid_to            - تاريخ النهاية
```

### سياسات الأمان:
```
✅ SELECT: المعلن يرى دفعاته
✅ INSERT: فقط عند الشراء
✅ UPDATE/DELETE: ممنوع
```

---

## 10. جدول TRANSFER_RECORDS
**الوظيفة:** سجل نقل ملكية الهواتف  
**الملكية:** المرسل والمستقبل  
**حجم البيانات:** المتوسط

### الأعمدة:
```
id (UUID)           - معرف السجل
phone_id (UUID)     - معرف الهاتف
from_user_id (UUID) - المالك الأول
to_user_id (UUID)   - المالك الجديد
transfer_date       - تاريخ النقل
reason              - السبب (sale, gift, recovery)
notes               - ملاحظات
```

### سياسات الأمان:
```
✅ SELECT: المرسل والمستقبل
✅ INSERT: من الخادم (RPC)
✅ UPDATE/DELETE: ممنوع (سجل دائم)
```

---

# جداول الأمان

## 11. جدول PHONE_REPORTS
**الوظيفة:** تقارير الهواتف المفقودة/المسروقة  
**الملكية:** المبلغ (reporter_id)  
**حجم البيانات:** كبير

### الأعمدة الرئيسية:
```
id (UUID)           - معرف التقرير الفريد
phone_id (UUID)     - معرف الهاتف المبلغ عنه
reporter_id (UUID)  - معرف المبلغ
report_type         - نوع التقرير (lost, stolen, damaged)
description         - الوصف التفصيلي
status              - الحالة (open, investigating, resolved)
is_public           - هل التقرير عام؟
created_at          - تاريخ التقرير
```

### سياسات الأمان:
```
✅ SELECT: 
   - المبلغ يرى تقريره
   - الجميع يرون التقارير العامة
   - المسؤولون يرون الكل

✅ INSERT: أي مستخدم يمكنه التبليغ
✅ UPDATE: المبلغ قبل الحل، المسؤول دائماً
✅ DELETE: المبلغ فقط
```

---

## 12. جدول NOTIFICATIONS
**الوظيفة:** إشعارات المستخدمين  
**الملكية:** المستخدم (user_id)  
**حجم البيانات:** كبير جداً

### الأعمدة:
```
id (UUID)           - معرف الإشعار
user_id (UUID)      - معرف المستخدم المستقبل
title              - عنوان الإشعار
message            - نص الرسالة
type               - النوع (alert, info, warning, success)
is_read            - هل تم قراءته؟
related_id         - معرف العنصر المرتبط
created_at         - تاريخ الإنشاء
```

### سياسات الأمان:
```
✅ SELECT: المستخدم يرى إشعاراته فقط
✅ INSERT: من الخادم
✅ UPDATE: المستخدم يحدّث (is_read)
✅ DELETE: المستخدم يحذف
```

---

# جداول السياسات

## 13. جدول PLANS
**الوظيفة:** خطط الاشتراك المتاحة  
**الملكية:** عامة (من المسؤول)  

### الأعمدة:
```
id (UUID)           - معرف الخطة
plan_name          - اسم الخطة (basic, pro, premium)
description        - الوصف
price              - السعر الشهري
features           - المميزات (JSON)
duration_days      - المدة بالأيام
is_active          - هل الخطة مفعلة؟
```

### سياسات الأمان:
```
✅ SELECT: الجميع يرون الخطط النشطة
✅ INSERT/UPDATE/DELETE: المسؤولون فقط
```

---

## 14. جدول USERS_PLANS
**الوظيفة:** اشتراك المستخدمين في الخطط  
**الملكية:** المستخدم (user_id)  

### الأعمدة:
```
id (UUID)           - معرف الاشتراك
user_id (UUID)      - معرف المستخدم
plan_id (UUID)      - معرف الخطة
start_date          - تاريخ البداية
end_date            - تاريخ الانتهاء
auto_renew          - تجديد تلقائي؟
```

### سياسات الأمان:
```
✅ SELECT: المستخدم يرى اشتراكاته
✅ INSERT/UPDATE: المستخدم
✅ DELETE: المستخدم (إلغاء)
```

---

## 15. جدول ADS_PRICE
**الوظيفة:** أسعار الإعلانات  
**الملكية:** عامة

### الأعمدة:
```
id (UUID)           - معرف السعر
ad_type             - نوع الإعلان
duration            - المدة (يوم، أسبوع، شهر)
price              - السعر
currency           - العملة
```

### سياسات الأمان:
```
✅ SELECT: الجميع
✅ INSERT/UPDATE/DELETE: المسؤولون فقط
```

---

## 16. جدول ADS_OFFAR (العروض)
**الوظيفة:** عروض خاصة للإعلانات  

### سياسات الأمان:
```
✅ SELECT: الجميع يرون العروض النشطة
✅ INSERT/UPDATE/DELETE: المسؤولون فقط
```

---

# جداول الأمان الإضافية

## 17. جدول PHONE_PASSWORD_RESET_TOKENS
**الوظيفة:** رموز إعادة تعيين كلمة المرور  
**الصلاحية:** ساعة واحدة فقط

### الأعمدة:
```
id (UUID)           - معرف الرمز
user_id (UUID)      - معرف المستخدم
token              - الرمز المشفر
expires_at          - وقت انتهاء الصلاحية
used_at             - متى تم استخدامه
```

### ملاحظات:
```
🔒 يتم حذفه تلقائياً بعد ساعة
🔒 يتم حذفه بعد الاستخدام
🔒 رمز قوي عشوائي (32 بايت)
```

---

## 18. جدول REPORT_RESET_TOKENS
**الوظيفة:** رموز إعادة تعيين التقارير  
**الصلاحية:** مشابهة لرموز كلمة المرور

---

## 19. جدول USER_REWARDS
**الوظيفة:** مكافآت المستخدمين  
**الملكية:** المستخدم

### الأعمدة:
```
id (UUID)           - معرف المكافأة
user_id (UUID)      - معرف المستخدم
balance             - الرصيد الحالي
total_earned        - إجمالي المكتسب
total_spent         - إجمالي المصروف
currency            - العملة (points, coins, etc.)
```

---

# جداول السجلات

## 20. جدول AUDIT_LOGS
**الوظيفة:** سجل جميع العمليات المهمة  
**الملكية:** عامة

### الأعمدة:
```
id (UUID)           - معرف السجل
user_id (UUID)      - المستخدم
action_type         - نوع العملية (create, update, delete, login, payment)
resource_type       - نوع المورد (user, phone, payment)
resource_id         - معرف المورد
changes             - التغييرات (JSON)
ip_address          - عنوان IP
created_at          - تاريخ العملية
```

### مثال:
```json
{
  "action_type": "create_phone_report",
  "resource_type": "phone_report",
  "resource_id": "uuid-123",
  "changes": {
    "report_type": "stolen",
    "status": "open"
  },
  "ip_address": "192.168.1.1"
}
```

---

## 21. جدول GAME_WIN (أرباح اللعبة)
**الوظيفة:** سجل أرباح اللعبة  
**الملكية:** المستخدم

### الأعمدة:
```
id (UUID)           - معرف الربح
user_id (UUID)      - معرف المستخدم
amount              - المبلغ الفائز
game_type           - نوع اللعبة
won_at              - تاريخ الفوز
claimed             - هل تم استلام الجائزة؟
```

---

## 22. جدول SUPPORT (الدعم الفني)
**الوظيفة:** طلبات الدعم الفني  
**الملكية:** المستخدم (user_id)

### الأعمدة:
```
id (UUID)           - معرف الطلب
user_id (UUID)      - معرف المستخدم
category            - الفئة (billing, technical, general)
subject             - الموضوع
description         - الوصف التفصيلي
status              - الحالة (open, in_progress, resolved, closed)
priority            - الأولوية (low, medium, high)
assigned_to         - المسؤول المعين
created_at          - تاريخ الإنشاء
resolved_at         - تاريخ الحل
```

---

## 23. جدول ACCESSORY_IMAGES
**الوظيفة:** صور الملحقات  
**مشابه لـ:** PHONE_IMAGES

---

# 📊 ملخص العلاقات

```
┌─────────────────────────────────────────────┐
│              USERS (المستخدم)              │
└──────────────┬────────────────────────────┘
               │
     ┌─────────┼──────────┬──────────┐
     │         │          │          │
     ▼         ▼          ▼          ▼
 BUSINESSES REGISTERED  PAYMENTS  PHONE
            PHONES                REPORTS

┌─────────────────────────────────────────────┐
│          PHONES (الهواتف للبيع)             │
└──────────┬────────────────────────────────┘
           │
     ┌─────┴─────┬──────────┐
     │           │          │
     ▼           ▼          ▼
PHONE_     PHONES_FOR_   TRANSFER_
IMAGES        SALE       RECORDS

┌─────────────────────────────────────────────┐
│        ACCESSORIES (الملحقات)              │
└──────────┬────────────────────────────────┘
           │
           ▼
      ACCESSORY_
       IMAGES
```

---

# 🔐 ملخص الأمان

| الجدول | البيانات المشفرة | RLS | Audit |
|--------|-----------------|-----|-------|
| users | full_name, phone_number, email, id_last6 | ✅ | ✅ |
| registered_phones | جميع البيانات | ✅ | ✅ |
| phones | صور فقط (مشفرة) | ✅ | ✅ |
| payments | تفاصيل الدفعة | ✅ | ✅ |
| phone_reports | وصف التقرير | ✅ | ✅ |

---

# 🎯 التوصيات

## للمطورين:
1. **استخدم التشفير**: تشفر جميع البيانات الحساسة
2. **تحقق من الملكية**: تأكد أن المستخدم يمتلك المورد
3. **سجل العمليات**: استخدم audit logs
4. **معالج الأخطاء**: استخدم رسائل واضحة

## للمسؤولين:
1. **مراقب الحسابات**: تفقد الحسابات المشبوهة
2. **تحديث السياسات**: راجع السياسات دورياً
3. **النسخ الاحتياطية**: احتفظ بنسخ احتياطية يومية
4. **المراجعة الأمنية**: اختبر الثغرات شهرياً

---

# 📚 ملفات إضافية

- `RLS_SECURITY_POLICIES_COMPLETE.sql` - جميع سياسات الأمان
- `AUTOMATIC_SECURITY_FIXES.md` - شرح الثغرات والحلول
- `DONE.md` - ملخص سريع

---

**تم إنشاؤه:** 19 أبريل 2026  
**الحالة:** ✅ جاهز للاستخدام  
**الإصدار:** 1.0
