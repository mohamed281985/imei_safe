export const generateRandomFilename = (originalName: string) => {
  const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? `.${extMatch[1]}` : '';
  const array = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now()}_${hex}${ext}`;
};

export const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
