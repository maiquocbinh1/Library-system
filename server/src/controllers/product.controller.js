const { AuthFailureError, BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const modelProduct = require('../models/product.model');
const ProductMongo = require('../models/product.mongo.model');
const { Op } = require('sequelize');
const { syncProductFromPlain, deleteProductMongo } = require('../services/mongoDualWrite');

function useMongoForProducts() {
    return process.env.USE_MONGODB === 'true' && !!process.env.MONGODB_URI;
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
            !publishingCompany
        ) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }
        const product = await modelProduct.create({
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
        });
        await syncProductFromPlain(product.get({ plain: true }));
        new Created({
            message: 'Create product success',
            metadata: product,
        }).send(res);
    }
    async getAllProduct(req, res) {
        if (useMongoForProducts()) {
            const products = await ProductMongo.find({}).lean();
            new OK({
                message: 'Get all product success (MongoDB Atlas)',
                metadata: products,
            }).send(res);
            return;
        }

        const products = await modelProduct.findAll();
        const raw = products.map((p) => p.get({ plain: true }));
        new OK({
            message: 'Get all product success',
            metadata: raw,
        }).send(res);
    }

    async getOneProduct(req, res) {
        const { id } = req.query;
        const product = await modelProduct.findOne({ where: { id } });
        new OK({
            message: 'Get one product success',
            metadata: product,
        }).send(res);
    }

    async searchProduct(req, res) {
        const { keyword } = req.query;
        const products = await modelProduct.findAll({ where: { nameProduct: { [Op.like]: `%${keyword}%` } } });
        new OK({
            message: 'Search product success',
            metadata: products,
        }).send(res);
    }

    async updateProduct(req, res) {
        const { id } = req.query;
        const updated = await modelProduct.update(req.body, { where: { id } });
        if (updated[0]) {
            const row = await modelProduct.findOne({ where: { id } });
            if (row) {
                await syncProductFromPlain(row.get({ plain: true }));
            }
        }
        new OK({
            message: 'Update product success',
            metadata: updated,
        }).send(res);
    }

    async deleteProduct(req, res) {
        const { id } = req.body;
        const product = await modelProduct.destroy({ where: { id } });
        if (product) {
            await deleteProductMongo(id);
        }
        new OK({
            message: 'Delete product success',
            metadata: product,
        }).send(res);
    }
}

module.exports = new controllerProduct();
