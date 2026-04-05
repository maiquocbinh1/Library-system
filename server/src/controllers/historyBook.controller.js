const modelHistoryBook = require('../models/historyBook.model');
const modelUser = require('../models/users.model');
const modelProduct = require('../models/product.model');
const { syncHistoryBookFromPlain, syncProductFromPlain } = require('../services/mongoDualWrite');

const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const SendMailBookBorrowConfirmation = require('../utils/SendMailSuccess');
const { where } = require('sequelize');
const SendMailBookBorrowFailed = require('../utils/SendMailFail');

class historyBookController {
    async createHistoryBook(req, res) {
        const { id } = req.user;
        const findUser = await modelUser.findOne({ where: { id } });
        if (!findUser) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        if (
            findUser.dataValues.idStudent === null ||
            findUser.dataValues.idStudent === '0' ||
            findUser.dataValues.idStudent === ''
        ) {
            throw new BadRequestError('Bạn chưa có ID sinh viên !!!');
        }

        const { fullName, phoneNumber, address, bookId, borrowDate, returnDate, quantity } = req.body;
        if (!fullName || !phoneNumber || !address || !bookId || !borrowDate || !returnDate || !quantity) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }
        const historyBook = await modelHistoryBook.create({
            fullName,
            phone: phoneNumber,
            address,
            bookId,
            borrowDate,
            returnDate,
            quantity,
            userId: id,
        });
        await syncHistoryBookFromPlain(historyBook.get({ plain: true }));
        const findProduct = await modelProduct.findOne({ where: { id: bookId } });
        if (!findProduct) {
            throw new BadRequestError('Sách không tồn tại');
        }
        await modelProduct.update({ stock: findProduct.stock - quantity }, { where: { id: bookId } });
        const productAfter = await modelProduct.findOne({ where: { id: bookId } });
        if (productAfter) {
            await syncProductFromPlain(productAfter.get({ plain: true }));
        }

        new Created({
            message: 'Create history book success',
            metadata: historyBook,
        }).send(res);
    }

    async getHistoryUser(req, res) {
        const { id } = req.user;
        const historyBook = await modelHistoryBook.findAll({ where: { userId: id } });
        const data = await Promise.all(
            historyBook.map(async (item) => {
                const product = await modelProduct.findOne({ where: { id: item.bookId } });
                return {
                    ...item.dataValues,
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
        const findHistory = await modelHistoryBook.findOne({ where: { id: idHistory, userId: id } });
        if (!findHistory) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }
        const findProduct = await modelProduct.findOne({ where: { id: findHistory.bookId } });
        if (!findProduct) {
            throw new BadRequestError('Sách không tồn tại');
        }
        await modelHistoryBook.update({ status: 'cancel' }, { where: { id: idHistory } });
        await modelProduct.update(
            { stock: findProduct.stock + findHistory.quantity },
            { where: { id: findHistory.bookId } },
        );
        const histRow = await modelHistoryBook.findOne({ where: { id: idHistory } });
        if (histRow) {
            await syncHistoryBookFromPlain(histRow.get({ plain: true }));
        }
        const productAfter = await modelProduct.findOne({ where: { id: findHistory.bookId } });
        if (productAfter) {
            await syncProductFromPlain(productAfter.get({ plain: true }));
        }
        new OK({
            message: 'Cancel book success',
        }).send(res);
    }

    async getAllHistoryBook(req, res) {
        const historyBook = await modelHistoryBook.findAll({
            order: [['createdAt', 'DESC']],
        });
        const data = await Promise.all(
            historyBook.map(async (item) => {
                const product = await modelProduct.findOne({ where: { id: item.bookId } });
                return {
                    ...item.dataValues,
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
        const findHistory = await modelHistoryBook.findOne({ where: { id: idHistory } });
        const findProduct = await modelProduct.findOne({ where: { id: productId } });
        const findUser = await modelUser.findOne({ where: { id: userId } });
        if (!findHistory) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }
        await modelHistoryBook.update({ status }, { where: { id: idHistory } });
        if (status === 'success') {
            await SendMailBookBorrowConfirmation(
                findUser.email,
                findProduct,
                findHistory.borrowDate,
                findHistory.returnDate,
            );
        }
        if (status === 'cancel') {
            await SendMailBookBorrowFailed(findUser.email, findProduct);
        }
        const histRow = await modelHistoryBook.findOne({ where: { id: idHistory } });
        if (histRow) {
            await syncHistoryBookFromPlain(histRow.get({ plain: true }));
        }
        new OK({
            message: 'Update status book success',
        }).send(res);
    }
}

module.exports = new historyBookController();
