const { AuthFailureError } = require('../core/error.response');
const { verifyToken, createToken } = require('../services/tokenServices');
const UserMongo = require('../models/user.mongo.model');
const mongoose = require('mongoose');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_SAME_SITE = IS_PRODUCTION ? 'Strict' : 'Lax';
const TOKEN_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
    maxAge: 15 * 60 * 1000,
};

const asyncHandler = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

const decodeUserFromCookies = async (req, res) => {
    const accessToken = req.cookies.token;
    if (accessToken) {
        try {
            return await verifyToken(accessToken);
        } catch {
            // Access token expired/invalid: fallback to refresh token below.
        }
    }

    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        throw new AuthFailureError('Vui lòng đăng nhập');
    }

    const decodedRefresh = await verifyToken(refreshToken);
    const renewedAccessToken = await createToken({ id: decodedRefresh.id, role: decodedRefresh.role });
    res.cookie('token', renewedAccessToken, TOKEN_COOKIE_OPTIONS);
    return decodedRefresh;
};

const findUserByAnyId = async (id) => {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await UserMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return UserMongo.findOne({ mysqlId: String(id) });
};

const authUser = async (req, res, next) => {
    try {
        const decoded = await decodeUserFromCookies(req, res);
        req.user = decoded;
        next();
    } catch (error) {
        next(error);
    }
};

const authAdmin = async (req, res, next) => {
    try {
        const decoded = await decodeUserFromCookies(req, res);
        const { id } = decoded;
        const findUser = await findUserByAnyId(id);
        if (!findUser || findUser.role !== 'admin') {
            throw new AuthFailureError('Bạn không có quyền truy cập');
        }
        req.user = decoded;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    asyncHandler,
    authUser,
    authAdmin,
};
