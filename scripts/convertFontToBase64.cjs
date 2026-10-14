const fs = require('fs');
const path = require('path');

// مسار ملف الخط
const fontPath = path.join('c:\\Users\\alm7lawer4\\Desktop\\New Folder (3)\\New Folder', 'hinted-Amiri-Regular.ttf');

// التحقق من وجود الملف
if (!fs.existsSync(fontPath)) {
  console.error('Error: Font file not found at path:', fontPath);
  process.exit(1);
}

// قراءة الملف وتحويله إلى Base64
fs.readFile(fontPath, (err, data) => {
  if (err) {
    console.error('Error reading the font file:', err);
    return;
  }
  const base64Font = `data:application/octet-stream;base64,${data.toString('base64')}`;
  console.log('Base64 Font Data:', base64Font);
});
