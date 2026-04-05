const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const ProductMongo = require('../models/product.mongo.model');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const KEYWORDS = ['lập trình', 'tiểu thuyết', 'kinh tế', 'khoa học'];
const MAX_RESULTS_PER_KEYWORD = 20;
const UPLOAD_IMAGE_DIR = path.resolve(__dirname, '../uploads/products');

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickCoverType() {
    // Theo UI: Bìa cứng/Bìa mềm, lưu vào DB theo enum schema: hard/soft
    return Math.random() < 0.5 ? 'hard' : 'soft';
}

function parsePublishYear(publishedDate) {
    if (!publishedDate) return new Date().getFullYear();
    const match = String(publishedDate).match(/\d{4}/);
    if (!match) return new Date().getFullYear();
    return Number(match[0]);
}

function normalizeLanguage(apiLanguage) {
    const value = String(apiLanguage || '').toLowerCase();
    return value.startsWith('vi') ? 'vn' : 'en';
}

function normalizeImage(imageLinks) {
    const thumbnail = imageLinks?.thumbnail || imageLinks?.smallThumbnail;
    if (!thumbnail) return null;
    return String(thumbnail).replace(/^http:\/\//i, 'https://');
}

function getImageExtensionFromUrl(url) {
    try {
        const parsed = new URL(url);
        const ext = path.extname(parsed.pathname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
    } catch {
        // no-op
    }
    return '.jpg';
}

function getImageExtensionFromContentType(contentType) {
    const value = String(contentType || '').toLowerCase();
    if (value.includes('png')) return '.png';
    if (value.includes('webp')) return '.webp';
    if (value.includes('jpeg') || value.includes('jpg')) return '.jpg';
    return null;
}

async function downloadBookImage(imageUrl) {
    if (!imageUrl) return 'https://via.placeholder.com/300x450?text=No+Image';

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
        });
        const ext = getImageExtensionFromContentType(response.headers?.['content-type']) || getImageExtensionFromUrl(imageUrl);
        const fileName = `google-book-${crypto.randomUUID()}${ext}`;
        const absolutePath = path.join(UPLOAD_IMAGE_DIR, fileName);
        await fs.writeFile(absolutePath, Buffer.from(response.data));
        return `uploads/products/${fileName}`;
    } catch (error) {
        console.warn(`[Seed] Không tải được ảnh: ${imageUrl}`);
        return imageUrl;
    }
}

async function normalizeBookItem(item) {
    const volumeInfo = item?.volumeInfo || {};
    const title = volumeInfo.title || 'Sách chưa rõ tên';
    const authors = Array.isArray(volumeInfo.authors) ? volumeInfo.authors : [];
    const firstAuthor = authors[0] || 'Không rõ tác giả';
    const imageUrl = normalizeImage(volumeInfo.imageLinks);
    const imagePath = await downloadBookImage(imageUrl);

    return {
        mysqlId: crypto.randomUUID(),
        nameProduct: title,
        image: imagePath,
        description: volumeInfo.description || 'Chưa có mô tả cho cuốn sách này.',
        stock: randomInt(10, 50),
        covertType: pickCoverType(),
        publishYear: parsePublishYear(volumeInfo.publishedDate),
        pages: Number(volumeInfo.pageCount) > 0 ? Number(volumeInfo.pageCount) : randomInt(100, 500),
        language: normalizeLanguage(volumeInfo.language),
        publisher: firstAuthor,
        publishingCompany: volumeInfo.publisher || 'Không rõ nhà xuất bản',
    };
}

async function fetchBooksByKeyword(keyword) {
    const response = await axios.get(GOOGLE_BOOKS_API, {
        params: {
            q: keyword,
            maxResults: MAX_RESULTS_PER_KEYWORD,
            printType: 'books',
        },
        timeout: 20000,
    });
    return Array.isArray(response.data?.items) ? response.data.items : [];
}

async function runImport() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI chưa được cấu hình trong file .env');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[Seed] Kết nối MongoDB thành công');

    try {
        await fs.mkdir(UPLOAD_IMAGE_DIR, { recursive: true });

        const rawItems = [];
        for (const keyword of KEYWORDS) {
            const items = await fetchBooksByKeyword(keyword);
            rawItems.push(...items);
            console.log(`[Seed] Keyword "${keyword}" => ${items.length} sách`);
        }

        const dedupeMap = new Map();
        for (const item of rawItems) {
            const volumeInfo = item?.volumeInfo || {};
            const title = String(volumeInfo.title || '').trim().toLowerCase();
            const firstAuthor = String(volumeInfo?.authors?.[0] || '').trim().toLowerCase();
            const key = `${title}__${firstAuthor}`;
            if (!title) continue;
            if (!dedupeMap.has(key)) {
                const normalizedBook = await normalizeBookItem(item);
                dedupeMap.set(key, normalizedBook);
            }
        }

        const books = Array.from(dedupeMap.values());
        if (books.length === 0) {
            console.log('[Seed] Không có dữ liệu hợp lệ để insert');
            return;
        }

        const inserted = await ProductMongo.insertMany(books, { ordered: false });
        console.log(`[Seed] Import thành công ${inserted.length}/${books.length} sách vào collection products`);
    } finally {
        await mongoose.connection.close();
        console.log('[Seed] Đã đóng kết nối MongoDB');
    }
}

runImport().catch((error) => {
    console.error('[Seed] Lỗi import Google Books:', error.message);
    process.exitCode = 1;
});
