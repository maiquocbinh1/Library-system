/* eslint-disable no-console */
require('dotenv').config();

const path = require('path');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const ProductMongo = require('../models/product.mongo.model');

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        throw new Error('Missing MONGODB_URI in .env');
    }

    const filePath = path.resolve(__dirname, 'books_categorized.xlsx');
    console.log('[updateCategories] Reading file:', filePath);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
        throw new Error('XLSX has no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    console.log('[updateCategories] Rows:', rows.length);

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[updateCategories] Connected to MongoDB');

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] || {};
        const rawId = String(row._id || '').trim();
        const newCategory = String(row.New_Category || '').trim();

        if (!rawId || !mongoose.isValidObjectId(rawId) || !newCategory) {
            skipped += 1;
            continue;
        }

        try {
            const book = await ProductMongo.findById(rawId);
            if (!book) {
                skipped += 1;
                continue;
            }

            book.category = newCategory;
            await book.save();
            updated += 1;

            if (updated % 50 === 0) {
                console.log(`[updateCategories] Updated ${updated}/${rows.length}...`);
            }
        } catch (err) {
            failed += 1;
            console.error('[updateCategories] Failed row:', { _id: rawId, New_Category: newCategory, error: err?.message });
        }
    }

    console.log('[updateCategories] Done.', { updated, skipped, failed, total: rows.length });
}

main()
    .catch((err) => {
        console.error('[updateCategories] Fatal:', err?.message || err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await mongoose.disconnect();
        } catch (e) {
            // ignore
        }
    });

