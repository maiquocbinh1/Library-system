const crypto = require('crypto');

const LibraryMailMongo = require('../models/libraryMail.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const NotificationMongo = require('../models/notification.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');

function randomId() {
    return crypto.randomUUID();
}

function toClientMail(doc) {
    const raw = doc.toObject ? doc.toObject() : { ...doc };
    const deliveryStatus =
        raw.deliveryStatus ||
        (raw.type === 'FORGOT_PASSWORD' && raw.status === 'PENDING' ? 'pending' : 'success');
    const recipientCount = raw.recipientCount != null ? Number(raw.recipientCount) : 1;
    return {
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
        _id: raw._id ? String(raw._id) : undefined,
        type: raw.type,
        title: raw.title || '',
        contentHtml: raw.contentHtml || '',
        senderEmail: raw.senderEmail || '',
        senderName: raw.senderName || '',
        senderStudentId: raw.senderStudentId || '',
        recipientUserId: raw.recipientUserId || '',
        status: raw.status || '',
        resolvedAt: raw.resolvedAt || null,
        resolvedBy: raw.resolvedBy || '',
        deliveryStatus,
        recipientCount,
        meta: raw.meta || null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

function buildLibraryMailFilter({ type, status, q }) {
    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (status && status !== 'all') filter.status = status;
    if (q) {
        filter.$or = [
            { title: { $regex: q, $options: 'i' } },
            { senderEmail: { $regex: q, $options: 'i' } },
            { senderName: { $regex: q, $options: 'i' } },
            { senderStudentId: { $regex: q, $options: 'i' } },
        ];
    }
    return filter;
}

/** Chuẩn hoá deliveryStatus trong aggregation (tài liệu cũ chưa có field) */
function statsAggregatePipeline(baseMatch) {
    return [
        { $match: baseMatch },
        {
            $addFields: {
                _ds: {
                    $switch: {
                        branches: [
                            { case: { $eq: ['$deliveryStatus', 'failed'] }, then: 'failed' },
                            { case: { $eq: ['$deliveryStatus', 'success'] }, then: 'success' },
                            { case: { $eq: ['$deliveryStatus', 'pending'] }, then: 'pending' },
                        ],
                        default: {
                            $cond: [
                                {
                                    $and: [{ $eq: ['$type', 'FORGOT_PASSWORD'] }, { $eq: ['$status', 'PENDING'] }],
                                },
                                'pending',
                                'success',
                            ],
                        },
                    },
                },
                _rc: { $ifNull: ['$recipientCount', 1] },
            },
        },
        {
            $group: {
                _id: null,
                totalSent: { $sum: 1 },
                successCount: { $sum: { $cond: [{ $eq: ['$_ds', 'success'] }, 1, 0] } },
                failedCount: { $sum: { $cond: [{ $eq: ['$_ds', 'failed'] }, 1, 0] } },
                totalRecipients: { $sum: '$_rc' },
            },
        },
    ];
}

async function resetPasswordToDefaultByEmail(emailLc) {
    if (!emailLc) return null;
    const user = await UserMongo.findOne({ email: String(emailLc).toLowerCase() });
    return user;
}

class LibraryMailController {
    /** Staff: danh sách nhật ký thư + thống kê (stats theo filter loại/trạng thái/tìm kiếm, không theo lọc delivery) */
    async list(req, res) {
        const type = String(req.query.type || 'all');
        const status = String(req.query.status || 'all');
        const deliveryStatus = String(req.query.deliveryStatus || 'all');
        const q = String(req.query.q || '').trim().toLowerCase();
        const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);

        const baseFilter = buildLibraryMailFilter({ type, status, q });

        const listFilter = { ...baseFilter };
        if (deliveryStatus && deliveryStatus !== 'all') {
            listFilter.deliveryStatus = deliveryStatus;
        }

        const [rows, statsAgg] = await Promise.all([
            LibraryMailMongo.find(listFilter).sort({ createdAt: -1 }).limit(limit).lean(),
            LibraryMailMongo.aggregate(statsAggregatePipeline(baseFilter)),
        ]);

        const s = statsAgg[0] || {};
        new OK({
            message: 'OK',
            metadata: {
                items: rows.map((r) => toClientMail(r)),
                stats: {
                    totalSent: Number(s.totalSent) || 0,
                    successCount: Number(s.successCount) || 0,
                    failedCount: Number(s.failedCount) || 0,
                    totalRecipients: Number(s.totalRecipients) || 0,
                },
            },
        }).send(res);
    }

    /**
     * Public/User: gửi yêu cầu quên mật khẩu để thư viện xử lý
     * Body: { email, studentId } — nội dung cố định theo quy định hệ thống
     */
    async createForgotPasswordRequest(req, res) {
        const { email, studentId } = req.body || {};
        const emailLc = String(email || '').trim().toLowerCase();
        if (!emailLc) throw new BadRequestError('Vui lòng nhập email');

        const safeStudentId = String(studentId || '').trim();
        if (!safeStudentId) throw new BadRequestError('Vui lòng nhập MSV hoặc MSG');

        const DEFAULT_FORGOT_BODY = 'em xin dc cap lai mat khau mac dinh';
        const esc = (s) =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

        const title = 'Yêu cầu quên mật khẩu';
        const contentHtml = `
            <div style="font-family:Arial,sans-serif">
              <p><b>Sinh viên</b> gửi yêu cầu đặt lại mật khẩu.</p>
              <p><b>Email:</b> ${esc(emailLc)}</p>
              <p><b>MSV/MSG:</b> ${esc(safeStudentId)}</p>
              <p><b>Nội dung:</b> ${esc(DEFAULT_FORGOT_BODY)}</p>
              <p style="color:#64748b;font-size:12px;margin-top:12px">Vui lòng kiểm tra thông tin và bấm “ResetPass” để đặt lại mật khẩu mặc định 123.</p>
            </div>
        `.trim();

        const doc = await LibraryMailMongo.create({
            mysqlId: randomId(),
            type: 'FORGOT_PASSWORD',
            title,
            contentHtml,
            senderEmail: emailLc,
            senderName: '',
            senderStudentId: safeStudentId,
            status: 'PENDING',
            deliveryStatus: 'pending',
            recipientCount: 1,
            meta: { message: DEFAULT_FORGOT_BODY },
        });

        new Created({ message: 'Đã gửi yêu cầu. Vui lòng chờ thư viện xử lý.', metadata: toClientMail(doc) }).send(res);
    }

    /**
     * Staff: duyệt yêu cầu quên mật khẩu -> reset về 123 + tạo notification cho user
     * Body: { mailId }
     */
    async resolveForgotPassword(req, res) {
        const { mailId } = req.body || {};
        if (!mailId) throw new BadRequestError('Thiếu mailId');

        const mail = await LibraryMailMongo.findOne({ $or: [{ _id: mailId }, { mysqlId: mailId }] });
        if (!mail) throw new BadRequestError('Không tìm thấy yêu cầu');
        if (mail.type !== 'FORGOT_PASSWORD') throw new BadRequestError('Không đúng loại yêu cầu');
        if (mail.status === 'RESOLVED') {
            new OK({ message: 'Đã xử lý trước đó', metadata: toClientMail(mail) }).send(res);
            return;
        }

        const emailLc = String(mail.senderEmail || '').toLowerCase();
        if (!emailLc) throw new BadRequestError('Thiếu email người gửi');

        const user = await resetPasswordToDefaultByEmail(emailLc);
        if (!user) throw new BadRequestError('Không tìm thấy user theo email này');

        // Dùng lại logic update password hiện có: set password mặc định "123"
        // Tránh duplicate logic hash tại đây: gọi trực tiếp phương thức updatePassword trong users.controller là khó.
        // => Set theo pattern hiện tại: users.controller.updatePassword expects { userId, newPassword }
        // Nhưng đây là controller riêng, ta cập nhật trực tiếp vào UserMongo như updatePassword đang làm.
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash('123', 10);
        user.password = hash;
        await user.save();

        const now = new Date();
        mail.status = 'RESOLVED';
        mail.deliveryStatus = 'success';
        mail.recipientCount = 1;
        mail.resolvedAt = now;
        mail.resolvedBy = String(req.user?.id || '');
        mail.recipientUserId = String(user._id);
        mail.meta = { ...(mail.meta || {}), resetToDefault: true };
        await mail.save();

        // Gửi thông báo nội bộ để sinh viên biết mật khẩu đã reset
        await NotificationMongo.create({
            mysqlId: randomId(),
            userId: String(user._id),
            type: 'INFO',
            title: 'Mật khẩu đã được đặt lại',
            contentHtml:
                '<p>Mật khẩu của bạn đã được thư viện đặt lại về <b>mặc định: 123</b>. Vui lòng đăng nhập và đổi mật khẩu mới.</p>',
            meta: { source: 'FORGOT_PASSWORD', mailId: String(mail._id) },
            dedupeKey: `FORGOT_RESET:${String(mail._id)}`,
        });

        new OK({ message: 'Đã reset mật khẩu về 123', metadata: toClientMail(mail) }).send(res);
    }
}

module.exports = new LibraryMailController();

