const crypto = require('crypto');
const mongoose = require('mongoose');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const { countAvailableForBook, countTotalCopiesForBook, syncBookInventoryFields } = require('../utils/bookInventory');
const { createBookCopiesForBook, deleteAvailableCopies, createBookCopiesFromBarcodes } = require('../services/bookCopy.service');
const { logAdminAction, AuditActions } = require('../utils/logAdminAction');

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

/** Khớp đầu sách theo thể loại lưu (giống UI/DSS: ưu `category_1`, không có thì `category`). */
function categoryStoredMatchFilter(exactName) {
    const s = String(exactName || '').trim();
    if (!s) return null;
    return {
        $or: [
            { category_1: s },
            {
                $and: [
                    {
                        $or: [{ category_1: { $exists: false } }, { category_1: null }, { category_1: '' }],
                    },
                    { category: s },
                ],
            },
        ],
    };
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

async function findBookCopyByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const c = await BookCopyMongo.findById(id);
        if (c) return c;
    }
    return BookCopyMongo.findOne({ mysqlId: String(id) });
}

function escapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chuyển lỗi lưu Mongo/Mongoose thành BadRequestError để client nhận 400 + message rõ. */
function mapMongoPersistError(err) {
    if (!err) return err;
    if (err.name === 'ValidationError') {
        const msgs = Object.values(err.errors || {})
            .map((e) => e.message)
            .filter(Boolean);
        return new BadRequestError(msgs.length ? msgs.join('; ') : 'Dữ liệu không hợp lệ');
    }
    if (err.name === 'CastError') {
        return new BadRequestError('Giá trị gửi lên không đúng định dạng');
    }
    if (err.code === 11000) {
        return new BadRequestError('Trùng dữ liệu (ví dụ mã sách). Vui lòng nhập giá trị khác.');
    }
    return err;
}

