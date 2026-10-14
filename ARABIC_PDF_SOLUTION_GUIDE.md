# دليل حل مشاكل النصوص العربية في PDF
# Arabic Text PDF Issues Solution Guide

## المشكلة الرئيسية / Main Problem
عند إنشاء ملفات PDF تحتوي على نصوص عربية، تظهر النصوص كرموز غريبة بدلاً من النص العربي الصحيح.

When creating PDF files containing Arabic text, the text appears as strange symbols instead of proper Arabic text.

## الأسباب المحتملة / Possible Causes

### 1. مشكلة في الخط / Font Issues
- الخط العربي غير محمل بشكل صحيح
- ملف الخط مفقود أو تالف
- مسار الخط غير صحيح

### 2. مشكلة في ترميز النص / Text Encoding Issues
- النص غير مرمز بـ UTF-8 بشكل صحيح
- مشكلة في تحويل النص إلى Base64

### 3. مشكلة في معالجة النص العربي / Arabic Text Processing Issues
- مكتبة arabic-persian-reshaper لا تعمل بشكل صحيح
- مكتبة bidi-js غير مهيأة بشكل صحيح
- عدم ربط الأحرف العربية بشكل صحيح

## الحلول المقترحة / Suggested Solutions

### الحل الأول: استخدام الملف المحسن
قم بتحديث استيراد الملف في OwnershipTransfer.tsx:

```typescript
// استبدل هذا السطر
import { processArabicText, loadArabicFont } from '../utils/pdf/arabic-text';

// بهذا السطر
import { processArabicTextWithEncoding, loadArabicFontSafe } from '../utils/pdf/arabic-text-improved';
```

### الحل الثاني: تحديث دالة إنشاء PDF
استبدل الكود في generateTransferPdf:

```typescript
// استبدل هذا
try {
  await loadArabicFont(doc);
  fontForTable = 'Amiri';
} catch (fontError) {
  console.error("Could not load Arabic font.", fontError);
  doc.setFont('helvetica');
}

// بهذا
const fontLoaded = await loadArabicFontSafe(doc);
if (fontLoaded) {
  fontForTable = 'Amiri';
  console.log('Arabic font loaded successfully');
} else {
  console.warn('Using fallback font - Arabic text may not display correctly');
  fontForTable = 'helvetica';
}
```

### الحل الثالث: تحديث معالجة النصوص
استبدل جميع استخدامات processArabicText بـ processArabicTextWithEncoding:

```typescript
// استبدل هذا
doc.text(processArabicText("إيصال نقل ملكية هاتف"), xPosRight, 25, { align: 'right' });

// بهذا
doc.text(processArabicTextWithEncoding("إيصال نقل ملكية هاتف"), xPosRight, 25, { align: 'right' });
```

### الحل الرابع: إضافة خطوط احتياطية
قم بتحميل خطوط عربية إضافية في مجلد public/fonts/:

1. Cairo-Regular.ttf
2. NotoSansArabic-Regular.ttf  
3. Tajawal-Regular.ttf

### الحل الخامس: تشخيص المشكلة
استخدم أداة التشخيص لفهم المشكلة بشكل أفضل:

```typescript
import { printDiagnosticReport, quickArabicTest } from '../utils/pdf/arabic-diagnostic';

// في console المتصفح
printDiagnosticReport();
quickArabicTest("مرحبا بك في التطبيق");
```

## خطوات التنفيذ / Implementation Steps

### الخطوة 1: تحديث الاستيرادات
```typescript
// في OwnershipTransfer.tsx
import { 
  processArabicTextWithEncoding as processArabicText, 
  loadArabicFontSafe as loadArabicFont 
} from '../utils/pdf/arabic-text-improved';
```

### الخطوة 2: تحديث دالة تحميل الخط
```typescript
const generateTransferPdf = async () => {
  const doc = new jsPDF();
  let fontForTable = 'helvetica';

  // تحميل الخط العربي مع معالجة أفضل للأخطاء
  const fontLoaded = await loadArabicFont(doc);
  if (fontLoaded) {
    fontForTable = 'Amiri';
  } else {
    toast({
      title: 'تنبيه',
      description: 'لم يتم تحميل الخط العربي. قد لا تظهر النصوص بشكل صحيح.',
      variant: 'default',
    });
  }

  // باقي الكود...
};
```

### الخطوة 3: تحديث معالجة النصوص
استبدل جميع استخدامات processArabicText في الجداول والنصوص.

## التحقق من النجاح / Success Verification

1. افتح وحدة التحكم في المتصفح
2. قم بتشغيل: `printDiagnosticReport()`
3. تحقق من أن جميع الاختبارات تظهر ✅ أو ⚠️
4. جرب إنشاء PDF جديد
5. تحقق من أن النصوص العربية تظهر بشكل صحيح

## المشاكل الشائعة وحلولها / Common Issues and Solutions

### المشكلة: "Font file not found"
**الحل**: تأكد من وجود ملف Amiri-Regular.ttf في مجلد public/fonts/

### المشكلة: النصوص تظهر معكوسة
**الحل**: تأكد من أن مكتبة bidi-js تعمل بشكل صحيح

### المشكلة: الأحرف غير مترابطة
**الحل**: تأكد من أن مكتبة arabic-persian-reshaper تعمل بشكل صحيح

### المشكلة: رسالة خطأ في وحدة التحكم
**الحل**: استخدم الدالة المحسنة loadArabicFontSafe

## موارد إضافية / Additional Resources

1. مكتبة jsPDF: https://github.com/parallax/jsPDF
2. خطوط عربية مجانية: https://fonts.google.com/?subset=arabic
3. أدوات اختبار النصوص العربية: Arabic text testing tools

---

## ملاحظات مهمة / Important Notes

- تأكد من أن جميع النصوص مرمزة بـ UTF-8
- استخدم الدوال المحسنة للحصول على أفضل النتائج
- قم بتشغيل أداة التشخيص قبل الإبلاغ عن أي مشاكل
- احتفظ بنسخة احتياطية من الملفات قبل التعديل
