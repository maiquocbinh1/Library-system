import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Select, message, Popconfirm, Tag } from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { requestCreatePolicy, requestDeletePolicy, requestGetPolicies, requestUpdatePolicy } from '../../config/request';

const READER_OPTIONS = [
    { value: 'SinhVien_ChinhQuy', label: 'Sinh viên chính quy' },
    { value: 'GiangVien_CanBo', label: 'Giảng viên / Cán bộ' },
    { value: 'HocVien_NCS', label: 'Học viên / NCS' },
];

const PolicyManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetPolicies();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setData(list);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể tải chính sách');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openEdit = (record) => {
        setEditing(record);
        setCreating(false);
        form.setFieldsValue({
            readerType: record.readerType,
            maxBooks: record.maxBooks,
            loanDays: record.loanDays,
            overdueFinePerDay: record.overdueFinePerDay ?? 1000,
        });
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditing(null);
        setCreating(true);
        form.resetFields();
        form.setFieldsValue({
            readerType: undefined,
            maxBooks: 3,
            loanDays: 30,
            overdueFinePerDay: 1000,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            if (creating) {
                await requestCreatePolicy(values);
                message.success('Đã thêm chính sách');
            } else if (editing?.id) {
                await requestUpdatePolicy(editing.id, {
                    maxBooks: values.maxBooks,
                    loanDays: values.loanDays,
                    overdueFinePerDay: values.overdueFinePerDay,
                    readerType: values.readerType,
                });
                message.success('Đã cập nhật chính sách');
            }
            setModalOpen(false);
            await fetchData();
        } catch (e) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.message || 'Thao tác thất bại');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (record) => {
        try {
            setLoading(true);
            await requestDeletePolicy(record.id);
            message.success('Đã xóa chính sách');
            await fetchData();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể xóa');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'Đối tượng',
            dataIndex: 'readerType',
            key: 'readerType',
            render: (v) => <Tag color="blue">{READER_OPTIONS.find((o) => o.value === v)?.label || v}</Tag>,
        },
        { title: 'Tối đa mượn', dataIndex: 'maxBooks', key: 'maxBooks', width: 120 },
        { title: 'Số ngày mượn', dataIndex: 'loanDays', key: 'loanDays', width: 130 },
        {
            title: 'Phạt (VNĐ/ngày/cuốn)',
            dataIndex: 'overdueFinePerDay',
            key: 'overdueFinePerDay',
            width: 200,
            render: (v) => Number(v ?? 0).toLocaleString('vi-VN'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 160,
            render: (_, record) => (
                <>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Sửa
                    </Button>
                    <Popconfirm title="Xóa chính sách này?" onConfirm={() => handleDelete(record)}>
                        <Button type="link" danger icon={<DeleteOutlined />}>
                            Xóa
                        </Button>
                    </Popconfirm>
                </>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-xl border-slate-200 shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Cấu hình chính sách mượn</h2>
                        <p className="text-sm text-slate-500">Theo loại bạn đọc (PTIT): số ngày mượn, giới hạn ấn phẩm, mức phạt quá hạn.</p>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        Thêm chính sách
                    </Button>
                </div>
                <Table
                    rowKey={(r) => r.id || r._id}
                    columns={columns}
                    dataSource={data}
                    loading={loading}
                    pagination={false}
                    size="middle"
                />
            </Card>

            <Modal
                title={creating ? 'Thêm chính sách' : 'Sửa chính sách'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={loading}
                okText="Lưu"
                destroyOnClose
                width={520}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="readerType"
                        label="Loại bạn đọc"
                        rules={[{ required: true, message: 'Chọn loại' }]}
                    >
                        <Select options={READER_OPTIONS} disabled={!creating} className="rounded-lg" />
                    </Form.Item>
                    <Form.Item name="maxBooks" label="Số ấn phẩm tối đa" rules={[{ required: true }]}>
                        <InputNumber min={1} className="w-full" />
                    </Form.Item>
                    <Form.Item name="loanDays" label="Số ngày mượn" rules={[{ required: true }]}>
                        <InputNumber min={1} className="w-full" />
                    </Form.Item>
                    <Form.Item name="overdueFinePerDay" label="Phạt quá hạn (VNĐ / ngày / cuốn)" rules={[{ required: true }]}>
                        <InputNumber min={0} className="w-full" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PolicyManagement;
