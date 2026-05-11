/**
 * Kết nối MongoDB cho script chạy bằng `node` (seed, import…).
 *
 * Trên server HTTP, `src/config/connectMongo.js` đã gọi `dns.setServers` trước khi connect.
 * Các script seed không qua file đó — nếu không set DNS, Windows/ISP dễ gặp:
 *   querySrv ECONNREFUSED _mongodb._tcp.xxx.mongodb.net
 *
 * Tùy chọn .env:
 *   MONGODB_SEED_FAMILY=4     — ép IPv4 (thử khi vẫn timeout)
 *   MONGODB_SERVER_SELECTION_MS=90000 — timeout chọn server (ms)
 */

const dns = require('dns');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

function resolveEnvPath() {
    return path.resolve(__dirname, '../../.env');
}

function applyPublicDnsForMongoSrv() {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    } catch (e) {
        console.warn('[mongoSeedConnect] Không set DNS resolver:', e.message);
    }
}

/**
 * Nạp .env, chỉnh DNS (SRV Atlas), rồi mongoose.connect.
 * @param {{ uri?: string }} [opts]
 * @returns {Promise<string>} URI đã dùng
 */
async function connectSeedMongo(opts = {}) {
    dotenv.config({ path: resolveEnvPath() });
    applyPublicDnsForMongoSrv();

    const uri = (opts.uri || process.env.MONGODB_URI || '').trim();
    if (!uri) {
        throw new Error(
            'Thiếu MONGODB_URI trong server/.env. ' +
                'Nếu mongodb+srv vẫn lỗi DNS, vào Atlas → Connect → Drivers → copy chuỗi mongodb:// (standard).',
        );
    }

    const mongoOpts = {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_MS || 60000),
        socketTimeoutMS: 120000,
    };

    if (String(process.env.MONGODB_SEED_FAMILY || '').trim() === '4') {
        mongoOpts.family = 4;
        console.log('[mongoSeedConnect] Dùng family=4 (IPv4) theo MONGODB_SEED_FAMILY.');
    }

    await mongoose.connect(uri, mongoOpts);
    console.log('[mongoSeedConnect] Đã kết nối MongoDB.');
    return uri;
}

async function disconnectSeedMongo() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}

module.exports = {
    connectSeedMongo,
    disconnectSeedMongo,
    resolveEnvPath,
    applyPublicDnsForMongoSrv,
};
