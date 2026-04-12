const crypto = require('crypto');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const { BadRequestError } = require('../core/error.response');

function random36() {
    return crypto.randomUUID();
}

/**
 * Sinh barcode: PTIT-{bookCode hoặc id ngắn}-{số thứ tự 4 chữ số}
 */
async function createBookCopiesForBook(bookId, bookCodeLabel, quantity) {
    if (!quantity || quantity <= 0) return;

    const label = String(bookCodeLabel || '')
        .replace(/\s/g, '')
        .slice(0, 12);
    const fallback = String(bookId).replace(/[^a-f0-9]/gi, '').slice(-8);
    const prefix = label || fallback || 'BOOK';

    const existingCount = await BookCopyMongo.countDocuments({ bookId });
    const copies = [];

    for (let i = 0; i < quantity; i += 1) {
        const seq = existingCount + i + 1;
        let barcode = `PTIT-${prefix}-${String(seq).padStart(4, '0')}`;
        let attempts = 0;
        while (attempts < 8) {
            // eslint-disable-next-line no-await-in-loop
            const clash = await BookCopyMongo.findOne({ barcode }).select('_id').lean();
            if (!clash) break;
            barcode = `PTIT-${prefix}-${String(seq).padStart(4, '0')}-${random36().slice(0, 4)}`;
            attempts += 1;
        }
        copies.push({
            mysqlId: random36(),
            bookId,
            barcode,
            status: 'AVAILABLE',
            condition: 'NEW',
        });
    }

    await BookCopyMongo.insertMany(copies);
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

module.exports = {
    createBookCopiesForBook,
    deleteAvailableCopies,
};
