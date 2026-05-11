const mongoose = require('mongoose');

const READER_TYPES = ['SinhVien_ChinhQuy'];

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
        /**
         * Số ngày cộng thêm mỗi lần gia hạn (kể từ hạn trả cũ).
         * Chỉ dùng giá trị 7 hoặc 14 (1 tuần / 2 tuần).
         */
        renewExtensionDays: { type: Number, default: 14, min: 7, max: 14 },
        /** Phạt quá hạn: VNĐ / cuốn / ngày */
        overdueFinePerDay: { type: Number, default: 1000, min: 0 },
    },
    { timestamps: true, collection: 'library_policies' },
);

module.exports = mongoose.models.PolicyMongo || mongoose.model('PolicyMongo', policyMongoSchema);
module.exports.READER_TYPES = READER_TYPES;
