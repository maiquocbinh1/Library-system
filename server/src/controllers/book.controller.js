const crypto = require('crypto');
const mongoose = require('mongoose');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const { countAvailableForBook, syncBookInventoryFields } = require('../utils/bookInventory');
const { createBookCopiesForBook, deleteAvailableCopies } = require('../services/bookCopy.service');

function random36() {
    return crypto.randomUUID();
}

function normalizeBookCode(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';

    const bo = /^BO-(\d+)$/i.exec(s);
    if (bo) return `BO-${String(bo[1]).padStart(3, '0')}`;

    const b = /^B(\d+)$/i.exec(s);
    if (b) return `B${String(b[1]).padStart(3, '0')}`;

    return null;
}

async function generateUniqueBookCode() {
    const latestBook = await BookMongo.findOne({
        bookCode: { $exists: true, $ne: null, $ne: '' },
    })
        .sort({ bookCode: -1 })
        .select('bookCode')
        .lean();

    let nextNumber = 1;
    if (latestBook?.bookCode) {
        const numericPart = Number.parseInt(String(latestBook.bookCode).replace(/^B/i, ''), 10);
        if (Number.isFinite(numericPart)) {
            nextNumber = numericPart + 1;
        }
    }

    for (let retry = 0; retry < 100; retry += 1) {
        const candidate = `B${String(nextNumber + retry).padStart(3, '0')}`;
        const existed = await BookMongo.findOne({ bookCode: candidate }).select('_id').lean();
        if (!existed) return candidate;
    }

    throw new BadRequestError('Không thể tạo mã sách mới, vui lòng thử lại');
}

function toClientBook(doc, options = {}) {
    const raw = doc.toObject ? doc.toObject({ virtuals: false }) : { ...doc };
    const title = raw.title ?? raw.nameProduct ?? '';
    const stock = options.stockOverride !== undefined ? options.stockOverride : raw.stock;

    return {
        ...raw,
        title,
        nameProduct: title,
        stock,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
    };
}

async function attachAvailableCounts(booksLean) {
    if (!booksLean.length) return [];
    const ids = booksLean.map((b) => b._id);
    const agg = await BookCopyMongo.aggregate([
        { $match: { bookId: { $in: ids }, status: 'AVAILABLE' } },
        { $group: { _id: '$bookId', available: { $sum: 1 } } },
    ]);
    const map = new Map(agg.map((a) => [String(a._id), a.available]));
    return booksLean.map((b) => {
        const available = map.get(String(b._id));
        const stockVal = available !== undefined ? available : b.stock;
        return toClientBook(b, { stockOverride: stockVal });
    });
}

async function findBookByAnyId(id) {
    if (!id) return null;

    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await BookMongo.findById(id);
        if (byMongoId) return byMongoId;
    }

    return BookMongo.findOne({ mysqlId: String(id) });
}

let legacyMigrationDone = false;

/**
 * Một lần: nếu `library_books` trống và còn collection `products` (dữ liệu cũ), copy sang và sinh bookCopy.
 */
async function migrateLegacyProductsToBooksOnce() {
    if (legacyMigrationDone) return;
    try {
        const db = mongoose.connection.db;
        if (!db) {
            legacyMigrationDone = true;
            return;
        }

        const newCount = await BookMongo.countDocuments();
        if (newCount > 0) {
            legacyMigrationDone = true;
            return;
        }

        const oldCol = db.collection('products');
        const oldDocs = await oldCol.find({}).toArray();
        if (!oldDocs.length) {
            legacyMigrationDone = true;
            return;
        }

        for (const d of oldDocs) {
            const stockNum = Number(d.stock) || 0;
            const doc = {
                mysqlId: d.mysqlId || random36(),
                image: d.image,
                title: d.nameProduct || d.title || 'Chưa có tên',
                category: d.category || null,
                category_1: d.category_1 || d.category || null,
                description: d.description ?? '',
                stock: stockNum,
                totalCopies: stockNum,
                coverPrice: d.coverPrice ?? d.price ?? null,
                covertType: d.covertType,
                publishYear: d.publishYear,
                pages: d.pages,
                language: d.language,
                publisher: d.publisher,
                publishingCompany: d.publishingCompany,
            };
            const bc = d.bookCode != null && String(d.bookCode).trim() ? String(d.bookCode).trim() : '';
            if (bc) doc.bookCode = bc;

            const book = await BookMongo.create(doc);
            await createBookCopiesForBook(book._id, book.bookCode || String(book._id).slice(-8), stockNum);
            await syncBookInventoryFields(book._id);
        }

        console.log(`[Book] Đã migrate ${oldDocs.length} đầu sách từ collection products -> library_books (+ bản sao).`);
    } catch (e) {
        console.warn('[Book] Migrate legacy products:', e.message);
    }
    legacyMigrationDone = true;
}

