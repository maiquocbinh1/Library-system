/**
 * Random hoá lại số bản sao của mỗi đầu sách trong khoảng [min, max].
 * Mặc định: 10–20 cuốn / đầu sách (thư viện trường học cỡ vừa).
 *
 * Quy tắc an toàn:
 *   - Không xóa bản sao đang BORROWED / RESERVED / MAINTENANCE / LOST.
 *   - Khi giảm: chỉ xóa bản sao status = AVAILABLE.
 *   - Nếu số bản đang "kẹt" (BORROWED…) đã >= target → giữ nguyên, không xóa.
 *   - Khi tăng: tạo thêm bản sao theo định dạng {bookCode}-STT (tiếp nối STT hiện có).
 *   - Sau cùng: gọi syncBookInventoryFields để đồng bộ stock / totalCopies.
 *
 * Chạy (PowerShell):
 *   cd server
 *   node src/scripts/randomizeBookCopyCount.js --confirm
 *
 * Tham số tùy chọn:
 *   --min=10
 *   --max=20
 *   --confirm   (bắt buộc — để tránh lỡ tay xóa bản sao)
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

function random36() {
    return crypto.randomUUID();
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function escapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs() {
    const args = { min: 10, max: 20, confirm: false };
    for (const a of process.argv.slice(2)) {
        if (a === '--confirm') args.confirm = true;
        else if (a.startsWith('--min=')) args.min = Math.max(0, Number(a.slice(6)) || 0);
        else if (a.startsWith('--max=')) args.max = Math.max(0, Number(a.slice(6)) || 0);
    }
    if (args.max < args.min) {
        const t = args.max;
        args.max = args.min;
        args.min = t;
    }
    return args;
}

async function getNextSeqForPrefix(bookId, prefix) {
    const rx = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`, 'i');
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

async function adjustBookCopies(book, target) {
    const bookId = book._id;
    const bookCode = String(book.bookCode || '').trim().toUpperCase();
    const fallback = String(bookId).replace(/[^a-f0-9]/gi, '').slice(-8).toUpperCase();
    const prefix = bookCode || fallback || 'BOOK';

    const allCopies = await BookCopyMongo.find({ bookId }).select('_id status').lean();
    const total = allCopies.length;
    const available = allCopies.filter((c) => c.status === 'AVAILABLE');
    const nonAvailableCount = total - available.length;

    if (total === target) {
        return { action: 'keep', added: 0, removed: 0, total };
    }

    if (total > target) {
        const need = total - target;
        const removableMax = available.length;
        const remove = Math.min(need, removableMax);
        if (remove === 0) {
            return {
                action: 'skip',
                added: 0,
                removed: 0,
                total,
                warn: `kho có ${nonAvailableCount} bản đang BORROWED/RESERVED không xóa được; total ${total} > target ${target}`,
            };
        }
        const ids = available.slice(0, remove).map((c) => c._id);
        await BookCopyMongo.deleteMany({ _id: { $in: ids } });
        const newTotal = total - remove;
        const warn = newTotal > target
            ? `chỉ xóa được ${remove}/${need} (còn ${nonAvailableCount} bản bị khóa do mượn/đặt giữ)`
            : null;
        return { action: 'shrink', added: 0, removed: remove, total: newTotal, warn };
    }

    // total < target → thêm
    const need = target - total;
    let seq = await getNextSeqForPrefix(bookId, prefix);
    const docs = [];
    for (let i = 0; i < need; i += 1) {
        let barcode = `${prefix}-${seq}`;
        let guard = 0;
        // eslint-disable-next-line no-await-in-loop
        while (await BookCopyMongo.findOne({ barcode }).select('_id').lean()) {
            seq += 1;
            barcode = `${prefix}-${seq}`;
            guard += 1;
            if (guard > 32) break;
        }
        docs.push({
            mysqlId: random36(),
            bookId,
            barcode,
            status: 'AVAILABLE',
            condition: 'NEW',
        });
        seq += 1;
    }
    if (docs.length) await BookCopyMongo.insertMany(docs);
    return { action: 'grow', added: docs.length, removed: 0, total: total + docs.length };
}

async function run() {
    const args = parseArgs();
    if (!args.confirm) {
        console.error('Thêm --confirm để chạy. Lệnh: node src/scripts/randomizeBookCopyCount.js --confirm');
        process.exit(1);
    }
    if (args.min <= 0 || args.max <= 0) {
        console.error('min/max phải > 0');
        process.exit(1);
    }

    await connectSeedMongo();
    const books = await BookMongo.find({}).select('_id bookCode title').lean();
    console.log(`[randomize] Tổng đầu sách: ${books.length}. Random target trong [${args.min}, ${args.max}].`);

    let added = 0;
    let removed = 0;
    let kept = 0;
    let warnings = [];

    for (let i = 0; i < books.length; i += 1) {
        const b = books[i];
        const target = randInt(args.min, args.max);
        try {
            // eslint-disable-next-line no-await-in-loop
            const r = await adjustBookCopies(b, target);
            added += r.added;
            removed += r.removed;
            if (r.action === 'keep') kept += 1;
            if (r.warn) warnings.push(`[${b.bookCode || b._id}] ${b.title}: ${r.warn}`);
        } catch (e) {
            warnings.push(`[${b.bookCode || b._id}] ${b.title}: LỖI ${e.message}`);
        }
        if ((i + 1) % 25 === 0) {
            console.log(`  ... đã xử lý ${i + 1}/${books.length}`);
        }
    }

    console.log('[randomize] Đồng bộ stock / totalCopies cho mọi sách...');
    for (const b of books) {
        // eslint-disable-next-line no-await-in-loop
        await syncBookInventoryFields(b._id);
    }

    console.log('='.repeat(60));
    console.log('RANDOMIZE TỒN KHO — HOÀN TẤT');
    console.log(`  Đã thêm:   ${added} bản sao`);
    console.log(`  Đã xóa:    ${removed} bản sao`);
    console.log(`  Giữ nguyên: ${kept} đầu sách (đã đúng target)`);
    if (warnings.length) {
        console.log(`  ⚠ Cảnh báo: ${warnings.length} mục`);
        for (const w of warnings.slice(0, 20)) console.log(`     - ${w}`);
        if (warnings.length > 20) console.log(`     ... và ${warnings.length - 20} mục khác`);
    }
    console.log('='.repeat(60));
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
