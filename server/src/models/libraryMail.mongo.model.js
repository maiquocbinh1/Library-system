const mongoose = require('mongoose');

/**
 * Collection: `library_mail`
 * Mục tiêu: nhật ký thư/thông báo nội bộ + yêu cầu quên mật khẩu (không dùng email).
 */
const libraryMailSchema = new mongoose.Schema(
    {
        /** ID dạng UUID để đồng bộ/hiển thị */
        mysqlId: { type: String, index: true, default: '' },

        /** SYSTEM: toàn hệ thống; BORROW_CONFIRM: xác nhận mượn; FORGOT_PASSWORD: yêu cầu quên mật khẩu */
        type: {
            type: String,
            enum: ['SYSTEM', 'BORROW_CONFIRM', 'FORGOT_PASSWORD'],
            required: true,
            index: true,
        },

        title: { type: String, default: '', trim: true },
        contentHtml: { type: String, default: '', trim: true },

        /** Người gửi (dùng cho FORGOT_PASSWORD) */
        senderUserId: { type: String, default: '', index: true },
        senderEmail: { type: String, default: '', trim: true, lowercase: true, index: true },
        senderName: { type: String, default: '', trim: true },
        senderStudentId: { type: String, default: '', trim: true },

        /** Người nhận (nếu là thư 1-1, ví dụ xác nhận mượn / quên mật khẩu đã xử lý) */
        recipientUserId: { type: String, default: '', index: true },

        /** Chỉ áp dụng cho FORGOT_PASSWORD */
        status: { type: String, enum: ['PENDING', 'RESOLVED'], default: 'PENDING', index: true },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, default: '', index: true }, // staff userId

        /** Kết quả gửi (thống kê nhật ký thư) — FORGOT PENDING thường là `pending` */
        deliveryStatus: {
            type: String,
            enum: ['success', 'failed', 'pending'],
            default: 'success',
            index: true,
        },
        /** Số người nhận (thư toàn hệ thống có thể > 1) */
        recipientCount: { type: Number, default: 1, min: 0 },

        meta: { type: Object, default: null },
    },
    { timestamps: true, collection: 'library_mail' },
);

libraryMailSchema.index({ type: 1, createdAt: -1 });
libraryMailSchema.index({ status: 1, createdAt: -1 });
libraryMailSchema.index({ senderEmail: 1, createdAt: -1 });
libraryMailSchema.index({ deliveryStatus: 1, createdAt: -1 });

module.exports = mongoose.model('LibraryMailMongo', libraryMailSchema);

