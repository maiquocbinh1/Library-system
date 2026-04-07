const mongoose = require('mongoose');

/** `products`: `mysqlId` = PK MySQL */
const productMongoSchema = new mongoose.Schema(
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
        nameProduct: { type: String, required: true },
        category: { type: String, default: null, trim: true },
        description: { type: String, default: '' },
        stock: { type: Number, required: true },
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
        collection: 'products',
    },
);

module.exports = mongoose.models.ProductMongo || mongoose.model('ProductMongo', productMongoSchema);
