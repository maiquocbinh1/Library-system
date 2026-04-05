const mongoose = require('mongoose');
const { BadRequestError } = require('../core/error.response');
const { OK } = require('../core/success.response');
const UserMongo = require('../models/user.mongo.model');
const ProductMongo = require('../models/product.mongo.model');
const HistoryBookMongo = require('../models/historyBook.mongo.model');

function normalizeProduct(doc) {
    if (!doc) return null;
    const raw = doc.toObject ? doc.toObject() : doc;
    return {
        ...raw,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
    };
}

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await UserMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return UserMongo.findOne({ mysqlId: String(id) });
}

async function findProductByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await ProductMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return ProductMongo.findOne({ mysqlId: String(id) });
}

class BookshelfController {
    async toggleFavorite(req, res) {
        const { id: userId } = req.user;
        const { productId } = req.body;
        if (!productId) {
            throw new BadRequestError('Vui lòng chọn sách');
        }

        const [user, product] = await Promise.all([findUserByAnyId(userId), findProductByAnyId(productId)]);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        if (!product) throw new BadRequestError('Sách không tồn tại');

        const productObjectId = String(product._id);
        const favoriteIds = (user.favoriteBooks || []).map((item) => String(item));
        const isFavorite = favoriteIds.includes(productObjectId);

        if (isFavorite) {
            user.favoriteBooks = (user.favoriteBooks || []).filter((item) => String(item) !== productObjectId);
        } else {
            user.favoriteBooks = [...(user.favoriteBooks || []), product._id];
        }

        await user.save();

        new OK({
            message: isFavorite ? 'Đã xóa khỏi danh sách yêu thích' : 'Đã thêm vào danh sách yêu thích',
            metadata: {
                isFavorite: !isFavorite,
                productId: productObjectId,
            },
        }).send(res);
    }

    async toggleReadLater(req, res) {
        const { id: userId } = req.user;
        const { productId } = req.body;
        if (!productId) {
            throw new BadRequestError('Vui lòng chọn sách');
        }

        const [user, product] = await Promise.all([findUserByAnyId(userId), findProductByAnyId(productId)]);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        if (!product) throw new BadRequestError('Sách không tồn tại');

        const productObjectId = String(product._id);
        const readLaterIds = (user.readLaterBooks || []).map((item) => String(item));
        const isReadLater = readLaterIds.includes(productObjectId);

        if (isReadLater) {
            user.readLaterBooks = (user.readLaterBooks || []).filter((item) => String(item) !== productObjectId);
        } else {
            user.readLaterBooks = [...(user.readLaterBooks || []), product._id];
        }

        await user.save();

        new OK({
            message: isReadLater ? 'Đã xóa khỏi danh sách đọc sau' : 'Đã thêm vào danh sách đọc sau',
            metadata: {
                isReadLater: !isReadLater,
                productId: productObjectId,
            },
        }).send(res);
    }

    async getBookshelf(req, res) {
        const { id: userId } = req.user;
        const user = await findUserByAnyId(userId);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');

        const populatedUser = await UserMongo.findById(user._id)
            .populate('favoriteBooks')
            .populate('readLaterBooks')
            .lean();

        const historyBooks = await HistoryBookMongo.find({
            userId: String(user._id),
            status: 'success',
        }).lean();

        const readingBooksMap = new Map();
        for (const history of historyBooks) {
            const product = await findProductByAnyId(history.bookId);
            if (product) {
                readingBooksMap.set(String(product._id), normalizeProduct(product));
            }
        }

        const favoriteBooks = (populatedUser?.favoriteBooks || []).map((book) => normalizeProduct(book)).filter(Boolean);
        const readLaterBooks = (populatedUser?.readLaterBooks || []).map((book) => normalizeProduct(book)).filter(Boolean);
        const readingBooks = Array.from(readingBooksMap.values());

        new OK({
            message: 'Lấy tủ sách cá nhân thành công',
            metadata: {
                favoriteBooks,
                readLaterBooks,
                readingBooks,
            },
        }).send(res);
    }
}

module.exports = new BookshelfController();