async function ensureLegacyBooks() {
    await migrateLegacyProductsToBooksOnce();
}

class controllerBook {
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
        await ensureLegacyBooks();

        const {
            nameProduct,
            title: titleIn,
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
            category_1,
            bookCode: bookCodeInput,
            coverPrice,
            price,
        } = req.body;

        const title = String(titleIn || nameProduct || '').trim();
        const resolvedCategory1 = String(category_1 || category || '').trim();

        if (
            !title ||
            !image ||
            description === undefined ||
            !stock ||
            !covertType ||
            !publishYear ||
            !pages ||
            !language ||
            !publisher ||
            !publishingCompany ||
            !resolvedCategory1
        ) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const stockNum = Number(stock);
        if (!Number.isFinite(stockNum) || stockNum < 0) {
            throw new BadRequestError('Số lượng không hợp lệ');
        }

        let bookCode = '';
        const trimmed = String(bookCodeInput || '').trim();
        if (trimmed) {
            const normalized = normalizeBookCode(trimmed);
            if (!normalized) throw new BadRequestError('Mã sách không hợp lệ');
            const existed = await BookMongo.findOne({ bookCode: normalized }).select('_id').lean();
            if (existed) throw new BadRequestError('Mã sách đã tồn tại');
            bookCode = normalized;
        } else {
            bookCode = await generateUniqueBookCode();
        }

        const cp = coverPrice !== undefined ? Number(coverPrice) : price !== undefined ? Number(price) : null;

        const book = await BookMongo.create({
            mysqlId: random36(),
            bookCode,
            title,
            image,
            category: resolvedCategory1,
            category_1: resolvedCategory1,
            description,
            stock: 0,
            totalCopies: 0,
            coverPrice: Number.isFinite(cp) ? cp : null,
            covertType,
            publishYear: Number(publishYear),
            pages: Number(pages),
            language,
            publisher,
            publishingCompany,
        });

        await createBookCopiesForBook(book._id, book.bookCode || String(book._id).slice(-8), stockNum);
        await syncBookInventoryFields(book._id);

        const fresh = await BookMongo.findById(book._id);
        const avail = await countAvailableForBook(book._id);

