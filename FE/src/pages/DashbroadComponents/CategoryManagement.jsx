import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { requestGetAllProduct } from '../../config/request';

const STORAGE_KEY = 'lib_admin_category_extra';

function loadExtra() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveExtra(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const CategoryManagement = () => {
    const [fromBooks, setFromBooks] = useState([]);
    const [extra, setExtra] = useState(() => loadExtra());
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const fetchBooks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetAllProduct();
            const list =
                (Array.isArray(res?.metadata) && res.metadata) ||
                (Array.isArray(res?.metadata?.products) && res.metadata.products) ||
                [];
            const cats = new Set();
            for (const b of list) {
                const c = String(b?.category_1 || b?.category || '').trim();
                if (c) cats.add(c);
            }
            setFromBooks([...cats].sort((a, b) => a.localeCompare(b, 'vi')));
        } catch {
            message.error('Không tải được danh mục từ đầu sách');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks]);

    const rows = useMemo(() => {
        const merged = new Set([...fromBooks, ...extra]);
        return [...merged].sort((a, b) => a.localeCompare(b, 'vi')).map((name) => ({
            key: name,
            name,
            inUseOnBook: fromBooks.includes(name),
        }));
    }, [fromBooks, extra]);

    const openAdd = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (name) => {
        setEditing(name);
        form.setFieldsValue({ name });
        setModalOpen(true);
    };

    const handleModalOk = async () => {
        try {
            const v = await form.validateFields();
            const name = String(v.name || '').trim();
            if (!name) return;

            if (editing) {
                if (fromBooks.includes(editing)) {
                    message.info('Thể loại đang gán trên sách — đổi tên tại form từng đầu sách (màn Đầu sách).');
                    setModalOpen(false);
                    return;
                }
                if (rows.some((r) => r.name === name && r.name !== editing)) {
                    message.warning('Tên thể loại đã tồn tại');
                    return;
                }
                setExtra((prev) => {
                    const next = prev.map((x) => (x === editing ? name : x));
                    saveExtra(next);
                    return next;
                });
            } else if (rows.some((r) => r.name === name)) {
                message.warning('Thể loại đã có trong danh sách');
                return;
            } else {
                setExtra((prev) => {
                    const next = [...prev, name];
                    saveExtra(next);
                    return next;
                });
            }
            setModalOpen(false);
            message.success('Đã lưu');
        } catch {
            /* validate */
        }
    };

    const handleDelete = (name, inUseOnBook) => {
        if (inUseOnBook) {
            message.warning('Đang dùng trên đầu sách — không xóa được.');
            return;
        }
        Modal.confirm({
            title: 'Xóa thể loại khỏi danh mục gợi ý?',
            content: name,
            okText: 'Xóa',
            cancelText: 'Hủy',
            okButtonProps: { danger: true },
            onOk: () => {
                setExtra((prev) => {
                    const next = prev.filter((x) => x !== name);
                    saveExtra(next);
                    return next;
                });
                message.success('Đã xóa');
            },
        });
    };

    const columns = [
        { title: 'Tên thể loại', dataIndex: 'name', key: 'name' },
        {
            title: 'Trạng thái',
            key: 'st',
            width: 180,
            render: (_, r) => (r.inUseOnBook ? <Tag color="blue">Đang có trên đầu sách</Tag> : <Tag>Gợi ý (chưa dùng)</Tag>),
        },
        {
            title: 'Thao tác',
            key: 'act',
            width: 200,
            render: (_, r) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r.name)} disabled={r.inUseOnBook}>
                        Đổi tên
                    </Button>
                    <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={r.inUseOnBook}
                        onClick={() => handleDelete(r.name, r.inUseOnBook)}
                    >
                        Xóa
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Quản lý thể loại sách</h2>
                        <p className="mb-0 text-sm text-slate-500">
                            Chuẩn hóa đầu vào: danh sách gộp thể loại đang dùng trên đầu sách và mục gợi ý thêm (lưu trên trình duyệt này).
                        </p>
                    </div>
                    <Space>
                        <Button onClick={fetchBooks} loading={loading}>
                            Làm mới
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} className="rounded-xl" onClick={openAdd}>
                            Thêm thể loại
                        </Button>
                    </Space>
                </div>
                <Table rowKey="key" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 12 }} />
            </Card>

            <Modal
                title={editing ? 'Đổi tên thể loại (gợi ý)' : 'Thêm thể loại'}
                open={modalOpen}
                onOk={handleModalOk}
                onCancel={() => setModalOpen(false)}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Tên thể loại" rules={[{ required: true, message: 'Nhập tên' }]}>
                        <Input className="rounded-xl" placeholder="Ví dụ: Công nghệ thông tin" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CategoryManagement;
