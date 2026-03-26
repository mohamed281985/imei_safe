
import fs from 'fs';

// Magic Numbers لأنواع الصور المسموح بها
const IMAGE_MAGIC_NUMBERS = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/bmp': [0x42, 0x4D]
};

/**
 * التحقق من نوع الملف الحقيقي باستخدام Magic Numbers
 * @param {Buffer} buffer - بايتات الملف
 * @returns {string|null} - نوع MIME إذا كان صالحاً، null إذا لم يكن
 */
export function validateImageMagicNumbers(buffer) {
  for (const [mimeType, magicNumbers] of Object.entries(IMAGE_MAGIC_NUMBERS)) {
    let isValid = true;
    for (let i = 0; i < magicNumbers.length; i++) {
      if (buffer[i] !== magicNumbers[i]) {
        isValid = false;
        break;
      }
    }
    if (isValid) {
      return mimeType;
    }
  }
  return null;
}

/**
 * التحقق من حجم الملف
 * @param {number} fileSize - حجم الملف بالبايت
 * @param {number} maxSizeInBytes - الحد الأقصى المسموح به بالبايت
 * @returns {boolean} - true إذا كان الحجم مقبولاً، false إذا لم يكن
 */
export function validateImageSize(fileSize, maxSizeInBytes) {
  return fileSize <= maxSizeInBytes;
}

/**
 * التحقق الشامل من الملف (Magic Numbers والحجم)
 * @param {Buffer} buffer - بايتات الملف
 * @param {number} fileSize - حجم الملف بالبايت
 * @param {number} maxSizeInBytes - الحد الأقصى المسموح به بالبايت
 * @returns {Object} - كائن يحتوي على نتيجة التحقق
 */
export function validateImageFile(buffer, fileSize, maxSizeInBytes) {
  // التحقق من Magic Numbers
  const mimeType = validateImageMagicNumbers(buffer);
  if (!mimeType) {
    return {
      isValid: false,
      mimeType: null,
      error: 'Invalid image type (magic numbers mismatch)'
    };
  }

  // التحقق من الحجم
  if (!validateImageSize(fileSize, maxSizeInBytes)) {
    return {
      isValid: false,
      mimeType,
      error: `File size exceeds maximum limit of ${maxSizeInBytes} bytes`
    };
  }

  return {
    isValid: true,
    mimeType
  };
}
