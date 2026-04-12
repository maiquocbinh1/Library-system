const mongoose = require('mongoose');

/** Đầu sách (bibliographic record). Collection mới: `library_books`. */
const bookMongoSchema = new mongoose.Schema(
    {
        mysqlId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 36,
        },
        bookCode: { type: String, unique: true, sparse: true, index: true, trim: true },
        image: { type: String, required: true },
        /** Tên đầu sách (thay cho nameProduct) */
        title: { type: String, required: true, trim: true },
        category: { type: String, default: null, trim: true },
        category_1: { type: String, default: null, trim: true },
        description: { type: String, default: '' },
        /**
         * Số bản có thể mượn (đồng bộ với số bản sao AVAILABLE — cache để truy vấn nhanh).
         * API trả về trường `stock` từ đây hoặc từ đếm bookCopy tùy endpoint.
         */
        stock: { type: Number, required: true, default: 0 },
        /** Tổng số bản sao vật lý (có thể dùng để hiển thị; đồng bộ khi thêm/xóa bản sao). */
        totalCopies: { type: Number, required: true, default: 0 },
        /** Giá bìa (phục vụ tính phạt sau này) */
        coverPrice: { type: Number, default: null },
        covertType: {
            type: String,
            enum: ['hard', 'soft'],
            required: true,
        },
        publishYear: { type: Number, required: true },
        pages: { type: Number, required: true },
        language: { type: String, required: true },
        publisher: { type: String, required: true },
        publishingCompany: { type: String, required: true },
    },
    {
        timestamps: true,
        collection: 'library_books',
    },
);

module.exports = mongoose.models.BookMongo || mongoose.model('BookMongo', bookMongoSchema);
