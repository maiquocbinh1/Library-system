const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const { AuthFailureError } = require('../core/error.response');
const { jwtDecode } = require('jwt-decode');

require('dotenv').config();

function random36() {
    return crypto.randomUUID();
}

const createApiKey = async (userId) => {
    const userIdStr = String(userId);
    await ApiKeyMongo.deleteMany({ userId: userIdStr });

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

    const privateKeyString = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyString = publicKey.export({ type: 'spki', format: 'pem' });

    return ApiKeyMongo.create({
        mysqlId: random36(),
        userId: userIdStr,
        publicKey: publicKeyString,
        privateKey: privateKeyString,
    });
};

const createToken = async (payload) => {
    const findApiKey = await ApiKeyMongo.findOne({ userId: String(payload.id) });

    if (!findApiKey?.privateKey) {
        throw new Error('Private key not found for user');
    }

    return jwt.sign(payload, findApiKey.privateKey, {
        algorithm: 'RS256',
        expiresIn: '15m',
    });
};

const createRefreshToken = async (payload) => {
    const findApiKey = await ApiKeyMongo.findOne({ userId: String(payload.id) });

    if (!findApiKey?.privateKey) {
        throw new Error('Private key not found for user');
    }

    return jwt.sign(payload, findApiKey.privateKey, {
        algorithm: 'RS256',
        expiresIn: '7d',
    });
};

const verifyToken = async (token) => {
    try {
        const { id } = jwtDecode(token);
        const findApiKey = await ApiKeyMongo.findOne({ userId: String(id) });

        if (!findApiKey) {
            throw new AuthFailureError('Vui lòng đăng nhập lại');
        }

        return jwt.verify(token, findApiKey.publicKey, {
            algorithms: ['RS256'],
        });
    } catch (error) {
        throw new AuthFailureError('Vui lòng đăng nhập lại');
    }
};

module.exports = {
    createApiKey,
    createToken,
    createRefreshToken,
    verifyToken,
};
