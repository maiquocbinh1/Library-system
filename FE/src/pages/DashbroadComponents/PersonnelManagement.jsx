import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Avatar,
    Button,
    Card,
    Col,
    Empty,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Spin,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    requestCreateStaffUser,
    requestGetStaffAuditLogs,
    requestGetStaffList,
    requestUpdateStaffUser,
} from '../../config/request';

const { Title, Text } = Typography;

const STAFF_PALETTES = [
    { bg: '#e0f2fe', color: '#0369a1' },
    { bg: '#dcfce7', color: '#166534' },
    { bg: '#ffedd5', color: '#c2410c' },
    { bg: '#fee2e2', color: '#b91c1c' },
];

/** Nhãn hiển thị cho mã action audit (backend + bổ sung nghiệp vụ). */
const AUDIT_ACTION_LABELS = {
    FINE_PAID: 'Xác nhận thu tiền phạt',
    USER_DELETED: 'Xóa tài khoản người dùng',
    USER_UPDATED: 'Cập nhật hồ sơ người dùng',
    USER_PASSWORD_RESET_BY_ADMIN: 'Đặt lại mật khẩu (admin)',
    PATRON_CARD_LOCK: 'Khóa / mở khóa thẻ độc giả',
    BOOK_COPY_DELETED: 'Xóa bản sao sách',
    STAFF_CREATED: 'Tạo tài khoản nhân sự',
    STAFF_UPDATED: 'Cập nhật tài khoản nhân sự',
    STAFF_DELETED: 'Xóa tài khoản nhân sự',
    LOAN_TICKET_CREATED: 'Lập phiếu mượn',
    INVENTORY_ADJUST: 'Điều chỉnh tồn kho / kiểm kê',
    RETURN_BATCH: 'Xác nhận trả sách (nhiều mã)',
    BOOK_RECEIVED: 'Tiếp nhận sách nhập kho',
};

function roleTitle(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'admin') return 'Quản trị viên';
    if (r === 'warehouse') return 'Nhân viên kho';
    if (r === 'librarian') return 'Thủ thư';
    return 'Nhân sự';
}

function roleTagStyle(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'admin') return { background: '#f3e8ff', color: '#6b21a8', label: 'Admin' };
    if (r === 'warehouse') return { background: '#ffedd5', color: '#c2410c', label: 'Kho' };
    return { background: '#dcfce7', color: '#166534', label: 'Thủ thư' };
}

function initialsFromName(name) {
    const p = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return `${p[0][0] || ''}${p[p.length - 1][0] || ''}`.toUpperCase();
}

function formatAuditRow(row) {
    const code = String(row?.action || '');
    const label = AUDIT_ACTION_LABELS[code] || code || '—';
    const tid = row?.targetId ? String(row.targetId).slice(0, 14) : '';
    const tt = row?.targetType ? String(row.targetType) : '';
    if (tid || tt) {
        return `${label}${tt ? ` · ${tt}` : ''}${tid ? ` · ${tid}${String(row.targetId).length > 14 ? '…' : ''}` : ''}`;
    }
    return label;
}

