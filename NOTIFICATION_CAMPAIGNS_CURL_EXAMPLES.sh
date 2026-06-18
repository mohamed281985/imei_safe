#!/bin/bash
# نظام إدارة حملات الإشعارات - أمثلة Curl عملية
# قابل للتنفيذ مباشرة بعد تعديل التوكنات والمعرفات

BASE_URL="http://localhost:3000"
# استبدل بـ توكنات حقيقية
TOKEN_EDITOR="your_editor_token_here"
TOKEN_ADMIN="your_admin_token_here"

# ألوان للإخراج
GREEN='\\033[0;32m'\nBLUE='\\033[0;34m'\nYELLOW='\\033[1;33m'\nRED='\\033[0;31m'\nNC='\\033[0m' # No Color

# ==================== مثال 1: الإنشاء ====================
echo -e \"${BLUE}📝 مثال 1: إنشاء حملة جديدة${NC}\"
echo -e \"${YELLOW}POST /admin/notification-campaigns${NC}\"

curl -X POST \\
  \"${BASE_URL}/admin/notification-campaigns\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"title\": \"عرض الصيف الكبير\",
    \"message\": \"احصل على خصم 50% على كل المنتجات\",
    \"audience\": \"all\",
    \"metadata\": {
      \"campaign_type\": \"seasonal\",
      \"discount\": \"50%\"
    }
  }' | jq .

# حفظ معرف الحملة من الاستجابة
# CAMPAIGN_ID=\"...\"

echo -e \"\\n${GREEN}✓ تم الإنشاء بحالة draft${NC}\\n\"

# ==================== مثال 2: عرض الحملات ====================
echo -e \"${BLUE}📋 مثال 2: عرض الحملات${NC}\"
echo -e \"${YELLOW}GET /admin/notification-campaigns${NC}\"

curl -X GET \\
  \"${BASE_URL}/admin/notification-campaigns?page=1&limit=10&status=draft&sort_order=desc\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq .

echo -e \"\\n${GREEN}✓ تم عرض الحملات${NC}\\n\"

# ==================== مثال 3: عرض الحملات المتقدم ====================
echo -e \"${BLUE}🔍 مثال 3: عرض الحملات مع فلاتر متقدمة${NC}\"
echo -e \"${YELLOW}GET /admin/notification-campaigns/enhanced${NC}\"

curl -X GET \\
  \"${BASE_URL}/admin/notification-campaigns/enhanced?\\
page=1&\\
limit=20&\\
status=approved&\\
created_by=user_id_here&\\
audience=all&\\
campaign_type=seasonal&\\
date_from=2026-01-01T00:00:00Z&\\
date_to=2026-12-31T23:59:59Z&\\
sort_order=desc\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq .

echo -e \"\\n${GREEN}✓ تم عرض الملخص الشامل${NC}\\n\"

# ==================== مثال 4: عرض حملة واحدة ====================
echo -e \"${BLUE}📌 مثال 4: عرض حملة واحدة${NC}\"
echo -e \"${YELLOW}GET /admin/notification-campaigns/:id${NC}\"

# استبدل campaign-id-here بـ معرف حقيقي
curl -X GET \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq .

echo -e \"\\n${GREEN}✓ تم عرض تفاصيل الحملة${NC}\\n\"

# ==================== مثال 5: الاختبار ====================
echo -e \"${BLUE}🧪 مثال 5: إرسال اختبار${NC}\"
echo -e \"${YELLOW}POST /admin/notification-campaigns/:id/test${NC}\"

curl -X POST \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here/test\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq .

echo -e \"\\n${GREEN}✓ تم إرسال الاختبار إلى الأدمن الحالي${NC}\\n\"

# ==================== مثال 6: الإرسال للموافقة ====================
echo -e \"${BLUE}✉️ مثال 6: إرسال الحملة للموافقة${NC}\"
echo -e \"${YELLOW}PATCH /admin/notification-campaigns/:id/submit${NC}\"

curl -X PATCH \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here/submit\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq .

echo -e \"\\n${GREEN}✓ تم إرسال الحملة للموافقة (draft → pending_approval)${NC}\\n\"

# ==================== مثال 7: الموافقة ====================
echo -e \"${BLUE}✅ مثال 7: الموافقة على الحملة${NC}\"
echo -e \"${YELLOW}PATCH /admin/notification-campaigns/:id/approve${NC}\"

curl -X PATCH \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here/approve\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" | jq .

echo -e \"\\n${GREEN}✓ تم الموافقة على الحملة (pending_approval → approved)${NC}\\n\"

# ==================== مثال 8: الإرسال الفعلي ====================
echo -e \"${BLUE}🚀 مثال 8: إرسال الحملة الموافق عليها${NC}\"
echo -e \"${YELLOW}POST /admin/notification-campaigns/:id/send${NC}\"

curl -X POST \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here/send\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" | jq .

echo -e \"\\n${GREEN}✓ تم إرسال الحملة (approved → sending → completed)${NC}\\n\"

# ==================== مثال 9: الإلغاء ====================
echo -e \"${BLUE}❌ مثال 9: إلغاء الحملة${NC}\"
echo -e \"${YELLOW}PATCH /admin/notification-campaigns/:id/cancel${NC}\"

