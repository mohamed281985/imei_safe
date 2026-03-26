import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192
};

async function processIcon(inputPath) {
    try {
        // التأكد من وجود الصورة المدخلة
        await fs.access(inputPath);
        
        // معالجة الصورة لكل حجم مطلوب
        for (const [density, size] of Object.entries(sizes)) {
            const outputPath = path.join(
                __dirname,
                '..',
                'android',
                'app',
                'src',
                'main',
                'res',
                `mipmap-${density}`,
                'ic_launcher.png'
            );

            // إنشاء نسخة مربعة بالحجم المطلوب
            await sharp(inputPath)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFile(outputPath);

            console.log(`Created icon for ${density}: ${size}x${size}`);

            // إنشاء النسخة المستديرة
            const roundOutputPath = path.join(
                path.dirname(outputPath),
                'ic_launcher_round.png'
            );

            // إنشاء نسخة مستديرة
            await sharp(inputPath)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .composite([{
                    input: Buffer.from(
                        `<svg><circle cx="${size/2}" cy="${size/2}" r="${size/2}" /></svg>`
                    ),
                    blend: 'dest-in'
                }])
                .toFile(roundOutputPath);

            console.log(`Created round icon for ${density}: ${size}x${size}`);
        }

        console.log('All icons have been generated successfully!');
    } catch (error) {
        console.error('Error processing icons:', error);
        process.exit(1);
    }
}

// تشغيل السكريبت
const inputPath = path.join(__dirname, '..', 'public', 'icon.png'); // تم إضافة امتداد الملف .png
processIcon(inputPath);