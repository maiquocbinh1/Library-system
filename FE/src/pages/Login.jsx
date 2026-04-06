import { useState } from 'react';
import { Button, Form, Input, Card, Divider, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Link, useNavigate } from 'react-router-dom';
import { requestLogin } from '../config/request';
import imagesLogin from '../assets/images/login.jpg';
import { useStore } from '../hooks/useStore';

function LoginUser() {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { refreshAuth } = useStore();
    const onFinish = async (values) => {
        setLoading(true);

        try {
            const res = await requestLogin(values);
            const role = String(res?.data?.metadata?.user?.role || '').toLowerCase();
            await refreshAuth();
            message.success('Đăng nhập thành công!');
            navigate(role === 'admin' ? '/admin' : '/');
        } catch (error) {
            const errorMessage = error?.response?.data?.message || 'Tài khoản hoặc mật khẩu không chính xác';
            message.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <header>
                <Header />
            </header>

            <main className="flex-grow flex items-center justify-center bg-gray-100 py-12">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col lg:flex-row items-stretch max-w-6xl mx-auto">
                        <div className="hidden lg:flex lg:w-1/2 h-auto">
                            <div className="relative w-full h-full">
                                <img
                                    src={`${import.meta.env.VITE_API_URL_IMAGE}/${imagesLogin}`}
                                    alt="Tour du lịch"
                                    className="rounded-l-xl shadow-lg object-cover w-full h-full"
                                />
                                <div className="absolute inset-0 bg-blue-500 opacity-20 rounded-l-xl"></div>
                                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                                    <h2 className="text-3xl font-bold shadow-text">Chào mừng trở lại</h2>
                                </div>
                            </div>
                        </div>

                        <div className="w-full lg:w-1/2 bg-white rounded-r-xl shadow-lg">
                            <div className="p-8">
                                <div className="text-center mb-6">
                                    <h1 className="text-2xl font-bold text-gray-800">Chào mừng trở lại</h1>
                                    <p className="text-gray-600">Đăng nhập vào tài khoản của bạn</p>
                                </div>

                                <Form
                                    name="login_form"
                                    className="login-form"
                                    initialValues={{ remember: true }}
                                    onFinish={onFinish}
                                    layout="vertical"
                                    size="large"
                                >
                                    <Form.Item
                                        name="email"
                                        rules={[{ required: true, message: 'Vui lòng nhập email!' }]}
                                    >
                                        <Input
                                            prefix={<UserOutlined className="text-gray-400" />}
                                            placeholder="Email"
                                            className="rounded-md"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="password"
                                        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined className="text-gray-400" />}
                                            placeholder="Mật khẩu"
                                            className="rounded-md"
                                        />
                                    </Form.Item>

                                    <div className="flex justify-between mb-4">
                                        <Link className="text-blue-600 hover:text-blue-800" to="/forgot-password">
                                            Quên mật khẩu?
                                        </Link>
                                    </div>

                                    <Form.Item>
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                            loading={loading}
                                        >
                                            Đăng nhập
                                        </Button>
                                    </Form.Item>

                                    <Divider plain>Hoặc</Divider>

                                    <div className="text-center pt-4">
                                        <Link to="/register">
                                            <Button className="w-full">Đăng ký</Button>
                                        </Link>
                                    </div>
                                </Form>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer>
                <Footer />
            </footer>

            <style>{`
                .shadow-text {
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
                }
            `}</style>
        </div>
    );
}

export default LoginUser;
