const crypto = require('crypto');
const mongoose = require('mongoose');
const HistoryBookMongo = require('../models/historyBook.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const ProductMongo = require('../models/product.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const SendMailBookBorrowConfirmation = require('../utils/SendMailSuccess');
const SendMailBookBorrowFailed = require('../utils/SendMailFail');

function random36() {
    return crypto.randomUUID();
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

async function findHistoryByAnyId(id) {
    if (!id) return null;

    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await HistoryBookMongo.findById(id);
        if (byMongoId) return byMongoId;
    }

    return HistoryBookMongo.findOne({ mysqlId: String(id) });
}

function toClientHistory(doc) {
    const raw = doc.toObject ? doc.toObject() : doc;
    return {
        ...raw,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
    };
}

class historyBookController {
    async createHistoryBook(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        if (user.idStudent === null || user.idStudent === '0' || user.idStudent === '') {
            throw new BadRequestError('Bạn chưa có ID sinh viên !!!');
        }

        const { fullName, phoneNumber, address, bookId, borrowDate, returnDate, quantity } = req.body;
        if (!fullName || !phoneNumber || !address || !bookId || !borrowDate || !returnDate || !quantity) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const product = await findProductByAnyId(bookId);
        if (!product) {
            throw new BadRequestError('Sách không tồn tại');
        }
        if (Number(product.stock) < Number(quantity)) {
            throw new BadRequestError('Số lượng sách không đủ');
        }

        const historyBook = await HistoryBookMongo.create({
            mysqlId: random36(),
            fullName,
            phone: phoneNumber,
            address,
            bookId: String(product._id),
            borrowDate,
            returnDate,
            quantity: Number(quantity),
            userId: String(user._id),
        });

        product.stock = Number(product.stock) - Number(quantity);
        await product.save();

        new Created({
            message: 'Create history book success',
            metadata: toClientHistory(historyBook),
        }).send(res);
    }

    async getHistoryUser(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));

        const historyBook = await HistoryBookMongo.find({ userId: { $in: userIds } }).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(
            historyBook.map(async (item) => {
                const product = await findProductByAnyId(item.bookId);
                return {
                    ...item,
                    id: item.mysqlId || (item._id ? String(item._id) : undefined),
                    product,
                };
            }),
        );

        new OK({
            message: 'Get history book success',
            metadata: data,
        }).send(res);
    }

    async cancelBook(req, res) {
        const { id } = req.user;
        const { idHistory } = req.body;

        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const findHistory = await findHistoryByAnyId(idHistory);
        if (!findHistory) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));
        if (!userIds.includes(String(findHistory.userId))) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        const findProduct = await findProductByAnyId(findHistory.bookId);
        if (!findProduct) {
            throw new BadRequestError('Sách không tồn tại');
        }

        findHistory.status = 'cancel';
        await findHistory.save();

        findProduct.stock = Number(findProduct.stock) + Number(findHistory.quantity);
        await findProduct.save();

        new OK({
            message: 'Cancel book success',
        }).send(res);
    }

    async getAllHistoryBook(req, res) {
        const historyBook = await HistoryBookMongo.find({}).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(
            historyBook.map(async (item) => {
                const product = await findProductByAnyId(item.bookId);
                return {
                    ...item,
                    id: item.mysqlId || (item._id ? String(item._id) : undefined),
                    product,
                };
            }),
        );
        new OK({
            message: 'Get all history book success',
            metadata: data,
        }).send(res);
    }

    async updateStatusBook(req, res) {
        const { idHistory, status, productId, userId } = req.body;
        const findHistory = await findHistoryByAnyId(idHistory);
        const findProduct = await findProductByAnyId(productId || (findHistory && findHistory.bookId));
        const findUser = await findUserByAnyId(userId || (findHistory && findHistory.userId));
        if (!findHistory) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        findHistory.status = status;
        await findHistory.save();

        if (status === 'success' && findUser && findProduct) {
            await SendMailBookBorrowConfirmation(
                findUser.email,
                findProduct,
                findHistory.borrowDate,
                findHistory.returnDate,
            );
        }
        if (status === 'cancel' && findUser && findProduct) {
            await SendMailBookBorrowFailed(findUser.email, findProduct);
        }

        new OK({
            message: 'Update status book success',
        }).send(res);
    }
}

module.exports = new historyBookController();
