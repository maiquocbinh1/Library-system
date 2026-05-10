import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Button, message, Input, Space, Row, Col, Statistic } from 'antd';
import { ExportOutlined, DollarCircleOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { requestGetAllFines, requestPayFine } from '../../config/request';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

function exportToExcel(data) {
    const rows = data.map((r) => ({
        MSV: r?.user?.studentId || r?.studentId || '—',
        'Họ tên': r?.user?.fullName || '—',
        'Số ngày trễ': r?.overdueDays || 0,
        'Tiền phạt (VNĐ)': r?.fineAmount || 0,
        'Lý do': r?.reason || '',
        'Trạng thái': r?.status === 'PAID' ? 'Đã nộp' : 'Chưa nộp',
        'Ngày tạo': r?.createdAt ? dayjs(r.createdAt).format('DD/MM/YYYY') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Phiếu phạt');
    XLSX.writeFile(wb, 'danh_sach_phat.xlsx');
}

const FineManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [payingId, setPayingId] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetAllFines();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setData(list);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể tải danh sách phiếu phạt');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePay = async (record) => {
        const id = record.id || record._id;
        if (!id) return;
        try {
            setPayingId(id);
            await requestPayFine(id);
            message.success('Đã xác nhận thu tiền phạt');
            await fetchData();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể cập nhật thanh toán');
        } finally {
            setPayingId(null);
        }
    };

    const filtered = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return data;
        return data.filter((row) => {
            const msv = String(row?.user?.studentId || row?.studentId || '').toLowerCase();
            const name = String(row?.user?.fullName || '').toLowerCase();
            const reason = String(row?.reason || '').toLowerCase();
            return msv.includes(q) || name.includes(q) || reason.includes(q);
        });
    }, [data, searchText]);

    const columns = [
        {
            title: 'Mã MSV / MSG',
            key: 'msv',
            width: 140,
            render: (_, row) => row?.user?.studentId || row?.studentId || '—',
        },
        {
            title: 'Tên độc giả',
            key: 'name',
            ellipsis: true,
            render: (_, row) => row?.user?.fullName || '—',
        },
        {
            title: 'Số ngày trễ',
            dataIndex: 'overdueDays',
            key: 'overdueDays',
            width: 110,
        },
        {
            title: 'Tổng tiền phạt (VNĐ)',
            dataIndex: 'fineAmount',
            key: 'fineAmount',
            width: 160,
            render: (v) => Number(v || 0).toLocaleString('vi-VN'),
        },
        {
            title: 'Lý do',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (s) =>
                s === 'PAID' ? <Tag color="success">Đã nộp</Tag> : <Tag color="warning">Chưa nộp</Tag>,
        },
        {
            title: 'Ngày tạo',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 120,
            render: (v) => (v && dayjs(v).isValid() ? dayjs(v).format('DD/MM/YYYY') : '—'),
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_, record) =>
                record.status === 'UNPAID' ? (
                    <Button type="primary" size="small" loading={payingId === (record.id || record._id)} onClick={() => handlePay(record)}>
                        Thu tiền
                    </Button>
                ) : (
                    '—'
                ),
        },
    ];

    const totalUnpaid = useMemo(() => data.filter((r) => r.status === 'UNPAID').reduce((s, r) => s + Number(r.fineAmount || 0), 0), [data]);
    const todayCollected = useMemo(() => {
        const today = dayjs().format('YYYY-MM-DD');
        return data.filter((r) => r.status === 'PAID' && dayjs(r.updatedAt || r.createdAt).format('YYYY-MM-DD') === today)
            .reduce((s, r) => s + Number(r.fineAmount || 0), 0);
    }, [data]);
    const unpaidCount = useMemo(() => data.filter((r) => r.status === 'UNPAID').length, [data]);

    return (
        <div className="flex flex-col gap-4">
            {/* 3 thẻ tổng quan */}
            <Row gutter={16}>
                <Col xs={24} sm={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 14 }}>
                        <Statistic title={<span className="text-slate-500 text-xs">Tổng nợ phạt chưa thu</span>}
                            value={totalUnpaid} formatter={(v) => `${Number(v).toLocaleString('vi-VN')} đ`}
                            prefix={<WarningOutlined className="text-red-500" />} valueStyle={{ color: '#ef4444' }} />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 14 }}>
                        <Statistic title={<span className="text-slate-500 text-xs">Đã thu hôm nay</span>}
                            value={todayCollected} formatter={(v) => `${Number(v).toLocaleString('vi-VN')} đ`}
                            prefix={<DollarCircleOutlined className="text-green-600" />} valueStyle={{ color: '#16a34a' }} />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 14 }}>
                        <Statistic title={<span className="text-slate-500 text-xs">Phiếu phạt chưa thanh toán</span>}
                            value={unpaidCount} suffix="phiếu"
                            prefix={<CheckCircleOutlined className="text-amber-500" />} valueStyle={{ color: '#f59e0b' }} />
                    </Card>
                </Col>
            </Row>

            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold text-slate-900">Quản lý Phạt</h2>
                    <Space wrap>
                        <Input.Search
                            allowClear
                            placeholder="Tìm MSV, tên, lý do..."
                            className="max-w-xs"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        <Button icon={<ExportOutlined />} onClick={() => exportToExcel(filtered)}>Xuất Excel</Button>
                        <Button onClick={() => fetchData()} loading={loading}>Làm mới</Button>
                    </Space>
                </div>
                <Table
                    rowKey={(r) => r.id || r._id}
                    columns={columns}
                    dataSource={filtered}
                    loading={loading}
                    scroll={{ x: 1100 }}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    size="middle"
                    className="rounded-xl"
                />
            </Card>
        </div>
    );
};

export default FineManagement;
