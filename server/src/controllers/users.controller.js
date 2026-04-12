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
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const {
    READER_TYPES,
    normalizeCode,
    getPatronCodeString,
    assignPatronCodeToUser,
} = require('../utils/patronUser');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const sendMailForgotPassword = require('../utils/sendMailForgotPassword');
const dayjs = require('dayjs');

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

function buildReaderCardView(u) {
    if (!u) return null;
    const raw = u.toObject ? u.toObject() : u;
    const code = getPatronCodeString(raw);
    return {
        readerCode: code,
        birthDate: raw.birthDate ?? null,
        className: raw.className ?? null,
        gender: raw.gender ?? null,
        planMonths: raw.cardPlanMonths ?? null,
        issuedAt: raw.libraryCardIssuedAt ?? null,
        expiresAt: raw.libraryCardExpiresAt ?? null,
        roleType: raw.readerType === 'GiangVien_CanBo' ? 'lecturer' : 'student',
        systemType: raw.cardSystemType ?? null,
        status: raw.verificationStatus ?? 'none',
    };
}

function toSafeUser(user) {
    if (!user) return null;
    const raw = user.toObject ? user.toObject() : user;
    const patron = getPatronCodeString(raw);
    return {
        id: String(raw._id),
        mysqlId: raw.mysqlId,
        fullName: raw.fullName,
        email: raw.email,
        role: raw.role,
        typeLogin: raw.typeLogin,
        phone: raw.phone,
        address: raw.address,
        studentId: raw.studentId || null,
        staffId: raw.staffId || null,
        readerType: raw.readerType || null,
        verificationStatus: raw.verificationStatus || 'none',
        readerCode: patron,
        idStudent: patron,
    };
}

async function assertPatronIdsAvailable({ studentId, staffId, readerType, excludeUserId }) {
    const sid = normalizeCode(studentId);
    const stid = normalizeCode(staffId);
    if (!readerType || !READER_TYPES.includes(readerType)) {
        throw new BadRequestError('Loại bạn đọc không hợp lệ');
    }
    if (readerType === 'GiangVien_CanBo') {
        if (!stid || sid) {
            throw new BadRequestError('Giảng viên/cán bộ vui lòng nhập MSG (không dùng MSV)');
        }
    } else if (!sid || stid) {
        throw new BadRequestError('Sinh viên/học viên/NCS vui lòng nhập MSV (không dùng MSG)');
    }
    const dupQ = { $or: [] };
    if (sid) dupQ.$or.push({ studentId: sid });
    if (stid) dupQ.$or.push({ staffId: stid });
    if (excludeUserId) {
        dupQ._id = { $ne: excludeUserId };
    }
    const dup = await UserMongo.findOne(dupQ);
    if (dup) {
        throw new BadRequestError('MSV hoặc MSG đã tồn tại');
    }
}

