import {
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Form,
    Image,
    Input,
    InputNumber,
    Modal,
    Row,
    Space,
    Typography,
} from 'antd';
import { BookOutlined, CalendarOutlined, IdcardOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { requestCreateHistoryBook } from '../config/request';
import { toast } from 'react-toastify';

const { Title, Text } = Typography;

const BORROW_DURATION_MAX_DAYS = 30;

function ModalBorrowBook({ visible, onCancel, bookData }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const { dataUser } = useStore();

    const today = dayjs();
    const minReturnDate = today.add(1, 'day');
    const maxReturnDate = today.add(BORROW_DURATION_MAX_DAYS, 'day');
    const bookImageSrc = bookData?.image?.startsWith('http')
        ? bookData.image
        : `${import.meta.env.VITE_API_URL_IMAGE}/${bookData?.image || ''}`;

    useEffect(() => {
        if (visible && dataUser) {
            form.setFieldsValue({
                quantity: 1,
                fullName: dataUser?.fullName || '',
                address: dataUser?.address || '',
                phoneNumber: dataUser?.phoneNumber || '',
                studentId: dataUser?.idStudent || '',
                returnDate: minReturnDate,
            });
        }
    }, [visible, dataUser, form, minReturnDate]);

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const borrowData = {
                ...values,
                bookId: bookData?.id,
                borrowDate: today.format('YYYY-MM-DD'),
                returnDate: values.returnDate.format('YYYY-MM-DD'),
            };

            try {
                await requestCreateHistoryBook(borrowData);
                toast.success('Đăng ký mượn sách thành công!');
            } catch (error) {
                console.error('Error submitting borrow request:', error);
                toast.error(error.response.data.message);
            }

            form.resetFields();
            onCancel();
        } catch (error) {
            console.error('Error submitting borrow request:', error);
            toast.error('Đăng ký mượn sách thất bại!');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    const validateReturnDate = (_, value) => {
        if (!value) {
            return Promise.reject(new Error('Vui lòng chọn ngày trả!'));
        }
        if (value.isBefore(minReturnDate, 'day')) {
            return Promise.reject(new Error('Ngày trả phải sau ngày mượn ít nhất 1 ngày!'));
        }
        if (value.isAfter(maxReturnDate, 'day')) {
            return Promise.reject(new Error(`Thời gian mượn tối đa ${BORROW_DURATION_MAX_DAYS} ngày!`));
        }
        return Promise.resolve();
    };

    const isSubmitDisabled = !bookData || bookData.stock <= 0 || loading;

    return (
        <Modal
            title={
                <div className="flex items-center space-x-2">
                    <BookOutlined className="text-blue-600" />
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Đăng ký mượn sách
                    </span>
                </div>
            }
            open={visible}
            onCancel={handleCancel}
            footer={null}
            width={800}
            className="borrow-book-modal"
            destroyOnHidden
        >
            <div className="space-y-6">
                {bookData && (
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                        <Title level={4} className="text-gray-800 mb-4">
                            📚 Thông tin sách
                        </Title>
                        <Row gutter={16} align="middle">
                            <Col xs={24} sm={8} className="flex justify-center">
                                <Image
                                    src={bookImageSrc}
                                    alt={bookData.nameProduct}
                                    width={120}
                                    height={160}
                                    className="rounded-lg shadow-md object-cover"
                                    preview={false}
                                    fallback="/placeholder-avatar.png"
                                />
                            </Col>
                            <Col xs={24} sm={16}>
                                <Space direction="vertical" size="small" className="w-full">
                                    <Title level={5} className="text-gray-800 mb-2">
                                        {bookData.nameProduct}
                                    </Title>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        <span>
                                            Nhà xuất bản: <Text strong>{bookData.publisher}</Text>
                                        </span>
                                        <span>
                                            Số trang: <Text strong>{bookData.pages} trang</Text>
                                        </span>
                                        <span>
                                            Năm XB: <Text strong>{bookData.publishYear}</Text>
                                        </span>
                                        <span>
                                            Còn lại:{' '}
                                            <Text strong className="text-green-600">
                                                {bookData.stock} quyển
                                            </Text>
                                        </span>
                                    </div>
                                </Space>
                            </Col>
                        </Row>
                    </Card>
                )}

                <Divider className="my-6" />

                <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                    <Title level={4} className="text-gray-800 mb-4">
                        👤 Thông tin người mượn
                    </Title>
                    <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} preserve={false}>
                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="fullName"
                                    label="Họ và tên"
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập họ và tên!' },
                                        { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự!' },
                                    ]}
                                >
                                    <Input
                                        prefix={<UserOutlined />}
                                        placeholder="Nhập họ và tên đầy đủ"
                                        className="h-10"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="address" label="Địa chỉ">
                                    <Input prefix={<IdcardOutlined />} placeholder="Nhập địa chỉ" className="h-10" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="phoneNumber"
                                    label="Số điện thoại"
                                    rules={[
                                        { required: true, message: 'Vui lòng nhập số điện thoại!' },
                                        {
                                            pattern: /^(0[3|5|7|8|9])+([0-9]{8})$/,
                                            message: 'Số điện thoại không hợp lệ!',
                                        },
                                    ]}
                                >
                                    <Input
                                        prefix={<PhoneOutlined />}
                                        placeholder="Ví dụ: 0987654321"
                                        className="h-10"
                                        maxLength={10}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="quantity"
                                    label="Số lượng"
                                    rules={[{ required: true, message: 'Vui lòng nhập số lượng!' }]}
                                >
                                    <InputNumber
                                        min={1}
                                        max={bookData?.stock}
                                        placeholder="Số lượng"
                                        prefix={<BookOutlined />}
                                        className="h-10"
                                    />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider className="my-4" />

                        <Title level={5} className="text-gray-800 mb-4">
                            📅 Thời gian mượn
                        </Title>

                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item label="Ngày mượn">
                                    <Input
                                        value={today.format('DD/MM/YYYY')}
                                        disabled
                                        className="h-10 bg-gray-100"
                                        prefix={<CalendarOutlined />}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="returnDate"
                                    label="Ngày trả dự kiến"
                                    rules={[{ validator: validateReturnDate }]}
                                >
                                    <DatePicker
                                        className="w-full h-10"
                                        placeholder="Chọn ngày trả"
                                        format="DD/MM/YYYY"
                                        showToday={false}
                                        disabledDate={(current) =>
                                            current &&
                                            (current.isBefore(minReturnDate, 'day') ||
                                                current.isAfter(maxReturnDate, 'day'))
                                        }
                                    />
                                </Form.Item>
                            </Col>
                        </Row>

                        <div className="flex justify-end space-x-3 pt-4">
                            <Button onClick={handleCancel} className="px-6 h-10">
                                Hủy bỏ
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                className="px-6 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 border-none hover:from-blue-600 hover:to-indigo-700"
                                disabled={isSubmitDisabled}
                            >
                                {loading ? 'Đang xử lý...' : '📚 Xác nhận mượn'}
                            </Button>
                        </div>
                    </Form>
                </Card>
            </div>
        </Modal>
    );
}

export default ModalBorrowBook;
