const mongoose = require('mongoose');
const ProductMongo = require('../models/product.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const HistoryBookMongo = require('../models/historyBook.mongo.model');
const OtpMongo = require('../models/otp.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');

function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

/** MySQL đã ghi xong; lỗi Mongo chỉ log. */
async function runMongoSync(label, fn) {
    if (!isMongoConnected()) {
        return;
    }
    try {
        await fn();
        console.log(`[SYNC] MySQL + Mongo write success (${label})`);
    } catch (err) {
        console.error(`[SYNC] Mongo write failed (${label}):`, err.message);
    }
}

function toProductMongoPayload(plain) {
    if (!plain || !plain.id) return null;
    return {
        mysqlId: plain.id,
        image: plain.image,
        nameProduct: plain.nameProduct,
        description: plain.description ?? '',
        stock: plain.stock,
        covertType: plain.covertType,
        publishYear: plain.publishYear,
        pages: plain.pages,
        language: plain.language,
        publisher: plain.publisher,
        publishingCompany: plain.publishingCompany,
    };
}

async function syncProductFromPlain(plain) {
    const payload = toProductMongoPayload(plain);
    if (!payload) return;
    await runMongoSync('product upsert', async () => {
        await ProductMongo.findOneAndUpdate({ mysqlId: payload.mysqlId }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    });
}

async function deleteProductMongo(mysqlId) {
    if (!mysqlId) return;
    await runMongoSync('product delete', async () => {
        await ProductMongo.deleteOne({ mysqlId: String(mysqlId) });
    });
}

function toUserMongoPayload(plain) {
    if (!plain || !plain.id) return null;
    return {
        mysqlId: plain.id,
        avatar: plain.avatar ?? null,
        fullName: plain.fullName,
        phone: plain.phone ?? null,
        address: plain.address ?? null,
        email: plain.email,
        password: plain.password ?? null,
        role: plain.role || 'user',
        typeLogin: plain.typeLogin,
        idStudent: plain.idStudent ?? null,
    };
}

async function syncUserFromPlain(plain) {
    const payload = toUserMongoPayload(plain);
    if (!payload) return;
    await runMongoSync('user upsert', async () => {
        await UserMongo.findOneAndUpdate({ mysqlId: payload.mysqlId }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    });
}

async function deleteUserMongo(mysqlId) {
    if (!mysqlId) return;
    await runMongoSync('user delete', async () => {
        await UserMongo.deleteOne({ mysqlId: String(mysqlId) });
    });
}

function toHistoryBookMongoPayload(plain) {
    if (!plain || !plain.id) return null;
    return {
        mysqlId: plain.id,
        userId: plain.userId,
        fullName: plain.fullName,
        phone: plain.phone ?? null,
        address: plain.address ?? null,
        bookId: plain.bookId,
        borrowDate: plain.borrowDate,
        returnDate: plain.returnDate ?? null,
        status: plain.status,
        quantity: plain.quantity,
    };
}

async function syncHistoryBookFromPlain(plain) {
    const payload = toHistoryBookMongoPayload(plain);
    if (!payload) return;
    await runMongoSync('historyBook upsert', async () => {
        await HistoryBookMongo.findOneAndUpdate({ mysqlId: payload.mysqlId }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    });
}

async function deleteHistoryBookMongo(mysqlId) {
    if (!mysqlId) return;
    await runMongoSync('historyBook delete', async () => {
        await HistoryBookMongo.deleteOne({ mysqlId: String(mysqlId) });
    });
}

async function syncOtpFromPlain(plain) {
    if (!plain || plain.id == null) return;
    const mysqlId = String(plain.id);
    const payload = {
        mysqlId,
        email: plain.email,
        otp: plain.otp,
    };
    await runMongoSync('otp upsert', async () => {
        await OtpMongo.findOneAndUpdate({ mysqlId: payload.mysqlId }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    });
}

async function deleteOtpsByEmailMongo(email) {
    if (!email) return;
    await runMongoSync('otp delete by email', async () => {
        await OtpMongo.deleteMany({ email });
    });
}

function toApiKeyMongoPayload(plain) {
    if (!plain || !plain.id) return null;
    return {
        mysqlId: plain.id,
        userId: plain.userId,
        publicKey: plain.publicKey,
        privateKey: plain.privateKey,
    };
}

async function syncApiKeyFromPlain(plain) {
    const payload = toApiKeyMongoPayload(plain);
    if (!payload) return;
    await runMongoSync('apiKey upsert', async () => {
        await ApiKeyMongo.findOneAndUpdate({ mysqlId: payload.mysqlId }, payload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    });
}

async function deleteApiKeysByUserIdMongo(userId) {
    if (!userId) return;
    await runMongoSync('apiKey delete by userId', async () => {
        await ApiKeyMongo.deleteMany({ userId: String(userId) });
    });
}

module.exports = {
    isMongoConnected,
    runMongoSync,
    syncProductFromPlain,
    deleteProductMongo,
    syncUserFromPlain,
    deleteUserMongo,
    syncHistoryBookFromPlain,
    deleteHistoryBookMongo,
    syncOtpFromPlain,
    deleteOtpsByEmailMongo,
    syncApiKeyFromPlain,
    deleteApiKeysByUserIdMongo,
};
