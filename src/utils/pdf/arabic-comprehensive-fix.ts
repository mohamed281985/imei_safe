import * as ArabicReshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

// Initialize bidi-js with improved error handling
let reorder: any = null;
try {
  const bidiInstance = bidiFactory && bidiFactory();
  if (bidiInstance) {
    if (typeof bidiInstance === 'function') {
      reorder = bidiInstance;
    } else if (typeof bidiInstance === 'object') {
      const b: any = bidiInstance;
      reorder = b.reorderVisually || b.reorder_visually || b.getReordered || b.reorderText || b.default;
    }
  }
} catch (error) {
  console.warn('Failed to initialize bidi-js:', error);
}

/**
 * Fix encoding issues for Arabic text in PDF
 */
export const fixArabicEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    let fixedText = String(text);

    // Fix specific encoding problems you mentioned
    const encodingFixes = [
      // Complete phrases first
      [/þÖþ'þŽþ´þßþ• þÚþßþŽþäþßþ•\( þÊþ‹þŽþ'þßþ• þ•þŽþçþŽþôþ'\)/g, 'بيانات البائع (المالك السابق)'],
      [/þñþ®þ˜þ¸þäþßþ• þ•þŽþçþŽþôþ'\)/g, 'بيانات المشتري (المالك الجديد)'],

      // Individual words
      [/þÖþ'þŽþ´þßþ•/g, 'بيانات'],
      [/þÚþßþŽþäþßþ•/g, 'البائع'],
      [/þÊþ‹þŽþ'þßþ•/g, 'المالك'],
      [/þ•þŽþçþŽþôþ'/g, 'السابق'],
      [/þñþ®þ˜þ¸þäþßþ•/g, 'المشتري'],
      [/þâþ³þûþ•/g, 'الاسم'],
      [/þÒþ—þŽþìþßþ•/g, 'رقم'],
      [/þâþ×þ/g, 'الهاتف'],
      [/þ"þ×þŽþÄþ'þßþ•/g, 'آخر'],
      [/þæþã/g, 'من'],
      [/þáþŽþ×þ-þƒ/g, 'البطاقة'],
      [/þ®þ§þ•/g, 'أرقام'],
      [/þòþçþíþ®þ˜þÜþßþùþ•/g, 'الإلكتروني'],
      [/þªþóþ®þ'þßþ•/g, 'البريد'],

      // Individual characters
      [/þ•/g, ' ']
    ];

    for (const [pattern, replacement] of encodingFixes) {
      fixedText = fixedText.replace(pattern, replacement);
    }

    return fixedText;
  } catch (error) {
    console.warn('Encoding fix failed:', error);
    return String(text);
  }
};

/**
 * Fix reversed Arabic text
 */
export const fixReversedArabic = (text: string): string => {
  if (!text) return '';

  try {
    const reversedFixes = [
      [/ﻒﺗﺎﻫ ﺔﻴﻜﻠﻣ ﻞﻘﻧ ﻝﺎﺼﻳﺇ/g, 'إيصال نقل ملكية هاتف'],
      [/ﺔﻴﻠﻤﻌﻟﺍ ﺦﻳﺭﺎﺗ/g, 'تاريخ العملية'],
      [/ﻞﻴﺻﺎﻔﺘﻟﺍ ﻥﺎﻴﺒﻟﺍ/g, 'البيان التفاصيل'],
      [/ﻒﺗﺎﻬﻟﺍ ﻉﻮﻧ/g, 'نوع الهاتف'],
      [/ﻲﻠﺴﻠﺴﺘﻟﺍ ﻢﻗﺮﻟﺍ/g, 'الرقم التسلسلي'],
      [/ﻑﺍﺮﻃﻷﺍ ﻞﻴﺻﺎﻔﺗ/g, 'تفاصيل الأطراف']
    ];

    let fixedText = text;
    for (const [pattern, replacement] of reversedFixes) {
      fixedText = fixedText.replace(pattern, replacement);
    }

    return fixedText;
  } catch (error) {
    console.warn('Reversed text fix failed:', error);
    return text;
  }
};

/**
 * Main Arabic text processor
 */
export const processArabicTextWithEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    console.log('Processing text:', text);

    // Step 1: Fix encoding issues
    let processedText = fixArabicEncoding(text);
    console.log('After encoding fix:', processedText);

    // Step 2: Fix reversed text
    processedText = fixReversedArabic(processedText);
    console.log('After reversed fix:', processedText);

    // Step 3: Return without complex processing to avoid issues
    return processedText;

  } catch (error) {
    console.warn('Text processing failed:', error);
    return fixArabicEncoding(text);
  }
};

/**
 * Load Arabic font
 */
export const loadArabicFontSafe = async (doc: any): Promise<boolean> => {
  try {
    const fontUrl = '/fonts/Amiri-Regular.ttf';
    const fontResponse = await fetch(fontUrl);

    if (!fontResponse.ok) {
      console.warn('Arabic font not found');
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
          reject(new Error('Invalid font data'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read font file'));
      reader.readAsDataURL(fontBlob);
    });

    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');

    console.log('Arabic font loaded successfully');
    return true;

  } catch (error) {
    console.warn('Failed to load Arabic font:', error);
    return false;
  }
};

// Export aliases
export const processArabicText = processArabicTextWithEncoding;
export const loadArabicFont = loadArabicFontSafe;