curl -X PATCH \\
  \"${BASE_URL}/admin/notification-campaigns/campaign-id-here/cancel\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"reason\": \"تم اكتشاف خطأ في البيانات\"
  }' | jq .

echo -e \"\\n${GREEN}✓ تم إلغاء الحملة (status → cancelled)${NC}\\n\"

# ==================== مثال 10: عرض سجل التدقيق ====================
echo -e \"${BLUE}📊 مثال 10: عرض سجل التدقيق للحملات${NC}\"
echo -e \"${YELLOW}GET /admin/audit-logs${NC}\"

curl -X GET \\
  \"${BASE_URL}/admin/audit-logs?\\
resource_type=notification_campaign&\\
status=success&\\
sort_order=desc&\\
page=1&\\
limit=50\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" | jq .

echo -e \"\\n${GREEN}✓ تم عرض السجل الشامل${NC}\\n\"

# ==================== مثال كامل متسلسل ====================
echo -e \"${BLUE}🔄 مثال 11: سيناريو كامل متسلسل${NC}\"
cat << 'EOF'
#!/bin/bash

# 1. إنشاء الحملة
RESPONSE=$(curl -s -X POST \\
  \"${BASE_URL}/admin/notification-campaigns\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"title\": \"عرض خاص\",
    \"message\": \"لا تفوت هذه الفرصة\"
  }')

CAMPAIGN_ID=$(echo $RESPONSE | jq -r '.data.id')
echo \"✓ تم الإنشاء: $CAMPAIGN_ID\"

# 2. إرسال للموافقة
curl -s -X PATCH \\
  \"${BASE_URL}/admin/notification-campaigns/${CAMPAIGN_ID}/submit\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" > /dev/null
echo \"✓ تم الإرسال للموافقة\"

# 3. اختبار سريع
curl -s -X POST \\
  \"${BASE_URL}/admin/notification-campaigns/${CAMPAIGN_ID}/test\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" > /dev/null
echo \"✓ تم الاختبار\"

# 4. الموافقة
curl -s -X PATCH \\
  \"${BASE_URL}/admin/notification-campaigns/${CAMPAIGN_ID}/approve\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" > /dev/null
echo \"✓ تم الموافقة\"

# 5. الإرسال الفعلي
curl -s -X POST \\
  \"${BASE_URL}/admin/notification-campaigns/${CAMPAIGN_ID}/send\" \\
  -H \"Authorization: Bearer ${TOKEN_ADMIN}\" > /dev/null
echo \"✓ تم الإرسال الفعلي\"

# 6. عرض النتيجة النهائية
echo \"\\n📊 النتيجة النهائية:\"
curl -s -X GET \\
  \"${BASE_URL}/admin/notification-campaigns/${CAMPAIGN_ID}\" \\
  -H \"Authorization: Bearer ${TOKEN_EDITOR}\" | jq '.data | {id, status, created_by, approved_by, completed_at}'

EOF

echo -e \"\\n${GREEN}✓ انسخ واستخدم السيناريو الكامل أعلاه${NC}\\n\"

# ==================== حالات الخطأ الشائعة ====================
echo -e \"${YELLOW}⚠️ حالات الخطأ الشائعة:${NC}\"
cat << 'EOF'

1. 401 Unauthorized
   السبب: التوكن غير صحيح أو منتهي
   الحل: تأكد من التوكن الصحيح

2. 403 Forbidden - missing can_send_notifications
   السبب: المستخدم لا يملك الصلاحية
   الحل: تحقق من جدول admin_permissions

3. 400 Cannot approve your own campaign
   السبب: تحاول الموافقة على حملتك
   الحل: اطلب من أدمن آخر الموافقة

4. 400 Campaign must be approved before sending
   السبب: تحاول إرسال حملة غير موافق عليها
   الحل: تابع الخطوات: submit → approve → send

5. 404 Campaign not found
   السبب: معرف الحملة غير صحيح
   الحل: تحقق من معرف الحملة

EOF

# ==================== الملخص ====================
echo -e \"${GREEN}======= ملخص الـ Endpoints =======${NC}\"
cat << 'EOF'

✅ POST   /admin/notification-campaigns              (إنشاء)
✅ GET    /admin/notification-campaigns              (عرض قائمة)
✅ GET    /admin/notification-campaigns/enhanced     (عرض مع فلاتر)
✅ GET    /admin/notification-campaigns/:id          (عرض واحدة)
✅ PATCH  /admin/notification-campaigns/:id/submit   (إرسال للموافقة)
✅ PATCH  /admin/notification-campaigns/:id/approve  (الموافقة)
✅ PATCH  /admin/notification-campaigns/:id/cancel   (الإلغاء)
✅ POST   /admin/notification-campaigns/:id/send     (الإرسال الفعلي)
✅ POST   /admin/notification-campaigns/:id/test     (اختبار)

الصلاحيات المطلوبة:
- can_send_notifications: إنشاء، عرض، اختبار، إرسال للموافقة
- can_approve_notifications: موافقة، إلغاء، إرسال فعلي

EOF
