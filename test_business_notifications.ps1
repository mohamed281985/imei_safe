# Business Verification Notification Testing Script for Windows
# اختبار مسارات الموافقة والرفض للشركات

$API_URL = "http://localhost:3000"
$ADMIN_TOKEN = "your_admin_token_here"
$USER_ID = "test_business_user_id"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "Business Verification Test Suite" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# 1. اختبار الموافقة
Write-Host "`n[1] Testing: POST /admin/businesses/:userId/approve" -ForegroundColor Yellow
$body1 = @{} | ConvertTo-Json
Invoke-WebRequest -Uri "$API_URL/admin/businesses/$USER_ID/approve" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $ADMIN_TOKEN"
    "Content-Type" = "application/json"
  } `
  -Body $body1 `
  -Verbose

# 2. اختبار الرفض
Write-Host "`n[2] Testing: POST /admin/businesses/:userId/reject" -ForegroundColor Yellow
$body2 = @{
  reason = "صورة رخصة غير واضحة - License image is not clear"
} | ConvertTo-Json

Invoke-WebRequest -Uri "$API_URL/admin/businesses/$USER_ID/reject" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $ADMIN_TOKEN"
    "Content-Type" = "application/json"
  } `
  -Body $body2 `
  -Verbose

# 3. اختبار الرفض بدون سبب (يجب أن يفشل)
Write-Host "`n[3] Testing: POST /admin/businesses/:userId/reject (بدون سبب - should fail)" -ForegroundColor Yellow
$body3 = @{} | ConvertTo-Json

try {
  Invoke-WebRequest -Uri "$API_URL/admin/businesses/$USER_ID/reject" `
    -Method POST `
    -Headers @{
      "Authorization" = "Bearer $ADMIN_TOKEN"
      "Content-Type" = "application/json"
    } `
    -Body $body3 `
    -Verbose
} catch {
  Write-Host "Expected Error: " -ForegroundColor Red
  Write-Host $_.Exception.Message
}

Write-Host "`n===================================" -ForegroundColor Cyan
Write-Host "Verification Checklist:" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

Write-Host "
✓ Check 1: Notifications in database
  - Query: SELECT * FROM notifications WHERE type IN ('business_approved', 'business_rejected')
  
✓ Check 2: User FCM Token
  - Query: SELECT fcm_token FROM users WHERE id = '$USER_ID'
  - Note: If NULL, FCM notifications won't be sent
  
✓ Check 3: Email Configuration
  - Environment: RESEND_API_KEY should be set
  - Test: Send a test email to verify Resend is working
  
✓ Check 4: Business Status Update
  - Query: SELECT status, reason FROM businesses WHERE user_id = '$USER_ID'
  - Expected: status='approved'|'rejected', reason='...'
  
✓ Check 5: Audit Logs
  - Query: SELECT * FROM audit_logs WHERE action IN ('approve_business', 'reject_business')
" -ForegroundColor Green

Write-Host "`nTest Suite Completed" -ForegroundColor Cyan
