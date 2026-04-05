import { useState } from 'react';
import { Button, Form, Input, message, Card, Divider } from 'antd';
import { MailOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { requestForgotPassword, requestResetPassword } from '../config/request';

function ForgotPassword() {
    const [isEmailSent, setIsEmailSent] = useState(false);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleEmailSubmit = async (values) => {
        try {
            setLoading(true);
            const data = {
                email: values.email,
            };
            await requestForgotPassword(data);
            setEmail(values.email);
            setIsEmailSent(true);
            message.success('Mã xác thực đã được gửi đến email của bạn!');
        } catch (error) {
            message.error('Có lỗi xảy ra. Vui lòng thử lại sau!');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (values) => {
        try {
            setLoading(true);
            const data = {
                email: email,
                otp: values.otp,
                newPassword: values.newPassword,
            };
            await requestResetPassword(data);
            message.success('Đặt lại mật khẩu thành công!');
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        } catch (error) {
            message.error('Có lỗi xảy ra. Vui lòng thử lại sau!');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <header>
                <Header />
            </header>

            <main className="flex-grow flex items-center justify-center bg-gray-50 py-12 px-4">
                <Card className="w-full max-w-md shadow-lg">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Quên mật khẩu</h2>
                        <p className="text-gray-600 mt-2">
                            {!isEmailSent
                                ? 'Nhập email của bạn để nhận mã xác thực'
                                : 'Nhập mã xác thực và mật khẩu mới'}
                        </p>
                    </div>

                    <Divider />

                    {!isEmailSent ? (
                        <Form name="forgot_password" layout="vertical" onFinish={handleEmailSubmit} autoComplete="off">
                            <Form.Item
                                name="email"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập email!' },
                                    { type: 'email', message: 'Email không hợp lệ!' },
                                ]}
                            >
                                <Input
                                    prefix={<MailOutlined className="text-gray-400" />}
                                    placeholder="Email"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    className="w-full bg-blue-500 hover:bg-blue-600"
                                    size="large"
                                    loading={loading}
                                >
                                    Gửi mã xác thực
                                </Button>
                            </Form.Item>

                            <div className="text-center">
                                <a href="/login" className="text-blue-500 hover:text-blue-700">
                                    Quay lại đăng nhập
                                </a>
                            </div>
                        </Form>
                    ) : (
                        <Form name="reset_password" layout="vertical" onFinish={handleResetPassword} autoComplete="off">
                            <Form.Item
                                name="otp"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập mã OTP!' },
                                    { min: 6, message: 'Mã OTP phải có ít nhất 6 ký tự!' },
                                ]}
                            >
                                <Input
                                    prefix={<KeyOutlined className="text-gray-400" />}
                                    placeholder="Mã xác thực OTP"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                name="newPassword"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập mật khẩu mới!' },
                                    { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự!' },
                                ]}
                            >
                                <Input.Password
                                    prefix={<LockOutlined className="text-gray-400" />}
                                    placeholder="Mật khẩu mới"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                name="confirmPassword"
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: 'Vui lòng xác nhận mật khẩu!' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password
                                    prefix={<LockOutlined className="text-gray-400" />}
                                    placeholder="Xác nhận mật khẩu mới"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    className="w-full bg-blue-500 hover:bg-blue-600"
                                    size="large"
                                    loading={loading}
                                >
                                    Đặt lại mật khẩu
                                </Button>
                            </Form.Item>

                            <div className="text-center">
                                <Button
                                    type="link"
                                    onClick={() => setIsEmailSent(false)}
                                    className="text-blue-500 hover:text-blue-700"
                                >
                                    Quay lại nhập email
                                </Button>
                            </div>
                        </Form>
                    )}
                </Card>
            </main>

            <footer>
                <Footer />
            </footer>
        </div>
    );
}

export default ForgotPassword;
