const mongoose = require('mongoose');

/**
 * Nhật ký kiểm toán (Audit Trail) — ghi lại thao tác của Admin / Thủ thư.
 *
 * Mục đích: đối soát nội bộ, phát hiện gian lận, KPI hiệu suất theo số lần thao tác.
 * Collection: `library_audit_logs` (đồng bộ prefix `library_*` với các bảng nghiệp vụ khác).
 */
const auditLogMongoSchema = new mongoose.Schema(
    {
        /** Khóa legacy / đồng bộ với các model khác trong dự án (UUID) */
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },

        /** Mongo _id hoặc mysqlId của người thực hiện (từ JWT `req.user.id`) */
        adminId: { type: String, required: true, index: true },

        /** Họ tên tại thời điểm ghi log (snapshot — đổi tên sau vẫn đọc được lịch sử) */
        adminName: { type: String, required: true, trim: true },

        /**
         * Vai trò người thực hiện tại thời điểm log — dùng cho aggregation KPI
         * (chỉ đếm admin + librarian, bỏ qua nếu có log từ job hệ thống sau này).
         */
        adminRole: {
            type: String,
            enum: ['admin', 'librarian', 'warehouse', 'system'],
            default: 'librarian',
            index: true,
        },

        /**
         * Mã hành động dạng SCREAMING_SNAKE_CASE (ví dụ: FINE_PAID, USER_DELETED).
         * Không dùng enum cứng để dễ mở rộng action mới mà không migration schema.
         */
        action: { type: String, required: true, trim: true, index: true },

        /** Đối tượng bị tác động: id phiếu phạt, id user, id bản sao sách, … */
        targetId: { type: String, default: '', trim: true, index: true },

        /** Phân loại đối tượng: FINE_TICKET | USER | BOOK_COPY | STAFF | … */
        targetType: { type: String, default: 'UNKNOWN', trim: true, index: true },

        /** Snapshot JSON-safe trước khi thay đổi (null nếu là hành động tạo mới) */
        oldValues: { type: mongoose.Schema.Types.Mixed, default: null },

        /** Snapshot sau khi thay đổi (null nếu là hành động xóa) */
        newValues: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true, collection: 'library_audit_logs' },
);

auditLogMongoSchema.index({ createdAt: -1 });
auditLogMongoSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLogMongo || mongoose.model('AuditLogMongo', auditLogMongoSchema);
