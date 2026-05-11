/**
 * Chạy: node src/scripts/seedPolicies.js (từ thư mục server, đã có MONGODB_URI trong .env)
 * Hoặc: cd server && node src/scripts/seedPolicies.js
 */
const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const PolicyMongo = require('../models/policy.mongo.model');

const SEED = [
    { readerType: 'SinhVien_ChinhQuy', maxBooks: 8, loanDays: 14, renewExtensionDays: 14, overdueFinePerDay: 1000 },
];

async function run() {
    await connectSeedMongo();
    console.log('[seedPolicies] Đã kết nối MongoDB');

    try {
        for (const row of SEED) {
            const doc = await PolicyMongo.findOneAndUpdate(
                { readerType: row.readerType },
                {
                    $set: {
                        maxBooks: row.maxBooks,
                        loanDays: row.loanDays,
                        renewExtensionDays: row.renewExtensionDays ?? 14,
                        overdueFinePerDay: row.overdueFinePerDay,
                    },
                },
                { upsert: true, new: true },
            );
            console.log(`[seedPolicies] OK ${row.readerType}:`, {
                maxBooks: doc.maxBooks,
                loanDays: doc.loanDays,
                renewExtensionDays: doc.renewExtensionDays,
                overdueFinePerDay: doc.overdueFinePerDay,
            });
        }
        console.log('[seedPolicies] Hoàn tất.');
    } finally {
        await disconnectSeedMongo();
    }
}

run().catch((e) => {
    console.error('[seedPolicies] Lỗi:', e.message);
    process.exit(1);
});
