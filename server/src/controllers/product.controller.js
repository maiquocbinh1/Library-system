const crypto = require('crypto');
const mongoose = require('mongoose');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const ProductMongo = require('../models/product.mongo.model');

function random36() {
    return crypto.randomUUID();
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

        const product = await ProductMongo.create({
            mysqlId: random36(),
            nameProduct,
            image,
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

        await ProductMongo.deleteOne({ _id: product._id });
        new OK({
            message: 'Delete product success',
            metadata: 1,
        }).send(res);
    }
}

module.exports = new controllerProduct();
