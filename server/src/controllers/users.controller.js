const modelUser = require('../models/users.model');
const modelApiKey = require('../models/apiKey.model');
const modelOtp = require('../models/otp.model');

const { AuthFailureError, BadRequestError } = require('../core/error.response');
const { OK } = require('../core/success.response');
const User = require('../models/users.model');
const Product = require('../models/product.model');
const HistoryBook = require('../models/historyBook.model');
const { Op } = require('sequelize');
const { createApiKey, createRefreshToken, createToken, verifyToken } = require('../services/tokenServices');

const sendMailForgotPassword = require('../utils/sendMailForgotPassword');

const bcrypt = require('bcrypt');
const CryptoJS = require('crypto-js');
const { jwtDecode } = require('jwt-decode');
const jwt = require('jsonwebtoken');
const otpGenerator = require('otp-generator');
const {
    syncUserFromPlain,
    deleteUserMongo,
    deleteApiKeysByUserIdMongo,
    syncOtpFromPlain,
    deleteOtpsByEmailMongo,
} = require('../services/mongoDualWrite');

require('dotenv').config();

class controllerUser {
    async registerUser(req, res) {
        const { fullName, phone, address, email, password } = req.body;
        if (!fullName || !phone || !email || !password) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }
        const findUser = await modelUser.findOne({ where: { email } });

        if (findUser) {
            throw new BadRequestError('Email đã tồn tại');
        }

        const saltRounds = 10;
        const salt = bcrypt.genSaltSync(saltRounds);
        const passwordHash = bcrypt.hashSync(password, salt);
        const dataUser = await modelUser.create({
            fullName,
            phone,
            address,
            email,
            password: passwordHash,
            typeLogin: 'email',
        });

