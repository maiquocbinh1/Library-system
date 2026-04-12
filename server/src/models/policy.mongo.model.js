const mongoose = require('mongoose');

const READER_TYPES = ['SinhVien_ChinhQuy', 'GiangVien_CanBo', 'HocVien_NCS'];

const policyMongoSchema = new mongoose.Schema(
    {
        readerType: {
            type: String,
            enum: READER_TYPES,
            required: true,
            unique: true,
            index: true,
        },
        /** Số ấn phẩm tối đa được mượn cùng lúc */
        maxBooks: { type: Number, required: true, min: 1 },
        /** Thời gian mượn tối đa (ngày) */
        loanDays: { type: Number, required: true, min: 1 },
        /** Phạt quá hạn: VNĐ / cuốn / ngày */
        overdueFinePerDay: { type: Number, default: 1000, min: 0 },
    },
    { timestamps: true, collection: 'library_policies' },
);

module.exports = mongoose.models.PolicyMongo || mongoose.model('PolicyMongo', policyMongoSchema);
module.exports.READER_TYPES = READER_TYPES;
