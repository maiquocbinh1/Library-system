import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Input, Modal, Form, Select, message, Space, Tag, Tabs, Drawer, Typography, Divider } from 'antd';
import { IdcardOutlined, EyeOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import {
    requestDeleteUser,
    requestGetAllUsers,
    requestIssueReaderCard,
    requestUpdatePassword,
    requestSendWarningNotification,
    requestUpdateUserAdmin,
    requestGetHighRiskUsers,
    requestGetAllHistoryBook,
    requestGetAllFines,
    requestSetPatronLock,
} from '../../config/request';
import { READER_TYPE_OPTIONS } from '../../constants/readerTypes';
import dayjs from 'dayjs';
import { loanStatusMeta, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Search } = Input;

// ── Tính mức độ rủi ro ────────────────────────────────────────────────────
function getRiskLevel(user, riskMap) {
    const r = riskMap[user.id] || {};
    const totalFine = r.totalFine || 0;
    const overdue = r.overdueBooksCount || 0;
    if (totalFine > 50000 || overdue >= 3) return 'high';
    if (totalFine > 0 || overdue >= 1) return 'medium';
    return 'low';
}

const riskTag = (level) => {
    if (level === 'high') return <Tag color="red">Rủi ro cao</Tag>;
    if (level === 'medium') return <Tag color="orange">Cần theo dõi</Tag>;
    return <Tag color="green">An toàn</Tag>;
};

const UserManagement = () => {
    const [data, setData] = useState([]);
    const [riskMap, setRiskMap] = useState({});
    const [activeTab, setActiveTab] = useState('all');
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isCardModalVisible, setIsCardModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deletingUser, setDeletingUser] = useState(null);
    const [selectedUserForCard, setSelectedUserForCard] = useState(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [cardForm] = Form.useForm();
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailUser, setDetailUser] = useState(null);
    const [loanRows, setLoanRows] = useState([]);
    const [fineRows, setFineRows] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [lockLoading, setLockLoading] = useState(false);
    const [searchText, setSearchText] = useState('');

    const columns = [
        { title: 'MSV', key: 'studentId', width: 140, render: (_, r) => r.studentId || r.readerCode || '—' },
        { title: 'Tên người dùng', dataIndex: 'fullName', key: 'fullName', ellipsis: true },
        { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
        { title: 'Vai trò', dataIndex: 'role', key: 'role', width: 120, render: (v) => <Tag color={v === 'admin' ? 'purple' : v === 'librarian' ? 'blue' : 'default'}>{v || '—'}</Tag> },
        {
            title: 'Mức độ rủi ro', key: 'risk', width: 140,
            render: (_, r) => riskTag(getRiskLevel(r, riskMap)),
        },
        {
            // Align header above the "Kích hoạt" button (not the right-most "Xóa")
            title: (
                <div className="w-full text-right" style={{ paddingRight: 37 }}>
                    Hành động
                </div>
            ),
            key: 'action',
            align: 'right',
            onHeaderCell: () => ({ style: { textAlign: 'right', paddingRight: 37 } }),
            render: (text, record) => (
                <div className="flex w-full justify-end">
                    <Space size={8} wrap={false}>
                        <Button
                            type="primary"
                            size="small"
                            onClick={() => {
                                setEditingUser(record);
                                form.setFieldsValue(record);
                                setIsEditModalVisible(true);
                            }}
                        >
                            Sửa
                        </Button>
                        <Button type="default" size="small" icon={<EyeOutlined />} onClick={() => openPatronDetail(record)} className="rounded-xl">
                            Chi tiết
                        </Button>
                        <Button
                            icon={<IdcardOutlined />}
                            size="small"
                            onClick={() => {
                                setSelectedUserForCard(record);
                                cardForm.setFieldsValue({
                                    fullName: record.fullName,
                                    email: record.email,
                                    planMonths: 3,
                                    readerType: 'SinhVien_ChinhQuy',
                                    readerCode: '',
                                });
                                setIsCardModalVisible(true);
                            }}
                            className="rounded-xl"
                        >
                            Kích hoạt
                        </Button>
                        <Button
                            type="primary"
                            danger
                            size="small"
                            onClick={() => {
                                setDeletingUser(record);
                                setIsDeleteModalVisible(true);
                            }}
                        >
                            Xóa
                        </Button>
                    </Space>
                </div>
            ),
        },
    ];

    const fetchData = async () => {
        const res = await requestGetAllUsers();
        const list = Array.isArray(res?.metadata) ? res.metadata : [];
        const normalized = list.map((item) => ({
            ...item,
            id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
        }));
        setData(normalized);
    };

    const fetchRiskData = async () => {
        try {
            const res = await requestGetHighRiskUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const map = {};
            for (const u of list) map[u.id] = u;
            setRiskMap(map);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        fetchData();
        fetchRiskData();
    }, []);

    const patronIds = (u) => [String(u?.id || ''), String(u?._id || ''), String(u?.mysqlId || '')].filter(Boolean);

    const openPatronDetail = async (record) => {
        setDetailUser(record);
        setDetailOpen(true);
        setDetailLoading(true);
        try {
            const primaryId = String(record?.id || record?._id || '').trim();
            const [hRes, fRes] = await Promise.all([
                primaryId ? requestGetAllHistoryBook({ userId: primaryId }) : requestGetAllHistoryBook(),
                primaryId ? requestGetAllFines({ userId: primaryId }) : requestGetAllFines(),
            ]);
            const tickets = Array.isArray(hRes?.metadata) ? hRes.metadata : [];
            const fines = Array.isArray(fRes?.metadata) ? fRes.metadata : [];
            const ids = patronIds(record);
            setLoanRows(
                tickets
                    .filter((t) => ids.includes(String(t.userId)))
                    .map((t) => ({ ...t, id: t.id || t.mysqlId || t._id })),
            );
            setFineRows(
                fines.filter((f) => {
                    const uid = String(f?.userId || f?.user?.id || '');
                    return ids.includes(uid);
                }),
            );
        } catch {
            message.error('Không tải được lịch sử độc giả');
            setLoanRows([]);
            setFineRows([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const totalDebt = useMemo(() => {
        if (!detailUser) return 0;
        return fineRows.filter((f) => f.status === 'UNPAID').reduce((s, f) => s + Number(f.fineAmount || 0), 0);
    }, [detailUser, fineRows]);

    const togglePatronLock = async () => {
        if (!detailUser) return;
        const blocked = !detailUser.libraryCardBlocked;
        try {
            setLockLoading(true);
            await requestSetPatronLock({ userId: detailUser.id, blocked });
            message.success(blocked ? 'Đã khóa thẻ' : 'Đã mở khóa thẻ');
            setDetailUser((u) => ({ ...u, libraryCardBlocked: blocked }));
            await fetchData();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không cập nhật được');
        } finally {
            setLockLoading(false);
        }
    };

    const handleResetPassDefault = async () => {
        if (!detailUser) return;
        try {
            setLockLoading(true);
            await requestUpdatePassword({ userId: detailUser.id, password: '123' });
            await requestSendWarningNotification({
                userId: detailUser.id,
                title: 'Mật khẩu đã được đặt lại',
                contentHtml:
                    '<p>Mật khẩu của bạn đã được thư viện đặt lại về <b>mặc định: 123</b>. Vui lòng đăng nhập và đổi mật khẩu mới.</p>',
                dedupeKey: `RESET_PASS:${detailUser.id}:${Date.now()}`,
            });
            message.success('Đã reset mật khẩu về mặc định 123 và gửi thông báo cho sinh viên.');
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể reset mật khẩu');
        } finally {
            setLockLoading(false);
        }
    };

    const handleUpdateUser = async () => {
        try {
            setLoading(true);
            const data = {
                userId: editingUser.id,
                ...form.getFieldsValue(),
            };
            const { password, ...rest } = data;
            await requestUpdateUserAdmin(rest);
            if (password && String(password).trim()) {
                await requestUpdatePassword({ userId: editingUser.id, password: String(password).trim() });
            }
            setIsEditModalVisible(false);
            form.resetFields();
            fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật người dùng');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        try {
            setLoading(true);
            const data = {
                userId: deletingUser.id,
            };
            await requestDeleteUser(data);
            setIsDeleteModalVisible(false);
            fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể xóa người dùng');
        } finally {
            setLoading(false);
        }
    };

    const handleIssueCard = async () => {
        try {
            const values = await cardForm.validateFields();
            setLoading(true);
            await requestIssueReaderCard({
                userId: selectedUserForCard?.id,
                planMonths: values.planMonths,
                readerCode: String(values.readerCode || '').trim(),
                readerType: values.readerType || 'SinhVien_ChinhQuy',
            });
            message.success('Đã kích hoạt độc giả thành công');
            setIsCardModalVisible(false);
            setSelectedUserForCard(null);
            cardForm.resetFields();
            fetchData();
        } catch (error) {
            if (error?.errorFields) return;
            message.error(error?.response?.data?.message || 'Không thể kích hoạt');
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => {
        /** Chỉ độc giả (patron) — không hiển thị admin, thủ thư, nhân viên kho. */
        const q = String(searchText || '').trim().toLowerCase();
        const users = data.filter((u) => String(u.role || '').toLowerCase() === 'user');
        const searched = !q
            ? users
            : users.filter((u) => {
                  const msv = String(u.studentId || u.readerCode || u.idStudent || '').toLowerCase();
                  const name = String(u.fullName || '').toLowerCase();
                  const email = String(u.email || '').toLowerCase();
                  return msv.includes(q) || name.includes(q) || email.includes(q);
              });
        if (activeTab === 'all') return searched;
        if (activeTab === 'active') return searched.filter((u) => u.verificationStatus === 'verified');
        if (activeTab === 'fined') return searched.filter((u) => riskMap[u.id]?.totalFine > 0);
        if (activeTab === 'overdue') return searched.filter((u) => riskMap[u.id]?.overdueBooksCount > 0);
        return searched;
    }, [data, riskMap, activeTab, searchText]);

    const tabItems = [
        { key: 'all', label: 'Tất cả' },
        { key: 'active', label: 'Đang hoạt động' },
        { key: 'fined', label: 'Có nợ phạt' },
        { key: 'overdue', label: 'Có sách quá hạn' },
    ];

    /** Hiển thị mã vạch / mã bản sao từ bookCopies (API get-all-history-book). */
    const formatLoanCopyCodes = (row) => {
        const copies = Array.isArray(row?.bookCopies) ? row.bookCopies : [];
        const statusKey = normalizeLoanStatusKey(row?.status);
        const isTerminal = statusKey === 'RETURNED' || statusKey === 'CANCELLED';

        if (!copies.length) return '—';
        const hasPendingPlaceholder = copies.some((c) => !c?.copyId && (c?.status === 'PENDING' || c?.barcode == null));
        if (hasPendingPlaceholder && copies.every((c) => !c?.barcode)) {
            return isTerminal ? '—' : 'Chờ xuất kho';
        }
        const parts = copies.map((c) => {
            const b = c?.barcode != null && String(c.barcode).trim() !== '' ? String(c.barcode).trim() : '';
            if (b) return b;
            if (c?.copyId) return `ID:${String(c.copyId).slice(-8)}`;
            return '';
        }).filter(Boolean);
        return parts.length ? [...new Set(parts)].join(', ') : '—';
    };

    return (
        <div>
            <div className="mb-4 flex justify-between">
                <h2 className="text-2xl font-bold">Danh sách & tra cứu độc giả</h2>
            </div>
            <Search
                allowClear
                placeholder="Tìm MSV, tên, email..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={(v) => setSearchText(v)}
                style={{ width: 320, marginBottom: 12 }}
            />
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="mb-3" />
            <Table columns={columns} dataSource={filteredData} rowKey={(record) => record.id || record.email} scroll={{ x: 1020 }} />

            <Drawer
                title={detailUser ? `Chi tiết độc giả — ${detailUser.fullName || ''}` : 'Chi tiết'}
                width={820}
                open={detailOpen}
                onClose={() => { setDetailOpen(false); setDetailUser(null); }}
                destroyOnHidden
            >
                {detailUser && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <Typography.Text type="secondary">MSV / Thẻ</Typography.Text>
                            <div className="font-mono font-semibold">{detailUser.studentId || detailUser.readerCode || '—'}</div>
                            <Typography.Text type="secondary" className="mt-2 block">Email</Typography.Text>
                            <div>{detailUser.email || '—'}</div>
                            {detailUser.libraryCardBlocked ? <Tag color="red" className="mt-2">Thẻ đang khóa</Tag> : <Tag color="green" className="mt-2">Thẻ hoạt động</Tag>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Typography.Text strong>Tổng nợ phạt chưa thu:</Typography.Text>
                            <Typography.Text type="danger">{totalDebt.toLocaleString('vi-VN')} đ</Typography.Text>
                        </div>
                        {detailUser.role === 'user' && (
                            <Space>
                                <Button
                                    type={detailUser.libraryCardBlocked ? 'default' : 'primary'}
                                    danger={!detailUser.libraryCardBlocked}
                                    icon={detailUser.libraryCardBlocked ? <UnlockOutlined /> : <LockOutlined />}
                                    loading={lockLoading}
                                    onClick={togglePatronLock}
                                >
                                    {detailUser.libraryCardBlocked ? 'Mở khóa thẻ' : 'Khóa thẻ / tài khoản mượn'}
                                </Button>
                                {detailUser.verificationStatus === 'verified' && (
                                    <Button danger loading={lockLoading} onClick={handleResetPassDefault}>
                                        ResetPass (123)
                                    </Button>
                                )}
                            </Space>
                        )}
                        <Divider className="!my-2" />
                        <Typography.Title level={5}>Lịch sử mượn</Typography.Title>
                        <Table
                            size="small"
                            loading={detailLoading}
                            rowKey={(r) => r.id}
                            dataSource={loanRows}
                            pagination={{ pageSize: 6 }}
                            columns={[
                                {
                                    title: 'Trạng thái',
                                    dataIndex: 'status',
                                    width: 120,
                                    render: (s) => {
                                        const m = loanStatusMeta(s);
                                        return <Tag color={m.color}>{m.text}</Tag>;
                                    },
                                },
                                { title: 'Ngày', dataIndex: 'borrowDate', width: 110, render: (d) => (d && dayjs(d).isValid() ? dayjs(d).format('DD/MM/YYYY') : '—') },
                                {
                                    title: 'Mã đầu sách',
                                    key: 'bookCode',
                                    width: 120,
                                    ellipsis: true,
                                    render: (_, r) => {
                                        const c = r?.product?.bookCode ?? r?.product?.code;
                                        return c ? <span className="font-mono text-xs">{String(c)}</span> : '—';
                                    },
                                },
                                {
                                    title: 'Mã bản sao',
                                    key: 'copyBarcodes',
                                    width: 140,
                                    ellipsis: true,
                                    render: (_, r) => <span className="font-mono text-xs">{formatLoanCopyCodes(r)}</span>,
                                },
                                {
                                    title: 'Đầu sách',
                                    key: 't',
                                    ellipsis: true,
                                    render: (_, r) => r?.product?.title || r?.product?.nameProduct || '—',
                                },
                            ]}
                            scroll={{ x: 640 }}
                        />
                        <Typography.Title level={5}>Phiếu phạt</Typography.Title>
                        <Table
                            size="small"
                            loading={detailLoading}
                            rowKey={(r) => r.id || r._id}
                            dataSource={fineRows}
                            pagination={{ pageSize: 5 }}
                            columns={[
                                { title: 'Số tiền', dataIndex: 'fineAmount', width: 120, render: (v) => `${Number(v || 0).toLocaleString('vi-VN')} đ` },
                                { title: 'Trạng thái', dataIndex: 'status', width: 100, render: (s) => (s === 'PAID' ? <Tag color="success">Đã nộp</Tag> : <Tag color="warning">Chưa nộp</Tag>) },
                                {
                                    title: 'Sách vi phạm',
                                    key: 'violationBook',
                                    width: 200,
                                    ellipsis: true,
                                    render: (_, r) => {
                                        const vb = r?.violationBook;
                                        if (!vb || (!vb.title && !vb.bookCode && !(vb.copyBarcodes || []).length)) return '—';
                                        const parts = [vb.title, vb.bookCode, (vb.copyBarcodes || []).join(', ')].filter(Boolean);
                                        return parts.join(' · ');
                                    },
                                },
                                { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
                            ]}
                        />
                    </div>
                )}
            </Drawer>

            <Modal
                title="Sửa thông tin người dùng"
                open={isEditModalVisible}
                onOk={handleUpdateUser}
                onCancel={() => {
                    setIsEditModalVisible(false);
                }}
                okText="Lưu"
                cancelText="Hủy"
                confirmLoading={loading}
            >
                <Form form={form} layout="vertical" name="edit_user_form">
                    <Form.Item
                        name="fullName"
                        label="Tên người dùng"
                        rules={[{ required: true, message: 'Vui lòng nhập tên người dùng!' }]}
                    >
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Vui lòng nhập email!' }]}>
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Mật khẩu"
                        rules={[
                            { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                        ]}
                        tooltip="Để trống nếu không đổi mật khẩu"
                    >
                        <Input.Password className="rounded-xl" placeholder="Nhập mật khẩu mới (nếu muốn đổi)" />
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label="Vai trò"
                        rules={[{ required: true, message: 'Vui lòng chọn vai trò!' }]}
                    >
                        <Select
                            options={[
                                { value: 'user', label: 'Người dùng' },
                                { value: 'librarian', label: 'Thủ thư' },
                                { value: 'admin', label: 'Quản trị viên' },
                            ]}
                            className="rounded-xl"
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Kích hoạt tài khoản Độc giả"
                open={isCardModalVisible}
                onOk={handleIssueCard}
                onCancel={() => {
                    setIsCardModalVisible(false);
                    setSelectedUserForCard(null);
                }}
                okText="Xác nhận Kích hoạt"
                cancelText="Hủy"
                confirmLoading={loading}
            >
                <Form form={cardForm} layout="vertical">
                    <Form.Item label="Họ tên" name="fullName">
                        <Input disabled className="rounded-xl" />
                    </Form.Item>
                    <Form.Item label="Gmail" name="email">
                        <Input disabled className="rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        label="Loại bạn đọc"
                        name="readerType"
                        rules={[{ required: true, message: 'Vui lòng chọn loại bạn đọc!' }]}
                    >
                        <Select className="rounded-xl" options={READER_TYPE_OPTIONS} />
                    </Form.Item>

                    <Form.Item
                        label="Thời hạn kích hoạt (tháng)"
                        name="planMonths"
                        rules={[{ required: true, message: 'Vui lòng chọn thời hạn kích hoạt!' }]}
                    >
                        <Select
                            className="rounded-xl"
                            options={[
                                { value: 3, label: '3 tháng' },
                                { value: 6, label: '6 tháng' },
                                { value: 12, label: '12 tháng (1 năm)' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="MSV / MSG"
                        name="readerCode"
                        rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập MSV hoặc MSG!' }]}
                    >
                        <Input
                            className="rounded-xl"
                            placeholder="Mã sinh viên hoặc mã giảng viên/cán bộ"
                            addonAfter={
                                <Button
                                    type="link"
                                    className="px-0"
                                    onClick={() => {
                                        const code = `PTIT${Math.floor(100000 + Math.random() * 900000)}`;
                                        cardForm.setFieldsValue({ readerCode: code });
                                    }}
                                >
                                    Tự sinh
                                </Button>
                            }
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Xóa người dùng"
                open={isDeleteModalVisible}
                onOk={handleDeleteUser}
                onCancel={() => {
                    setIsDeleteModalVisible(false);
                }}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                confirmLoading={loading}
            >
                <p>Bạn có chắc chắn muốn xóa người dùng "{deletingUser?.fullName}" không?</p>
            </Modal>
        </div>
    );
};

export default UserManagement;
