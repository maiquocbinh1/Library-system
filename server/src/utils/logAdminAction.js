const crypto = require('crypto');
const AuditLogMongo = require('../models/auditLog.mongo.model');
const UserMongo = require('../models/user.mongo.model');

/**
 * Chuẩn hoá object để lưu Mongo — loại bỏ password, chuyển ObjectId → string, tránh throw khi JSON.stringify.
 * @param {any} value
 * @returns {any}
 */
function safeSnapshot(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value !== 'object') return value;

    try {
        const seen = new WeakSet();
        const json = JSON.stringify(value, (k, v) => {
            if (k === 'password' || k === 'privateKey' || k === 'otp') return undefined;
            if (v && typeof v === 'object') {
                if (v._bsontype === 'ObjectID' || v._bsontype === 'ObjectId') return String(v);
                if (typeof v.toHexString === 'function' && v.constructor?.name === 'ObjectId') return String(v);
                if (seen.has(v)) return '[Circular]';
                seen.add(v);
            }
            return v;
        });
        return JSON.parse(json);
    } catch {
        return { _note: 'Không thể serialize snapshot', type: typeof value };
    }
}

/**
 * Ghi nhật ký kiểm toán khi Admin / Thủ thư thực hiện thao tác nhạy cảm.
 *
 * - Không throw ra ngoài: lỗi ghi log chỉ `console.warn` để không làm hỏng luồng nghiệp vụ chính.
 * - Chỉ ghi khi `req.user` có id và role là `admin`, `librarian` hoặc `warehouse`.
 *
 * @param {object} params
 * @param {import('express').Request} params.req — Express request (cookies JWT → req.user từ authUser)
 * @param {string} params.action — Mã hành động, ví dụ `FINE_PAID`, `USER_DELETED`
 * @param {string} [params.targetId] — Id đối tượng (string)
 * @param {string} [params.targetType] — Phân loại: USER, FINE_TICKET, BOOK_COPY, STAFF, …
 * @param {object|null} [params.oldValues] — Snapshot trước thay đổi
 * @param {object|null} [params.newValues] — Snapshot sau thay đổi
 * @returns {Promise<void>}
 */
async function logAdminAction({ req, action, targetId = '', targetType = 'UNKNOWN', oldValues = null, newValues = null }) {
    try {
        const uid = req?.user?.id != null ? String(req.user.id) : '';
        if (!uid || !action) return;

        const roleRaw = String(req?.user?.role || '').toLowerCase();
        if (roleRaw !== 'admin' && roleRaw !== 'librarian' && roleRaw !== 'warehouse') return;

        const actor = await UserMongo.findById(uid).select('fullName role email').lean();
        const adminName = actor?.fullName || actor?.email || 'Không rõ';
        const ar = actor?.role;
        const adminRole = ['admin', 'librarian', 'warehouse'].includes(String(ar))
            ? String(ar)
            : roleRaw === 'admin'
              ? 'admin'
              : roleRaw === 'warehouse'
                ? 'warehouse'
                : 'librarian';

        await AuditLogMongo.create({
            mysqlId: crypto.randomUUID(),
            adminId: uid,
            adminName: String(adminName).trim() || '—',
            adminRole,
            action: String(action).trim(),
            targetId: targetId != null ? String(targetId) : '',
            targetType: String(targetType || 'UNKNOWN').trim(),
            oldValues: safeSnapshot(oldValues),
            newValues: safeSnapshot(newValues),
        });
    } catch (err) {
        console.warn('[logAdminAction] Không ghi được audit log:', err?.message || err);
    }
}

/** Các mã action dùng chung — tránh typo string rải rác trong controller. */
const AuditActions = {
    FINE_PAID: 'FINE_PAID',
    USER_DELETED: 'USER_DELETED',
    USER_UPDATED: 'USER_UPDATED',
    USER_PASSWORD_RESET_BY_ADMIN: 'USER_PASSWORD_RESET_BY_ADMIN',
    PATRON_CARD_LOCK: 'PATRON_CARD_LOCK',
    BOOK_COPY_DELETED: 'BOOK_COPY_DELETED',
    STAFF_CREATED: 'STAFF_CREATED',
    STAFF_DELETED: 'STAFF_DELETED',
    STAFF_UPDATED: 'STAFF_UPDATED',
};

module.exports = {
    logAdminAction,
    safeSnapshot,
    AuditActions,
};
