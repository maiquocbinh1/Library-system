import React, { useEffect, useState } from 'react';
import { Card, Select, Spin, Table, Tag, Typography } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { requestGetEmailLogs } from '../../config/request';

const { Paragraph } = Typography;

const TYPE_OPTIONS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'warning', label: 'Cảnh báo' },
    { value: 'mass', label: 'Hàng loạt' },
    { value: 'borrow_confirm', label: 'Xác nhận mượn' },
];

function typeTag(type) {
    const t = String(type || '');
    const color =
        t === 'warning' ? 'orange' : t === 'mass' ? 'blue' : t === 'borrow_confirm' ? 'green' : 'default';
    const label =
        t === 'warning'
            ? 'Cảnh báo'
            : t === 'mass'
              ? 'Hàng loạt'
              : t === 'borrow_confirm'
                ? 'Xác nhận mượn'
                : t || '—';
    return <Tag color={color}>{label}</Tag>;
}

/** Nhật ký gửi email (collection email_logs) — GET /api/admin/oas/email-logs */
const SystemAuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await requestGetEmailLogs(typeFilter);
                const list = Array.isArray(res?.metadata) ? res.metadata : [];
                if (!cancelled) setLogs(list);
            } catch {
                if (!cancelled) setLogs([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [typeFilter]);

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl shadow-sm" title="Nhật ký email hệ thống" bodyStyle={{ padding: 16 }}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Paragraph type="secondary" className="!mb-0 text-sm">
                        <FileSearchOutlined className="mr-1" />
                        Theo dõi email đã gửi (cảnh báo, hàng loạt, xác nhận mượn).
                    </Paragraph>
                    <Select
                        value={typeFilter}
                        style={{ minWidth: 200 }}
                        options={TYPE_OPTIONS}
                        onChange={setTypeFilter}
                    />
                </div>
                <Spin spinning={loading}>
                    <Table
                        rowKey={(r) => String(r._id || r.id)}
                        dataSource={logs}
                        locale={{ emptyText: 'Chưa có bản ghi' }}
                        columns={[
                            {
                                title: 'Loại',
                                dataIndex: 'type',
                                key: 'type',
                                width: 140,
                                render: (v) => typeTag(v),
                            },
                            {
                                title: 'Người nhận',
                                dataIndex: 'recipientName',
                                key: 'recipientName',
                                width: 160,
                                ellipsis: true,
                                render: (v) => v || '—',
                            },
                            {
                                title: 'Email',
                                dataIndex: 'recipientEmail',
                                key: 'recipientEmail',
                                width: 200,
                                ellipsis: true,
                                render: (v) => v || '—',
                            },
                            {
                                title: 'Tiêu đề',
                                dataIndex: 'subject',
                                key: 'subject',
                                ellipsis: true,
                                render: (v) => v || '—',
                            },
                            {
                                title: 'Thời gian',
                                dataIndex: 'sentAt',
                                key: 'sentAt',
                                width: 170,
                                render: (sentAt) =>
                                    sentAt && dayjs(sentAt).isValid()
                                        ? dayjs(sentAt).format('DD/MM/YYYY HH:mm')
                                        : '—',
                            },
                            {
                                title: 'Trạng thái',
                                dataIndex: 'status',
                                key: 'status',
                                width: 110,
                                render: (status) => (
                                    <Tag color={status === 'success' ? 'green' : 'red'}>
                                        {status === 'success' ? 'Thành công' : 'Lỗi'}
                                    </Tag>
                                ),
                            },
                        ]}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                </Spin>
            </Card>
        </div>
    );
};

export default SystemAuditLog;