class controllerUser {
    async adminCreateReader(req, res) {
        const { fullName, phone, address, email, readerType, studentId, staffId } = req.body;
        if (!fullName || !phone || !email) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const existed = await UserMongo.findOne({ email });
        if (existed) {
            throw new BadRequestError('Email đã tồn tại');
        }

        await assertPatronIdsAvailable({ studentId, staffId, readerType });

        const passwordPlain = random36() + random36();
        const passwordHash = bcrypt.hashSync(passwordPlain, bcrypt.genSaltSync(10));
        const payload = {
            mysqlId: random36(),
            fullName,
            phone,
            address: address || '',
            email,
            password: passwordHash,
            typeLogin: 'email',
            role: 'user',
            readerType,
            verificationStatus: 'verified',
        };
        if (readerType === 'GiangVien_CanBo') {
            payload.staffId = normalizeCode(staffId);
            payload.studentId = null;
        } else {
            payload.studentId = normalizeCode(studentId);
            payload.staffId = null;
        }

        const dataUser = await UserMongo.create(payload);

        const userId = String(dataUser._id);
        await createApiKey(userId);

        new OK({ message: 'Tạo độc giả thành công', metadata: { id: userId, user: toSafeUser(dataUser) } }).send(res);
    }
    async registerUser(req, res) {
        const { fullName, phone, address, email, password, readerType, studentId, staffId } = req.body;
        if (!fullName || !phone || !email || !password) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const existed = await UserMongo.findOne({ email });
        if (existed) {
            throw new BadRequestError('Email đã tồn tại');
        }

        await assertPatronIdsAvailable({ studentId, staffId, readerType });

        const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
        const payload = {
            mysqlId: random36(),
            fullName,
            phone,
            address,
            email,
            password: passwordHash,
            typeLogin: 'email',
            role: 'user',
            readerType,
            verificationStatus: 'verified',
        };
        if (readerType === 'GiangVien_CanBo') {
            payload.staffId = normalizeCode(staffId);
            payload.studentId = null;
        } else {
            payload.studentId = normalizeCode(studentId);
            payload.staffId = null;
        }

        const dataUser = await UserMongo.create(payload);

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

        // Never expose password hash (or other sensitive fields) to frontend
        const auth = CryptoJS.AES.encrypt(JSON.stringify(toSafeUser(user)), process.env.SECRET_CRYPTO).toString();
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
        const { fullName, address, phone, readerType, studentId, staffId } = req.body;
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

        const sid = normalizeCode(studentId);
        const stid = normalizeCode(staffId);
        const wantsPatron = (sid || stid) && readerType;
        if (wantsPatron) {
            if (user.studentId || user.staffId) {
                throw new BadRequestError('MSV/MSG đã được gán, không thể đổi qua form này');
            }
            await assertPatronIdsAvailable({ studentId, staffId, readerType, excludeUserId: user._id });
            assignPatronCodeToUser(user, sid || stid, readerType);
            user.verificationStatus = 'verified';
        }

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
        const users = await UserMongo.find({}, { password: 0 }).sort({ createdAt: -1 }).lean();

        const enriched = users.map((u) => {
            const userId = String(u?._id);
            const readerCode = getPatronCodeString(u);
            return {
                ...u,
                id: userId,
                readerCode,
                readerCard: buildReaderCardView(u),
            };
        });

        new OK({ message: 'Lấy danh sách người dùng thành công', metadata: enriched }).send(res);
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
        const activeBorrow = await LoanTicketMongo.findOne({
            userId: { $in: userIdCandidates },
            status: { $in: ['PENDING_APPROVAL', 'BORROWING', 'OVERDUE'] },
        }).lean();
        if (activeBorrow) {
            throw new BadRequestError('Không thể xóa vì độc giả chưa trả hết sách');
        }

        const userObjectId = String(user._id);
        await UserMongo.deleteOne({ _id: user._id });
        await ApiKeyMongo.deleteMany({ userId: userObjectId });

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

        if (user.verificationStatus === 'verified' && getPatronCodeString(user)) {
            throw new BadRequestError('Tài khoản đã có MSV/MSG');
        }
        if (user.verificationStatus === 'pending') {
            throw new BadRequestError('Vui lòng chờ thư viện xác nhận MSV/MSG');
        }

        user.verificationStatus = 'pending';
        user.studentId = null;
        user.staffId = null;
        user.idStudent = null;
        await user.save();
        new OK({ message: 'Yêu cầu thành công' }).send(res);
    }

    async confirmIdStudent(req, res) {
        const { userId, studentId, staffId, idStudent, readerType } = req.body;
        const sid = normalizeCode(studentId ?? idStudent);
        const stid = normalizeCode(staffId);
        if (!userId || (!sid && !stid)) {
            throw new BadRequestError('Vui lòng nhập MSV hoặc MSG');
        }

        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const rt = readerType || (stid && !sid ? 'GiangVien_CanBo' : 'SinhVien_ChinhQuy');
        await assertPatronIdsAvailable({ studentId: sid || undefined, staffId: stid || undefined, readerType: rt, excludeUserId: user._id });

        assignPatronCodeToUser(user, sid || stid, rt);
        user.verificationStatus = 'verified';
        await user.save();
        new OK({ message: 'Xác nhận thành công' }).send(res);
    }

