const mongoose = require('mongoose');
const ReaderCodeMongo = require('../models/readerCode.mongo.model');

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        return false;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 20000,
        });
        try {
            await ReaderCodeMongo.createCollection();
        } catch (createErr) {
            // 48 = NamespaceExists (collection already exists)
            if (createErr?.code !== 48) {
                throw createErr;
            }
        }
        await ReaderCodeMongo.syncIndexes();
        console.log('[MongoDB] Kết nối Atlas thành công');
        return true;
    } catch (err) {
        console.error('[MongoDB] Kết nối Atlas thất bại:', err.message);
        return false;
    }
}

module.exports = { connectMongo };
