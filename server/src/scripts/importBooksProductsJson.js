/**
 * Nạp (thay thế) sách MongoDB từ file export JSON (Compass / mongoexport Extended JSON).
 *
 * - Xóa: fine_tickets, loan_tickets, circulation_return_events, library_book_copies, library_books
 * - Giữ: users, admin, policies, api keys
 * - Tạo lại bản sao: mỗi đầu sách có `stock` bản AVAILABLE (barcode = bookCode + hậu tố)
 *
 * Chạy (PowerShell), ví dụ:
 *   cd server
 *   $env:BOOKS_JSON="D:\Downloads\books.products.json"
 *   node src/scripts/importBooksProductsJson.js --confirm
 *
 * Hoặc:
 *   node src/scripts/importBooksProductsJson.js --confirm --file "D:\Downloads\books.products.json"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const CirculationReturnEventMongo = require('../models/circulationReturnEvent.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

function random36() {
    return crypto.randomUUID();
}

function getArgFile() {
    const eq = process.argv.find((x) => x.startsWith('--file='));
    if (eq) return eq.slice('--file='.length).trim();
    const i = process.argv.indexOf('--file');
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].trim();
    const fromEnv = String(process.env.BOOKS_JSON || process.env.BOOKS_IMPORT_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return path.join('D:', 'Downloads', 'books.products.json');
}

function unwrapExt(v) {
    if (v == null || typeof v !== 'object') return v;
    if (v.$oid != null) return v.$oid;
    if (v.$uuid != null) return String(v.$uuid);
    if (v.$date != null) return new Date(v.$date);
    return v;
}

function categoryString(cat, fallback) {
    if (typeof cat === 'string' && cat.trim()) return cat.trim();
    if (cat && typeof cat === 'object' && (cat.$oid != null || cat.$oid === '')) {
        return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Khác';
    }
    return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Khác';
}

function normalizeCovertType(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'soft') return 'soft';
    return 'hard';
}

function toBookDoc(raw) {
    const _idRaw = unwrapExt(raw._id);
    const mysqlRaw = unwrapExt(raw.mysqlId);
    const mysqlId = String(mysqlRaw || random36()).slice(0, 36);

    const bookCode = raw.bookCode != null ? String(raw.bookCode).trim() : '';
    const title = String(raw.nameProduct || raw.title || 'Không tên').trim() || 'Không tên';
    const category = categoryString(raw.category, raw.category_1);
    const category1 = raw.category_1 != null ? String(raw.category_1).trim() : null;
    const description = raw.description != null ? String(raw.description) : '';
    const image = String(raw.image || '/placeholder-book.png').trim();
    const stockNum = Math.max(0, Math.min(5000, Number(raw.stock) || 0));
    const covertType = normalizeCovertType(raw.covertType);
    const publishYear = Math.max(1000, Math.min(3000, Number(raw.publishYear) || new Date().getFullYear()));
    const pages = Math.max(1, Math.min(20000, Number(raw.pages) || 1));
    const language = String(raw.language || 'Tiếng Việt').trim() || 'Tiếng Việt';
    const publisher = String(raw.publisher || '—').trim() || '—';
    const publishingCompany = String(raw.publishingCompany || publisher).trim() || publisher;

    const createdAt = raw.createdAt ? unwrapExt(raw.createdAt) : new Date();
    const updatedAt = raw.updatedAt ? unwrapExt(raw.updatedAt) : new Date();

    const doc = {
        mysqlId,
        bookCode: bookCode || undefined,
        image,
        title,
        category,
        category_1: category1,
        description,
        stock: 0,
        totalCopies: 0,
        coverPrice: raw.coverPrice != null ? Number(raw.coverPrice) : null,
        covertType,
        publishYear,
        pages,
        language,
        publisher,
        publishingCompany,
        createdAt,
        updatedAt,
    };

    if (_idRaw && mongoose.isValidObjectId(String(_idRaw))) {
        doc._id = new mongoose.Types.ObjectId(String(_idRaw));
    } else {
        doc._id = new mongoose.Types.ObjectId();
    }

    return { doc, stockNum, bookCode: bookCode || mysqlId.replace(/-/g, '').slice(0, 12) };
}

async function clearBookDomain() {
    console.log('[import-books-json] Xóa phiếu / phạt / nhật trả / bản sao / đầu sách...');
    await FineTicketMongo.deleteMany({});
    await LoanTicketMongo.deleteMany({});
    await CirculationReturnEventMongo.deleteMany({});
    await BookCopyMongo.deleteMany({});
    await BookMongo.deleteMany({});
}

async function run() {
    if (!process.argv.includes('--confirm')) {
        console.error('Thêm --confirm để thực hiện (sẽ xóa toàn bộ sách + bản sao + phiếu mượn/phạt).');
        process.exit(1);
    }

    const filePath = path.resolve(getArgFile());
    if (!fs.existsSync(filePath)) {
        console.error(`Không thấy file: ${filePath}`);
        process.exit(1);
    }

    const rawText = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(rawText);
    if (!Array.isArray(arr)) {
        console.error('File JSON phải là mảng các document.');
        process.exit(1);
    }

    await connectSeedMongo();
    await clearBookDomain();

    const colBooks = mongoose.connection.db.collection('library_books');
    const rows = [];
    for (const raw of arr) {
        rows.push(toBookDoc(raw));
    }

    const bookDocs = rows.map((r) => r.doc);
    if (bookDocs.length) {
        await colBooks.insertMany(bookDocs, { ordered: false });
    }
    console.log(`[import-books-json] Đã chèn ${bookDocs.length} đầu sách.`);

    const copyBulk = [];
    for (const { doc, stockNum, bookCode } of rows) {
        const bookId = doc._id;
        if (!bookId || stockNum === 0) continue;
        const base = String(bookCode).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || String(bookId).slice(-12);
        for (let i = 1; i <= stockNum; i += 1) {
            const barcode = `${base}-${i}`;
            copyBulk.push({
                mysqlId: random36(),
                bookId,
                barcode,
                status: 'AVAILABLE',
            });
        }
    }

    const BATCH = 500;
    for (let i = 0; i < copyBulk.length; i += BATCH) {
        const chunk = copyBulk.slice(i, i + BATCH);
        if (chunk.length) await BookCopyMongo.insertMany(chunk, { ordered: false });
    }
    console.log(`[import-books-json] Đã chèn ${copyBulk.length} bản sao (AVAILABLE).`);

    const ids = await BookMongo.find({}).distinct('_id');
    for (const bid of ids) {
        await syncBookInventoryFields(bid);
    }

    console.log('[import-books-json] Đã đồng bộ stock / totalCopies theo bản sao.');
    console.log('Hoàn tất.');
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[import-books-json] Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
