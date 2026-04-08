import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Card, Form, Input, InputNumber, message } from 'antd';
import { requestGetAllHistoryBook, requestUpdateStatusBook } from '../../config/request';
import dayjs from 'dayjs';

const LoanRequestManagement = () => {
    const [data, setData] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [detailForm] = Form.useForm();
    const { Search } = Input;

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await requestGetAllHistoryBook();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list.map((item) => ({
                ...item,
                id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
                product: {
                    ...(item?.product || {}),
                    id:
                        item?.product?.id ||
                        item?.product?.mysqlId ||
                        (item?.product?._id ? String(item.product._id) : undefined),
                },
            }));
            setData(normalized);
        } catch (error) {
            message.error('Không thể tải danh sách yêu cầu mượn');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchData();
    }, []);
    const handleUpdateStatus = async (id, status, productId, userId) => {
        try {
            setLoading(true);
            const data = {
                idHistory: id,
                status,
                productId,
                userId,
            };
            await requestUpdateStatusBook(data);
            setSelectedRequest(null);
            detailForm.resetFields();
            fetchData();
        } catch (error) {
            console.log(error);
            message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedRequest) {
            detailForm.resetFields();
            detailForm.setFieldsValue({
                id: '',
                fullName: '',
                bookName: '',
                quantity: undefined,
                borrowDate: '',
                returnDate: '',
                status: '',
            });
            return;
        }
        detailForm.setFieldsValue({
            id: selectedRequest.id || '',
            fullName: selectedRequest.fullName || '',
            bookName: selectedRequest?.product?.nameProduct || '',
            quantity: Number(selectedRequest.quantity || 1),
            borrowDate: selectedRequest.borrowDate ? dayjs(selectedRequest.borrowDate).format('DD/MM/YYYY') : '',
            returnDate: selectedRequest.returnDate ? dayjs(selectedRequest.returnDate).format('DD/MM/YYYY') : '',
            status: selectedRequest.status || '',
        });
    }, [selectedRequest, detailForm]);

    const statusTag = useMemo(() => {
        const status = selectedRequest?.status;
        const color = status === 'pending' ? 'green' : status === 'success' ? 'geekblue' : 'volcano';
        const text = status === 'pending' ? 'Chờ duyệt' : status === 'success' ? 'Đã duyệt' : status ? 'Từ chối' : 'Chưa chọn';
        return <Tag color={status ? color : 'default'}>{text}</Tag>;
    }, [selectedRequest]);

    const columns = [
        { title: 'ID Yêu cầu', dataIndex: 'id', key: 'id', render: (text) => <span>{String(text || '').slice(0, 10)}</span> },
        { title: 'Người mượn', dataIndex: 'fullName', key: 'fullName' },
        {
            title: 'Ảnh',
            dataIndex: 'product',
            key: 'product',
            render: (record) => (
                <img
                    style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                    src={record?.image ? `${import.meta.env.VITE_API_URL_IMAGE}/${record.image}` : '/placeholder-avatar.png'}
                    alt=""
                />
            ),
        },
        { title: 'Tên sách', dataIndex: 'product', key: 'product', render: (record) => record?.nameProduct || '-' },
        { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity' },
        {
            title: 'Ngày mượn',
            dataIndex: 'borrowDate',
            key: 'borrowDate',
            render: (text) => dayjs(text).format('DD/MM/YYYY'),
        },
        {
            title: 'Ngày trả',
            dataIndex: 'returnDate',
            key: 'returnDate',
            render: (text) => dayjs(text).format('DD/MM/YYYY'),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            dataIndex: 'status',
            render: (status) => {
                let color = status === 'pending' ? 'green' : status === 'success' ? 'geekblue' : 'volcano';
                return (
                    <Tag color={color}>
                        {status === 'pending' ? 'Chờ duyệt' : status === 'success' ? 'Đã duyệt' : 'Từ chối'}
                    </Tag>
                );
            },
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (text, record) => (
                <span>
                    {record.status === 'pending' && (
                        <Button
                            onClick={() => handleUpdateStatus(record.id, 'success', record.product?.id, record.userId)}
                            type="primary"
                        >
                            Duyệt
                        </Button>
                    )}
                    {record.status === 'pending' && (
                        <Button
                            onClick={() => handleUpdateStatus(record.id, 'cancel', record.product?.id, record.userId)}
                            type="primary"
                            danger
                        >
                            {' '}
                            Từ chối
                        </Button>
                    )}
                </span>
            ),
        },
    ];

    const filteredData = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return data;
        return data.filter((item) => {
            const id = String(item?.id || '').toLowerCase();
            const borrower = String(item?.fullName || '').toLowerCase();
            const bookName = String(item?.product?.nameProduct || '').toLowerCase();
            const status = String(item?.status || '').toLowerCase();
            return id.includes(q) || borrower.includes(q) || bookName.includes(q) || status.includes(q);
        });
    }, [data, searchText]);

    return (
        <div className="flex flex-col gap-4">
            <Card className="shrink-0 rounded-2xl shadow-sm" bodyStyle={{ padding: 14 }}>
                <div className="flex flex-col gap-4 lg:flex-row">
                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm lg:w-56">
                        {selectedRequest?.product?.image ? (
                            <img
                                src={`${import.meta.env.VITE_API_URL_IMAGE}/${selectedRequest.product.image}`}
                                alt={selectedRequest?.product?.nameProduct || 'book'}
                                className="h-52 w-full rounded-xl object-cover shadow-sm"
                                onError={(e) => {
                                    e.currentTarget.src = '/placeholder-book.png';
                                }}
                            />
                        ) : (
                            <div className="flex h-52 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                                Chưa chọn yêu cầu
                            </div>
                        )}
                    </div>

                    <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-slate-900">Quản lý độc giả mượn</h2>
                                {statusTag}
                            </div>
                            <Search
                                allowClear
                                placeholder="Tìm kiếm tên sách / độc giả / mã yêu cầu..."
                                className="w-full max-w-sm"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </div>

                        <Form form={detailForm} layout="vertical" size="middle">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <Form.Item label="ID yêu cầu" name="id">
                                    <Input disabled className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Người mượn" name="fullName">
                                    <Input disabled className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Tên sách" name="bookName">
                                    <Input disabled className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Số lượng" name="quantity">
                                    <InputNumber disabled className="w-full rounded-xl" min={1} />
                                </Form.Item>
                                <Form.Item label="Ngày mượn" name="borrowDate">
                                    <Input disabled className="rounded-xl" />
                                </Form.Item>
                                <Form.Item label="Ngày trả" name="returnDate">
                                    <Input disabled className="rounded-xl" />
                                </Form.Item>
                            </div>

                            <div className="mt-1 flex flex-wrap gap-2">
                                <Button
                                    type="primary"
                                    className="h-10 rounded-xl shadow-sm"
                                    disabled={!selectedRequest || selectedRequest.status !== 'pending'}
                                    loading={loading}
                                    onClick={() =>
                                        handleUpdateStatus(selectedRequest.id, 'success', selectedRequest.product?.id, selectedRequest.userId)
                                    }
                                >
                                    Duyệt
                                </Button>
                                <Button
                                    danger
                                    className="h-10 rounded-xl shadow-sm"
                                    disabled={!selectedRequest || selectedRequest.status !== 'pending'}
                                    loading={loading}
                                    onClick={() =>
                                        handleUpdateStatus(selectedRequest.id, 'cancel', selectedRequest.product?.id, selectedRequest.userId)
                                    }
                                >
                                    Từ chối
                                </Button>
                                <Button
                                    className="h-10 rounded-xl shadow-sm"
                                    disabled={!selectedRequest}
                                    onClick={() => setSelectedRequest(null)}
                                >
                                    Làm mới
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
            </Card>

            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 12 }}>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey={(record) => record.id || record.userId}
                    loading={loading}
                    className="rounded-xl overflow-hidden"
                    size="middle"
                    scroll={{ x: 1000, y: 420 }}
                    pagination={false}
                    onRow={(record) => ({
                        onClick: () => setSelectedRequest(record),
                    })}
                    rowClassName={(record) => (String(record?.id) === String(selectedRequest?.id) ? 'bg-blue-50' : '')}
                />
            </Card>
        </div>
    );
};

export default LoanRequestManagement;
