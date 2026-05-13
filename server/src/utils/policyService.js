const PolicyMongo = require('../models/policy.mongo.model');

/**
 * Chính sách mượn áp dụng cho user (theo readerType).
 * Fallback policy đầu tiên trong DB hoặc default an toàn nếu thiếu readerType / chưa cấu hình.
 */
async function getBorrowPolicyForUser(user) {
    if (!user || user.role === 'admin' || user.role === 'warehouse') {
        return null;
    }
    const type = user.readerType;
    const p = type ? await PolicyMongo.findOne({ readerType: type }).lean() : null;
    if (p) return p;

    const fallback = await PolicyMongo.findOne({}).lean();
    if (fallback) return fallback;

    return {
        readerType: 'SinhVien_ChinhQuy',
        maxBooks: 5,
        loanDays: 14,
        renewExtensionDays: 7,
        overdueFinePerDay: 1000,
    };
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
