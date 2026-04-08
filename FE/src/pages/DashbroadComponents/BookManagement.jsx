import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Input, Modal, Form, InputNumber, Select, Upload, Popconfirm, Typography, Card, Row, Col, message, Tag } from 'antd';
import { UploadOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    requestCreateProduct,
    requestDeleteProduct,
    requestGetAllProduct,
    requestUpdateProduct,
    requestUploadImageProduct,
} from '../../config/request';

const { Search } = Input;
const { Text } = Typography;

const STANDARD_CATEGORIES = [
    'Công nghệ thông tin (CNTT / IT)',
    'Kinh tế – Kinh doanh',
    'Giáo dục – Học tập',
    'Văn học – Tiểu thuyết',
    'Kỹ năng sống',
    'Thiếu nhi',
    'Ngoại ngữ',
    'Khoa học – Tự nhiên',
    'Lịch sử – Địa lý',
    'Tâm lý – Phát triển bản thân',
];

const BookManagement = () => {
    const [data, setData] = useState([]);
    const [isAddModalVisible, setIsAddModalVisible] = useState(false);
    const [selectedBook, setSelectedBook] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imageUpdating, setImageUpdating] = useState(false);
    const [pendingImageFile, setPendingImageFile] = useState(null);
    const [pendingImagePreview, setPendingImagePreview] = useState('');
    const [searchText, setSearchText] = useState('');
    const [addImagePreview, setAddImagePreview] = useState('');
    const [tablePagination, setTablePagination] = useState({
        current: 1,
        pageSize: 10,
    });

    const [addForm] = Form.useForm();
    const [detailForm] = Form.useForm();

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await requestGetAllProduct();
            const list =
                (Array.isArray(res?.metadata) && res.metadata) ||
                (Array.isArray(res?.metadata?.products) && res.metadata.products) ||
                (Array.isArray(res?.data?.metadata) && res.data.metadata) ||
                [];
            const normalized = list.map((item) => ({
                ...item,
                id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
            }));
            // Mở tab Console trên trình duyệt và kiểm tra normalized.length.
            // Nếu length = 158 thì Ant Design Table sẽ tự động phân trang toàn bộ dữ liệu.
            console.log('BookManagement products:', normalized);
            setData(normalized);
        } catch (error) {
            console.error('Failed to fetch books:', error);
            message.error('Không thể tải dữ liệu sách');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!selectedBook) {
            detailForm.resetFields();
            detailForm.setFieldsValue({
                bookCode: '',
                nameProduct: '',
                publisher: '',
                category: undefined,
                stock: undefined,
                description: '',
            });
            setPendingImageFile(null);
            setPendingImagePreview('');
            return;
        }

        const cleanedRecord = {
            bookCode: selectedBook.bookCode || '',
            nameProduct: selectedBook.nameProduct || '',
            publisher: selectedBook.publisher || '',
            category: selectedBook.category ? String(selectedBook.category).trim() : STANDARD_CATEGORIES[0],
            stock: Number(selectedBook.stock || 0),
            description: selectedBook.description || '',
        };
        detailForm.setFieldsValue(cleanedRecord);
        setPendingImageFile(null);
        setPendingImagePreview('');
    }, [selectedBook, detailForm]);

    const showAddModal = () => {
        setIsAddModalVisible(true);
        addForm.setFieldsValue({
            category: STANDARD_CATEGORIES[0],
            covertType: 'soft',
            language: 'vi',
        });
    };

    const handleAddOk = () => {
        addForm.submit();
    };

    const handleAddCancel = () => {
        setIsAddModalVisible(false);
        setAddImagePreview('');
        addForm.resetFields();
    };

    const onAddFinish = async (values) => {
        try {
            setLoading(true);

            if (!values.image?.fileList || values.image.fileList.length === 0) {
                message.error('Vui lòng chọn ảnh bìa');
                return;
            }

            const formData = new FormData();
            formData.append('image', values.image.fileList[0].originFileObj);

            const urlImage = await requestUploadImageProduct(formData);
            const createData = {
                ...values,
                image: urlImage.metadata,
            };
            if (String(values.bookCode || '').trim()) {
                createData.bookCode = String(values.bookCode || '').trim();
            }

            await requestCreateProduct(createData);
            message.success('Thêm sách thành công');
            handleAddCancel();
            fetchData();
        } catch (error) {
            console.error('Add product error:', error);
            message.error(error?.response?.data?.message || 'Không thể thêm sách');
        } finally {
            setLoading(false);
        }
    };

    const onUpdateFromDetail = async () => {
        if (!selectedBook?.id) {
            message.warning('Vui lòng chọn một cuốn sách từ bảng để chỉnh sửa');
            return;
        }
        try {
            const values = await detailForm.validateFields();
            setLoading(true);

            let nextImage = selectedBook.image;
            if (pendingImageFile) {
                setImageUpdating(true);
                const formData = new FormData();
                formData.append('image', pendingImageFile);
                const uploadRes = await requestUploadImageProduct(formData);
                nextImage = uploadRes?.metadata || nextImage;
            }

            const updateData = {
                ...values,
                image: nextImage,
            };
            await requestUpdateProduct(selectedBook.id, updateData);
            message.success('Cập nhật sách thành công');
            setPendingImageFile(null);
            setPendingImagePreview('');
            fetchData();
        } catch (error) {
            if (error?.errorFields) return;
            console.error('Update product error:', error);
            message.error(error?.response?.data?.message || 'Không thể cập nhật sách');
        } finally {
            setLoading(false);
            setImageUpdating(false);
        }
    };

    const handleDeleteBook = async () => {
        if (!selectedBook?.id) return;
        try {
            setLoading(true);
            await requestDeleteProduct(selectedBook.id);
            message.success('Xóa sách thành công');
            setSelectedBook(null);
            detailForm.resetFields();
            fetchData();
        } catch (error) {
            console.error('Delete product error:', error);
            message.error(error?.response?.data?.message || 'Không thể xóa sách');
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshView = async () => {
        setSelectedBook(null);
        setSearchText('');
        setPendingImageFile(null);
        setPendingImagePreview('');
        detailForm.resetFields();
        await fetchData();
        message.success('Đã làm mới dữ liệu');
    };

    // Chỉ preview ảnh; chỉ upload khi bấm "Lưu thay đổi"
    const handlePickPendingImage = ({ fileList }) => {
        const file = fileList?.[0]?.originFileObj;
        if (!file) {
            setPendingImageFile(null);
            setPendingImagePreview('');
            return;
        }
        setPendingImageFile(file);
        setPendingImagePreview(URL.createObjectURL(file));
    };

    const filteredData = useMemo(() => {
        if (!searchText.trim()) return data;
        const keyword = searchText.trim().toLowerCase();
        return data.filter((item) => {
            const code = String(item?.bookCode || '').toLowerCase();
            const bookName = String(item?.nameProduct || '').toLowerCase();
            const author = String(item?.publisher || '').toLowerCase();
            return code.includes(keyword) || bookName.includes(keyword) || author.includes(keyword);
        });
    }, [data, searchText]);

    useEffect(() => {
        setTablePagination((prev) => ({
            ...prev,
            current: 1,
        }));
    }, [searchText]);

    const columns = [
        {
            title: 'STT',
            key: 'index',
            width: 70,
            align: 'center',
            render: (_, __, index) => {
                const current = Number(tablePagination.current || 1);
                const pageSize = Number(tablePagination.pageSize || 10);
                return (current - 1) * pageSize + index + 1;
            },
        },
        {
            title: 'Mã sách',
            dataIndex: 'bookCode',
            key: 'bookCode',
            width: 130,
            render: (text) =>
                text ? (
                    <span className="font-semibold text-blue-600">{text}</span>
                ) : (
                    <span className="italic text-gray-400">Chưa cấp mã</span>
                ),
        },
        {
            title: 'Tên sách',
            dataIndex: 'nameProduct',
            key: 'nameProduct',
            ellipsis: true,
            width: 250,
            render: (text) => (
                <Text strong ellipsis={{ tooltip: text }}>
                    {text || '-'}
                </Text>
            ),
        },
        {
            title: 'Tác giả',
            dataIndex: 'publisher',
            key: 'publisher',
            ellipsis: true,
            width: 180,
        },
        {
            title: 'Thể loại',
            dataIndex: 'category',
            key: 'category',
            ellipsis: true,
            width: 180,
            render: (value) => {
                const raw = String(value || '').trim();
                if (!raw) return <span className="text-slate-400">-</span>;

                return (
                    <Tag color="blue" className="max-w-full truncate">
                        {raw}
                    </Tag>
                );
            },
        },
        {
            title: 'Tồn kho',
            dataIndex: 'stock',
            key: 'stock',
            width: 120,
            align: 'center',
            render: (stock) => {
                const value = Number(stock || 0);
                return value < 5 ? <Text className="font-semibold text-red-500">{value}</Text> : <Text className="font-semibold text-slate-700">{value}</Text>;
            },
        },
    ];

    const selectedImageSrc = pendingImagePreview
        ? pendingImagePreview
        : selectedBook?.image
          ? selectedBook.image.startsWith('http')
              ? selectedBook.image
              : `${import.meta.env.VITE_API_URL_IMAGE}/${selectedBook.image}`
          : null;

    return (
        <div className="flex flex-col gap-4 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="primary" icon={<PlusOutlined />} onClick={showAddModal} loading={loading} className="h-10 rounded-xl shadow-sm">
                    Thêm sách mới
                </Button>
                <Search
                    allowClear
                    placeholder="Tìm kiếm tên sách / tác giả / mã sách..."
                    className="w-full max-w-sm"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>

            <Card className="shrink-0 rounded-2xl shadow-sm" bodyStyle={{ padding: 14 }}>
                <div className="flex flex-col gap-4 lg:flex-row">
                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm lg:w-56">
                        {selectedImageSrc ? (
                            <img
                                src={selectedImageSrc}
                                alt={selectedBook?.nameProduct || 'book cover'}
                                className="h-52 w-full rounded-xl object-cover shadow-sm"
                                onError={(e) => {
                                    e.currentTarget.src = '/placeholder-book.png';
                                }}
                            />
                        ) : (
                            <div className="flex h-52 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                                Chưa chọn sách
                            </div>
                        )}
                    </div>

                    <div className="flex-1">
                        <Form form={detailForm} layout="vertical" size="middle">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <Form.Item label="Mã sách" name="bookCode">
                                    <Input disabled placeholder="Chưa cấp mã" className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Tên sách" name="nameProduct" rules={[{ required: true, message: 'Vui lòng nhập tên sách!' }]}>
                                    <Input disabled={!selectedBook} className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Tác giả" name="publisher" rules={[{ required: true, message: 'Vui lòng nhập tác giả!' }]}>
                                    <Input disabled={!selectedBook} className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Thể loại" name="category" rules={[{ required: true, message: 'Vui lòng chọn thể loại!' }]}>
                                    <Select
                                        placeholder="Chọn thể loại"
                                        disabled={!selectedBook}
                                        className="rounded-xl"
                                        options={STANDARD_CATEGORIES.map((item) => ({ value: item, label: item }))}
                                    />
                                </Form.Item>
                                <Form.Item label="Số lượng tồn kho" name="stock" rules={[{ required: true, message: 'Vui lòng nhập số lượng tồn kho!' }]}>
                                    <InputNumber className="w-full rounded-xl" min={0} disabled={!selectedBook} />
                                </Form.Item>
                            </div>
                            <Form.Item label="Mô tả" name="description">
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 3 }} disabled={!selectedBook} className="rounded-xl" />
                            </Form.Item>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    icon={<SaveOutlined />}
                                    type="primary"
                                    className="h-10 rounded-xl bg-blue-600 shadow-sm"
                                    onClick={onUpdateFromDetail}
                                    loading={loading}
                                    disabled={!selectedBook}
                                >
                                    Lưu thay đổi
                                </Button>
                                <Upload
                                    showUploadList={false}
                                    beforeUpload={() => false}
                                    disabled={!selectedBook || imageUpdating}
                                    accept="image/*"
                                    maxCount={1}
                                    onChange={handlePickPendingImage}
                                >
                                    <Button className="h-10 rounded-xl shadow-sm" loading={imageUpdating} disabled={!selectedBook}>
                                        <span className="inline-flex items-center justify-center gap-2">
                                            <UploadOutlined />
                                            <span>Sửa ảnh</span>
                                        </span>
                                    </Button>
                                </Upload>
                                <Button icon={<ReloadOutlined />} onClick={handleRefreshView} loading={loading} className="h-10 rounded-xl shadow-sm">
                                    Làm mới
                                </Button>
                                <Popconfirm
                                    title="Xóa sách"
                                    description={`Bạn có chắc muốn xóa "${selectedBook?.nameProduct}"?`}
                                    okText="Xóa"
                                    cancelText="Hủy"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={handleDeleteBook}
                                    disabled={!selectedBook}
                                >
                                    <Button danger icon={<DeleteOutlined />} disabled={!selectedBook} loading={loading} className="h-10 rounded-xl shadow-sm">
                                        Xóa
                                    </Button>
                                </Popconfirm>
                            </div>
                        </Form>
                    </div>
                </div>
            </Card>

            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 12 }}>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey={(record) => record._id || record.mysqlId || record.id || record.nameProduct}
                    loading={loading}
                    className="rounded-xl overflow-hidden"
                    size="middle"
                    scroll={{ x: 1000, y: 280 }}
                    onRow={(record) => ({
                        onClick: () => setSelectedBook(record),
                    })}
                    rowClassName={(record) => (String(record?.id) === String(selectedBook?.id) ? 'bg-blue-50' : '')}
                    onChange={(pagination) => {
                        setTablePagination({
                            current: pagination?.current || 1,
                            pageSize: pagination?.pageSize || 10,
                        });
                    }}
                    pagination={{
                        current: tablePagination.current,
                        pageSize: tablePagination.pageSize,
                        defaultPageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        position: ['bottomCenter'],
                        hideOnSinglePage: false,
                        showTotal: (total, range) => `Hiển thị ${range[0]}-${range[1]} của ${total} sách`,
                    }}
                />
            </Card>

            <Modal
                title="Thêm sách mới"
                open={isAddModalVisible}
                onOk={handleAddOk}
                onCancel={handleAddCancel}
                okText="Thêm"
                cancelText="Hủy"
                width={980}
                confirmLoading={loading}
                rootClassName="book-add-modal"
            >
                <Form form={addForm} layout="vertical" onFinish={onAddFinish}>
                    <Row gutter={24}>
                        <Col xs={24} md={8}>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                                <div className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-white">
                                    {addImagePreview ? (
                                        <img src={addImagePreview} alt="preview" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-slate-400">Chưa chọn ảnh</div>
                                    )}
                                </div>
                                <Form.Item
                                    className="mt-3 mb-0 [&_.ant-form-item-control-input-content]:flex [&_.ant-form-item-control-input-content]:justify-center"
                                    name="image"
                                    rules={[{ required: true, message: 'Vui lòng tải lên ảnh bìa!' }]}
                                >
                                    <Upload
                                        name="image"
                                        beforeUpload={() => false}
                                        maxCount={1}
                                        showUploadList={false}
                                        className="flex justify-center"
                                        onChange={({ fileList }) => {
                                            const file = fileList?.[0]?.originFileObj;
                                            setAddImagePreview(file ? URL.createObjectURL(file) : '');
                                        }}
                                    >
                                        <Button icon={<UploadOutlined />} className="h-10 rounded-xl shadow-sm">
                                            Chọn ảnh bìa
                                        </Button>
                                    </Upload>
                                </Form.Item>
                            </div>
                        </Col>

                        <Col xs={24} md={16}>
                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="nameProduct" label="Tên sách" rules={[{ required: true, message: 'Vui lòng nhập tên sách!' }]}>
                                        <Input className="rounded-xl" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="publisher" label="Tác giả" rules={[{ required: true, message: 'Vui lòng nhập tác giả!' }]}>
                                        <Input className="rounded-xl" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                name="bookCode"
                                label="Mã sách"
                                extra="Để trống để hệ thống tự cấp mã (B001, B002...). Nếu nhập tay: định dạng B + số (ví dụ B001)."
                                rules={[
                                    {
                                        validator: (_, value) => {
                                            const v = String(value || '').trim();
                                            if (!v) return Promise.resolve();
                                            if (!/^B\d+$/i.test(v)) {
                                                return Promise.reject(new Error('Mã sách không hợp lệ'));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <Input className="rounded-xl" placeholder="Ví dụ: B042" allowClear />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="category" label="Thể loại" rules={[{ required: true, message: 'Vui lòng chọn thể loại!' }]}>
                                        <Select className="rounded-xl" options={STANDARD_CATEGORIES.map((item) => ({ value: item, label: item }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="stock" label="Số lượng tồn kho" rules={[{ required: true, message: 'Vui lòng nhập số lượng!' }]}>
                                        <InputNumber className="w-full rounded-xl" min={0} />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="publishYear" label="Năm xuất bản" rules={[{ required: true, message: 'Vui lòng nhập năm xuất bản!' }]}>
                                        <InputNumber className="w-full rounded-xl" min={1900} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item name="pages" label="Số trang" rules={[{ required: true, message: 'Vui lòng nhập số trang!' }]}>
                                        <InputNumber className="w-full rounded-xl" min={1} />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="language" label="Ngôn ngữ" rules={[{ required: true, message: 'Vui lòng nhập ngôn ngữ!' }]}>
                                        <Input className="rounded-xl" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="publishingCompany"
                                        label="Nhà xuất bản / Công ty phát hành"
                                        rules={[{ required: true, message: 'Vui lòng nhập nhà xuất bản!' }]}
                                    >
                                        <Input className="rounded-xl" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item name="covertType" label="Loại bìa" rules={[{ required: true, message: 'Vui lòng chọn loại bìa!' }]}>
                                <Select
                                    className="rounded-xl"
                                    options={[
                                        { value: 'hard', label: 'Bìa cứng' },
                                        { value: 'soft', label: 'Bìa mềm' },
                                    ]}
                                />
                            </Form.Item>

                            <Form.Item name="description" label="Mô tả" rules={[{ required: true, message: 'Vui lòng nhập mô tả!' }]}>
                                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} className="rounded-xl" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <style>{`
                .book-add-modal .ant-modal-content {
                    border-radius: 18px;
                    box-shadow: 0 10px 35px rgba(15, 23, 42, 0.12);
                }
                .book-add-modal .ant-modal-header {
                    border-radius: 18px 18px 0 0;
                }
            `}</style>
        </div>
    );
};

export default BookManagement;
