const crypto = require('crypto');
const mongoose = require('mongoose');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const ProductMongo = require('../models/product.mongo.model');
const HistoryBookMongo = require('../models/historyBook.mongo.model');

function random36() {
    return crypto.randomUUID();
}

function parseBookCodeSequence(code) {
    const s = String(code || '').trim();
    const bo = /^BO-(\d+)$/i.exec(s);
    if (bo) return Number.parseInt(bo[1], 10);
    const legacy = /^B(\d+)$/i.exec(s);
    if (legacy) return Number.parseInt(legacy[1], 10);
    return null;
}

function normalizeManualBookCode(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = /^B(\d+)$/i.exec(s);
    if (!m) return null;
    return `B${String(m[1]).padStart(3, '0')}`;
}

async function generateUniqueBookCode() {
    const docs = await ProductMongo.find({
        bookCode: { $exists: true, $ne: null, $ne: '' },
    })
        .select('bookCode')
        .lean();

    let maxNum = 0;
    for (const d of docs) {
        const n = parseBookCodeSequence(d.bookCode);
        if (n !== null && Number.isFinite(n) && n > maxNum) maxNum = n;
    }

    const nextNumber = maxNum + 1;

    for (let retry = 0; retry < 100; retry += 1) {
        const candidate = `B${String(nextNumber + retry).padStart(3, '0')}`;
        const existed = await ProductMongo.findOne({ bookCode: candidate }).select('_id').lean();
        if (!existed) return candidate;
    }

    throw new BadRequestError('Không thể tạo mã sách mới, vui lòng thử lại');
}

function toClientProduct(doc) {
    const raw = doc.toObject ? doc.toObject() : doc;
    return {
        ...raw,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
    };
}

async function findProductByAnyId(id) {
    if (!id) return null;

    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await ProductMongo.findById(id);
        if (byMongoId) return byMongoId;
    }

    return ProductMongo.findOne({ mysqlId: String(id) });
}

class controllerProduct {
    async uploadImage(req, res) {
        const { file } = req;
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const imageUrl = `uploads/products/${file.filename}`;
        new Created({
            message: 'Upload image success',
            metadata: imageUrl,
        }).send(res);
    }

    async createProduct(req, res) {
        const {
            nameProduct,
            image,
            description,
            stock,
            covertType,
            publishYear,
            pages,
            language,
            publisher,
            publishingCompany,
            category,
            bookCode: bookCodeInput,
        } = req.body;

        if (
            !nameProduct ||
            !image ||
            !description ||
            !stock ||
            !covertType ||
            !publishYear ||
            !pages ||
            !language ||
            !publisher ||
            !publishingCompany ||
            !category
        ) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        let bookCode;
        const trimmedCode = String(bookCodeInput || '').trim();
        if (trimmedCode) {
            const normalized = normalizeManualBookCode(trimmedCode);
            if (!normalized) {
                throw new BadRequestError('Mã sách không hợp lệ');
            }
            const existed = await ProductMongo.findOne({ bookCode: normalized }).select('_id').lean();
            if (existed) {
                throw new BadRequestError('Mã sách đã tồn tại');
            }
            bookCode = normalized;
        } else {
            bookCode = await generateUniqueBookCode();
        }
        const product = await ProductMongo.create({
            mysqlId: random36(),
            bookCode,
            nameProduct,
            image,
            category,
            description,
            stock: Number(stock),
            covertType,
            publishYear: Number(publishYear),
            pages: Number(pages),
            language,
            publisher,
            publishingCompany,
        });

        new Created({
            message: 'Create product success',
            metadata: toClientProduct(product),
        }).send(res);
    }

    async syncOldBooksCode(req, res) {
        // Chạy 1 lần để cấp mã cho sách cũ chưa có bookCode
        const booksWithoutCode = await ProductMongo.find({
            $or: [{ bookCode: { $exists: false } }, { bookCode: null }, { bookCode: '' }],
        }).sort({ createdAt: 1 });

        let updatedCount = 0;
        for (const book of booksWithoutCode) {
            const newCode = await generateUniqueBookCode();
            book.bookCode = newCode;
            await book.save();
            updatedCount += 1;
        }

        new OK({
            message: 'Đồng bộ mã sách thành công',
            metadata: {
                updatedCount,
            },
        }).send(res);
    }

    async getAllProduct(req, res) {
        const products = await ProductMongo.find({}).lean();
        const metadata = products.map((p) => ({
            ...p,
            id: p.mysqlId || (p._id ? String(p._id) : undefined),
        }));

        new OK({
            message: 'Get all product success',
            metadata,
        }).send(res);
    }

    async getOneProduct(req, res) {
        const { id } = req.query;
        const product = await findProductByAnyId(id);
        new OK({
            message: 'Get one product success',
            metadata: product ? toClientProduct(product) : null,
        }).send(res);
    }

    async searchProduct(req, res) {
        const keyword = String(req.query.keyword || '').trim();
        const products = await ProductMongo.find({
            nameProduct: { $regex: keyword, $options: 'i' },
        }).lean();

        const metadata = products.map((p) => ({
            ...p,
            id: p.mysqlId || (p._id ? String(p._id) : undefined),
        }));

        new OK({
            message: 'Search product success',
            metadata,
        }).send(res);
    }

    async updateProduct(req, res) {
        const { id } = req.query;
        const product = await findProductByAnyId(id);
        if (!product) {
            throw new BadRequestError('Sách không tồn tại');
        }

        const allowed = [
            'nameProduct',
            'category',
            'image',
            'description',
            'stock',
            'covertType',
            'publishYear',
            'pages',
            'language',
            'publisher',
            'publishingCompany',
        ];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                product[key] = req.body[key];
            }
        }

        if (req.body.stock !== undefined) product.stock = Number(req.body.stock);
        if (req.body.publishYear !== undefined) product.publishYear = Number(req.body.publishYear);
        if (req.body.pages !== undefined) product.pages = Number(req.body.pages);

        await product.save();

        new OK({
            message: 'Update product success',
            metadata: [1],
        }).send(res);
    }

    async deleteProduct(req, res) {
        const { id } = req.body;
        const product = await findProductByAnyId(id);
        if (!product) {
            throw new BadRequestError('Sách không tồn tại');
        }

        const productIdCandidates = [String(product._id)];
        if (product.mysqlId) productIdCandidates.push(String(product.mysqlId));

        const activeBorrow = await HistoryBookMongo.findOne({
            bookId: { $in: productIdCandidates },
            status: { $in: ['pending', 'success'] },
        }).lean();
        if (activeBorrow) {
            throw new BadRequestError('Không thể xóa vì sách đang được mượn hoặc chưa hoàn tất phiếu');
        }

        await ProductMongo.deleteOne({ _id: product._id });
        new OK({
            message: 'Delete product success',
            metadata: 1,
        }).send(res);
    }
}

module.exports = new controllerProduct();
