import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Tag, Select, DatePicker, Button, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { requestGetEmailLogs } from '../../config/request';

const { RangePicker } = DatePicker;

const TYPE_OPTIONS = [
    { value: 'all', label: 'Tất cả loại' },
    { value: 'warning', label: 'Cảnh báo quá hạn' },
    { value: 'mass', label: 'Thông báo hàng loạt' },
    { value: 'confirm', label: 'Xác nhận mượn sách' },
];

const typeLabel = (type) => {
    switch (type) {
        case 'warning': return <Tag color="red">Cảnh báo quá hạn</Tag>;
        case 'mass': return <Tag color="blue">Thông báo hàng loạt</Tag>;
        case 'confirm': return <Tag color="green">Xác nhận mượn</Tag>;
        default: return <Tag>{type || 'Khác'}</Tag>;
    }
};

const EmailLogManagement = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateRange, setDateRange] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetEmailLogs(typeFilter);
            setLogs(Array.isArray(res?.metadata) ? res.metadata : []);
        } catch {
            message.error('Không thể tải nhật ký email');
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const filteredLogs = logs.filter((log) => {
        if (!dateRange || !dateRange[0] || !dateRange[1]) return true;
        const sentAt = dayjs(log.sentAt);
        return sentAt.isAfter(dateRange[0].startOf('day')) && sentAt.isBefore(dateRange[1].endOf('day'));
    });

    const columns = [
        {
            title: 'Thời gian gửi',
            dataIndex: 'sentAt',
            key: 'sentAt',
            width: 170,
            render: (v) => v ? dayjs(v).format('HH:mm - DD/MM/YYYY') : '—',
            sorter: (a, b) => new Date(b.sentAt) - new Date(a.sentAt),
            defaultSortOrder: 'ascend',
        },
        {
            title: 'Loại email',
            dataIndex: 'type',
            key: 'type',
            width: 180,
            render: typeLabel,
        },
        {
            title: 'Người nhận',
            key: 'recipient',
            width: 260,
            render: (_, row) => {
                if (row.type === 'mass') {
                    return <span className="text-slate-500">Hàng loạt ({row.recipientCount || '?'} người)</span>;
                }
                return (
                    <div>
                        <div className="font-medium">{row.recipientName || '—'}</div>
                        <div className="text-xs text-slate-400">{row.recipientEmail || ''}</div>
                    </div>
                );
            },
        },
        {
            title: 'Chủ đề',
            dataIndex: 'subject',
            key: 'subject',
            ellipsis: true,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (v) => (
                <Tag color={v === 'success' ? 'success' : 'error'}>
                    {v === 'success' ? 'Thành công' : 'Thất bại'}
                </Tag>
            ),
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-900">Nhật ký gửi thư (OAS)</h2>
                <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>Làm mới</Button>
            </div>

            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-4 flex flex-wrap gap-3">
                    <Select
                        value={typeFilter}
                        onChange={setTypeFilter}
                        options={TYPE_OPTIONS}
                        className="w-52"
                        placeholder="Lọc theo loại"
                    />
                    <RangePicker
                        value={dateRange}
                        onChange={setDateRange}
                        format="DD/MM/YYYY"
                        placeholder={['Từ ngày', 'Đến ngày']}
                    />
                </div>

                <Table
                    rowKey={(r) => String(r._id || r.sentAt)}
                    columns={columns}
                    dataSource={filteredLogs}
                    loading={loading}
                    pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `Tổng ${t} bản ghi` }}
                    size="small"
                    locale={{ emptyText: 'Chưa có nhật ký email nào' }}
                />
            </Card>
        </div>
    );
};

export default EmailLogManagement;
