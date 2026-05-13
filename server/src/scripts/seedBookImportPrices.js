require('dotenv').config();

const mongoose = require('mongoose');
const dns = require('dns');

const BookMongo = require('../models/book.mongo.model');

dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

function randInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

function pickImportPriceVnd() {
    // Random giá nhập từ 10.000đ đến 150.000đ (bước 1.000đ)
    const raw = randInt(10_000, 150_000);
    return Math.round(raw / 1000) * 1000;
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        console.error('[seed:book-prices] Thiếu MONGODB_URI trong biến môi trường.');
        process.exit(1);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

    const args = process.argv.slice(2);
    const force = args.includes('--force');

    const filter = force ? {} : { $or: [{ importPriceVnd: null }, { importPriceVnd: { $exists: false } }] };

    const books = await BookMongo.find(filter).select('_id title nameProduct bookCode importPriceVnd').lean();
    if (!books.length) {
        console.log('[seed:book-prices] Không có đầu sách cần seed (dùng --force để ghi đè).');
        await mongoose.disconnect();
        return;
    }

    const ops = books.map((b) => ({
        updateOne: {
            filter: { _id: b._id },
            update: { $set: { importPriceVnd: pickImportPriceVnd() } },
        },
    }));

    const r = await BookMongo.bulkWrite(ops, { ordered: false });
    console.log(`[seed:book-prices] Đã seed importPriceVnd cho ${r.modifiedCount} đầu sách.`);

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error('[seed:book-prices] Lỗi:', e?.message || e);
    process.exit(1);
});

