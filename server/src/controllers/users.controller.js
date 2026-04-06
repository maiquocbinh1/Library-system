const crypto = require('crypto');
const bcrypt = require('bcrypt');
const CryptoJS = require('crypto-js');
const { jwtDecode } = require('jwt-decode');
const jwt = require('jsonwebtoken');
const otpGenerator = require('otp-generator');
const mongoose = require('mongoose');

const { AuthFailureError, BadRequestError } = require('../core/error.response');
const { OK } = require('../core/success.response');
const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const OtpMongo = require('../models/otp.mongo.model');
const ReaderCodeMongo = require('../models/readerCode.mongo.model');
const ProductMongo = require('../models/product.mongo.model');
const HistoryBookMongo = require('../models/historyBook.mongo.model');
const sendMailForgotPassword = require('../utils/sendMailForgotPassword');

require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_SAME_SITE = IS_PRODUCTION ? 'Strict' : 'Lax';

const TOKEN_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
    maxAge: 15 * 60 * 1000,
};

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

const LOGGED_COOKIE_OPTIONS = {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

function clearLegacyAuthCookies(res) {
    const legacyOptions = { path: '/api/user', sameSite: COOKIE_SAME_SITE, secure: IS_PRODUCTION };
    res.clearCookie('token', legacyOptions);
    res.clearCookie('refreshToken', legacyOptions);
    res.clearCookie('logged', legacyOptions);
}

function setAuthCookies(res, token, refreshToken) {
    clearLegacyAuthCookies(res);
    res.cookie('token', token, TOKEN_COOKIE_OPTIONS);
    res.cookie('logged', 1, LOGGED_COOKIE_OPTIONS);
    if (refreshToken) {
        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
    }
}

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

async function createApiKey(userId) {
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
}

async function signTokenForUser(userId, payload = {}, expiresIn = '15m') {
    const userIdStr = String(userId);
    const apiKey = await ApiKeyMongo.findOne({ userId: userIdStr });
    if (!apiKey?.privateKey) {
        throw new Error('Private key not found for user');
    }
    return jwt.sign({ id: userIdStr, ...payload }, apiKey.privateKey, {
        algorithm: 'RS256',
        expiresIn,
    });
}

async function verifyUserToken(token) {
    const { id } = jwtDecode(token);
    const apiKey = await ApiKeyMongo.findOne({ userId: String(id) });
    if (!apiKey?.publicKey) {
        throw new AuthFailureError('Vui lòng đăng nhập lại');
    }
    return jwt.verify(token, apiKey.publicKey, { algorithms: ['RS256'] });
}

function toSafeUser(user) {
    if (!user) return null;
    return {
        id: String(user._id),
        mysqlId: user.mysqlId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        typeLogin: user.typeLogin,
        phone: user.phone,
        address: user.address,
    };
}

class controllerUser {
    async registerUser(req, res) {
        const { fullName, phone, address, email, password } = req.body;
        if (!fullName || !phone || !email || !password) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const existed = await UserMongo.findOne({ email });
        if (existed) {
            throw new BadRequestError('Email đã tồn tại');
        }

        const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
        const dataUser = await UserMongo.create({
            mysqlId: random36(),
            fullName,
            phone,
            address,
            email,
            password: passwordHash,
            typeLogin: 'email',
            role: 'user',
        });

        const userId = String(dataUser._id);
        await createApiKey(userId);

        const token = await signTokenForUser(userId, {
            role: dataUser.role,
            address: dataUser.address,
            phone: dataUser.phone,
        });
        const refreshToken = await signTokenForUser(userId, { role: dataUser.role }, '7d');

        setAuthCookies(res, token, refreshToken);

        new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken, user: toSafeUser(dataUser) } }).send(res);
    }

    async loginUser(req, res) {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const user = await UserMongo.findOne({ email });
        if (!user) {
            throw new AuthFailureError('Tài khoản hoặc mật khẩu không chính xác');
        }

        const isPasswordValid = bcrypt.compareSync(password, user.password || '');
        if (!isPasswordValid) {
            throw new AuthFailureError('Tài khoản hoặc mật khẩu không chính xác');
        }

        const userId = String(user._id);
        await createApiKey(userId);

        const token = await signTokenForUser(userId, { role: user.role });
        const refreshToken = await signTokenForUser(userId, { role: user.role }, '7d');

        setAuthCookies(res, token, refreshToken);

        new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken, user: toSafeUser(user) } }).send(res);
    }

    async authUser(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new AuthFailureError('Tài khoản không tồn tại');
        }

        const auth = CryptoJS.AES.encrypt(JSON.stringify(user.toObject()), process.env.SECRET_CRYPTO).toString();
        new OK({ message: 'success', metadata: auth }).send(res);
    }

    async refreshToken(req, res) {
        const refreshToken = req.cookies.refreshToken;
        const decoded = await verifyUserToken(refreshToken);
        const user = await findUserByAnyId(decoded.id);
        if (!user) {
            throw new AuthFailureError('Vui lòng đăng nhập lại');
        }

        const token = await signTokenForUser(String(user._id), { role: user.role });
        setAuthCookies(res, token);

        new OK({ message: 'Refresh token thành công', metadata: { token } }).send(res);
    }

    async logout(req, res) {
        const { id } = req.user;
        await ApiKeyMongo.deleteMany({ userId: String(id) });
        clearLegacyAuthCookies(res);
        res.clearCookie('token', { path: '/', sameSite: COOKIE_SAME_SITE, secure: IS_PRODUCTION });
        res.clearCookie('refreshToken', { path: '/', sameSite: COOKIE_SAME_SITE, secure: IS_PRODUCTION });
        res.clearCookie('logged', { path: '/', sameSite: COOKIE_SAME_SITE, secure: IS_PRODUCTION });
        new OK({ message: 'Đăng xuất thành công' }).send(res);
    }

    async updateInfoUser(req, res) {
        const { id } = req.user;
        const { fullName, address, phone } = req.body;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Không tìm thấy tài khoản');
        }

        let image = user.avatar;
        if (req.file) {
            image = `uploads/avatars/${req.file.filename}`;
        }

        user.fullName = fullName ?? user.fullName;
        user.address = address ?? user.address;
        user.phone = phone ?? user.phone;
        user.avatar = image;
        await user.save();

        new OK({ message: 'Cập nhật thông tin tài khoản thành cong' }).send(res);
    }

    async loginGoogle(req, res) {
        const { credential } = req.body;
        const dataToken = jwtDecode(credential);

        let user = await UserMongo.findOne({ email: dataToken.email });
        if (!user) {
            user = await UserMongo.create({
                mysqlId: random36(),
                fullName: dataToken.name,
                email: dataToken.email,
                typeLogin: 'google',
                role: 'user',
            });
        }

        const userId = String(user._id);
        await createApiKey(userId);
        const token = await signTokenForUser(userId, { role: user.role });
        const refreshToken = await signTokenForUser(userId, { role: user.role }, '7d');

        setAuthCookies(res, token, refreshToken);

        new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken, user: toSafeUser(user) } }).send(res);
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                throw new BadRequestError('Vui lòng nhập email');
            }

            const user = await UserMongo.findOne({ email });
            if (!user) {
                throw new AuthFailureError('Email không tồn tại');
            }

            const token = jwt.sign({ id: String(user._id), email: user.email }, process.env.JWT_SECRET, {
                expiresIn: '15m',
            });

            const otp = otpGenerator.generate(6, {
                digits: true,
                lowerCaseAlphabets: false,
                upperCaseAlphabets: false,
                specialChars: false,
            });

            const hash = await bcrypt.hash(otp, 10);
            await OtpMongo.create({
                mysqlId: random36(),
                email: user.email,
                otp: hash,
            });

            await sendMailForgotPassword(email, otp);

            return res
                .setHeader('Set-Cookie', [`tokenResetPassword=${token};  Secure; Max-Age=300; Path=/; SameSite=Strict`])
                .status(200)
                .json({ message: 'Gửi thành công !!!' });
        } catch (error) {
            console.error('Error forgot password:', error);
            return res.status(500).json({ message: 'Có lỗi xảy ra' });
        }
    }

    async resetPassword(req, res) {
        try {
            const token = req.cookies.tokenResetPassword;
            const { otp, newPassword } = req.body;
            if (!token) {
                throw new BadRequestError('Vui lòng gửi yêu cầu quên mật khẩu');
            }

            const decode = jwt.verify(token, process.env.JWT_SECRET);
            const latestOtp = await OtpMongo.findOne({ email: decode.email }).sort({ createdAt: -1 });
            if (!latestOtp) {
                throw new AuthFailureError('Sai mã OTP hoặc đã hết hạn, vui lòng lấy OTP mới');
            }

            const isMatch = await bcrypt.compare(otp, latestOtp.otp);
            if (!isMatch) {
                throw new AuthFailureError('Sai mã OTP hoặc đã hết hạn, vui lòng lấy OTP mới');
            }

            const user = await UserMongo.findOne({ email: decode.email });
            if (!user) {
                throw new AuthFailureError('Người dùng không tồn tại');
            }

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            await OtpMongo.deleteMany({ email: decode.email });
            res.clearCookie('tokenResetPassword');
            return res.status(200).json({ message: 'Đặt lại mật khẩu thành công' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Có lỗi xảy ra, vui lòng liên hệ ADMIN !!' });
        }
    }

    async getUsers(req, res) {
        const users = await UserMongo.find().sort({ createdAt: -1 });
        new OK({ message: 'Lấy danh sách người dùng thành công', metadata: users }).send(res);
    }

    async updateUser(req, res) {
        const { userId, fullName, phone, email, role, address } = req.body;
        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        user.fullName = fullName ?? user.fullName;
        user.phone = phone ?? user.phone;
        user.email = email ?? user.email;
        user.role = role ?? user.role;
        user.address = address ?? user.address;
        await user.save();

        new OK({ message: 'Cập nhật người dùng thành công' }).send(res);
    }

    async changeAvatar(req, res) {
        const { file } = req;
        const { id } = req.user;
        if (!file) {
            throw new BadRequestError('Vui lòng chọn file');
        }

        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        user.avatar = `uploads/avatars/${file.filename}`;
        await user.save();

        new OK({
            message: 'Upload thành công',
            metadata: `uploads/avatars/${file.filename}`,
        }).send(res);
    }

    async deleteUser(req, res) {
        const { userId } = req.body;
        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const userIdCandidates = [String(user._id)];
        if (user.mysqlId) userIdCandidates.push(String(user.mysqlId));
        const activeBorrow = await HistoryBookMongo.findOne({
            userId: { $in: userIdCandidates },
            status: { $in: ['pending', 'success'] },
        }).lean();
        if (activeBorrow) {
            throw new BadRequestError('Không thể xóa vì độc giả chưa trả hết sách');
        }

        const userObjectId = String(user._id);
        await UserMongo.deleteOne({ _id: user._id });
        await ApiKeyMongo.deleteMany({ userId: userObjectId });
        await ReaderCodeMongo.deleteMany({ userId: userObjectId });

        new OK({ message: 'Xóa người dùng thành công' }).send(res);
    }

    async updatePassword(req, res) {
        const { userId, password } = req.body;
        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        user.password = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
        await user.save();
        new OK({ message: 'Cập nhật mật khẩu thành công' }).send(res);
    }

    async requestIdStudent(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const userObjectId = String(user._id);
        const currentReaderCode = await ReaderCodeMongo.findOne({ userId: userObjectId });
        if (currentReaderCode?.status === 'approved' && currentReaderCode.readerCode) {
            throw new BadRequestError('Bạn đã có mã độc giả');
        }
        if (currentReaderCode?.status === 'pending' || user.idStudent === '0') {
            throw new BadRequestError('Vui lòng chờ xác nhận mã độc giả');
        }

        if (currentReaderCode) {
            currentReaderCode.status = 'pending';
            currentReaderCode.readerCode = null;
            currentReaderCode.requestedAt = new Date();
            currentReaderCode.approvedAt = null;
            await currentReaderCode.save();
        } else {
            await ReaderCodeMongo.create({
                mysqlId: random36(),
                userId: userObjectId,
                status: 'pending',
                readerCode: null,
                requestedAt: new Date(),
            });
        }

        user.idStudent = '0';
        await user.save();
        new OK({ message: 'Yêu cầu thành công' }).send(res);
    }

    async confirmIdStudent(req, res) {
        const { idStudent, userId } = req.body;
        if (!idStudent || !userId) {
            throw new BadRequestError('Vui lòng nhập mã độc giả');
        }

        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const userObjectId = String(user._id);
        const duplicatedReaderCode = await ReaderCodeMongo.findOne({
            readerCode: String(idStudent),
            userId: { $ne: userObjectId },
        });
        if (duplicatedReaderCode) {
            throw new BadRequestError('Mã độc giả đã tồn tại');
        }

        await ReaderCodeMongo.findOneAndUpdate(
            { userId: userObjectId },
            {
                $set: {
                    status: 'approved',
                    readerCode: String(idStudent),
                    approvedAt: new Date(),
                },
                $setOnInsert: {
                    mysqlId: random36(),
                    requestedAt: new Date(),
                },
            },
            { upsert: true, new: true },
        );

        user.idStudent = idStudent;
        await user.save();
        new OK({ message: 'Xác nhận thành công' }).send(res);
    }

    async getRequestLoan(req, res) {
        const findRequestLoan = await UserMongo.find({ idStudent: { $in: ['0', null] } });
        new OK({
            message: 'Lấy danh sách yêu cầu mượn sách thành công',
            metadata: findRequestLoan,
        }).send(res);
    }

    async getStatistics(req, res) {
        try {
            const totalUsers = await UserMongo.countDocuments();
            const totalBooks = await ProductMongo.countDocuments();
            const pendingRequests = await HistoryBookMongo.countDocuments({ status: 'pending' });

            const booksInStock = await ProductMongo.countDocuments({ stock: { $gt: 0 } });
            const booksOutOfStock = totalBooks - booksInStock;

            const bookStatusData = [
                { type: 'Còn sách', value: booksInStock },
                { type: 'Hết sách', value: booksOutOfStock },
            ];

            const approvedLoans = await HistoryBookMongo.countDocuments({ status: 'success' });
            const rejectedLoans = await HistoryBookMongo.countDocuments({ status: 'cancel' });

            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const overdueLoans = await HistoryBookMongo.countDocuments({
                status: 'success',
                returnDate: null,
                borrowDate: { $lt: fourteenDaysAgo },
            });

            const loanStatusData = [
                { status: 'Đã duyệt', count: approvedLoans },
                { status: 'Chờ duyệt', count: pendingRequests },
                { status: 'Từ chối', count: rejectedLoans },
                { status: 'Quá hạn', count: overdueLoans },
            ];

            res.status(200).json({
                totalUsers,
                totalBooks,
                pendingRequests,
                bookStatusData,
                loanStatusData,
            });
        } catch (error) {
            res.status(500).json({ message: 'Lỗi server: ' + error.message });
        }
    }
}

module.exports = new controllerUser();
