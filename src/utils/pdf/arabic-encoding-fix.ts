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
 * حل مشاكل الترميز للنصوص العربية في PDF
 */
export const fixArabicEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    let fixedText = String(text);

    // Fix the specific encoding issues you're seeing
    const encodingFixes = [
      [/þÖ/g, 'إ'],
      [/þ'/g, 'ي'],
      [/þŽ/g, 'ص'],
      [/þ´/g, 'ا'],
      [/þß/g, 'ل'],
      [/þ•/g, ' '],
      [/þÚ/g, 'ن'],
      [/þä/g, 'ق'],
      [/þô/g, 'ة'],
      [/þÊ/g, 'م'],
      [/þ‹/g, 'ا'],
      [/þç/g, 'س'],
      [/þŽ/g, 'ا'],
      [/þ'/g, 'ل'],
      [/þ'/g, 'ك'],
      [/þ'/g, 'ب'],
      [/þ'/g, 'ق'],
      // More common Arabic character fixes
      [/Ø§/g, 'ا'], // alef
      [/Ø¨/g, 'ب'], // beh
      [/ØªØ/g, 'ت'], // teh
      [/Ø«/g, 'ث'], // theh
      [/Ø¬/g, 'ج'], // jeem
      [/Ø­/g, 'ح'], // hah
      [/Ø®/g, 'خ'], // khah
      [/Ø¯/g, 'د'], // dal
      [/Ø°/g, 'ذ'], // thal
      [/Ø±/g, 'ر'], // reh
      [/Ø²/g, 'ز'], // zain
      [/Ø³/g, 'س'], // seen
      [/Ø´/g, 'ش'], // sheen
      [/Øµ/g, 'ص'], // sad
      [/Ø¶/g, 'ض'], // dad
      [/Ø·/g, 'ط'], // tah
      [/Ø¸/g, 'ظ'], // zah
      [/Ø¹/g, 'ع'], // ain
      [/Øº/g, 'غ'], // ghain
      [/Ù/g, 'ف'], // feh
      [/Ù‚/g, 'ق'], // qaf
      [/Ùƒ/g, 'ك'], // kaf
      [/Ù„/g, 'ل'], // lam
      [/Ù…/g, 'م'], // meem
      [/Ù†/g, 'ن'], // noon
      [/Ù‡/g, 'ه'], // heh
      [/Ùˆ/g, 'و'], // waw
      [/ÙŠ/g, 'ي'], // yeh
      [/Ù‰/g, 'ى'], // alef maksura
      [/Ø©/g, 'ة']  // teh marbuta
    ];

    // Apply all fixes
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
 * Enhanced Arabic text processing with encoding fixes
 */
export const processArabicTextWithEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    // First fix encoding issues
    let fixedText = fixArabicEncoding(text);

    // Check if text contains Arabic characters after fixing
    const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(fixedText);

    if (!hasArabic) {
      return fixedText;
    }

    // Apply Arabic text processing
    let reshapedText: string;

    try {
      if (ArabicReshaper && typeof ArabicReshaper.ArabicShaper?.convertArabic === 'function') {
        reshapedText = ArabicReshaper.ArabicShaper.convertArabic(fixedText);
      } else {
        reshapedText = fixedText;
      }
    } catch (reshapeError) {
      console.warn('Arabic reshaping failed:', reshapeError);
      reshapedText = fixedText;
    }

    // Apply bidi reordering
    if (typeof reorder === 'function') {
      try {
        return reorder(reshapedText, true);
      } catch (bidiError) {
        console.warn('Bidi reordering failed:', bidiError);
      }
    }

    return reshapedText;
  } catch (error) {
    console.warn('Arabic text processing failed:', error);
    return fixArabicEncoding(text);
  }
};

/**
 * Load Arabic font with fallback
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

// Export aliases for backward compatibility
export const processArabicText = processArabicTextWithEncoding;
export const loadArabicFont = loadArabicFontSafe;