    async issueReaderCard(req, res) {
        const {
            userId,
            planMonths,
            readerCode,
            studentId,
            staffId,
            readerType,
            birthDate,
            className,
            gender,
            roleType,
            systemType,
            issuedAt,
        } = req.body;
        const months = Number(planMonths);
        if (!userId || !Number.isFinite(months) || ![3, 6, 12].includes(months)) {
            throw new BadRequestError('Gói thẻ không hợp lệ');
        }

        const user = await findUserByAnyId(userId);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const code = normalizeCode(readerCode || studentId || staffId);
        if (!code) {
            throw new BadRequestError('Vui lòng nhập MSV hoặc MSG');
        }

        let rt = readerType;
        if (!rt || !READER_TYPES.includes(rt)) {
            rt = roleType === 'lecturer' ? 'GiangVien_CanBo' : 'SinhVien_ChinhQuy';
        }

        await assertPatronIdsAvailable({
            studentId: rt === 'GiangVien_CanBo' ? undefined : code,
            staffId: rt === 'GiangVien_CanBo' ? code : undefined,
            readerType: rt,
            excludeUserId: user._id,
        });

        const now = new Date();
        const baseIssuedAt = issuedAt ? dayjs(issuedAt) : dayjs(now);
        if (!baseIssuedAt.isValid()) {
            throw new BadRequestError('Ngày làm thẻ không hợp lệ');
        }
        const expiresAt = baseIssuedAt.add(months, 'month').toDate();
        const issuedAtDate = baseIssuedAt.toDate();
        const birthDateDate = birthDate ? dayjs(birthDate) : null;
        if (birthDate && !birthDateDate?.isValid?.()) {
            throw new BadRequestError('Ngày sinh không hợp lệ');
        }

        assignPatronCodeToUser(user, code, rt);
        user.verificationStatus = 'verified';
        user.cardPlanMonths = months;
        user.libraryCardIssuedAt = issuedAtDate;
        user.libraryCardExpiresAt = expiresAt;
        user.birthDate = birthDate ? birthDateDate.toDate() : null;
        user.className = className ? String(className).trim() : null;
        user.gender = gender ? String(gender) : null;
        user.cardSystemType = systemType ? String(systemType) : null;
        await user.save();

        const userObjectId = String(user._id);
        new OK({
            message: 'Cấp thẻ độc giả thành công',
            metadata: { userId: userObjectId, readerCode: code, planMonths: months, expiresAt },
        }).send(res);
    }

    async getRequestLoan(req, res) {
        const findRequestLoan = await UserMongo.find({ verificationStatus: 'pending' });
        new OK({
            message: 'Lấy danh sách yêu cầu mượn sách thành công',
            metadata: findRequestLoan,
        }).send(res);
    }

    async getStatistics(req, res) {
        try {
            const totalUsers = await UserMongo.countDocuments();
            const totalBooks = await BookMongo.countDocuments();
            const pendingRequests = await LoanTicketMongo.countDocuments({ status: 'PENDING_APPROVAL' });

            const distinctAvailableTitles = await BookCopyMongo.distinct('bookId', { status: 'AVAILABLE' });
            const booksInStock = distinctAvailableTitles.length;
            const booksOutOfStock = totalBooks - booksInStock;

            const bookStatusData = [
                { type: 'Còn sách', value: booksInStock },
                { type: 'Hết sách', value: booksOutOfStock },
            ];

            const approvedLoans = await LoanTicketMongo.countDocuments({ status: 'BORROWING' });
            const rejectedLoans = await LoanTicketMongo.countDocuments({ status: 'CANCELLED' });

            const now = new Date();
            const overdueLoans = await LoanTicketMongo.countDocuments({
                $or: [
                    { status: 'OVERDUE' },
                    { status: 'BORROWING', dueDate: { $ne: null, $lt: now } },
                ],
            });

            const ticketsCurrentlyBorrowing = await LoanTicketMongo.countDocuments({ status: 'BORROWING' });
            const ticketsOverdueNotReturned = await LoanTicketMongo.countDocuments({ status: 'OVERDUE' });

            const unpaidFineAgg = await FineTicketMongo.aggregate([
                { $match: { status: 'UNPAID' } },
                { $group: { _id: null, total: { $sum: '$fineAmount' } } },
            ]);
            const totalUnpaidFineAmount = unpaidFineAgg[0]?.total ? Math.round(Number(unpaidFineAgg[0].total)) : 0;

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
                ticketsCurrentlyBorrowing,
                ticketsOverdueNotReturned,
                totalUnpaidFineAmount,
            });
        } catch (error) {
            res.status(500).json({ message: 'Lỗi server: ' + error.message });
        }
    }
}

module.exports = new controllerUser();
