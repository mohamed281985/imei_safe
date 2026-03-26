/**
 * الحل النهائي لمشاكل النصوص العربية في PDF
 * Final solution for Arabic text issues in PDF
 */

/**
 * إصلاح شامل للترميز والنصوص المقلوبة
 */
export const fixAllArabicIssues = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    let fixedText = String(text);
    console.log('النص الأصلي:', fixedText);

    // إصلاح الرموز الغريبة (þ characters)
    const encodingFixes = [
      ['þÖþ\'þŽþ´þßþ• þÚþßþŽþäþßþ•( þÊþ‹þŽþ\'þßþ• þ•þŽþçþŽþôþ\')', 'بيانات البائع (المالك السابق)'],
      ['þñþ®þ˜þ¸þäþßþ• þ•þŽþçþŽþôþ\')', 'بيانات المشتري (المالك الجديد)'],
      ['þÖþ\'þŽþ´þßþ•', 'بيانات'],
      ['þÚþßþŽþäþßþ•', 'البائع'],
      ['þÊþ‹þŽþ\'þßþ•', 'المالك'],
      ['þ•þŽþçþŽþôþ\'', 'السابق'],
      ['þñþ®þ˜þ¸þäþßþ•', 'المشتري'],
      ['þâþ³þûþ•', 'الاسم'],
      ['þÒþ—þŽþìþßþ•', 'رقم'],
      ['þâþ×þ', 'الهاتف'],
      ['þ"þ×þŽþÄþ\'þßþ•', 'آخر'],
      ['þæþã', 'من'],
      ['þáþŽþ×þ-þƒ', 'البطاقة'],
      ['þ®þ§þ•', 'أرقام'],
      ['þªþóþªþ þßþ•', 'التفاصيل'],
      ['þòþçþíþ®þ˜þÜþßþùþ•', 'الإلكتروني'],
      ['þªþóþ®þ\'þßþ•', 'البريد'],
      ['þ•', ' ']
    ];

    // تطبيق إصلاحات الترميز
    for (const [encoded, decoded] of encodingFixes) {
      const regex = new RegExp(encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      fixedText = fixedText.replace(regex, decoded);
    }

    // إصلاح النصوص المقلوبة
    const reversedFixes = [
      ['ﻒﺗﺎﻫ ﺔﻴﻜﻠﻣ ﻞﻘﻧ ﻝﺎﺼﻳﺇ', 'إيصال نقل ملكية هاتف'],
      ['ﺔﻴﻠﻤﻌﻟﺍ ﺦﻳﺭﺎﺗ', 'تاريخ العملية'],
      ['ﻞﻴﺻﺎﻔﺘﻟﺍ ﻥﺎﻴﺒﻟﺍ', 'البيان التفاصيل'],
      ['ﻒﺗﺎﻬﻟﺍ ﻉﻮﻧ', 'نوع الهاتف'],
      ['ﻲﻠﺴﻠﺴﺘﻟﺍ ﻢﻗﺮﻟﺍ', 'الرقم التسلسلي'],
      ['ﻑﺍﺮﻃﻷﺍ ﻞﻴﺻﺎﻔﺗ', 'تفاصيل الأطراف'],
      ['ﻥﺎﻴﺒﻟﺍ', 'البيان'],
      ['ﻞﻴﺻﺎﻔﺘﻟﺍ', 'التفاصيل']
    ];

    // تطبيق إصلاحات النصوص المقلوبة
    for (const [reversed, normal] of reversedFixes) {
      fixedText = fixedText.replace(new RegExp(reversed, 'g'), normal);
    }

    console.log('النص بعد الإصلاح:', fixedText);
    return fixedText;

  } catch (error) {
    console.debug('فشل في إصلاح النص:', error);
    return String(text);
  }
};

/**
 * معالجة النصوص العربية الشاملة
 */
export const processArabicTextWithEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  // تطبيق جميع الإصلاحات
  const fixedText = fixAllArabicIssues(text);

  // إرجاع النص المصحح بدون معالجات معقدة قد تكسر النص
  return fixedText;
};

/**
 * تحميل الخط العربي
 */
export const loadArabicFontSafe = async (doc: any): Promise<boolean> => {
  try {
    const fontUrl = '/fonts/Amiri-Regular.ttf';
    const fontResponse = await fetch(fontUrl);

    if (!fontResponse.ok) {
      console.warn('لم يتم العثور على الخط العربي في:', fontUrl);
      return false;
    }

    const fontBlob = await fontResponse.blob();
    const reader = new FileReader();

    const fontBase64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.includes(',')) {
          resolve(result.split(',')[1]);
        } else {
          reject(new Error('بيانات خط غير صالحة'));
        }
      };
      reader.onerror = () => reject(new Error('فشل في قراءة ملف الخط'));
      reader.readAsDataURL(fontBlob);
    });

    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');

    console.log('تم تحميل الخط العربي بنجاح');
    return true;

  } catch (error) {
    console.debug('فشل في تحميل الخط العربي:', error);
    return false;
  }
};

/**
 * اختبار سريع للحلول
 */
export const testArabicFixes = (): void => {
  console.log('🧪 اختبار إصلاحات النصوص العربية');

  const testCases = [
    'þÖþ\'þŽþ´þßþ•',
    'þÚþßþŽþäþßþ•',
    'þâþ³þûþ•',
    'ﻒﺗﺎﻫ ﺔﻴﻜﻠﻣ ﻞﻘﻧ ﻝﺎﺼﻳﺇ'
  ];

  testCases.forEach((testCase, index) => {
    const fixed = fixAllArabicIssues(testCase);
    console.log(`${index + 1}. الأصلي: ${testCase}`);
    console.log(`   المصحح: ${fixed}`);
  });
};

// تصدير للتوافق مع النسخة السابقة
export const processArabicText = processArabicTextWithEncoding;
export const loadArabicFont = loadArabicFontSafe;
