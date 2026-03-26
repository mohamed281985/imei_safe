import * as ArabicReshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

// Initialize bidi-js instance with better error handling
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
 * Process text for correct rendering in PDF, especially for mixed Arabic and English text.
 * It reshapes Arabic characters for proper joining and applies the bidi algorithm for RTL display.
 * @param text The text to process
 * @returns The processed text ready for PDF rendering
 */
export const processArabicText = (text: string | null | undefined): string => {
  if (!text) return '';
  const textStr = String(text).trim();

  // Check if text contains any Arabic characters
  const hasArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(textStr);

  if (!hasArabic) {
    return textStr; // Return as is if no Arabic characters
  }

  try {
    // 1. Reshape Arabic letters for correct joining (ligatures)
    let reshapedText: string;

    // Try different API methods for arabic-persian-reshaper
    if (ArabicReshaper && typeof ArabicReshaper.ArabicShaper?.convertArabic === 'function') {
      reshapedText = ArabicReshaper.ArabicShaper.convertArabic(textStr);
    } else if (ArabicReshaper && typeof (ArabicReshaper as any).default?.convertArabic === 'function') {
      reshapedText = (ArabicReshaper as any).default.convertArabic(textStr);
    } else if (typeof (ArabicReshaper as any) === 'function') {
      reshapedText = (ArabicReshaper as any)(textStr);
    } else {
      console.warn('ArabicReshaper not available, using original text');
      reshapedText = textStr;
    }

    // 2. Reorder visually for mixed Arabic/English/numbers using bidi-js
    if (typeof reorder === 'function') {
      try {
        // Use true for RTL since we've confirmed this contains Arabic text
        return reorder(reshapedText, true);
      } catch (bidiError) {
        console.warn('Bidi reordering failed, using reshaped text:', bidiError);
      }
    }

    return reshapedText;
  } catch (error) {
    console.warn('Arabic text processing failed, using original text:', error);
    return textStr;
  }
};

/**
 * Load Arabic font with multiple fallback options
 * @param doc The jsPDF instance to load the font into
 * @returns Promise that resolves when the font is loaded
 */
export const loadArabicFont = async (doc: any): Promise<void> => {
  const fontPaths = [
    '/fonts/Amiri-Regular.ttf',
    '/fonts/Cairo-Regular.ttf', 
    '/fonts/NotoSansArabic-Regular.ttf',
    '/fonts/Tajawal-Regular.ttf'
  ];

  for (const fontUrl of fontPaths) {
    try {
      console.log(`Trying to load font: ${fontUrl}`);
      const fontResponse = await fetch(fontUrl);

      if (!fontResponse.ok) {
        console.warn(`Font not found: ${fontUrl}`);
        continue;
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

      const fontName = fontUrl.split('/').pop()?.replace('.ttf', '') || 'ArabicFont';
      const fontFamily = fontName.split('-')[0];

      doc.addFileToVFS(`${fontName}.ttf`, fontBase64);
      doc.addFont(`${fontName}.ttf`, fontFamily, 'normal');
      doc.setFont(fontFamily);

      console.log(`Successfully loaded font: ${fontFamily}`);
      return; // Success, exit function

    } catch (error) {
      console.warn(`Failed to load font ${fontUrl}:`, error);
      continue; // Try next font
    }
  }

  // If all fonts fail, try to use a system font that might support Arabic
  console.debug("Could not load any Arabic font. Trying system fonts...");

  try {
    // Try to set a system font that might support Arabic
    doc.setFont('helvetica'); // Fallback to default
    console.warn("Using helvetica as fallback - Arabic text may not display correctly");
  } catch (fallbackError) {
    console.debug("Even fallback font failed:", fallbackError);
  }

  throw new Error('Failed to load any Arabic font');
};

/**
 * Alternative function to load Arabic font with better error handling
 */
export const loadArabicFontSafe = async (doc: any): Promise<boolean> => {
  try {
    await loadArabicFont(doc);
    return true;
  } catch (error) {
    console.debug("Arabic font loading failed:", error);
    return false;
  }
};

/**
 * Enhanced text processing with encoding fix
 */
export const processArabicTextWithEncoding = (text: string | null | undefined): string => {
  if (!text) return '';

  try {
    // Ensure proper UTF-8 encoding
    const textStr = decodeURIComponent(escape(String(text).trim()));
    return processArabicText(textStr);
  } catch (error) {
    console.warn('Encoding fix failed, using standard processing:', error);
    return processArabicText(text);
  }
};
