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

const SendMailBookBorrowFailed = async (email, productInfo) => {
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
            from: `"Thư viện Moho" <${EMAIL_USER}>`,
            to: email,
            subject: 'Thông báo: Mượn sách không thành công',
            text: `Rất tiếc, việc mượn sách "${productInfo.nameProduct || productInfo.title}" không thành công.`,
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
                        background: linear-gradient(135deg, #e17055, #fd79a8);
                        padding: 30px;
                        color: #ffffff;
                        text-align: center;
                    }
                    .header h2 {
                        margin: 0;
                        font-size: 22px;
                    }
                    .success-icon {
                        font-size: 48px;
                        margin-bottom: 10px;
                    }
                    .content {
                        padding: 30px;
                    }
                    .message {
                        font-size: 16px;
                        margin-bottom: 20px;
                        line-height: 1.6;
                    }
                    .book-info {
                        background-color: #f8f9fa;
                        border-left: 4px solid #e17055;
                        padding: 20px;
                        margin: 20px 0;
                        border-radius: 5px;
                    }
                    .book-title {
                        font-size: 18px;
                        font-weight: bold;
                        color: #2d3436;
                        margin-bottom: 10px;
                    }
                    .book-details {
                        font-size: 14px;
                        color: #636e72;
                        line-height: 1.5;
                    }
                    .return-date {
                        text-align: center;
                        background-color: #fff3cd;
                        border: 1px solid #ffeaa7;
                        padding: 15px;
                        font-size: 16px;
                        font-weight: bold;
                        color: #856404;
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                    .footer {
                        text-align: center;
                        font-size: 14px;
                        padding: 20px;
                        background-color: #f1f2f6;
                        color: #636e72;
                    }
                    .note {
                        background-color: #e8f4f8;
                        border-left: 4px solid #00cec9;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 5px;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="success-icon">❌</div>
                        <h2>Mượn sách không thành công</h2>
                    </div>
                    <div class="content">
                        <div class="message">
                            Rất tiếc! Yêu cầu mượn sách của bạn không thể được thực hiện.
                        </div>
                        
                        
                        <div class="book-info">
                            <div class="book-title">${productInfo.nameProduct || productInfo.title}</div>
                            <div class="book-details">
                                <strong>Mô tả:</strong> ${productInfo.description || 'Không có mô tả'}<br/>
                                <strong>Mã sách:</strong> ${productInfo.id}<br/>
                                <strong>Nhà xuất bản:</strong> ${productInfo.publisher}<br/>
                                <strong>Công ty phát hành:</strong> ${productInfo.publishingCompany}<br/>
                                <strong>Năm xuất bản:</strong> ${productInfo.publishYear}<br/>
                                <strong>Số trang:</strong> ${productInfo.pages} trang<br/>
                                <strong>Loại bìa:</strong> ${
                                    productInfo.covertType === 'hard' ? 'Bìa cứng' : 'Bìa mềm'
                                }<br/>
                                <strong>Ngôn ngữ:</strong> ${productInfo.language}<br/>
                                <strong>Số lượng còn lại:</strong> ${productInfo.stock} cuốn
                            </div>
                        </div>

                        <div class="note">
                            <strong>Gợi ý cho bạn:</strong><br/>
                            • Kiểm tra lại thông tin tài khoản của bạn<br/>
                            • Liên hệ thư viện để được hỗ trợ<br/>
                            • Thử mượn sách khác hoặc đặt trước sách này<br/>
                            • Xem danh sách sách có sẵn tại thư viện
                        </div>

                        <div class="message">
                            Chúng tôi xin lỗi vì sự bất tiện này. Vui lòng liên hệ với chúng tôi nếu cần hỗ trợ thêm.
                        </div>
                    </div>
                    <div class="footer">
                        Trân trọng,<br/>
                        <strong>Thư viện Moho</strong><br/>
                        📞 Hotline: 1900-xxxx | 📧 library@moho.com
                    </div>
                </div>
            </body>
            </html>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email thông báo mượn sách không thành công đã gửi:', info.messageId);
    } catch (error) {
        console.error('❌ Lỗi khi gửi email thông báo mượn sách không thành công:', error);
    }
};

module.exports = SendMailBookBorrowFailed;
