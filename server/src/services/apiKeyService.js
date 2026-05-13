const crypto = require('crypto');
const ApiKeyMongo = require('../models/apiKey.mongo.model');

/** Sinh UUID dạng chuỗi 36 ký tự — dùng chung cho mysqlId / khóa phụ. */
function random36() {
    return crypto.randomUUID();
}

/**
 * Tạo cặp khóa RSA + lưu ApiKey cho user (đăng nhập JWT RS256).
 * Xóa api key cũ của cùng userId trước khi tạo mới — giống luồng `users.controller`.
 */
async function createApiKeyForUser(userId) {
    const userIdStr = String(userId);
    await ApiKeyMongo.deleteMany({ userId: userIdStr });

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyString = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyString = publicKey.export({ type: 'spki', format: 'pem' });

    return ApiKeyMongo.create({
        mysqlId: random36(),
        userId: userIdStr,
        publicKey: publicKeyString,
        privateKey: privateKeyString,
    });
}

module.exports = {
    random36,
    createApiKeyForUser,
};