function toClientBookCopyRow(copyLean, bookLean) {
    const b = bookLean;
    const title = b?.title || b?.nameProduct || '';
    return {
        id: copyLean.mysqlId || String(copyLean._id),
        _id: String(copyLean._id),
        barcode: copyLean.barcode,
        status: copyLean.status,
        condition: copyLean.condition,
        bookId: String(copyLean.bookId),
        bookCode: b?.bookCode || '',
        title,
        nameProduct: title,
        createdAt: copyLean.createdAt,
        updatedAt: copyLean.updatedAt,
    };
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

        // Chấp nhận barcodes (mảng) hoặc stock (số). Stock >= 0 là hợp lệ.
        const barcodesRaw = req.body.barcodes;
        const hasBarcodes = Array.isArray(barcodesRaw) && barcodesRaw.length > 0;
        const stockNum = Number(stock);
        if (!hasBarcodes && (stock === undefined || stock === null || !Number.isFinite(stockNum) || stockNum < 0)) {
            throw new BadRequestError('Vui lòng nhập số lượng bản sao (≥ 0) hoặc danh sách mã sách');
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

        if (hasBarcodes) {
            await createBookCopiesFromBarcodes(book._id, barcodesRaw);
        } else if (stockNum > 0) {
            await createBookCopiesForBook(book._id, book.bookCode || String(book._id).slice(-8), stockNum);
        }
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

    /** Danh sách bản sao (barcode) — kho. Query: bookId, status, keyword, limit */
    async listAllBookCopies(req, res) {
        await ensureLegacyBooks();

        const { bookId: qBookId, status: qStatus, keyword } = req.query;
        const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 3000));

        const filter = {};
        if (qBookId && mongoose.isValidObjectId(String(qBookId))) {
            filter.bookId = qBookId;
        }
        if (qStatus && String(qStatus).trim()) {
            filter.status = String(qStatus).trim().toUpperCase();
        }

        const kw = String(keyword || '').trim();
        if (kw) {
            const rx = new RegExp(escapeRegex(kw), 'i');
            const bookHits = await BookMongo.find({
                $or: [{ title: rx }, { nameProduct: rx }, { bookCode: rx }],
            })
                .distinct('_id');
            filter.$or = [{ barcode: rx }, { bookId: { $in: bookHits } }];
        }

        const copies = await BookCopyMongo.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

        const bookIds = [...new Set(copies.map((c) => c.bookId).filter(Boolean))];
        const books = await BookMongo.find({ _id: { $in: bookIds } })
            .select('title nameProduct bookCode')
            .lean();
        const bookMap = new Map(books.map((b) => [String(b._id), b]));

        const metadata = copies.map((c) => toClientBookCopyRow(c, bookMap.get(String(c.bookId))));

        new OK({
            message: 'Lấy danh sách bản sao thành công',
            metadata,
        }).send(res);
    }

    /** Chi tiết một bản sao — GET /api/product/book-copy?id= */
    async getBookCopy(req, res) {
        await ensureLegacyBooks();
        const id = String(req.query.id || '').trim();
        if (!id) throw new BadRequestError('Thiếu id bản sao');

        const copy = await findBookCopyByAnyId(id);
        if (!copy) {
            new OK({ message: 'Không tìm thấy', metadata: null }).send(res);
            return;
        }
        const lean = copy.toObject ? copy.toObject() : copy;
        const book = await BookMongo.findById(lean.bookId).select('title nameProduct bookCode').lean();
        new OK({
            message: 'OK',
            metadata: toClientBookCopyRow(lean, book),
        }).send(res);
    }

    /** Tạo một bản sao — POST /api/product/book-copy  body: { bookId, barcode, condition? } */
    async createBookCopy(req, res) {
        await ensureLegacyBooks();
        const { bookId, barcode, condition } = req.body || {};
        if (!bookId) throw new BadRequestError('Thiếu bookId');
        if (!barcode || !String(barcode).trim()) throw new BadRequestError('Thiếu barcode');

        const book = await findBookByAnyId(bookId);
        if (!book) throw new BadRequestError('Sách không tồn tại');

        const { created, duplicates } = await createBookCopiesFromBarcodes(book._id, [barcode]);
        if (duplicates.length) throw new BadRequestError(`Barcode đã tồn tại: ${duplicates.join(', ')}`);
        if (!created.length) throw new BadRequestError('Không tạo được bản sao');

        const doc = await findBookCopyByAnyId(created[0]._id);
        const allowedCond = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];
        if (condition && allowedCond.includes(String(condition).toUpperCase())) {
            doc.condition = String(condition).toUpperCase();
            await doc.save();
        }

        await syncBookInventoryFields(book._id);
        const lean = doc.toObject ? doc.toObject() : doc;
        const b = await BookMongo.findById(lean.bookId).select('title nameProduct bookCode').lean();
        new Created({
            message: 'Đã thêm bản sao',
            metadata: toClientBookCopyRow(lean, b),
        }).send(res);
    }

    /** Cập nhật bản sao — PUT /api/product/book-copy  body: { id, barcode?, condition?, status? } */
    async updateBookCopy(req, res) {
        await ensureLegacyBooks();
        const { id, barcode, condition, status } = req.body || {};
        if (!id) throw new BadRequestError('Thiếu id bản sao');

        const copy = await findBookCopyByAnyId(id);
        if (!copy) throw new BadRequestError('Không tìm thấy bản sao');

        const allowedCond = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];
        const allowedStatusStaff = ['AVAILABLE', 'RESERVED', 'MAINTENANCE', 'LOST'];

        if (barcode !== undefined) {
            if (copy.status !== 'AVAILABLE') {
                throw new BadRequestError('Chỉ đổi barcode khi bản sao đang ở trạng thái sẵn sàng');
            }
            const b = String(barcode || '').trim().toUpperCase();
            if (!b) throw new BadRequestError('Barcode không hợp lệ');
            const clash = await BookCopyMongo.findOne({ barcode: b, _id: { $ne: copy._id } }).select('_id').lean();
            if (clash) throw new BadRequestError('Barcode đã được sử dụng');
            copy.barcode = b;
        }

        if (condition !== undefined) {
            const c = String(condition || '').trim().toUpperCase();
            if (!allowedCond.includes(c)) throw new BadRequestError('Tình trạng bản không hợp lệ');
            copy.condition = c;
        }

        if (status !== undefined) {
            const s = String(status || '').trim().toUpperCase();
            if (!allowedStatusStaff.includes(s)) {
                throw new BadRequestError('Không thể đặt trạng thái này từ API quản lý (mượn/trả do hệ thống lưu thông)');
            }
            if (copy.status === 'BORROWED') {
                throw new BadRequestError('Đang mượn — không đổi trạng thái tại đây; dùng trả sách');
            }
            copy.status = s;
        }

        await copy.save();
        await syncBookInventoryFields(copy.bookId);

        const lean = copy.toObject ? copy.toObject() : copy;
        const book = await BookMongo.findById(lean.bookId).select('title nameProduct bookCode').lean();
        new OK({
            message: 'Cập nhật bản sao thành công',
            metadata: toClientBookCopyRow(lean, book),
        }).send(res);
    }

    /** Xóa bản sao (chỉ khi AVAILABLE và không nằm trên phiếu đang hoạt động) — DELETE /api/product/book-copy?id= */
    async deleteBookCopy(req, res) {
        await ensureLegacyBooks();
        const id = String(req.query.id || req.body?.id || '').trim();
        if (!id) throw new BadRequestError('Thiếu id bản sao');

        const copy = await findBookCopyByAnyId(id);
        if (!copy) throw new BadRequestError('Không tìm thấy bản sao');
        if (copy.status !== 'AVAILABLE') {
            throw new BadRequestError('Chỉ xóa bản sao đang sẵn sàng (AVAILABLE)');
        }

        const activeLoan = await LoanTicketMongo.findOne({
            bookCopyIds: copy._id,
            status: { $in: ['PENDING_APPROVAL', 'READY_FOR_PICKUP', 'BORROWING', 'OVERDUE'] },
        })
            .select('_id')
            .lean();
        if (activeLoan) throw new BadRequestError('Bản sao đang trên phiếu mượn — không xóa được');

        const bookId = copy.bookId;
        const copySnap = {
            id: String(copy._id),
            barcode: copy.barcode,
            status: copy.status,
            bookId: copy.bookId ? String(copy.bookId) : null,
            condition: copy.condition,
        };
        await BookCopyMongo.deleteOne({ _id: copy._id });
        await syncBookInventoryFields(bookId);

        await logAdminAction({
            req,
            action: AuditActions.BOOK_COPY_DELETED,
            targetId: String(copy._id),
            targetType: 'BOOK_COPY',
            oldValues: copySnap,
            newValues: null,
        });

        new OK({ message: 'Đã xóa bản sao', metadata: { id: String(copy._id) } }).send(res);
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

        // bookCode / publishYear / pages xử lý riêng (tránh gán bookCode = '' từ vòng lặp → trùng unique).
        const allowed = [
            'category',
            'category_1',
            'image',
            'description',
            'covertType',
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

        let pendingPrefixRename = null;
        if (req.body.bookCode !== undefined) {
            const trimmed = String(req.body.bookCode ?? '').trim();
            if (trimmed) {
                const normalized = normalizeBookCode(trimmed);
                if (!normalized) throw new BadRequestError('Mã sách không hợp lệ');
                const existed = await BookMongo.findOne({ bookCode: normalized }).select('_id').lean();
                if (existed && String(existed._id) !== String(product._id)) {
                    throw new BadRequestError('Mã sách đã tồn tại');
                }
                const oldCode = String(product.bookCode || '').trim();
                if (oldCode && oldCode !== normalized) {
                    pendingPrefixRename = { from: oldCode, to: normalized };
                }
                product.bookCode = normalized;
            }
            // Không gán bookCode = '' (nhiều tài liệu '' sẽ vi phạm unique index).
        }

        if (req.body.category_1 !== undefined || req.body.category !== undefined) {
            const next = String(req.body.category_1 || req.body.category || '').trim();
            if (next) {
                product.category = next;
                product.category_1 = next;
            }
        }

        if (req.body.publishYear !== undefined) {
            const y = Number(req.body.publishYear);
            if (!Number.isFinite(y)) throw new BadRequestError('Năm xuất bản không hợp lệ');
            product.publishYear = y;
        }
        if (req.body.pages !== undefined) {
            const p = Number(req.body.pages);
            if (!Number.isFinite(p)) throw new BadRequestError('Số trang không hợp lệ');
            product.pages = p;
        }

        if (req.body.stock !== undefined) {
            // Payload `stock` từ FE hiện tại được hiểu là TỔNG SỐ BẢN SAO (totalCopies).
            // Hệ thống sẽ tạo thêm / xóa bản AVAILABLE để khớp tổng đó.
            // Không thể giảm xuống dưới số bản sao đang bị "khóa" (BORROWED/RESERVED/MAINTENANCE/LOST).
            const target = Number(req.body.stock);
            if (!Number.isFinite(target) || target < 0) {
                throw new BadRequestError('Số lượng không hợp lệ');
            }
            const currentTotal = await countTotalCopiesForBook(product._id);
            const delta = target - currentTotal;
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

        try {
            await product.save();
        } catch (e) {
            throw mapMongoPersistError(e);
        }

        if (pendingPrefixRename) {
            const { from, to } = pendingPrefixRename;
            const rx = new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
            const copies = await BookCopyMongo.find({ bookId: product._id, barcode: rx }).lean();
            for (const c of copies) {
                const m = rx.exec(String(c.barcode || ''));
                if (!m) continue;
                const newBarcode = `${to}-${m[1]}`;
                const clash = await BookCopyMongo.findOne({ barcode: newBarcode, _id: { $ne: c._id } }).select('_id').lean();
                if (clash) continue;
                await BookCopyMongo.updateOne({ _id: c._id }, { $set: { barcode: newBarcode } });
            }
        }

        try {
            await syncBookInventoryFields(product._id);
        } catch (e) {
            throw mapMongoPersistError(e);
        }

        new OK({
            message: 'Update product success',
            metadata: [1],
        }).send(res);
    }

    /**
     * Thêm bản sao vào đầu sách đã có bằng danh sách barcode thủ công.
     * POST /api/product/add-copies-by-barcode
     * Body: { bookId, barcodes: ["DNT-01", "DNT-02"] }
     */
    async addCopiesByBarcode(req, res) {
        await ensureLegacyBooks();
        const { bookId, barcodes } = req.body;
        if (!bookId) throw new BadRequestError('Thiếu bookId');
        if (!Array.isArray(barcodes) || !barcodes.length) throw new BadRequestError('Danh sách mã sách không được rỗng');

        const book = await findBookByAnyId(bookId);
        if (!book) throw new BadRequestError('Sách không tồn tại');

        const { created, duplicates } = await createBookCopiesFromBarcodes(book._id, barcodes);
        await syncBookInventoryFields(book._id);

        const avail = await countAvailableForBook(book._id);
        new OK({
            message: duplicates.length
                ? `Đã thêm ${created.length} bản sao. ${duplicates.length} mã đã trùng: ${duplicates.join(', ')}`
                : `Đã thêm ${created.length} bản sao thành công`,
            metadata: { created, duplicates, currentStock: avail },
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
            status: { $in: ['PENDING_APPROVAL', 'READY_FOR_PICKUP', 'BORROWING', 'OVERDUE'] },
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

    /**
     * Đổi tên thể loại trên mọi đầu sách đang gán (đồng bộ category + category_1).
     * POST /api/product/bulk-rename-category  body: { from, to }
     */
    async bulkRenameCategory(req, res) {
        await ensureLegacyBooks();
        const from = String(req.body?.from || '').trim();
        const to = String(req.body?.to || '').trim();
        if (!from) throw new BadRequestError('Thiếu tên thể loại hiện tại');
        if (!to) throw new BadRequestError('Thiếu tên thể loại mới');
        if (from === to) throw new BadRequestError('Tên mới trùng tên cũ');

        const filter = categoryStoredMatchFilter(from);
        if (!filter) throw new BadRequestError('Tên thể loại không hợp lệ');

        const r = await BookMongo.updateMany(filter, { $set: { category: to, category_1: to } });

        new OK({
            message:
                r.modifiedCount > 0
                    ? `Đã đổi thể loại «${from}» → «${to}» trên ${r.modifiedCount} đầu sách`
                    : 'Không có đầu sách nào đang gán thể loại này',
            metadata: { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount },
        }).send(res);
    }

    /**
     * Gỡ thể loại khỏi mọi đầu sách đang gán (category + category_1 = null). Biểu đồ DSS tính lại theo dữ liệu mới.
     * POST /api/product/bulk-clear-category  body: { name }
     */
    async bulkClearCategory(req, res) {
        await ensureLegacyBooks();
        const name = String(req.body?.name || req.body?.category || '').trim();
        if (!name) throw new BadRequestError('Thiếu tên thể loại cần gỡ');

        const filter = categoryStoredMatchFilter(name);
        if (!filter) throw new BadRequestError('Tên thể loại không hợp lệ');

        const r = await BookMongo.updateMany(filter, { $set: { category: null, category_1: null } });

        new OK({
            message:
                r.modifiedCount > 0
                    ? `Đã gỡ thể loại «${name}» trên ${r.modifiedCount} đầu sách`
                    : 'Không có đầu sách nào đang gán thể loại này',
            metadata: { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount },
        }).send(res);
    }
}

module.exports = new controllerBook();
