import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Select, message, Popconfirm, Tag } from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    requestCreatePolicy,
    requestDeletePolicy,
    requestGetPolicies,
    requestUpdatePolicy,
    requestRefreshCirculationSample,
} from '../../config/request';

const RENEW_EXT_OPTIONS = [{ value: 7, label: '7 ngày (1 tuần) — theo quy định' }];

const PolicyManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshSampleBusy, setRefreshSampleBusy] = useState(false);
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
            maxCopiesPerTitle: record.maxCopiesPerTitle ?? 2,
            loanDays: record.loanDays,
            renewExtensionDays: record.renewExtensionDays ?? 7,
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
            maxCopiesPerTitle: 2,
            loanDays: 14,
            renewExtensionDays: 7,
            overdueFinePerDay: 1000,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            if (creating) {
                await requestCreatePolicy({ ...values, readerType: 'SinhVien_ChinhQuy' });
                message.success('Đã thêm chính sách');
            } else if (editing?.id) {
                await requestUpdatePolicy(editing.id, {
                    maxBooks: values.maxBooks,
                    maxCopiesPerTitle: values.maxCopiesPerTitle,
                    loanDays: values.loanDays,
                    renewExtensionDays: values.renewExtensionDays,
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

    const handleRefreshSample = async () => {
        try {
            setRefreshSampleBusy(true);
            const res = await requestRefreshCirculationSample();
            message.success(res?.message || 'Đã làm mới dữ liệu mẫu');
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể làm mới dữ liệu mẫu');
        } finally {
            setRefreshSampleBusy(false);
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
            render: () => <Tag color="blue">Sinh viên</Tag>,
        },
        { title: 'Tối đa mượn', dataIndex: 'maxBooks', key: 'maxBooks', width: 120 },
        {
            title: 'Tối đa / đầu sách',
            dataIndex: 'maxCopiesPerTitle',
            key: 'maxCopiesPerTitle',
            width: 130,
            render: (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : '2'),
        },
        { title: 'Số ngày mượn', dataIndex: 'loanDays', key: 'loanDays', width: 130 },
        {
            title: 'Gia hạn mỗi lần',
            dataIndex: 'renewExtensionDays',
            key: 'renewExtensionDays',
            width: 150,
            render: (d) => (d != null && Number.isFinite(Number(d)) ? `${Number(d)} ngày` : '—'),
        },
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
                        <p className="text-sm text-slate-500">
                            Số ngày mượn tối đa, gia hạn 7 ngày mỗi lần (tối đa 1 lần/phiếu), giới hạn ấn phẩm, giới hạn
                            số cuốn cùng một đầu sách, mức phạt quá hạn.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Popconfirm
                            title="Làm mới dữ liệu mẫu quầy?"
                            description="Xóa toàn bộ phiếu mượn và phạt của các MSV seed circulation, trả bản sao về kho. Thao tác không hoàn tác."
                            okText="Làm mới"
                            cancelText="Hủy"
                            onConfirm={handleRefreshSample}
                        >
                            <Button icon={<ReloadOutlined />} loading={refreshSampleBusy}>
                                Làm mới dữ liệu mẫu quầy
                            </Button>
                        </Popconfirm>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Thêm chính sách
                        </Button>
                    </div>
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
                destroyOnHidden
                width={520}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="maxBooks" label="Số ấn phẩm tối đa" rules={[{ required: true }]}>
                        <InputNumber min={1} className="w-full" />
                    </Form.Item>
                    <Form.Item
                        name="maxCopiesPerTitle"
                        label="Tối đa số cuốn cùng một đầu sách (cùng lúc)"
                        rules={[{ required: true }]}
                        extra="Tránh một sinh viên giữ quá nhiều bản cùng tiêu đề, để bạn khác còn mượn được."
                    >
                        <InputNumber min={1} className="w-full" />
                    </Form.Item>
                    <Form.Item name="loanDays" label="Số ngày mượn tối đa" rules={[{ required: true }]}>
                        <InputNumber min={1} max={14} className="w-full" />
                    </Form.Item>
                    <Form.Item
                        name="renewExtensionDays"
                        label="Thời gian gia hạn mỗi lần (cộng từ hạn trả cũ)"
                        rules={[{ required: true }]}
                    >
                        <Select options={RENEW_EXT_OPTIONS} className="w-full" />
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
