const crypto = require('crypto');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const { BadRequestError } = require('../core/error.response');

function random36() {
    return crypto.randomUUID();
}

function escapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lấy số thứ tự tiếp theo cho barcode dạng `{prefix}-{n}`.
 * Quét toàn bộ bản sao của đầu sách, tách phần số ở cuối, lấy max + 1.
 * An toàn ngay cả khi đã xóa bản sao ở giữa (không tái sử dụng STT cũ).
 */
async function getNextCopySequence(bookId, prefix) {
    const safePrefix = escapeRegex(prefix);
    const rx = new RegExp(`^${safePrefix}-(\\d+)$`, 'i');
    const rows = await BookCopyMongo.find({ bookId, barcode: rx }).select('barcode').lean();
    let maxSeq = 0;
    for (const r of rows) {
        const m = rx.exec(String(r.barcode || ''));
        if (!m) continue;
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    return maxSeq + 1;
}

/**
 * Sinh barcode tự động theo định dạng `{bookCode}-{STT}` (STT tăng dần từ 1).
 * Ví dụ: B001-1, B001-2, B001-3...
 */
async function createBookCopiesForBook(bookId, bookCodeLabel, quantity) {
    if (!quantity || quantity <= 0) return [];

    const cleaned = String(bookCodeLabel || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    const fallback = String(bookId).replace(/[^a-f0-9]/gi, '').slice(-8).toUpperCase();
    const prefix = cleaned || fallback || 'BOOK';

    let seq = await getNextCopySequence(bookId, prefix);
    const copies = [];

    for (let i = 0; i < quantity; i += 1) {
        let barcode = `${prefix}-${seq}`;
        let attempts = 0;
        while (attempts < 8) {
            // eslint-disable-next-line no-await-in-loop
            const clash = await BookCopyMongo.findOne({ barcode }).select('_id').lean();
            if (!clash) break;
            seq += 1;
            barcode = `${prefix}-${seq}`;
            attempts += 1;
        }
        copies.push({
            mysqlId: random36(),
            bookId,
            barcode,
            status: 'AVAILABLE',
            condition: 'NEW',
        });
        seq += 1;
    }

    if (copies.length) {
        await BookCopyMongo.insertMany(copies);
    }
    return copies;
}

async function deleteAvailableCopies(bookId, removeCount) {
    if (removeCount <= 0) return;
    const toRemove = await BookCopyMongo.find({ bookId, status: 'AVAILABLE' })
        .sort({ createdAt: -1 })
        .limit(removeCount)
        .select('_id')
        .lean();

    if (toRemove.length < removeCount) {
        throw new BadRequestError('Không đủ số bản đang sẵn sàng để giảm (có thể đang được mượn)');
    }
    const ids = toRemove.map((x) => x._id);
    await BookCopyMongo.deleteMany({ _id: { $in: ids } });
}

/**
 * Thêm bản sao với barcode tùy chỉnh (một hoặc nhiều mã).
 * @returns {{ created: { _id: string, barcode: string }[], duplicates: string[], invalid: string[] }}
 */
async function createBookCopiesFromBarcodes(bookId, barcodesRaw) {
    const created = [];
    const duplicates = [];
    const invalid = [];

    if (!bookId || !Array.isArray(barcodesRaw) || !barcodesRaw.length) {
        return { created, duplicates, invalid };
    }

    const normalized = [];
    const seenLocal = new Set();
    for (const raw of barcodesRaw) {
        const barcode = String(raw || '').trim().toUpperCase();
        if (!barcode) {
            if (raw !== undefined && raw !== null && String(raw).trim() !== '') invalid.push(String(raw));
            continue;
        }
        if (seenLocal.has(barcode)) {
            duplicates.push(barcode);
            continue;
        }
        seenLocal.add(barcode);
        normalized.push(barcode);
    }

    const existing = await BookCopyMongo.find({ barcode: { $in: normalized } }).select('barcode').lean();
    const existSet = new Set(existing.map((e) => e.barcode));

    const toInsert = [];
    for (const barcode of normalized) {
        if (existSet.has(barcode)) {
            duplicates.push(barcode);
            continue;
        }
        toInsert.push({
            mysqlId: random36(),
            bookId,
            barcode,
            status: 'AVAILABLE',
            condition: 'NEW',
        });
        existSet.add(barcode);
    }

    if (toInsert.length) {
        const inserted = await BookCopyMongo.insertMany(toInsert);
        for (const doc of inserted) {
            created.push({ _id: String(doc._id), barcode: doc.barcode });
        }
    }

    return { created, duplicates, invalid: invalid.filter(Boolean) };
}

module.exports = {
    createBookCopiesForBook,
    deleteAvailableCopies,
    createBookCopiesFromBarcodes,
};
