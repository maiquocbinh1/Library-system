const mongoose = require('mongoose');

/** Mỗi lần nhận trả thành công qua barcode (quầy lưu thông) — phục vụ nhật ký “đã trả hôm nay”. */
const circulationReturnEventSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        barcode: { type: String, required: true, trim: true, index: true },
        bookTitle: { type: String, required: true, trim: true },
        borrowerStudentId: { type: String, default: '' },
        borrowerName: { type: String, default: '' },
        ticketId: { type: String, default: '', index: true },
        fineAmount: { type: Number, default: 0 },
        onTime: { type: Boolean, default: true },
        /** Thời điểm ghi nhận tại quầy (theo giờ máy chủ). */
        recordedAt: { type: Date, required: true, index: true },
        /** user id (JWT) của thủ thư thao tác */
        staffUserId: { type: String, default: null, index: true },
    },
    { timestamps: true, collection: 'circulation_return_events' },
);

circulationReturnEventSchema.index({ staffUserId: 1, recordedAt: -1 });

module.exports =
    mongoose.models.CirculationReturnEventMongo ||
    mongoose.model('CirculationReturnEventMongo', circulationReturnEventSchema);
