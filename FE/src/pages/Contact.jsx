import Header from '../components/Header';
import Footer from '../components/Footer';
import { Button, Card, Form, Input, message } from 'antd';

const { TextArea } = Input;

function Contact() {
    const [form] = Form.useForm();

    const handleSubmit = (values) => {
        console.log('Contact form data:', values);
        message.success('Gửi tin nhắn thành công!');
        form.resetFields();
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />
            <main className="pt-24 pb-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-900">Liên hệ với chúng tôi</h1>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
                        <Card className="rounded-xl shadow-sm border border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900 mb-5">Liên hệ</h2>

                            <div className="space-y-4 text-gray-700">
                                <p>📍 123 Đường ABC, Quận 1, TP.HCM</p>
                                <p>📞 (028) 1234 5678</p>
                                <p>✉️ info@thuvien.edu.vn</p>
                                <p>🕒 Thứ 2 - Chủ nhật: 8:00 - 20:00</p>
                            </div>
                        </Card>

                        <Card className="rounded-xl shadow-sm border border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900 mb-5">Gửi lời nhắn</h2>

                            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                                <Form.Item
                                    label="Họ và tên"
                                    name="fullName"
                                    rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
                                >
                                    <Input placeholder="Nhập họ và tên" />
                                </Form.Item>

                                <Form.Item
                                    label="Email"
                                    name="email"
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập email' },
                                        { type: 'email', message: 'Email không hợp lệ' },
                                    ]}
                                >
                                    <Input placeholder="Nhập email" />
                                </Form.Item>

                                <Form.Item
                                    label="Tiêu đề"
                                    name="subject"
                                    rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
                                >
                                    <Input placeholder="Nhập tiêu đề" />
                                </Form.Item>

                                <Form.Item
                                    label="Nội dung lời nhắn"
                                    name="content"
                                    rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}
                                >
                                    <TextArea rows={5} placeholder="Nhập nội dung lời nhắn..." />
                                </Form.Item>

                                <Form.Item className="mb-0">
                                    <Button type="primary" htmlType="submit" className="bg-blue-600 hover:!bg-blue-700">
                                        Gửi tin nhắn
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Card>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}

export default Contact;
