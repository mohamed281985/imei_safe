/**
 * ملف تشخيصي لمشاكل النصوص العربية في PDF
 * Arabic Text PDF Diagnostic Tool
 */

import { processArabicText, loadArabicFont } from './arabic-text';
import { processArabicTextWithEncoding, loadArabicFontSafe } from './arabic-text-improved';

export interface DiagnosticResult {
  test: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

/**
 * تشخيص شامل لمشاكل النصوص العربية
 * Comprehensive Arabic text diagnostic
 */
export const diagnoseArabicTextIssues = async (): Promise<DiagnosticResult[]> => {
  const results: DiagnosticResult[] = [];

  // Test 1: Check if Arabic reshaper is working
  try {
    const testText = "مرحبا بك في تطبيق IMEI فايندر";
    const processed = processArabicText(testText);

    if (processed === testText) {
      results.push({
        test: 'Arabic Reshaper',
        status: 'warning',
        message: 'Arabic reshaper may not be working properly',
        details: { original: testText, processed }
      });
    } else {
      results.push({
        test: 'Arabic Reshaper',
        status: 'success',
        message: 'Arabic text processing is working',
        details: { original: testText, processed }
      });
    }
  } catch (error) {
    results.push({
      test: 'Arabic Reshaper',
      status: 'error',
      message: 'Arabic reshaper failed completely',
      details: error
    });
  }

  // Test 2: Check font loading
  try {
    const mockDoc = {
      addFileToVFS: (name: string, data: string) => console.log('Font added to VFS:', name),
      addFont: (file: string, family: string, style: string) => console.log('Font registered:', family),
      setFont: (family: string) => console.log('Font set:', family)
    };

    await loadArabicFont(mockDoc as any);
    results.push({
      test: 'Font Loading',
      status: 'success',
      message: 'Arabic font loaded successfully'
    });
  } catch (error) {
    results.push({
      test: 'Font Loading',
      status: 'error',
      message: 'Failed to load Arabic font',
      details: error
    });
  }

  // Test 3: Check encoding
  try {
    const testText = "إيصال نقل ملكية هاتف";
    const encoded = encodeURIComponent(testText);
    const decoded = decodeURIComponent(encoded);

    if (decoded === testText) {
      results.push({
        test: 'Text Encoding',
        status: 'success',
        message: 'Text encoding is working correctly'
      });
    } else {
      results.push({
        test: 'Text Encoding',
        status: 'error',
        message: 'Text encoding issues detected',
        details: { original: testText, encoded, decoded }
      });
    }
  } catch (error) {
    results.push({
      test: 'Text Encoding',
      status: 'error',
      message: 'Text encoding test failed',
      details: error
    });
  }

  // Test 4: Check browser support
  const browserSupport = {
    fetch: typeof fetch !== 'undefined',
    fileReader: typeof FileReader !== 'undefined',
    blob: typeof Blob !== 'undefined',
    unicode: /[\u0600-\u06FF]/.test('العربية')
  };

  const supportIssues = Object.entries(browserSupport)
    .filter(([key, supported]) => !supported)
    .map(([key]) => key);

  if (supportIssues.length === 0) {
    results.push({
      test: 'Browser Support',
      status: 'success',
      message: 'All required browser features are supported'
    });
  } else {
    results.push({
      test: 'Browser Support',
      status: 'error',
      message: 'Some browser features are not supported',
      details: { unsupported: supportIssues }
    });
  }

  return results;
};

/**
 * طباعة تقرير التشخيص
 * Print diagnostic report
 */
export const printDiagnosticReport = async (): Promise<void> => {
  console.log('🔍 بدء تشخيص مشاكل النصوص العربية في PDF...');
  console.log('🔍 Starting Arabic text PDF diagnostic...');

  const results = await diagnoseArabicTextIssues();

  console.log('\n📊 نتائج التشخيص / Diagnostic Results:');
  console.log('=====================================');

  results.forEach((result, index) => {
    const statusIcon = result.status === 'success' ? '✅' : 
                      result.status === 'warning' ? '⚠️' : '❌';

    console.log(`\n${index + 1}. ${statusIcon} ${result.test}`);
    console.log(`   الحالة / Status: ${result.status.toUpperCase()}`);
    console.log(`   الرسالة / Message: ${result.message}`);

    if (result.details) {
      console.log(`   التفاصيل / Details:`, result.details);
    }
  });

  console.log('\n🔧 الحلول المقترحة / Suggested Solutions:');
  console.log('=====================================');

  const errorCount = results.filter(r => r.status === 'error').length;
  const warningCount = results.filter(r => r.status === 'warning').length;

  if (errorCount === 0 && warningCount === 0) {
    console.log('✅ لا توجد مشاكل! النظام يعمل بشكل صحيح.');
    console.log('✅ No issues found! The system is working correctly.');
  } else {
    console.log('📋 قائمة الحلول المقترحة:');
    console.log('1. تأكد من وجود ملف الخط في /public/fonts/Amiri-Regular.ttf');
    console.log('2. تحقق من أن المكتبات مثبتة بشكل صحيح: npm install arabic-persian-reshaper bidi-js');
    console.log('3. استخدم الدالة المحسنة processArabicTextWithEncoding بدلاً من processArabicText');
    console.log('4. استخدم loadArabicFontSafe بدلاً من loadArabicFont للحصول على معالجة أفضل للأخطاء');
  }
};

/**
 * اختبار سريع للنص العربي
 * Quick Arabic text test
 */
export const quickArabicTest = (text: string): void => {
  console.log('🧪 اختبار سريع للنص العربي / Quick Arabic Test');
  console.log('===============================================');
  console.log('النص الأصلي / Original text:', text);

  try {
    const processed = processArabicText(text);
    console.log('النص المعالج / Processed text:', processed);
    console.log('هل تم التعديل؟ / Was modified?', processed !== text ? 'نعم / Yes' : 'لا / No');
  } catch (error) {
    console.debug('خطأ في المعالجة / Processing error:', error);
  }
};