const PersonnelManagement = () => {
    const [loading, setLoading] = useState(true);
    const [staffList, setStaffList] = useState([]);
    const [auditRows, setAuditRows] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    const [auditPagination, setAuditPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });

    const fetchLists = useCallback(async (page, pageSize) => {
        setLoading(true);
        setLoadError(null);
        try {
            const [staffRes, auditRes] = await Promise.all([
                requestGetStaffList(),
                requestGetStaffAuditLogs({ page, limit: pageSize }),
            ]);
            const staffMeta = Array.isArray(staffRes?.metadata) ? staffRes.metadata : [];
            const auditMeta = auditRes?.metadata;
            const auditItems = Array.isArray(auditMeta?.items) ? auditMeta.items : [];
            const total = Number(auditMeta?.total) || 0;

            setStaffList(
                staffMeta.map((u) => ({
                    id: String(u.id || u._id),
                    name: u.fullName || '—',
                    roleKey: String(u.role || '').toLowerCase(),
                    roleLabel: roleTitle(u.role),
                    email: u.email || '',
                    phone: u.phone != null ? String(u.phone) : '',
                    address: u.address != null ? String(u.address) : '',
                })),
            );
            setAuditRows(
                auditItems.map((r) => ({
                    key: String(r._id),
                    staff: r.adminName || '—',
                    action: formatAuditRow(r),
                    time:
                        r.createdAt && dayjs(r.createdAt).isValid()
                            ? dayjs(r.createdAt).format('DD/MM/YYYY HH:mm')
                            : '—',
                })),
            );
            setAuditPagination({ current: page, pageSize, total });
        } catch (e) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.message || e?.message || 'Không tải được dữ liệu';
            setLoadError(status === 403 ? 'Chỉ tài khoản Admin mới xem được trang này (403).' : msg);
            setStaffList([]);
            setAuditRows([]);
            setAuditPagination((p) => ({ ...p, total: 0 }));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLists(1, 10);
    }, [fetchLists]);

    const handleReload = () => {
        void fetchLists(1, auditPagination.pageSize);
    };

    const activityColumns = useMemo(
        () => [
            {
                title: <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nhân viên</span>,
                dataIndex: 'staff',
                key: 'staff',
                width: '26%',
                render: (v) => <span className="font-medium text-slate-800">{v}</span>,
            },
            {
                title: <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Hành động</span>,
                dataIndex: 'action',
                key: 'action',
                render: (v) => <span className="text-slate-600">{v}</span>,
            },
            {
                title: <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Thời gian</span>,
                dataIndex: 'time',
                key: 'time',
                width: 160,
                align: 'right',
                render: (v) => <span className="font-mono text-sm text-slate-500">{v}</span>,
            },
        ],
        [],
    );

    const handleCreateStaff = async () => {
        try {
            const v = await form.validateFields();
            setCreateSubmitting(true);
            await requestCreateStaffUser({
                fullName: String(v.fullName).trim(),
                email: String(v.email).trim().toLowerCase(),
                password: String(v.password),
                phone: v.phone ? String(v.phone).trim() : undefined,
                address: v.address ? String(v.address) : undefined,
                staffRole: v.staffRole || 'librarian',
            });
            message.success('Đã tạo tài khoản');
            form.resetFields();
            setAddOpen(false);
            await fetchLists(auditPagination.current, auditPagination.pageSize);
        } catch (e) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.message || 'Không tạo được tài khoản');
        } finally {
            setCreateSubmitting(false);
        }
    };

    const openEditStaff = (s) => {
        setEditingId(s.id);
        editForm.setFieldsValue({
            staffRole: s.roleKey === 'warehouse' ? 'warehouse' : 'librarian',
            fullName: s.name,
            email: s.email,
            phone: s.phone || '',
            address: s.address || '',
            password: '',
        });
        setEditOpen(true);
    };

    const handleUpdateStaff = async () => {
        if (!editingId) return;
        try {
            const v = await editForm.validateFields();
            setEditSubmitting(true);
            const payload = {
                fullName: String(v.fullName).trim(),
                email: String(v.email).trim().toLowerCase(),
                staffRole: v.staffRole || 'librarian',
                phone: v.phone ? String(v.phone).trim() : undefined,
                address: v.address ? String(v.address) : undefined,
            };
            if (v.password && String(v.password).trim()) {
                payload.password = String(v.password);
            }
            await requestUpdateStaffUser(editingId, payload);
            message.success('Đã cập nhật nhân sự');
            editForm.resetFields();
            setEditOpen(false);
            setEditingId(null);
            await fetchLists(auditPagination.current, auditPagination.pageSize);
        } catch (e) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.message || 'Không cập nhật được');
        } finally {
            setEditSubmitting(false);
        }
    };

    return (
        <div className="personnel-management w-full max-w-none pb-2">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Title level={3} className="!mb-0 !text-slate-900">
                            Quản lý Nhân sự
                        </Title>
                    </div>
                    <Text type="secondary" className="text-sm">
                        Danh sách quản trị viên, thủ thư và nhân viên kho; nhật ký kiểm toán từ collection{' '}
                        <span className="font-mono text-xs">library_audit_logs</span>.
                    </Text>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <Button icon={<ReloadOutlined />} onClick={() => void handleReload()} disabled={loading}>
                        Tải lại
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} className="shadow-sm" onClick={() => setAddOpen(true)}>
                        Thêm nhân viên
                    </Button>
                </div>
            </div>

            {loadError ? (
                <Alert type="warning" showIcon className="mb-4" message={loadError} description="Kiểm tra đăng nhập Admin và API `/api/admin/staff`." />
            ) : null}

            <Spin spinning={loading}>
                <Row gutter={[20, 20]}>
                    {staffList.length === 0 && !loading ? (
                        <Col span={24}>
                            <Card className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
                                <Empty description="Chưa có nhân sự hiển thị — thêm tài khoản thủ thư / kho hoặc chạy seed trên máy chủ." />
                            </Card>
                        </Col>
                    ) : (
                        staffList.map((s, idx) => {
                            const pal = STAFF_PALETTES[idx % STAFF_PALETTES.length];
                            const tag = roleTagStyle(s.roleKey);
                            const canEdit = s.roleKey !== 'admin';
                            return (
                                <Col xs={24} sm={12} lg={8} key={s.id}>
                                    <Card className="h-full rounded-xl border border-slate-200/90 shadow-sm" styles={{ body: { padding: 20 } }}>
                                        <div className="flex items-start gap-4">
                                            <Avatar
                                                size={56}
                                                style={{
                                                    backgroundColor: pal.bg,
                                                    color: pal.color,
                                                    fontWeight: 700,
                                                    fontSize: 18,
                                                }}
                                                icon={!initialsFromName(s.name) ? <UserOutlined /> : undefined}
                                            >
                                                {initialsFromName(s.name)}
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-base font-semibold text-slate-900">{s.name}</div>
                                                        <Text type="secondary" className="block truncate text-sm">
                                                            {s.roleLabel}
                                                        </Text>
                                                        {s.email ? (
                                                            <Text className="block truncate text-xs text-slate-500">{s.email}</Text>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                                        <Tag
                                                            className="m-0 rounded-full border-0 px-3 py-0.5 font-semibold"
                                                            style={{ background: tag.background, color: tag.color }}
                                                        >
                                                            {tag.label}
                                                        </Tag>
                                                        {canEdit ? (
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                className="text-sky-700"
                                                                icon={<EditOutlined />}
                                                                onClick={() => openEditStaff(s)}
                                                            >
                                                                Sửa
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                            );
                        })
                    )}
                </Row>

                <Card
                    className="mt-8 rounded-xl border border-slate-200/90 shadow-sm"
                    title={<span className="text-base font-semibold text-slate-900">Nhật ký kiểm toán</span>}
                    styles={{ body: { padding: 0 } }}
                >
                    <Table
                        columns={activityColumns}
                        dataSource={auditRows}
                        locale={{
                            emptyText:
                                'Chưa có bản ghi trong nhật ký. Các thao tác quản trị (thu phạt, cập nhật user, xóa bản sao, …) sẽ được ghi tự động.',
                        }}
                        pagination={{
                            current: auditPagination.current,
                            pageSize: auditPagination.pageSize,
                            total: auditPagination.total,
                            showSizeChanger: true,
                            pageSizeOptions: [10, 20, 50, 100],
                            showTotal: (t) => `Tổng ${t} bản ghi`,
                            onChange: (page, size) => {
                                void fetchLists(page, size);
                            },
                        }}
                        size="middle"
                        className="personnel-activity-table"
                    />
                </Card>
            </Spin>

            <Modal
                title="Thêm nhân sự"
                open={addOpen}
                onCancel={() => {
                    setAddOpen(false);
                    form.resetFields();
                }}
                destroyOnHidden
                width={480}
                footer={[
                    <Button key="c" onClick={() => setAddOpen(false)}>
                        Hủy
                    </Button>,
                    <Button key="s" type="primary" loading={createSubmitting} onClick={() => void handleCreateStaff()}>
                        Tạo tài khoản
                    </Button>,
                ]}
            >
                <Form form={form} layout="vertical" className="mt-2" initialValues={{ staffRole: 'librarian' }}>
                    <Form.Item name="staffRole" label="Vai trò" rules={[{ required: true }]}>
                        <Select
                            options={[
                                { value: 'librarian', label: 'Thủ thư' },
                                { value: 'warehouse', label: 'Nhân viên kho' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
                        <Input placeholder="Họ và tên" />
                    </Form.Item>
                    <Form.Item name="email" label="Email đăng nhập" rules={[{ required: true, type: 'email', message: 'Email hợp lệ' }]}>
                        <Input placeholder="email@domain.com" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Mật khẩu"
                        rules={[
                            { required: true, message: 'Nhập mật khẩu' },
                            { min: 6, message: 'Tối thiểu 6 ký tự' },
                        ]}
                    >
                        <Input.Password placeholder="Mật khẩu" />
                    </Form.Item>
                    <Form.Item name="phone" label="Số điện thoại">
                        <Input placeholder="Tùy chọn" />
                    </Form.Item>
                    <Form.Item name="address" label="Địa chỉ">
                        <Input placeholder="Tùy chọn" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Sửa nhân sự"
                open={editOpen}
                onCancel={() => {
                    setEditOpen(false);
                    setEditingId(null);
                    editForm.resetFields();
                }}
                destroyOnHidden
                width={480}
                footer={[
                    <Button
                        key="c"
                        onClick={() => {
                            setEditOpen(false);
                            setEditingId(null);
                            editForm.resetFields();
                        }}
                    >
                        Hủy
                    </Button>,
                    <Button key="s" type="primary" loading={editSubmitting} onClick={() => void handleUpdateStaff()}>
                        Lưu thay đổi
                    </Button>,
                ]}
            >
                <Form form={editForm} layout="vertical" className="mt-2">
                    <Form.Item name="staffRole" label="Vai trò" rules={[{ required: true }]}>
                        <Select
                            options={[
                                { value: 'librarian', label: 'Thủ thư' },
                                { value: 'warehouse', label: 'Nhân viên kho' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
                        <Input placeholder="Họ và tên" />
                    </Form.Item>
                    <Form.Item name="email" label="Email đăng nhập" rules={[{ required: true, type: 'email', message: 'Email hợp lệ' }]}>
                        <Input placeholder="email@domain.com" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Mật khẩu mới"
                        extra="Để trống nếu giữ nguyên mật khẩu hiện tại."
                        rules={[
                            {
                                validator: (_, v) => {
                                    if (v == null || !String(v).trim()) return Promise.resolve();
                                    if (String(v).length < 6) {
                                        return Promise.reject(new Error('Tối thiểu 6 ký tự'));
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <Input.Password placeholder="Không đổi thì để trống" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="phone" label="Số điện thoại">
                        <Input placeholder="Tùy chọn" />
                    </Form.Item>
                    <Form.Item name="address" label="Địa chỉ">
                        <Input placeholder="Tùy chọn" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PersonnelManagement;
