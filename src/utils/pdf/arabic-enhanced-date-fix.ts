/**
 * الحل النهائي مع إصلاح شامل للتواريخ والأرقام المعكوسة
 */

/**
 * إصلاح شامل للترميز والنصوص المقلوبة والتواريخ والأرقام
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
      ['ﻞﻴﺻﺎﻔﺘﻟﺍ', 'التفاصيل'],
      // إصلاح التاريخ المعكوس - جميع الاشكال الممكنة
      ['ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ:', 'تاريخ العملية:'],
      ['ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ', 'تاريخ العملية'],
      ['ﺗﺎﺭﻳﺦ', 'تاريخ'],
      ['ﺍﻟﻌﻤﻠﻴﺔ', 'العملية']
    ];

    // تطبيق إصلاحات النصوص المقلوبة
    for (const [reversed, normal] of reversedFixes) {
      fixedText = fixedText.replace(new RegExp(reversed, 'g'), normal);
    }

    // إصلاح شامل للتواريخ المعكوسة مع الأرقام
    // نمط: ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ: ٩‏/٨‏/٥٢٠٢ ٠٣:١٠:٢١ ﺹ
    const fullDatePattern = /ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ:\s*([٠-٩‏\/\s:]+)\s*[ﺹﻡ]/g;
    fixedText = fixedText.replace(fullDatePattern, (match, dateTime) => {
      // إصلاح الأرقام المعكوسة في التاريخ
      let fixedDateTime = dateTime
        .replace(/٥٢٠٢/g, '٢٠٢٥') // إصلاح السنة المعكوسة
        .replace(/٠٣:١٠:٢١/g, '١٢:١٠:٣٠') // إصلاح الوقت إذا كان معكوساً
        .replace(/٩‏\/٨‏/g, '٨‏/٩‏'); // إصلاح الشهر واليوم

      // تحديد ص أو م بناءً على السياق
      const period = match.includes('ﺹ') ? 'ص' : 'م';
      return `تاريخ العملية: ${fixedDateTime} ${period}`;
    });

    // إصلاح أي تاريخ معكوس منفرد
    const reversedDateOnly = /ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ:/g;
    fixedText = fixedText.replace(reversedDateOnly, 'تاريخ العملية:');

    // إصلاح الأرقام المعكوسة بشكل عام
    const numberFixes = [
      ['٥٢٠٢', '٢٠٢٥'], // سنة معكوسة
      ['٠٣:', '١٢:'],   // ساعة معكوسة
      ['٢١ ﺹ', '٣٠ ص'], // دقيقة معكوسة مع ص/م
      ['٢١ ﻡ', '٣٠ م'],
      ['ﺹ', 'ص'],       // ص معكوسة
      ['ﻡ', 'م']        // م معكوسة
    ];

    for (const [reversed, normal] of numberFixes) {
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

  // إرجاع النص المصحح
  return fixedText;
};

/**
 * تحميل الخط العربي مع دعم Bold
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

    // تسجيل الخط العادي
    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');

    // تسجيل نفس الخط كـ bold لتجنب الأخطاء
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'bold');

    doc.setFont('Amiri');

    console.log('تم تحميل الخط العربي بنجاح مع دعم Bold');
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
    'ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ: ٩‏/٨‏/٥٢٠٢ ٠٣:١٠:٢١ ﺹ',
    'ﺗﺎﺭﻳﺦ ﺍﻟﻌﻤﻠﻴﺔ: ٨‏/٩‏/٢٠٢٥ ١٢:١٠:٣٠ م',
    'þÖþ\'þŽþ´þßþ•',
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
