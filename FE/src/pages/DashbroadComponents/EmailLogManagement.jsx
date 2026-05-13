import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Select, DatePicker, Button, Input, message, Typography, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, MailOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { requestGetLibraryMail, requestResolveForgotPasswordMail } from '../../config/request';

const { RangePicker } = DatePicker;

const TYPE_OPTIONS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'BORROW_CONFIRM', label: 'Xác nhận mượn sách' },
    { value: 'SYSTEM', label: 'Toàn hệ thống' },
    { value: 'FORGOT_PASSWORD', label: 'Quên mật khẩu' },
];

const STATUS_OPTIONS = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'PENDING', label: 'Chờ xử lý' },
    { value: 'RESOLVED', label: 'Đã xử lý' },
];

const typeLabel = (type) => {
    switch (type) {
        case 'FORGOT_PASSWORD': return <Tag color="volcano">Quên mật khẩu</Tag>;
        case 'SYSTEM': return <Tag color="blue">Toàn hệ thống</Tag>;
        case 'BORROW_CONFIRM': return <Tag color="green">Xác nhận mượn</Tag>;
        default: return <Tag>{type || 'Khác'}</Tag>;
    }
};

const deliveryLabel = (ds) => {
    if (ds === 'failed') return <Tag color="error">Thất bại</Tag>;
    if (ds === 'pending') return <Tag color="warning">Chờ gửi / chờ xử lý</Tag>;
    return <Tag color="success">Thành công</Tag>;
};

const emptyStats = { totalSent: 0, successCount: 0, failedCount: 0, totalRecipients: 0 };

