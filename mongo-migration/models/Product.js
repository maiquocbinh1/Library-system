const mongoose = require('mongoose');

/**
 * Migrated from MySQL `products` table.
 * `description` is full TEXT — MongoDB stores as UTF-8 string (no truncation in migration).
 */
const productSchema = new mongoose.Schema(
    {
        mysqlId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 36,
        },
        image: { type: String, required: true },
        nameProduct: { type: String, required: true },
        description: { type: String, default: '' },
        stock: { type: Number, required: true },
        /** MySQL column name preserved (typo "covert" vs "cover") */
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

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