        await dataUser.save();
        await syncUserFromPlain(dataUser.get({ plain: true }));
        await createApiKey(dataUser.id);
        const token = await createToken({
            id: dataUser.id,
            isAdmin: dataUser.isAdmin,
            address: dataUser.address,
            phone: dataUser.phone,
        });
        const refreshToken = await createRefreshToken({ id: dataUser.id });
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000,
        });

        res.cookie('logged', 1, {
            httpOnly: false,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken } }).send(res);
    }

    async loginUser(req, res) {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }
        const findUser = await modelUser.findOne({ where: { email } });
        if (!findUser) {
            throw new AuthFailureError('Tài khoản hoặc mật khẩu không chính xác');
        }
        const isPasswordValid = bcrypt.compareSync(password, findUser.password);
        if (!isPasswordValid) {
            throw new AuthFailureError('Tài khoản hoặc mật khẩu không chính xác');
        }
        await syncUserFromPlain(findUser.get({ plain: true }));
        await createApiKey(findUser.id);
        const token = await createToken({ id: findUser.id, isAdmin: findUser.isAdmin });
        const refreshToken = await createRefreshToken({ id: findUser.id });
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000,
        });
        res.cookie('logged', 1, {
            httpOnly: false,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken } }).send(res);
    }

    async authUser(req, res) {
        const { id } = req.user;

        const findUser = await modelUser.findOne({ where: { id } });

        if (!findUser) {
            throw new AuthFailureError('Tài khoản không tồn tại');
        }

        const auth = CryptoJS.AES.encrypt(JSON.stringify(findUser), process.env.SECRET_CRYPTO).toString();

        new OK({ message: 'success', metadata: auth }).send(res);
    }

    async refreshToken(req, res) {
        const refreshToken = req.cookies.refreshToken;

        const decoded = await verifyToken(refreshToken);

        const user = await modelUser.findOne({ where: { id: decoded.id } });
        const token = await createToken({ id: user.id });
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000,
        });

        res.cookie('logged', 1, {
            httpOnly: false,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        new OK({ message: 'Refresh token thành công', metadata: { token } }).send(res);
    }

    async logout(req, res) {
        const { id } = req.user;
        await modelApiKey.destroy({ where: { userId: id } });
        await deleteApiKeysByUserIdMongo(id);
        res.clearCookie('token');
        res.clearCookie('refreshToken');
        res.clearCookie('logged');

        new OK({ message: 'Đăng xuất thành công' }).send(res);
    }

    async updateInfoUser(req, res, next) {
        const { id } = req.user;
        const { fullName, address, phone, sex } = req.body;

        const user = await modelUser.findOne({ where: { id } });
        if (!user) {
            throw new BadRequestError('Không tìm thấy tài khoản');
        }

        let image = user.avatar;
        if (req.file) {
            image = `uploads/avatars/${req.file.filename}`;
        }
        await user.update({ fullName, address, phone, sex, avatar: image });
        const userFresh = await modelUser.findOne({ where: { id } });
        if (userFresh) {
            await syncUserFromPlain(userFresh.get({ plain: true }));
        }

        new OK({ message: 'Cập nhật thông tin tài khoản thành cong' }).send(res);
    }

    async loginGoogle(req, res) {
        const { credential } = req.body;
        const dataToken = jwtDecode(credential);
        const user = await modelUser.findOne({ where: { email: dataToken.email } });
        if (user) {
            await syncUserFromPlain(user.get({ plain: true }));
            await createApiKey(user.id);
            const token = await createToken({ id: user.id });
            const refreshToken = await createRefreshToken({ id: user.id });
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 15 * 60 * 1000,
            });
            res.cookie('logged', 1, {
                httpOnly: false,
                secure: true,
                sameSite: 'Strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken } }).send(res);
        } else {
            const newUser = await modelUser.create({
                fullName: dataToken.name,
                email: dataToken.email,
                typeLogin: 'google',
            });
            await newUser.save();
            await syncUserFromPlain(newUser.get({ plain: true }));
            await createApiKey(newUser.id);
            const token = await createToken({ id: newUser.id });
            const refreshToken = await createRefreshToken({ id: newUser.id });
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 15 * 60 * 1000,
            });
            res.cookie('logged', 1, {
                httpOnly: false,
                secure: true,
                sameSite: 'Strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            new OK({ message: 'Đăng nhập thành công', metadata: { token, refreshToken } }).send(res);
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                throw new BadRequestError('Vui lòng nhập email');
            }

            const user = await modelUser.findOne({ where: { email } });
            if (!user) {
                throw new AuthFailureError('Email không tồn tại');
            }

            const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '15m' });
            const otp = await otpGenerator.generate(6, {
                digits: true,
                lowerCaseAlphabets: false,
                upperCaseAlphabets: false,
                specialChars: false,
            });

            const saltRounds = 10;

            bcrypt.hash(otp, saltRounds, async function (err, hash) {
                if (err) {
                    console.error('Error hashing OTP:', err);
                } else {
                    const otpRow = await modelOtp.create({
                        email: user.email,
                        otp: hash,
                    });
                    await syncOtpFromPlain(otpRow.get({ plain: true }));
                    await sendMailForgotPassword(email, otp);

                    return res
                        .setHeader('Set-Cookie', [
                            `tokenResetPassword=${token};  Secure; Max-Age=300; Path=/; SameSite=Strict`,
                        ])
                        .status(200)
                        .json({ message: 'Gửi thành công !!!' });
                }
            });
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
            if (!decode) {
                throw new AuthFailureError('Sai mã OTP hoặc đã hết hạn, vui lòng lấy OTP mới');
            }

            const findOTP = await modelOtp.findOne({
                where: { email: decode.email },
                order: [['createdAt', 'DESC']],
            });
            if (!findOTP) {
                throw new AuthFailureError('Sai mã OTP hoặc đã hết hạn, vui lòng lấy OTP mới');
            }

            const isMatch = await bcrypt.compare(otp, findOTP.otp);
            if (!isMatch) {
                throw new AuthFailureError('Sai mã OTP hoặc đã hết hạn, vui lòng lấy OTP mới');
            }

            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            const findUser = await modelUser.findOne({ where: { email: decode.email } });
            if (!findUser) {
                throw new AuthFailureError('Người dùng không tồn tại');
            }

            findUser.password = hashedPassword;
            await findUser.save();
            await syncUserFromPlain(findUser.get({ plain: true }));

            await modelOtp.destroy({ where: { email: decode.email } });
            await deleteOtpsByEmailMongo(decode.email);
            res.clearCookie('tokenResetPassword');
            return res.status(200).json({ message: 'Đặt lại mật khẩu thành công' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Có lỗi xảy ra, vui lòng liên hệ ADMIN !!' });
        }
    }

    async getUsers(req, res) {
        const users = await modelUser.findAll();
        new OK({ message: 'Lấy danh sách người dùng thành công', metadata: users }).send(res);
    }

    async updateUser(req, res) {
        const { userId, fullName, phone, email, role, address } = req.body;

        const user = await modelUser.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        user.fullName = fullName;
        user.phone = phone;
        user.email = email;
        user.role = role;
        user.address = address;
        await user.save();
        await syncUserFromPlain(user.get({ plain: true }));
        new OK({ message: 'Cập nhật người dùng thành công' }).send(res);
    }

    async changeAvatar(req, res) {
        const { file } = req;
        const { id } = req.user;
        if (!file) {
            throw new BadRequestError('Vui lòng chọn file');
        }
        const user = await modelUser.findOne({ where: { id } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        user.avatar = `uploads/avatars/${file.filename}`;
        await user.save();
        await syncUserFromPlain(user.get({ plain: true }));
        new OK({
            message: 'Upload thành công',
            metadata: `uploads/avatars/${file.filename}`,
        }).send(res);
    }

    async deleteUser(req, res) {
        const { userId } = req.body;
        const user = await modelUser.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        await user.destroy();
        await deleteApiKeysByUserIdMongo(userId);
        await deleteUserMongo(userId);
        new OK({ message: 'Xóa người dùng thành công' }).send(res);
    }

    async updatePassword(req, res) {
        const { userId, password } = req.body;
        const user = await modelUser.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        const saltRounds = 10;
        const salt = bcrypt.genSaltSync(saltRounds);
        const passwordHash = bcrypt.hashSync(password, salt);
        user.password = passwordHash;
        await user.save();
        await syncUserFromPlain(user.get({ plain: true }));
        new OK({ message: 'Cập nhật mật khẩu thành công' }).send(res);
    }

    async requestIdStudent(req, res) {
        const { id } = req.user;
        const user = await modelUser.findOne({ where: { id } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        if (user.dataValues.idStudent !== null || user.dataValues.idStudent === '0') {
            throw new BadRequestError('Vui lòng chờ xác nhận ID sinh viên');
        } else {
            user.idStudent = '0';
            await user.save();
            await syncUserFromPlain(user.get({ plain: true }));
            new OK({ message: 'Yêu cầu thành công' }).send(res);
        }
    }

    async confirmIdStudent(req, res) {
        const { idStudent, userId } = req.body;
        if (!idStudent || !userId) {
            throw new BadRequestError('Vui lòng nhập ID sinh viên');
        }

        const user = await modelUser.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        user.idStudent = idStudent;
        await user.save();
        await syncUserFromPlain(user.get({ plain: true }));
        new OK({ message: 'Xác nhận thành công' }).send(res);
    }

    async getRequestLoan(req, res) {
        const findRequestLoan = await modelUser.findAll({ where: { idStudent: '0' || null } });
        new OK({
            message: 'Lấy danh sách yêu cầu mượn sách thành công',
            metadata: findRequestLoan,
        }).send(res);
    }

    async getStatistics(req, res) {
        try {
            const totalUsers = await User.count();
            const totalBooks = await Product.count();
            const pendingRequests = await HistoryBook.count({ where: { status: 'pending' } });

            const booksInStock = await Product.count({ where: { stock: { [Op.gt]: 0 } } });
            const booksOutOfStock = totalBooks - booksInStock;

            const bookStatusData = [
                { type: 'Còn sách', value: booksInStock },
                { type: 'Hết sách', value: booksOutOfStock },
            ];

            const approvedLoans = await HistoryBook.count({ where: { status: 'success' } });
            const pendingLoans = pendingRequests;
            const rejectedLoans = await HistoryBook.count({ where: { status: 'cancel' } });

            /** Mượn quá hạn: đã duyệt, chưa trả, quá 14 ngày kể từ ngày mượn */
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const overdueLoans = await HistoryBook.count({
                where: {
                    status: 'success',
                    returnDate: null,
                    borrowDate: { [Op.lt]: fourteenDaysAgo },
                },
            });

            const loanStatusData = [
                { status: 'Đã duyệt', count: approvedLoans },
                { status: 'Chờ duyệt', count: pendingLoans },
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
