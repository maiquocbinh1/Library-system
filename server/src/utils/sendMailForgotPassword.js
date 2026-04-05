const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const EMAIL_USER = process.env.USER_EMAIL;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const SendMailForgotPassword = async (email, otp) => {
    try {
        const { token: accessToken } = await oAuth2Client.getAccessToken();

        if (!accessToken) {
            console.error('❌ Không lấy được access token');
            return;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: EMAIL_USER,
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                refreshToken: REFRESH_TOKEN,
                accessToken: accessToken,
            },
        });

        const mailOptions = {
            from: `"Moho" <${EMAIL_USER}>`,
            to: email,
            subject: 'Yêu cầu đặt lại mật khẩu',
            text: `Mã OTP để đặt lại mật khẩu của bạn là: ${otp}`,
            html: `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: 'Roboto', sans-serif;
                        background-color: #f2f4f8;
                        margin: 0;
                        padding: 0;
                        color: #2d3436;
                    }
                    .container {
                        max-width: 600px;
                        margin: 30px auto;
                        background-color: #ffffff;
                        border-radius: 10px;
                        overflow: hidden;
                        box-shadow: 0 6px 12px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: linear-gradient(135deg, #6c5ce7, #a29bfe);
                        padding: 30px;
                        color: #ffffff;
                        text-align: center;
                    }
                    .header h2 {
                        margin: 0;
                        font-size: 22px;
                    }
                    .content {
                        padding: 30px;
                    }
                    .message {
                        font-size: 16px;
                        margin-bottom: 20px;
                        line-height: 1.6;
                    }
                    .otp-box {
                        text-align: center;
                        background-color: #f1f2f6;
                        border: 1px dashed #6c5ce7;
                        padding: 20px;
                        font-size: 24px;
                        font-weight: bold;
                        color: #6c5ce7;
                        border-radius: 10px;
                        letter-spacing: 4px;
                    }
                    .footer {
                        text-align: center;
                        font-size: 14px;
                        padding: 20px;
                        background-color: #f1f2f6;
                        color: #636e72;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Yêu cầu đặt lại mật khẩu</h2>
                    </div>
                    <div class="content">
                        <div class="message">
                            Bạn hoặc ai đó đã yêu cầu đặt lại mật khẩu cho tài khoản sử dụng địa chỉ email này.
                        </div>
                        <div class="message">
                            Vui lòng sử dụng mã OTP bên dưới để xác nhận và đặt lại mật khẩu:
                        </div>
                        <div class="otp-box">${otp}</div>
                        <div class="message">
                            Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.
                        </div>
                    </div>
                    <div class="footer">
                        Trân trọng,<br/>
                        <strong>Moho</strong>
                    </div>
                </div>
            </body>
            </html>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email đặt lại mật khẩu đã gửi:', info.messageId);
    } catch (error) {
        console.error('❌ Lỗi khi gửi email đặt lại mật khẩu:', error);
    }
};

module.exports = SendMailForgotPassword;
