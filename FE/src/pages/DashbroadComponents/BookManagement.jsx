import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Table, Button, Input, Modal, Form, InputNumber, Select, Upload, Popconfirm, Typography, Card, Row, Col, message, Tag } from 'antd';
import { UploadOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    requestCreateProduct,
    requestDeleteProduct,
    requestGetAllProduct,
    requestSyncBookCodes,
    requestUpdateProduct,
    requestUploadImageProduct,
} from '../../config/request';

const { Search } = Input;
const { Text } = Typography;

const CATEGORY_FALLBACK = ['Technology', 'Self-Help', "Children's Books", 'Psychology', 'Computing', 'Literature', 'Educational', 'Cookbooks'];

function getBookId(record) {
    if (!record) return '';
    return String(record._id || record.id || record.mysqlId || '').trim();
}

function nextBoCodeFromList(list) {
    let maxNum = 0;
    for (const item of list || []) {
        const s = String(item?.bookCode || '').trim();
        const m = /^BO-(\d+)$/i.exec(s) || /^B(\d+)$/i.exec(s);
        if (!m) continue;
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
    return `BO-${String(maxNum + 1).padStart(3, '0')}`;
}

const BookManagement = () => {
    const [data, setData] = useState([]);
    const [isAddModalVisible, setIsAddModalVisible] = useState(false);
    const [selectedBook, setSelectedBook] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imageUpdating, setImageUpdating] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [addImagePreview, setAddImagePreview] = useState('');
    const [tablePagination, setTablePagination] = useState({
        current: 1,
        pageSize: 10,
    });

    const [addForm] = Form.useForm();
    const [detailForm] = Form.useForm();
    const autoSaveTimerRef = useRef(null);
    const autoSaveInFlightRef = useRef(false);
    const autoSaveHydratingRef = useRef(false);
    const pendingPatchRef = useRef({});

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
                // Luôn ưu tiên Mongo _id để update/delete ổn định
                id: item?._id ? String(item._id) : String(item?.id || item?.mysqlId || ''),
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

    const categoryOptions = useMemo(() => {
        const uniqueCategories = [
            ...new Set(
                data
                    .map((item) => String(item?.category_1 || item?.category || '').trim())
                    .filter(Boolean),
            ),
        ];
        return uniqueCategories.length ? uniqueCategories : CATEGORY_FALLBACK;
    }, [data]);

    useEffect(() => {
        if (!selectedBook) {
            autoSaveHydratingRef.current = true;
            detailForm.resetFields();
            detailForm.setFieldsValue({
                bookCode: '',
                nameProduct: '',
                publisher: '',
                category: undefined,
                stock: undefined,
                description: '',
            });
            pendingPatchRef.current = {};
            setTimeout(() => {
                autoSaveHydratingRef.current = false;
            }, 0);
            return;
        }

        autoSaveHydratingRef.current = true;
        detailForm.setFieldsValue({
            bookCode: selectedBook.bookCode || '',
            nameProduct: selectedBook.nameProduct || '',
            publisher: selectedBook.publisher || '',
            category: selectedBook.category_1 || selectedBook.category || categoryOptions[0],
            stock: Number(selectedBook.stock || 0),
            description: selectedBook.description || '',
        });
        pendingPatchRef.current = {};
        setTimeout(() => {
            autoSaveHydratingRef.current = false;
        }, 0);
    }, [selectedBook, detailForm, categoryOptions]);

    const showAddModal = () => {
        setIsAddModalVisible(true);
        addForm.setFieldsValue({
            category: categoryOptions[0],
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
        const targetId = getBookId(selectedBook);
        if (!targetId) {
            message.warning('Vui lòng chọn một cuốn sách từ bảng để chỉnh sửa');
            return;
        }
        try {
            const values = await detailForm.validateFields();
            setLoading(true);

            const updateData = {
                ...values,
                image: selectedBook.image,
            };
            await requestUpdateProduct(targetId, updateData);
            message.success('Cập nhật sách thành công');
            fetchData();
        } catch (error) {
            if (error?.errorFields) return;
            console.error('Update product error:', error);
            message.error(error?.response?.data?.message || 'Không thể cập nhật sách');
        } finally {
            setLoading(false);
        }
    };

    const applyLocalBookPatch = (targetId, patch) => {
        if (!targetId) return;
        const normalizedPatch = { ...patch };
        if (normalizedPatch.category !== undefined && normalizedPatch.category_1 === undefined) {
            normalizedPatch.category_1 = normalizedPatch.category;
        }
        setSelectedBook((prev) => (prev && String(getBookId(prev)) === String(targetId) ? { ...prev, ...patch } : prev));
        setData((prev) =>
            Array.isArray(prev)
                ? prev.map((item) => (String(getBookId(item)) === String(targetId) ? { ...item, ...normalizedPatch } : item))
                : prev,
        );
    };

    const scheduleAutoSavePatch = (incomingPatch) => {
        const targetId = getBookId(selectedBook);
        if (!targetId) return;

        const patch = { ...incomingPatch };
        // Đồng bộ theo backend: dùng category_1
        if (patch.category !== undefined && patch.category_1 === undefined) {
            patch.category_1 = patch.category;
        }

        pendingPatchRef.current = {
            ...pendingPatchRef.current,
            ...patch,
        };

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(async () => {
            if (autoSaveInFlightRef.current) return;
            const payload = pendingPatchRef.current || {};
            if (!payload || Object.keys(payload).length === 0) return;
            autoSaveInFlightRef.current = true;
            try {
                await requestUpdateProduct(targetId, payload);
                applyLocalBookPatch(targetId, payload);
                pendingPatchRef.current = {};
            } catch (error) {
                message.error(error?.response?.data?.message || 'Không thể tự động lưu thay đổi');
            } finally {
                autoSaveInFlightRef.current = false;
            }
        }, 600);
    };

    const handleDeleteBook = async () => {
        const targetId = getBookId(selectedBook);
        if (!targetId) return;
        try {
            setLoading(true);
            await requestDeleteProduct(targetId);
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
        detailForm.resetFields();
        await fetchData();
        message.success('Đã làm mới dữ liệu');
    };

    const handleSyncBookCodes = async () => {
        try {
            setLoading(true);
            const res = await requestSyncBookCodes();
            const updatedCount = res?.metadata?.updatedCount ?? res?.data?.metadata?.updatedCount;
            message.success(`Đã cấp mã sách cho ${updatedCount ?? 0} sách`);
            await fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể đồng bộ mã sách');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateBookImage = async ({ file, onSuccess, onError }) => {
        const targetId = getBookId(selectedBook);
        if (!targetId) {
            message.warning('Vui lòng chọn một cuốn sách trước khi cập nhật ảnh');
            onError?.(new Error('No selected book'));
            return;
        }

        try {
            setImageUpdating(true);
            const formData = new FormData();
            formData.append('image', file);
            const uploadRes = await requestUploadImageProduct(formData);
            const imageUrl = uploadRes?.metadata;

            await requestUpdateProduct(targetId, { image: imageUrl });
            setSelectedBook((prev) => (prev ? { ...prev, image: imageUrl } : prev));
            setData((prev) =>
                Array.isArray(prev)
                    ? prev.map((item) => (String(getBookId(item)) === String(targetId) ? { ...item, image: imageUrl } : item))
                    : prev,
            );
            message.success('Cập nhật ảnh sách thành công');
            onSuccess?.('ok');
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật ảnh sách');
            onError?.(error);
        } finally {
            setImageUpdating(false);
        }
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
            dataIndex: 'category_1',
            key: 'category_1',
            width: 180,
            render: (value) => {
                const raw = String(value || '').trim();
                if (!raw) return <span className="italic text-gray-400">Chưa phân loại</span>;
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

    const selectedImageSrc = selectedBook?.image
        ? selectedBook.image.startsWith('http')
            ? selectedBook.image
            : `${import.meta.env.VITE_API_URL_IMAGE}/${selectedBook.image}`
        : null;

    return (
        <div className="flex flex-col gap-4 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="primary" icon={<PlusOutlined />} onClick={showAddModal} loading={loading} className="h-10 rounded-xl shadow-sm">
                        Thêm sách mới
                    </Button>
                    <Button onClick={handleSyncBookCodes} loading={loading} className="h-10 rounded-xl shadow-sm">
                        Cấp mã sách (sách cũ)
                    </Button>
                </div>
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
                        <Form
                            form={detailForm}
                            layout="vertical"
                            size="middle"
                            onValuesChange={(changedValues) => {
                                if (!selectedBook) return;
                                if (autoSaveHydratingRef.current) return;
                                scheduleAutoSavePatch(changedValues);
                            }}
                        >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <Form.Item label="Mã sách" name="bookCode">
                                    <Input
                                        disabled={!selectedBook}
                                        placeholder="Ví dụ: B001 hoặc BO-001"
                                        className="rounded-xl"
                                        allowClear
                                    />
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
                                        options={categoryOptions.map((item) => ({ value: item, label: item }))}
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
                                    customRequest={handleUpdateBookImage}
                                    disabled={!selectedBook || imageUpdating}
                                    accept="image/*"
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
                                    label="Ảnh bìa"
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
                                extra="Bấm 'Tạo mã BO-STT' để tự sinh (BO-001, BO-002...). Hoặc nhập tay: B001 / BO-001."
                                rules={[
                                    {
                                        validator: (_, value) => {
                                            const v = String(value || '').trim();
                                            if (!v) return Promise.resolve();
                                            if (!/^B\d+$/i.test(v) && !/^BO-\d+$/i.test(v)) {
                                                return Promise.reject(new Error('Mã sách không hợp lệ'));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <Input
                                    className="rounded-xl"
                                    placeholder="Ví dụ: BO-001"
                                    addonAfter={
                                        <Button
                                            type="link"
                                            className="px-0"
                                            onClick={() => addForm.setFieldsValue({ bookCode: nextBoCodeFromList(data) })}
                                        >
                                            Tạo mã BO-STT
                                        </Button>
                                    }
                                />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item name="category" label="Thể loại" rules={[{ required: true, message: 'Vui lòng chọn thể loại!' }]}>
                                        <Select className="rounded-xl" options={categoryOptions.map((item) => ({ value: item, label: item }))} />
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
