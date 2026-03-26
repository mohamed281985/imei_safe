import * as ArabicReshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

// Initialize bidi-js instance
const bidiInstance = bidiFactory && bidiFactory();
let reorder: any = null;
if (bidiInstance) {
  if (typeof bidiInstance === 'function') {
    reorder = bidiInstance;
  } else if (typeof bidiInstance === 'object') {
    const b: any = bidiInstance;
    reorder = b.reorderVisually || b.reorder_visually || b.getReordered || b.reorderText || b.default;
  }
}

/**
 * Process text for correct rendering in PDF, especially for mixed Arabic and English text.
 * It reshapes Arabic characters for proper joining and applies the bidi algorithm for RTL display.
 * @param text The text to process
 * @returns The processed text ready for PDF rendering
 */
export const processArabicText = (text: string | null | undefined): string => {
  if (!text) return '';
  const textStr = String(text);
  
  // Check if text contains any Arabic characters
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(textStr);
  
  if (!hasArabic) {
    return textStr; // Return as is if no Arabic characters
  }

  // 1. Reshape Arabic letters for correct joining (ligatures)
  const reshapedText = ArabicReshaper.ArabicShaper.convertArabic(textStr);

  // 2. Reorder visually for mixed Arabic/English/numbers using bidi-js
  try {
    if (typeof reorder === 'function') {
      // Use true for RTL since we've confirmed this contains Arabic text
      return reorder(reshapedText, true);
    }
    return reshapedText;
  } catch (e) {
    console.warn('Bidi reordering failed, falling back to reshaped text:', e);
    return reshapedText;
  }
};

/**
 * Load the Amiri font for a jsPDF instance
 * @param doc The jsPDF instance to load the font into
 * @returns Promise that resolves when the font is loaded
 */
export const loadArabicFont = async (doc: any): Promise<void> => {
  try {
    const fontUrl = '/fonts/Amiri-Regular.ttf';
    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) throw new Error('Font file not found at ' + fontUrl);
    
    const fontBlob = await fontResponse.blob();
    const reader = new FileReader();
    const fontBase64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(fontBlob);
    });

    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');
  } catch (error) {
    console.debug("Could not load Arabic font. Falling back to helvetica.", error);
    doc.setFont('helvetica');
    throw error; // Re-throw to allow caller to handle the error
  }
};