const EmailLogManagement = () => {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(emptyStats);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deliveryFilter, setDeliveryFilter] = useState('all');
    const [dateRange, setDateRange] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [resolvingId, setResolvingId] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetLibraryMail({
                type: typeFilter,
                status: statusFilter,
                deliveryStatus: deliveryFilter,
                q: searchText,
                limit: 500,
            });
            const meta = res?.metadata;
            let items = [];
            let nextStats = emptyStats;
            if (Array.isArray(meta)) {
                items = meta;
                nextStats = {
                    totalSent: items.length,
                    successCount: items.filter((x) => x.deliveryStatus === 'success' || (!x.deliveryStatus && x.type !== 'FORGOT_PASSWORD')).length,
                    failedCount: items.filter((x) => x.deliveryStatus === 'failed').length,
                    totalRecipients: items.reduce((s, x) => s + (Number(x.recipientCount) || 1), 0),
                };
            } else if (meta && typeof meta === 'object') {
                items = Array.isArray(meta.items) ? meta.items : [];
                nextStats = {
                    totalSent: Number(meta.stats?.totalSent) || 0,
                    successCount: Number(meta.stats?.successCount) || 0,
                    failedCount: Number(meta.stats?.failedCount) || 0,
                    totalRecipients: Number(meta.stats?.totalRecipients) || 0,
                };
            }
            setLogs(items);
            setStats(nextStats);
        } catch {
            message.error('Không thể tải nhật ký thư');
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter, deliveryFilter, searchText]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const filteredLogs = useMemo(() => logs.filter((log) => {
        if (!dateRange || !dateRange[0] || !dateRange[1]) return true;
        const created = dayjs(log.createdAt);
        return created.isAfter(dateRange[0].startOf('day')) && created.isBefore(dateRange[1].endOf('day'));
    }), [logs, dateRange]);

    const handleResolveForgot = async (row) => {
        try {
            setResolvingId(row.id || row._id);
            await requestResolveForgotPasswordMail(row.id || row._id);
            message.success('Đã reset mật khẩu về mặc định 123 và gửi thông báo cho sinh viên.');
            await fetchLogs();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể xử lý yêu cầu');
        } finally {
            setResolvingId(null);
        }
    };

    const kpiCardClass = (key) => {
        const active =
            (key === 'all' && deliveryFilter === 'all') ||
            (key === 'success' && deliveryFilter === 'success') ||
            (key === 'failed' && deliveryFilter === 'failed');
        return `h-full cursor-pointer rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
            active ? 'border-violet-500 ring-2 ring-violet-200' : 'border-slate-200'
        }`;
    };

    const columns = [
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 170,
            render: (v) => (v ? dayjs(v).format('HH:mm - DD/MM/YYYY') : '—'),
            sorter: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Loại thư',
            dataIndex: 'type',
            key: 'type',
            width: 180,
            render: typeLabel,
        },
        {
            title: 'Kết quả gửi',
            dataIndex: 'deliveryStatus',
            key: 'deliveryStatus',
            width: 150,
            render: (v, row) => deliveryLabel(v || (row.type === 'FORGOT_PASSWORD' && row.status === 'PENDING' ? 'pending' : 'success')),
        },
        {
            title: 'Người nhận (số)',
            dataIndex: 'recipientCount',
            key: 'recipientCount',
            width: 120,
            align: 'right',
            render: (n) => <span className="tabular-nums">{n != null ? Number(n) : 1}</span>,
        },
        {
            title: 'Người gửi / Độc giả',
            key: 'who',
            width: 260,
            render: (_, row) => {
                const senderLine = row?.senderEmail || '—';
                return (
                    <div>
                        <div className="font-medium">{row?.senderName || row?.senderStudentId || '—'}</div>
                        <div className="text-xs text-slate-400">{senderLine}</div>
                    </div>
                );
            },
        },
        {
            title: 'Chủ đề',
            dataIndex: 'title',
            key: 'title',
            ellipsis: true,
        },
        {
            title: 'Xử lý quên MK',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (v, row) => {
                if (row.type !== 'FORGOT_PASSWORD') return <Tag color="default">—</Tag>;
                return <Tag color={v === 'RESOLVED' ? 'success' : 'warning'}>{v === 'RESOLVED' ? 'Đã xử lý' : 'Chờ xử lý'}</Tag>;
            },
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 160,
            render: (_, row) => {
                if (row.type !== 'FORGOT_PASSWORD') return '—';
                const disabled = String(row.status) === 'RESOLVED';
                return (
                    <Button
                        size="small"
                        type="primary"
                        disabled={disabled}
                        loading={resolvingId === (row.id || row._id)}
                        onClick={() => handleResolveForgot(row)}
                    >
                        ResetPass (123)
                    </Button>
                );
            },
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Typography.Title level={3} className="!mb-0 !text-slate-900">Nhật ký thư</Typography.Title>
                    <Typography.Text type="secondary">Thống kê gửi thư / thông báo và lọc theo kết quả.</Typography.Text>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
                    Làm mới
                </Button>
            </div>

            <Row gutter={[16, 16]} className="mb-4">
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        size="small"
                        className={kpiCardClass('all')}
                        onClick={() => setDeliveryFilter('all')}
                        styles={{ body: { padding: '16px 18px' } }}
                    >
                        <Statistic
                            title={<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tổng đã gửi</span>}
                            value={stats.totalSent}
                            prefix={<MailOutlined className="text-violet-500" />}
                            valueStyle={{ fontWeight: 700, color: '#1a3353' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        size="small"
                        className={kpiCardClass('success')}
                        onClick={() => setDeliveryFilter('success')}
                        styles={{ body: { padding: '16px 18px' } }}
                    >
                        <Statistic
                            title={<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Thành công</span>}
                            value={stats.successCount}
                            prefix={<CheckCircleOutlined className="text-emerald-500" />}
                            valueStyle={{ fontWeight: 700, color: '#047857' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        size="small"
                        className={kpiCardClass('failed')}
                        onClick={() => setDeliveryFilter('failed')}
                        styles={{ body: { padding: '16px 18px' } }}
                    >
                        <Statistic
                            title={<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Thất bại</span>}
                            value={stats.failedCount}
                            prefix={<CloseCircleOutlined className="text-red-500" />}
                            valueStyle={{ fontWeight: 700, color: '#b91c1c' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        size="small"
                        className="h-full cursor-pointer rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
                        onClick={() => {
                            setDeliveryFilter('all');
                            message.info(`Tổng số người nhận (tích lũy): ${stats.totalRecipients.toLocaleString('vi-VN')}`);
                        }}
                        styles={{ body: { padding: '16px 18px' } }}
                    >
                        <Statistic
                            title={<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tổng người nhận</span>}
                            value={stats.totalRecipients}
                            prefix={<TeamOutlined className="text-sky-500" />}
                            valueStyle={{ fontWeight: 700, color: '#0369a1' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card className="rounded-2xl shadow-sm" styles={{ body: { padding: 16 } }}>
                <div className="mb-4 flex flex-wrap gap-3">
                    <Input.Search
                        allowClear
                        placeholder="Tìm email / họ tên / MSV..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onSearch={() => fetchLogs()}
                        className="w-64"
                    />
                    <Select
                        value={typeFilter}
                        onChange={setTypeFilter}
                        options={TYPE_OPTIONS}
                        className="w-52"
                        placeholder="Lọc theo loại"
                    />
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={STATUS_OPTIONS}
                        className="w-44"
                        placeholder="Trạng thái"
                    />
                    <RangePicker
                        value={dateRange}
                        onChange={setDateRange}
                        format="DD/MM/YYYY"
                        placeholder={['Từ ngày', 'Đến ngày']}
                    />
                </div>

                <Table
                    rowKey={(r) => String(r._id || r.id || r.createdAt)}
                    columns={columns}
                    dataSource={filteredLogs}
                    loading={loading}
                    pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `Tổng ${t} bản ghi` }}
                    size="small"
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: 'Chưa có nhật ký thư nào' }}
                />
            </Card>
        </div>
    );
};

export default EmailLogManagement;
