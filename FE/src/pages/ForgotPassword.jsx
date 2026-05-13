import { Button, Card, Form, Input, message } from 'antd';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { requestSendForgotPasswordMail } from '../config/request';

function ForgotPassword() {
    const [form] = Form.useForm();
    const handleSend = async (values) => {
        try {
            await requestSendForgotPasswordMail({
                email: values.email,
                studentId: values.studentId,
            });
            message.success('Gửi thông báo thành công.');
            form.resetFields();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể gửi thông báo');
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <header>
                <Header />
            </header>

            <main className="flex-grow flex items-center justify-center bg-gray-50 py-12 px-4">
                <Card className="w-full max-w-md shadow-lg">
                    <div className="mb-6 text-center">
                        <h2 className="text-2xl font-bold text-gray-800">Quên mật khẩu</h2>
                        <p className="mt-2 text-gray-600">Vui lòng liên hệ thư viện để được hỗ trợ đổi mật khẩu.</p>
                    </div>

                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">
                        <p className="m-0">
                            - Vui lòng đến quầy thư viện PTIT để xác minh và đặt lại mật khẩu.
                        </p>
                        <p className="m-0 mt-2">
                            - Mang theo thẻ sinh viên/giấy tờ tùy thân khi yêu cầu hỗ trợ.
                        </p>
                        <div className="mt-4 text-center">
                            <a href="/login" className="text-blue-600 hover:text-blue-800">
                                Quay lại đăng nhập
                            </a>
                        </div>
                    </div>

                    <div className="mt-5 rounded-lg border border-gray-100 bg-white px-4 py-4">
                        <div className="mb-3 text-sm font-semibold text-gray-800">Gửi thông báo tới thư viện</div>
                        <Form form={form} layout="vertical" onFinish={handleSend}>
                            <Form.Item
                                name="email"
                                label="Email đăng nhập"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập email' },
                                    { type: 'email', message: 'Email không hợp lệ' },
                                ]}
                            >
                                <Input placeholder="vd: b21dcn001@stu.ptit.edu.vn" />
                            </Form.Item>
                            <Form.Item
                                name="studentId"
                                label="MSV / MSG"
                                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập MSV hoặc MSG' }]}
                            >
                                <Input placeholder="vd: B21DCN001" />
                            </Form.Item>
                            <Button type="primary" htmlType="submit" block>
                                Gửi thông báo
                            </Button>
                        </Form>
                    </div>
                </Card>
            </main>

            <footer>
                <Footer />
            </footer>
        </div>
    );
}

export default ForgotPassword;
