/**
 * Chạy: node src/scripts/seedPolicies.js (từ thư mục server, đã có MONGODB_URI trong .env)
 * Hoặc: cd server && node src/scripts/seedPolicies.js
 */
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const PolicyMongo = require('../models/policy.mongo.model');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SEED = [
    { readerType: 'SinhVien_ChinhQuy', maxBooks: 8, loanDays: 150, overdueFinePerDay: 1000 },
    { readerType: 'GiangVien_CanBo', maxBooks: 7, loanDays: 60, overdueFinePerDay: 1000 },
    { readerType: 'HocVien_NCS', maxBooks: 5, loanDays: 150, overdueFinePerDay: 1000 },
];

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu MONGODB_URI trong .env');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[seedPolicies] Đã kết nối MongoDB');

    try {
        for (const row of SEED) {
            const doc = await PolicyMongo.findOneAndUpdate(
                { readerType: row.readerType },
                {
                    $set: {
                        maxBooks: row.maxBooks,
                        loanDays: row.loanDays,
                        overdueFinePerDay: row.overdueFinePerDay,
                    },
                },
                { upsert: true, new: true },
            );
            console.log(`[seedPolicies] OK ${row.readerType}:`, {
                maxBooks: doc.maxBooks,
                loanDays: doc.loanDays,
                overdueFinePerDay: doc.overdueFinePerDay,
            });
        }
        console.log('[seedPolicies] Hoàn tất.');
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((e) => {
    console.error('[seedPolicies] Lỗi:', e.message);
    process.exit(1);
});
