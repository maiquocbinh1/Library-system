const crypto = require('crypto');
const mongoose = require('mongoose');
const NotificationMongo = require('../models/notification.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const { tryLogStaffNotificationMail } = require('../services/libraryMailLog.service');

function random36() {
    return crypto.randomUUID();
}

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const u = await UserMongo.findById(id).lean();
        if (u) return u;
    }
    return UserMongo.findOne({ mysqlId: String(id) }).lean();
}

function userIdCandidates(user) {
    const ids = [String(user._id)];
    if (user.mysqlId) ids.push(String(user.mysqlId));
    return ids;
}

function isMongoObjectIdString(v) {
    return typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v);
}

/** Tránh CastError khi client gửi mysqlId (UUID) thay vì _id. */
function notificationIdFilter(notificationId) {
    const s = String(notificationId || '').trim();
    if (!s) return { _id: null };
    if (isMongoObjectIdString(s)) return { $or: [{ _id: s }, { mysqlId: s }] };
    return { mysqlId: s };
}

function toClientNotification(doc) {
    const raw = doc.toObject ? doc.toObject() : { ...doc };
    return {
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
        _id: raw._id ? String(raw._id) : undefined,
        type: raw.type,
        title: raw.title,
        contentHtml: raw.contentHtml || '',
        meta: raw.meta || null,
        readAt: raw.readAt || null,
        createdAt: raw.createdAt,
    };
}

class NotificationController {
    /** User: danh sách thông báo của tôi */
    async getMyNotifications(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        const ids = userIdCandidates(user);

        const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 200);
        const list = await NotificationMongo.find({ userId: { $in: ids } })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        const unreadCount = await NotificationMongo.countDocuments({ userId: { $in: ids }, readAt: null });
        new OK({ message: 'OK', metadata: { unreadCount, items: list.map(toClientNotification) } }).send(res);
    }

    /** User: đánh dấu đã đọc */
    async markRead(req, res) {
        const { id } = req.user;
        const { notificationId } = req.body || {};
        if (!notificationId) throw new BadRequestError('Thiếu notificationId');
        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        const ids = userIdCandidates(user);

        const now = new Date();
        await NotificationMongo.updateOne(
            { ...notificationIdFilter(notificationId), userId: { $in: ids } },
            { $set: { readAt: now } },
        );
        new OK({ message: 'OK', metadata: { readAt: now } }).send(res);
    }

    /** User: đánh dấu tất cả đã đọc */
    async markAllRead(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        const ids = userIdCandidates(user);
        const now = new Date();
        const r = await NotificationMongo.updateMany({ userId: { $in: ids }, readAt: null }, { $set: { readAt: now } });
        new OK({ message: 'OK', metadata: { updated: r.modifiedCount } }).send(res);
    }

    /** Staff: gửi cảnh báo nội bộ cho 1 user */
    async sendWarning(req, res) {
        const { userId, title, contentHtml, meta, dedupeKey } = req.body || {};
        if (!userId) throw new BadRequestError('Thiếu userId');
        const u = await findUserByAnyId(userId);
        if (!u) throw new BadRequestError('Người dùng không tồn tại');

        const doc = await NotificationMongo.create({
            mysqlId: random36(),
            userId: String(u._id),
            type: 'WARNING',
            title: String(title || 'Thông báo từ thư viện').trim(),
            contentHtml: String(contentHtml || '').trim(),
            meta: meta || null,
            dedupeKey: String(dedupeKey || '').trim(),
        });
        await tryLogStaffNotificationMail(req, {
            mailMetaSource: 'in_app_staff_notification',
            title: String(title || 'Thông báo từ thư viện').trim(),
            contentHtml: String(contentHtml || '').trim(),
            recipientCount: 1,
            recipientUserId: String(u._id),
            metaExtras: { channel: 'send_warning', notificationMysqlId: doc.mysqlId },
        });
        new Created({ message: 'Đã gửi thông báo', metadata: toClientNotification(doc) }).send(res);
    }

    /** Staff: gửi hàng loạt (theo danh sách userIds) */
    async sendMass(req, res) {
        const { userIds, title, contentHtml } = req.body || {};
        if (!Array.isArray(userIds) || userIds.length === 0) throw new BadRequestError('Thiếu userIds');
        const t = String(title || 'Thông báo từ thư viện').trim();
        const html = String(contentHtml || '').trim();

        const createdAt = new Date();
        const batchId = random36();
        const ops = [];
        for (const uid of userIds) {
            const u = await findUserByAnyId(uid);
            if (!u) continue;
            ops.push({
                insertOne: {
                    document: {
                        mysqlId: random36(),
                        userId: String(u._id),
                        type: 'SYSTEM',
                        title: t,
                        contentHtml: html,
                        meta: { massBroadcast: true, batchId },
                        dedupeKey: '',
                        readAt: null,
                        createdAt,
                        updatedAt: createdAt,
                    },
                },
            });
        }
        if (!ops.length) throw new BadRequestError('Không có user hợp lệ');
        await NotificationMongo.bulkWrite(ops, { ordered: false });
        await tryLogStaffNotificationMail(req, {
            mailMetaSource: 'mass_broadcast',
            title: t,
            contentHtml: html,
            recipientCount: ops.length,
            metaExtras: { channel: 'send_mass', notificationCount: ops.length, batchId },
        });
        new OK({ message: `Đã gửi ${ops.length} thông báo` }).send(res);
    }
}

module.exports = new NotificationController();

