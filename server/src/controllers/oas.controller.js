const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { OK } = require('../core/success.response');
const { BadRequestError } = require('../core/error.response');
const UserMongo = require('../models/user.mongo.model');

const db = mongoose.connection;

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.USER_EMAIL,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
    });
}

function buildWarningHtml(fullName, studentId, totalFine, overdueBooks) {
    const fmtFine = Number(totalFine || 0).toLocaleString('vi-VN');
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#4f46e5;padding:24px;text-align:center">
        <h2 style="color:#fff;margin:0">Thư Viện PTIT</h2>
        <p style="color:#c7d2fe;margin:4px 0 0">Thông báo nhắc nhở</p>
      </div>
      <div style="padding:28px">
        <p>Kính gửi <b>${fullName}</b> (MSV: ${studentId}),</p>
        <p>Hệ thống tự động của Thư viện ghi nhận bạn hiện đang có:</p>
        <ul>
          <li><b>${overdueBooks}</b> cuốn sách đang quá hạn trả</li>
          <li>Tổng số tiền phạt trễ hạn: <b style="color:#ef4444">${fmtFine} VNĐ</b></li>
        </ul>
        <p>Yêu cầu bạn mang sách đến thư viện để hoàn tất thủ tục trả sách và đóng phạt trong thời gian sớm nhất.</p>
        <p style="color:#ef4444;font-weight:bold">CẢNH BÁO: Việc chậm trễ có thể dẫn đến việc tài khoản mượn sách của bạn bị khóa vĩnh viễn.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="font-size:12px;color:#94a3b8">Email được gửi tự động bởi Hệ thống Quản lý Thư viện PTIT</p>
      </div>
    </div>`;
}

class OasController {
    /** Gửi email cảnh báo cá nhân */
    async sendWarningEmail(req, res) {
        const { userId, total_fine = 0, overdue_books = 0 } = req.body;
        if (!userId) throw new BadRequestError('Thiếu userId');

        const user = await UserMongo.findById(userId).lean();
        if (!user?.email) throw new BadRequestError('Không tìm thấy email người dùng');

        const html = buildWarningHtml(user.fullName, user.studentId || 'N/A', total_fine, overdue_books);

        let statusLog = 'success';
        let errorDetail = '';
        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"Thư Viện PTIT" <${process.env.USER_EMAIL}>`,
                to: user.email,
                subject: '[QUAN TRỌNG] Thông báo trả sách và thanh toán nợ phạt Thư viện',
                html,
            });
            await UserMongo.findByIdAndUpdate(userId, { $inc: { warningCount: 1 } });
        } catch (err) {
            statusLog = 'error';
            errorDetail = err.message;
        }

        await db.collection('email_logs').insertOne({
            type: 'warning',
            recipientId: String(userId),
            recipientEmail: user.email,
            recipientName: user.fullName,
            subject: 'Thông báo trả sách và thanh toán nợ phạt',
            status: statusLog,
            errorDetail,
            sentAt: new Date(),
        });

        if (statusLog === 'error') {
            return res.status(500).json({ message: 'Gửi email thất bại: ' + errorDetail });
        }
        new OK({ message: `Đã gửi email tới ${user.email}` }).send(res);
    }

    /** Gửi email thông báo hàng loạt (BCC) */
    async sendMassEmail(req, res) {
        const { subject, content } = req.body;
        if (!subject || !content) throw new BadRequestError('Thiếu subject hoặc content');

        const users = await UserMongo.find({ role: 'user', email: { $exists: true, $ne: '' } }, { email: 1 }).lean();
        const emails = users.map((u) => u.email).filter(Boolean);
        if (!emails.length) throw new BadRequestError('Không có độc giả nào có email');

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
          <div style="background:#4f46e5;padding:24px;text-align:center">
            <h2 style="color:#fff;margin:0">Thư Viện PTIT</h2>
          </div>
          <div style="padding:28px">
            <p>Kính gửi các bạn độc giả,</p>
            <div style="white-space:pre-wrap">${content}</div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="font-size:12px;color:#94a3b8">Email được gửi tự động bởi Hệ thống Quản lý Thư viện PTIT</p>
          </div>
        </div>`;

        let statusLog = 'success';
        let errorDetail = '';
        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"Thư Viện PTIT" <${process.env.USER_EMAIL}>`,
                to: process.env.USER_EMAIL,
                bcc: emails,
                subject,
                html,
            });
        } catch (err) {
            statusLog = 'error';
            errorDetail = err.message;
        }

        await db.collection('email_logs').insertOne({
            type: 'mass',
            subject,
            recipientCount: emails.length,
            status: statusLog,
            errorDetail,
            sentAt: new Date(),
        });

        if (statusLog === 'error') {
            return res.status(500).json({ message: 'Gửi email thất bại: ' + errorDetail });
        }
        new OK({ message: `Đã gửi thông báo tới ${emails.length} độc giả` }).send(res);
    }

    /** Lấy danh sách nhật ký email */
    async getEmailLogs(req, res) {
        const { type, limit = 100 } = req.query;
        const filter = {};
        if (type && type !== 'all') filter.type = type;
        const logs = await db.collection('email_logs')
            .find(filter)
            .sort({ sentAt: -1 })
            .limit(Number(limit))
            .toArray();
        new OK({ message: 'Email logs', metadata: logs }).send(res);
    }
}

module.exports = new OasController();
