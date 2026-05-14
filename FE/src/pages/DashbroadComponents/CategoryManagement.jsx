import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { requestGetAllProduct, requestBulkRenameBookCategory, requestBulkClearBookCategory } from '../../config/request';

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

/** Thể loại hiển thị trên đầu sách — trùng logic DSS / Quản lý sách: ưu category_1, sau đó category. */
function storedCategoryLabel(book) {
    const c1 = String(book?.category_1 || '').trim();
    if (c1) return c1;
    return String(book?.category || '').trim();
}

const CategoryManagement = () => {
    const [fromBooks, setFromBooks] = useState([]);
    const [extra, setExtra] = useState(() => loadExtra());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
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
                const c = storedCategoryLabel(b);
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
                    if (name === editing) {
                        setModalOpen(false);
                        return;
                    }
                    if (rows.some((r) => r.name === name && r.name !== editing)) {
                        message.warning('Tên mới đã tồn tại trong danh sách — vẫn có thể gộp thể loại nếu bạn cố ý đặt trùng tên một thể loại khác.');
                    }
                    setSaving(true);
                    try {
                        const res = await requestBulkRenameBookCategory({ from: editing, to: name });
                        const n = res?.metadata?.modifiedCount ?? 0;
                        message.success(res?.message || `Đã cập nhật ${n} đầu sách. Biểu đồ DSS dùng cùng dữ liệu — làm mới trang Thống kê để xem.`);
                        setExtra((prev) => {
                            const next = prev.map((x) => (x === editing ? name : x));
                            const dedup = [...new Set(next)];
                            saveExtra(dedup);
                            return dedup;
                        });
                        await fetchBooks();
                    } catch (e) {
                        message.error(e?.response?.data?.message || e?.message || 'Không đổi tên được');
                        return;
                    } finally {
                        setSaving(false);
                    }
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

    const handleDelete = (rowName, inUseOnBook) => {
        if (inUseOnBook) {
            Modal.confirm({
                title: 'Gỡ thể loại khỏi mọi đầu sách?',
                content: (
                    <div className="space-y-2 text-sm">
                        <p>
                            Thể loại <strong>{rowName}</strong> sẽ được xóa khỏi trường <code>category</code> /{' '}
                            <code>category_1</code> trên tất cả đầu sách đang gán.
                        </p>
                        <p className="text-amber-700">
                            Biểu đồ DSS nhóm theo dữ liệu đầu sách — sau thao tác này các cuốn đó sẽ rơi vào nhóm phụ (ngôn
                            ngữ / NXB / «Không phân loại») cho đến khi bạn gán thể loại mới ở màn Đầu sách.
                        </p>
                    </div>
                ),
                okText: 'Gỡ khỏi đầu sách',
                cancelText: 'Hủy',
                okButtonProps: { danger: true },
                onOk: async () => {
                    try {
                        setLoading(true);
                        const res = await requestBulkClearBookCategory({ name: rowName });
                        message.success(res?.message || 'Đã gỡ thể loại');
                        await fetchBooks();
                    } catch (e) {
                        message.error(e?.response?.data?.message || e?.message || 'Không gỡ được');
                        throw e;
                    } finally {
                        setLoading(false);
                    }
                },
            });
            return;
        }
        Modal.confirm({
            title: 'Xóa thể loại khỏi danh mục gợi ý?',
            content: rowName,
            okText: 'Xóa',
            cancelText: 'Hủy',
            okButtonProps: { danger: true },
            onOk: () => {
                setExtra((prev) => {
                    const next = prev.filter((x) => x !== rowName);
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
            width: 200,
            render: (_, r) => (r.inUseOnBook ? <Tag color="blue">Đang có trên đầu sách</Tag> : <Tag>Gợi ý (chưa dùng)</Tag>),
        },
        {
            title: 'Thao tác',
            key: 'act',
            width: 220,
            render: (_, r) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r.name)}>
                        Đổi tên
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.name, r.inUseOnBook)}>
                        {r.inUseOnBook ? 'Gỡ khỏi sách' : 'Xóa'}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl shadow-sm" styles={{ body: { padding: 16 } }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Quản lý thể loại sách</h2>
                        <p className="mb-0 text-sm text-slate-500">
                            <strong>Đầu sách &amp; DSS</strong> dùng cùng nguồn: trường <code>category_1</code> (ưu tiên), sau
                            đó <code>category</code> — khi sửa một đầu sách, hệ thống đồng bộ hai trường. Đổi tên thể loại
                            tại đây sẽ cập nhật <strong>tất cả</strong> đầu sách đang gán tên đó; biểu đồ thể loại DSS đọc
                            lại từ MongoDB khi bạn làm mới trang Thống kê.
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
                title={
                    editing
                        ? fromBooks.includes(editing)
                            ? 'Đổi tên thể loại (cập nhật mọi đầu sách)'
                            : 'Đổi tên thể loại (gợi ý)'
                        : 'Thêm thể loại'
                }
                open={modalOpen}
                onOk={handleModalOk}
                onCancel={() => setModalOpen(false)}
                confirmLoading={saving}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Tên thể loại" rules={[{ required: true, message: 'Nhập tên' }]}>
                        <Input className="rounded-xl" placeholder="Ví dụ: Công nghệ thông tin" />
                    </Form.Item>
                    {editing && fromBooks.includes(editing) && (
                        <p className="mb-0 text-xs text-slate-500">
                            Mọi đầu sách đang hiển thị thể loại «{editing}» sẽ được đổi sang tên mới; biểu đồ DSS sẽ phản
                            ánh sau khi tải lại dữ liệu thống kê.
                        </p>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default CategoryManagement;
