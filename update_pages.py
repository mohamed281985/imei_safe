import os
import re

# قائمة الصفحات المراد تحديثها
pages_dir = "c:/Users/alm7lawer4/Desktop/New Folder (3)/new-imei12/src/pages"
hook_import = "import { useScrollToTop } from '../hooks/useScrollToTop';"
hook_call = "  useScrollToTop();"

# قائمة الصفحات
pages = [
    "AdDetails.tsx", "BusinessProfileComplete.tsx", "BusinessSignup.tsx", 
    "BusinessTransfer.tsx", "BusinessTransferbuy.tsx", "BusinessTransfersell.tsx",
    "CreateAdvertisement.tsx", "ForgotPassword.tsx", "Index.tsx",
    "LanguageSelect.tsx", "Login.tsx", "MyAds.tsx", "MyReports.tsx",
    "NotFound.tsx", "Owner.tsx", "OwnershipTransfer.tsx", "PayToUnlock.tsx",
    "PhoneDetails.tsx", "PublishAd.tsx", "RegisterPhone.tsx", "Report.tsx",
    "ReportPhone.tsx", "Reset.tsx", "ResetRegister.tsx", "SearchIMEI.tsx",
    "Signup.tsx", "SpecialAd.tsx", "SplashScreen.tsx", "TransferHistory.tsx",
    "Welcome.tsx"
]

for page in pages:
    file_path = os.path.join(pages_dir, page)
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # تحقق من وجود الاستيراد
            if 'useScrollToTop' not in content:
                # إضافة الاستيراد
                if 'import React' in content:
                    content = content.replace(
                        'import React',
                        f'{hook_import}\nimport React'
                    )

                # إضافة استدعاء الhook
                component_match = re.search(r'const \w+: React\.FC.*?= \(\) => \{', content)
                if component_match:
                    end_pos = component_match.end()
                    content = content[:end_pos] + f'\n{hook_call}' + content[end_pos:]

            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)

            print(f"تم تحديث {page}")
        except Exception as e:
            print(f"خطأ في تحديث {page}: {e}")

print("تم الانتهاء من تحديث جميع الصفحات")
