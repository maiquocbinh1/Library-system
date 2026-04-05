const mongoose = require('mongoose');

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        return false;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 20000,
        });
        console.log('[MongoDB] Kết nối Atlas thành công');
        return true;
    } catch (err) {
        console.error('[MongoDB] Kết nối Atlas thất bại:', err.message);
        return false;
    }
}

module.exports = { connectMongo };
