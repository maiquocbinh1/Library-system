import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Input, message } from 'antd';
import { requestGetBookCopies } from '../../config/request';

const STATUS_MAP = {
    AVAILABLE: { color: 'success', text: 'Có sẵn' },
    RESERVED: { color: 'processing', text: 'Giữ chỗ' },
    BORROWED: { color: 'warning', text: 'Đang mượn' },
    MAINTENANCE: { color: 'default', text: 'Bảo trì' },
    LOST: { color: 'error', text: 'Mất' },
};

const BookCopyManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetBookCopies();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setData(list);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể tải danh sách bản sao');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filtered = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return data;
        return data.filter((row) => {
            const bc = String(row?.barcode || '').toLowerCase();
            const title = String(row?.title || '').toLowerCase();
            const code = String(row?.bookCode || '').toLowerCase();
            return bc.includes(q) || title.includes(q) || code.includes(q);
        });
    }, [data, searchText]);

    const columns = [
        { title: 'Mã vạch (Barcode)', dataIndex: 'barcode', key: 'barcode', width: 200, ellipsis: true },
        { title: 'Mã đầu sách', dataIndex: 'bookCode', key: 'bookCode', width: 120 },
        { title: 'Tên sách', dataIndex: 'title', key: 'title', ellipsis: true },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (s) => {
                const m = STATUS_MAP[s] || { color: 'default', text: s || '—' };
                return <Tag color={m.color}>{m.text}</Tag>;
            },
        },
        {
            title: 'Tình trạng bản',
            dataIndex: 'condition',
            key: 'condition',
            width: 120,
            render: (c) => c || '—',
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-xl border-slate-200 shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Quản lý bản sao & mã vạch</h2>
                        <p className="text-sm text-slate-500">Theo dõi từng cuốn vật lý (barcode) trong kho thư viện.</p>
                    </div>
                    <Input.Search
                        allowClear
                        placeholder="Barcode, mã sách, tên sách..."
                        className="max-w-sm"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
                <Table
                    rowKey={(r) => r._id || r.id}
                    columns={columns}
                    dataSource={filtered}
                    loading={loading}
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 15, showSizeChanger: true }}
                    size="middle"
                />
            </Card>
        </div>
    );
};

export default BookCopyManagement;
