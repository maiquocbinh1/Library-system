const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const modelApiKey = require('../models/apiKey.model');
const { AuthFailureError } = require('../core/error.response');
const { jwtDecode } = require('jwt-decode');
const { syncApiKeyFromPlain } = require('./mongoDualWrite');

require('dotenv').config();

const createApiKey = async (userId) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

    const privateKeyString = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyString = publicKey.export({ type: 'spki', format: 'pem' });

    const newApiKey = new modelApiKey({ userId, publicKey: publicKeyString, privateKey: privateKeyString });
    const saved = await newApiKey.save();
    await syncApiKeyFromPlain(saved.get({ plain: true }));
    return saved;
};

const createToken = async (payload) => {
    const findApiKey = await modelApiKey.findOne({ where: { userId: payload.id } });

    if (!findApiKey?.privateKey) {
        throw new Error('Private key not found for user');
    }

    return jwt.sign(payload, findApiKey.privateKey, {
        algorithm: 'RS256',
        expiresIn: '15m',
    });
};

const createRefreshToken = async (payload) => {
    const findApiKey = await modelApiKey.findOne({ where: { userId: payload.id } });

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
        const findApiKey = await modelApiKey.findOne({ where: { userId: id } });

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
