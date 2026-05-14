const crypto = require('crypto');
const mongoose = require('mongoose');

const LibraryMailMongo = require('../models/libraryMail.mongo.model');
const UserMongo = require('../models/user.mongo.model');

function randomId() {
    return crypto.randomUUID();
}

async function findStaffSender(req) {
    const id = req?.user?.id;
    if (!id) {
        return { senderEmail: 'no-reply@thuvien.local', senderName: 'Thư viện', staffId: '' };
    }
    let u = null;
    if (mongoose.isValidObjectId(String(id))) {
        u = await UserMongo.findById(id).select('email fullName').lean();
    }
    if (!u) {
        u = await UserMongo.findOne({ mysqlId: String(id) }).select('email fullName').lean();
    }
    const email = u?.email ? String(u.email).toLowerCase().trim() : 'no-reply@thuvien.local';
    const name = u?.fullName ? String(u.fullName).trim() : 'Thư viện';
    return { senderEmail: email, senderName: name, staffId: String(id) };
}

/**
 * Ghi `library_mail` khi staff gửi thông báo in-app (nhật ký thư).
 * @param {'mass_broadcast'|'in_app_staff_notification'} mailMetaSource — mass toàn trường vs cảnh báo 1 user
 */
async function logStaffNotificationMail(req, { mailMetaSource, title, contentHtml, recipientCount, recipientUserId, metaExtras }) {
    const { senderEmail, senderName, staffId } = await findStaffSender(req);
    const n = Math.max(1, Math.min(Number(recipientCount) || 1, 10_000_000));
    const source =
        mailMetaSource === 'mass_broadcast' ? 'mass_broadcast' : 'in_app_staff_notification';
    const defaultTitle = source === 'mass_broadcast' ? 'Toàn hệ thống' : 'Thông báo nội bộ';

    await LibraryMailMongo.create({
        mysqlId: randomId(),
        type: 'SYSTEM',
        title: String(title || defaultTitle).trim().slice(0, 300),
        contentHtml: String(contentHtml || '').trim(),
        senderEmail,
        senderName,
        senderStudentId: '',
        recipientUserId: recipientUserId ? String(recipientUserId) : '',
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: staffId,
        deliveryStatus: 'success',
        recipientCount: n,
        meta: {
            source,
            ...(metaExtras && typeof metaExtras === 'object' ? metaExtras : {}),
        },
    });
}

async function tryLogStaffNotificationMail(req, payload) {
    try {
        await logStaffNotificationMail(req, payload);
    } catch (e) {
        console.error('[library_mail log] staff notification:', e?.message || e);
    }
}

module.exports = {
    logStaffNotificationMail,
    tryLogStaffNotificationMail,
};
