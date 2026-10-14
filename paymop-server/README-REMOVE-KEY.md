تم حذف `firebase-service-account.json` من الشجرة العاملة لأنه يحتوي على مفتاح خاص (private_key).

الخطوات الموصى بها بعد الحذف:
1. تدوير مفاتيح حساب الخدمة عبر Google Cloud Console: إبطال المفتاح الحالي وإنشاء مفتاح جديد بصلاحيات محدودة.
2. لا تحفظ مفتاح الحساب في المستودع. بدلاً من ذلك، استخدم متغيرات بيئة في بيئة الإنتاج:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (لاحظ أنه يجب تخزين السلاسل مع استبدال الأسطر الجديدة `\n` عند الحاجة)
3. بدّل إعدادات الخادم لاستخدام متغيرات البيئة (الموجودة حالياً في `server.js`) أو استخدم Secret Manager.
4. لإزالة الملف من تاريخ Git نهائياً استخدم `bfg` أو `git filter-repo` ثم قم بدفع (push) بعد ذلك:

   مثال باستخدام BFG:

   ```bash
   bfg --delete-files firebase-service-account.json
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force
   ```

5. بعد تدوير المفاتيح، اختبر الخادم محلياً بتهيئة المتغيرات البيئية في `paymop-server/.env` أو باستخدام Secrets في المنصة.

إذا رغبت، أستطيع تحضير سكربت `git filter-repo` أو أوامر BFG مخصّصة لك، أو المساعدة في تدوير المفاتيح والتأكد من استعادة عمل التطبيق بعد التهيئة.