        new Created({
            message: 'Create product success',
            metadata: toClientBook(fresh, { stockOverride: avail }),
        }).send(res);
    }

    async syncOldBooksCode(req, res) {
        await ensureLegacyBooks();

        const booksWithoutCode = await BookMongo.find({
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
        await ensureLegacyBooks();

        const products = await BookMongo.find({}).lean();
        const metadata = await attachAvailableCounts(products);

        new OK({
            message: 'Get all product success',
            metadata,
        }).send(res);
    }

    async getOneProduct(req, res) {
        await ensureLegacyBooks();

        const { id } = req.query;
        const product = await findBookByAnyId(id);
        if (!product) {
            new OK({
                message: 'Get one product success',
                metadata: null,
            }).send(res);
            return;
        }
        const avail = await countAvailableForBook(product._id);
        new OK({
            message: 'Get one product success',
            metadata: toClientBook(product, { stockOverride: avail }),
        }).send(res);
    }

    async searchProduct(req, res) {
        await ensureLegacyBooks();

        const keyword = String(req.query.keyword || '').trim();
        const products = await BookMongo.find({
            title: { $regex: keyword, $options: 'i' },
        }).lean();

        const metadata = await attachAvailableCounts(products);

        new OK({
            message: 'Search product success',
            metadata,
        }).send(res);
    }

    async updateProduct(req, res) {
        await ensureLegacyBooks();

        const { id } = req.query;
        const product = await findBookByAnyId(id);
        if (!product) {
            throw new BadRequestError('Sách không tồn tại');
        }

        const allowed = [
            'bookCode',
            'category',
            'category_1',
            'image',
            'description',
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

        if (req.body.title !== undefined) {
            product.title = String(req.body.title || '').trim();
        }
        if (req.body.nameProduct !== undefined) {
            product.title = String(req.body.nameProduct || '').trim();
        }

        if (req.body.coverPrice !== undefined) {
            const n = Number(req.body.coverPrice);
            product.coverPrice = Number.isFinite(n) ? n : null;
        } else if (req.body.price !== undefined) {
            const n = Number(req.body.price);
            product.coverPrice = Number.isFinite(n) ? n : null;
        }

        if (req.body.bookCode !== undefined) {
            const trimmed = String(req.body.bookCode || '').trim();
            if (trimmed) {
                const normalized = normalizeBookCode(trimmed);
                if (!normalized) throw new BadRequestError('Mã sách không hợp lệ');
                const existed = await BookMongo.findOne({ bookCode: normalized }).select('_id').lean();
                if (existed && String(existed._id) !== String(product._id)) {
                    throw new BadRequestError('Mã sách đã tồn tại');
                }
                product.bookCode = normalized;
            } else {
                product.bookCode = '';
            }
        }

        if (req.body.category_1 !== undefined || req.body.category !== undefined) {
            const next = String(req.body.category_1 || req.body.category || '').trim();
            if (next) {
                product.category = next;
                product.category_1 = next;
            }
        }

        if (req.body.publishYear !== undefined) product.publishYear = Number(req.body.publishYear);
        if (req.body.pages !== undefined) product.pages = Number(req.body.pages);

        if (req.body.stock !== undefined) {
            const target = Number(req.body.stock);
            if (!Number.isFinite(target) || target < 0) {
                throw new BadRequestError('Số lượng không hợp lệ');
            }
            const currentAvail = await countAvailableForBook(product._id);
            const delta = target - currentAvail;
            if (delta > 0) {
                await createBookCopiesForBook(
                    product._id,
                    product.bookCode || String(product._id).slice(-8),
                    delta,
                );
            } else if (delta < 0) {
                await deleteAvailableCopies(product._id, -delta);
            }
        }

        await product.save();
        await syncBookInventoryFields(product._id);

        new OK({
            message: 'Update product success',
            metadata: [1],
        }).send(res);
    }

    async deleteProduct(req, res) {
        await ensureLegacyBooks();

        const { id } = req.body;
        const product = await findBookByAnyId(id);
        if (!product) {
            throw new BadRequestError('Sách không tồn tại');
        }

        const productIdCandidates = [String(product._id)];
        if (product.mysqlId) productIdCandidates.push(String(product.mysqlId));

        const copyIdList = await BookCopyMongo.find({ bookId: product._id }).distinct('_id');
        const activeLoan = await LoanTicketMongo.findOne({
            bookCopyIds: { $in: copyIdList },
            status: { $in: ['PENDING_APPROVAL', 'BORROWING', 'OVERDUE'] },
        })
            .select('_id')
            .lean();
        if (activeLoan) {
            throw new BadRequestError('Không thể xóa vì sách đang được mượn hoặc chưa hoàn tất phiếu');
        }

        const onLoanCopies = await BookCopyMongo.countDocuments({
            bookId: product._id,
            status: { $in: ['BORROWED', 'RESERVED'] },
        });
        if (onLoanCopies > 0) {
            throw new BadRequestError('Không thể xóa vì còn bản sao đang ở trạng thái mượn');
        }

        await BookCopyMongo.deleteMany({ bookId: product._id });
        await BookMongo.deleteOne({ _id: product._id });
        new OK({
            message: 'Delete product success',
            metadata: 1,
        }).send(res);
    }
}

module.exports = new controllerBook();
