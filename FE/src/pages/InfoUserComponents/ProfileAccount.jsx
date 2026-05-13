import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar, Button, Card, Col, Form, Input, message, Row, Table, Upload, Typography,
} from 'antd';
import { BookOutlined, HistoryOutlined, UserOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    requestChangeOwnPassword,
    requestIdStudent,
    requestUpdateUser,
    requestUploadImage,
} from '../../config/request';
import { useStore } from '../../hooks/useStore';
import dayjs from 'dayjs';
import { loanStatusMeta, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Title, Text } = Typography;

function StatCard({ label, value, tone, icon }) {
    const tones = {
        blue: 'from-sky-50 to-indigo-50 border-sky-100 text-sky-900',
        green: 'from-emerald-50 to-teal-50 border-emerald-100 text-emerald-900',
        rose: 'from-rose-50 to-pink-50 border-rose-100 text-rose-900',
    };
    return (
        <div
            className={`flex items-center gap-4 rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm ${tones[tone] || tones.blue}`}
        >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-inner">
                <span className="text-xl opacity-80">{icon}</span>
            </div>
            <div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
                <div className="text-3xl font-bold tabular-nums">{value}</div>
            </div>
        </div>
    );
}

const ProfileAccount = ({ loans = [], loansLoading, unpaidFineSummary }) => {
    const [profileForm] = Form.useForm();
    const [pwdForm] = Form.useForm();
    const [isEditing, setIsEditing] = useState(false);
    const [pwdLoading, setPwdLoading] = useState(false);
    const { dataUser, refreshAuth } = useStore();

    const readerCode =
        dataUser?.readerCode || dataUser?.studentId || dataUser?.idStudent || null;
    const isReaderCodePending =
        dataUser?.verificationStatus === 'pending' || readerCode === '0';
    const hasReaderCode = Boolean(readerCode && readerCode !== '0');

    useEffect(() => {
        if (dataUser) profileForm.setFieldsValue(dataUser);
    }, [dataUser, profileForm]);

    const activeBorrowCount = useMemo(() => {
        return loans.filter((x) =>
            ['BORROWING', 'OVERDUE', 'PENDING_APPROVAL'].includes(normalizeLoanStatusKey(x?.status)),
        ).length;
    }, [loans]);

    const violationCount = unpaidFineSummary?.unpaidCount ?? 0;

    const recentRows = useMemo(() => {
        const sorted = [...loans].sort(
            (a, b) => new Date(b.borrowDate || 0) - new Date(a.borrowDate || 0),
        );
        return sorted.slice(0, 5).map((row) => ({
            key: row.id || row._id,
            title: row?.product?.nameProduct || row?.product?.title || '—',
            borrowDate: row.borrowDate,
            status: row.status,
        }));
    }, [loans]);

    const handleRequestReaderCode = async () => {
        try {
            const res = await requestIdStudent();
            await refreshAuth();
            toast.success(res.message);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không gửi được yêu cầu');
        }
    };

    const handleUpdateProfile = async (values) => {
        try {
            await requestUpdateUser(values);
            await refreshAuth();
            toast.success('Cập nhật thông tin thành công');
            setIsEditing(false);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Cập nhật thất bại');
        }
    };

    const handleBeforeUpload = async (file) => {
        const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
        if (!isJpgOrPng) {
            message.error('Chỉ tải JPG/PNG');
            return false;
        }
        if (file.size / 1024 / 1024 >= 2) {
            message.error('Ảnh phải nhỏ hơn 2MB');
            return false;
        }
        const formData = new FormData();
        formData.append('image', file);
        try {
            await requestUploadImage(formData);
            await refreshAuth();
            message.success('Đổi ảnh thành công!');
        } catch {
            message.error('Tải ảnh thất bại');
        }
        return false;
    };

    const handleChangePassword = async (values) => {
        setPwdLoading(true);
        try {
            await requestChangeOwnPassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            message.success('Đã cập nhật mật khẩu');
            pwdForm.resetFields();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Đổi mật khẩu thất bại');
        } finally {
            setPwdLoading(false);
        }
    };

    const avatarSrc = dataUser?.avatar
        ? `${import.meta.env.VITE_API_URL}/${dataUser.avatar}`
        : undefined;

    return (
        <div className="space-y-6">
            <div>
                <Title level={3} className="!mb-1 !text-slate-900">
                    Hồ sơ &amp; Tài khoản
                </Title>
                <Text type="secondary">Quản lý thông tin độc giả và bảo mật tài khoản</Text>
            </div>

            <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                    <StatCard
                        label="Đang mượn"
                        value={loansLoading ? '…' : activeBorrowCount}
                        tone="blue"
                        icon={<BookOutlined />}
                    />
                </Col>
                <Col xs={24} md={8}>
                    <StatCard
                        label="Lịch sử"
                        value={loansLoading ? '…' : loans.length}
                        tone="green"
                        icon={<HistoryOutlined />}
                    />
                </Col>
                <Col xs={24} md={8}>
                    <StatCard
                        label="Vi phạm (phạt chưa nộp)"
                        value={violationCount}
                        tone="rose"
                        icon={<WarningOutlined />}
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                    <Card
                        className="rounded-2xl border-slate-200/80 shadow-sm"
                        title={<span className="font-semibold text-slate-800">Thông tin độc giả</span>}
                        extra={
                            !isEditing ? (
                                <Button type="link" className="text-violet-600" onClick={() => setIsEditing(true)}>
                                    Chỉnh sửa
                                </Button>
                            ) : null
                        }
                    >
                        <div className="flex flex-col gap-6 sm:flex-row">
                            <div className="flex flex-col items-center gap-2">
                                <Avatar size={96} src={avatarSrc} icon={<UserOutlined />} className="ring-4 ring-violet-100" />
                                {isEditing && (
                                    <Upload name="avatar" showUploadList={false} beforeUpload={handleBeforeUpload}>
                                        <Button size="small" icon={<UploadOutlined />} className="rounded-lg">
                                            Đổi ảnh
                                        </Button>
                                    </Upload>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                {isEditing ? (
                                    <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
                                        <Form.Item
                                            name="fullName"
                                            label={<span className="text-xs font-bold uppercase tracking-wide text-violet-600">Họ tên</span>}
                                            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
                                        >
                                            <Input className="rounded-xl" size="large" />
                                        </Form.Item>
                                        <Form.Item
                                            label={<span className="text-xs font-bold uppercase tracking-wide text-violet-600">MSV / Thẻ</span>}
                                        >
                                            <Input
                                                className="rounded-xl"
                                                size="large"
                                                readOnly
                                                value={hasReaderCode ? readerCode : isReaderCodePending ? 'Đang chờ xác nhận' : 'Chưa có'}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name="email"
                                            label={<span className="text-xs font-bold uppercase tracking-wide text-violet-600">Email</span>}
                                            rules={[{ required: true, type: 'email', message: 'Email không hợp lệ' }]}
                                        >
                                            <Input className="rounded-xl" size="large" />
                                        </Form.Item>
                                        <Form.Item name="phone" label={<span className="text-xs font-bold uppercase tracking-wide text-violet-600">Số điện thoại</span>}>
                                            <Input className="rounded-xl" size="large" />
                                        </Form.Item>
                                        <Form.Item name="address" label={<span className="text-xs font-bold uppercase tracking-wide text-violet-600">Địa chỉ</span>}>
                                            <Input className="rounded-xl" size="large" />
                                        </Form.Item>
                                        <div className="flex flex-wrap gap-2">
                                            <Button type="primary" htmlType="submit" className="rounded-xl bg-violet-600">
                                                Lưu thay đổi
                                            </Button>
                                            <Button onClick={() => setIsEditing(false)} className="rounded-xl">
                                                Hủy
                                            </Button>
                                        </div>
                                    </Form>
                                ) : (
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <Text type="secondary" className="text-xs font-bold uppercase tracking-wide text-violet-600">Họ tên</Text>
                                            <div className="text-base font-semibold text-slate-900">{dataUser?.fullName || '—'}</div>
                                        </div>
                                        <div>
                                            <Text type="secondary" className="text-xs font-bold uppercase tracking-wide text-violet-600">MSV / Thẻ</Text>
                                            <div className="font-mono text-base text-slate-900">
                                                {hasReaderCode ? readerCode : isReaderCodePending ? 'Đang chờ thư viện xác nhận' : 'Chưa có'}
                                            </div>
                                        </div>
                                        <div>
                                            <Text type="secondary" className="text-xs font-bold uppercase tracking-wide text-violet-600">Email</Text>
                                            <div className="text-base text-slate-800">{dataUser?.email || '—'}</div>
                                        </div>
                                        <div>
                                            <Text type="secondary" className="text-xs font-bold uppercase tracking-wide text-violet-600">Điện thoại</Text>
                                            <div>{dataUser?.phone || '—'}</div>
                                        </div>
                                        <div>
                                            <Text type="secondary" className="text-xs font-bold uppercase tracking-wide text-violet-600">Địa chỉ</Text>
                                            <div>{dataUser?.address || '—'}</div>
                                        </div>
                                        {!hasReaderCode && !isReaderCodePending && (
                                            <Button type="primary" className="mt-2 rounded-xl bg-violet-600" onClick={handleRequestReaderCode}>
                                                Gửi yêu cầu xác nhận MSV/MSG
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card
                        className="rounded-2xl border-0 bg-slate-900 text-slate-100 shadow-lg"
                        styles={{ body: { padding: 24 } }}
                        title={<span className="font-semibold text-white">Đổi mật khẩu</span>}
                    >
                        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword} className="profile-pwd-form">
                            <Form.Item
                                name="currentPassword"
                                label={<span className="text-slate-300">Mật khẩu cũ</span>}
                                rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}
                            >
                                <Input.Password className="rounded-xl !bg-slate-800 !text-white border-slate-600" size="large" />
                            </Form.Item>
                            <Form.Item
                                name="newPassword"
                                label={<span className="text-slate-300">Mật khẩu mới (tối thiểu 8 ký tự)</span>}
                                rules={[
                                    { required: true, message: 'Nhập mật khẩu mới' },
                                    { min: 8, message: 'Tối thiểu 8 ký tự' },
                                ]}
                            >
                                <Input.Password className="rounded-xl !bg-slate-800 !text-white border-slate-600" size="large" />
                            </Form.Item>
                            <Form.Item
                                name="confirmPassword"
                                label={<span className="text-slate-300">Nhập lại mật khẩu mới</span>}
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: 'Xác nhận mật khẩu' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                            return Promise.reject(new Error('Không khớp mật khẩu mới'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password className="rounded-xl !bg-slate-800 !text-white border-slate-600" size="large" />
                            </Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={pwdLoading}
                                block
                                size="large"
                                className="mt-2 h-11 rounded-xl border-0 bg-white font-semibold text-slate-900 hover:!bg-slate-100"
                            >
                                Cập nhật mật khẩu
                            </Button>
                        </Form>
                    </Card>
                </Col>
            </Row>

            <Card
                className="rounded-2xl border-slate-200/80 shadow-sm"
                title={
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                        <HistoryOutlined className="text-violet-600" />
                        Hoạt động gần đây
                    </span>
                }
            >
                <Table
                    size="middle"
                    loading={loansLoading}
                    pagination={false}
                    dataSource={recentRows}
                    locale={{ emptyText: 'Chưa có hoạt động mượn' }}
                    columns={[
                        {
                            title: 'Sách',
                            dataIndex: 'title',
                            key: 'title',
                            ellipsis: true,
                            render: (t) => (
                                <span className="inline-flex items-center gap-2">
                                    <BookOutlined className="text-violet-500" />
                                    {t}
                                </span>
                            ),
                        },
                        {
                            title: 'Ngày mượn',
                            dataIndex: 'borrowDate',
                            width: 130,
                            render: (d) => (d && dayjs(d).isValid() ? dayjs(d).format('DD/MM/YYYY') : '—'),
                        },
                        {
                            title: 'Trạng thái',
                            dataIndex: 'status',
                            width: 140,
                            render: (s) => {
                                const m = loanStatusMeta(s);
                                return (
                                    <span
                                        className={`inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${
                                            m.color === 'blue'
                                                ? 'bg-sky-100 text-sky-800'
                                                : m.color === 'green'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : m.color === 'red'
                                                    ? 'bg-rose-100 text-rose-800'
                                                    : m.color === 'gold'
                                                      ? 'bg-amber-100 text-amber-900'
                                                      : 'bg-slate-100 text-slate-700'
                                        }`}
                                    >
                                        {m.text}
                                    </span>
                                );
                            },
                        },
                    ]}
                />
            </Card>
        </div>
    );
};

export default ProfileAccount;
