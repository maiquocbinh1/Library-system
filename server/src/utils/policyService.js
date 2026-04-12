const PolicyMongo = require('../models/policy.mongo.model');
const { BadRequestError } = require('../core/error.response');

/**
 * Chính sách mượn áp dụng cho user (theo readerType).
 * @throws {BadRequestError} nếu thiếu readerType hoặc chưa có bản ghi Policy trong DB.
 */
async function getBorrowPolicyForUser(user) {
    if (!user || user.role === 'admin') {
        return null;
    }
    const type = user.readerType;
    if (!type) {
        throw new BadRequestError('Tài khoản chưa có loại bạn đọc (readerType). Vui lòng cập nhật hồ sơ.');
    }
    const p = await PolicyMongo.findOne({ readerType: type }).lean();
    if (!p) {
        throw new BadRequestError('Chưa cấu hình chính sách mượn cho đối tượng của bạn. Vui lòng liên hệ thư viện.');
    }
    return p;
}

async function getPolicyByReaderType(type) {
    const t = String(type || '').trim();
    if (!t) return null;
    return PolicyMongo.findOne({ readerType: t }).lean();
}

module.exports = {
    getBorrowPolicyForUser,
    getPolicyByReaderType,
};
