import { useState } from 'react';
import { Button, Form, Input, Card, Divider, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import Header from '../components/Header';
import { Link, useNavigate } from 'react-router-dom';
import { requestLogin } from '../config/request';
import imagesLogin from '../assets/images/login-library.png';
import { useStore } from '../hooks/useStore';

const NOTICE_WRONG_PASSWORD = 'library-wrong-pw-reset';

/** Thông báo ban đầu khi sai MK nhưng thư viện đã reset (cùng vị trí với message.error). */
function openLibraryWrongPasswordResetHint(postLoginAlerts, onDismiss) {
    const single = postLoginAlerts.length === 1 ? postLoginAlerts[0] : null;

    message.open({
        key: NOTICE_WRONG_PASSWORD,
        type: 'info',
        duration: 0,
        content: (
            <div style={{ maxWidth: 420 }} className="text-left text-slate-800">
                <p className="mb-1 text-sm font-semibold text-slate-900">
                    {single?.title || 'Thông báo từ thư viện'}
                </p>
                <p className="mb-2 text-xs leading-snug text-slate-600">
                    Mật khẩu bạn nhập chưa đúng. Thư viện đã đặt lại mật khẩu cho tài khoản này — vui lòng đọc và thử đăng nhập lại bằng mật khẩu mặc định.
                </p>
                <div
                    className="mb-3 max-h-[40vh] overflow-y-auto text-xs leading-relaxed [&_p]:mb-1"
                    style={{ wordBreak: 'break-word' }}
                >
                    {postLoginAlerts.map((a) => (
                        <div
                            key={a.id}
                            className="mb-2 border-b border-slate-200/80 pb-2 last:mb-0 last:border-b-0 last:pb-0"
                        >
                            {!single && <div className="mb-1 font-semibold text-slate-900">{a.title}</div>}
                            <div
                                className="login-post-alert-html text-slate-700"
                                dangerouslySetInnerHTML={{ __html: a.contentHtml || '' }}
                            />
                        </div>
                    ))}
                </div>
                <Button type="primary" size="small" onClick={() => void onDismiss()}>
                    Đã hiểu
                </Button>
            </div>
        ),
    });
}

function LoginUser() {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { refreshAuth } = useStore();
    const onFinish = async (values) => {
        setLoading(true);

        try {
            const res = await requestLogin(values);
            const meta = res?.data?.metadata;
            const role = String(meta?.user?.role || '').toLowerCase();
            const target = role === 'admin' || role === 'librarian' || role === 'warehouse' ? '/admin' : '/';

            await refreshAuth();
            message.success('Đăng nhập thành công!');
            navigate(target);
        } catch (error) {
            const data = error?.response?.data;
            const errMeta = data?.metadata;
            if (
                errMeta?.loginHint === 'LIBRARY_PASSWORD_RESET' &&
                Array.isArray(errMeta.postLoginAlerts) &&
                errMeta.postLoginAlerts.length > 0
            ) {
                openLibraryWrongPasswordResetHint(errMeta.postLoginAlerts, () => {
                    message.destroy(NOTICE_WRONG_PASSWORD);
                });
            } else {
                message.error(data?.message || 'Tài khoản hoặc mật khẩu không chính xác');
            }
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
                                    src={imagesLogin}
                                    alt="Library login"
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

            <style>{`
                .shadow-text {
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
                }
            `}</style>
        </div>
    );
}

export default LoginUser;
