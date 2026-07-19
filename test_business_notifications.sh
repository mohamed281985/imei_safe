#!/bin/bash

# ملف اختبار مسارات الموافقة والرفض للشركات
# Business Verification Notification Testing Script

# المتغيرات
API_URL="http://localhost:3000"
ADMIN_TOKEN="your_admin_token_here"
USER_ID="test_business_user_id"

echo "==================================="
echo "Business Verification Test Suite"
echo "==================================="

# 1. اختبار الموافقة
echo -e "\n[1] Testing: POST /admin/businesses/:userId/approve"
curl -X POST "$API_URL/admin/businesses/$USER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n\n"

# 2. اختبار الرفض
echo -e "\n[2] Testing: POST /admin/businesses/:userId/reject"
curl -X POST "$API_URL/admin/businesses/$USER_ID/reject" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "صورة رخصة غير واضحة - License image is not clear"}' \
  -w "\nHTTP Status: %{http_code}\n\n"

# 3. اختبار الرفض بدون سبب (يجب أن يفشل)
echo -e "\n[3] Testing: POST /admin/businesses/:userId/reject (بدون سبب - should fail)"
curl -X POST "$API_URL/admin/businesses/$USER_ID/reject" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n\n"

# 4. التحقق من الإشعارات
echo -e "\n[4] Checking: Notifications in database"
echo "Note: Check notifications table for type: 'business_approved' or 'business_rejected'"

# 5. التحقق من FCM Token
echo -e "\n[5] Checking: FCM Token requirement"
echo "Note: Verify user has fcm_token in users table"

# 6. التحقق من البريد الإلكتروني
echo -e "\n[6] Checking: Email configuration"
echo "Note: Verify RESEND_API_KEY is set in environment"

echo -e "\n==================================="
echo "Test Suite Completed"
echo "==================================="
