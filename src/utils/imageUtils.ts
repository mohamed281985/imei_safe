
/**
 * Utility functions for handling images in the application
 */

/**
 * Returns a path for storing images based on type
 * @param type The type of image being stored
 * @returns The folder path for the image type
 */
export const getImageFolderPath = (type: 'ad' | 'report' | 'phone' | 'id' | 'selfie' | 'receipt') => {
  switch (type) {
    case 'ad':
      return '/ads/';
    case 'report':
      return '/report-images/';
    case 'phone':
      return '/phone-images/';
    case 'id':
      return '/id-images/';
    case 'selfie':
      return '/selfie-images/';
    case 'receipt':
      return '/receipt-images/';
    default:
      return '/';
  }
};

/**
 * Generates a unique filename for an uploaded image
 * @param originalName The original filename
 * @param type The type of image
 * @returns A unique filename
 */
export const generateImageFilename = (originalName: string, type: 'ad' | 'report' | 'phone' | 'id' | 'selfie' | 'receipt') => {
  const timestamp = Date.now();
  const extension = originalName.split('.').pop();
  return `${type}-${timestamp}.${extension}`;
};

/**
 * Saves a data URL to localStorage (simulating file storage)
 * @param dataUrl The data URL to save
 * @param type The type of image
 * @returns The path where the image would be stored in a real application
 */
export const saveImageToStorage = (dataUrl: string, type: 'ad' | 'report' | 'phone' | 'id' | 'selfie' | 'receipt') => {
  // In a real application, this would save to a server or cloud storage
  // For this demo, we'll just return the dataUrl
  
  // Generate a simulated path
  const timestamp = Date.now();
  const path = `${getImageFolderPath(type)}img-${timestamp}`;
  
  // In a real application, we'd save the file here
  
  return path;
};
