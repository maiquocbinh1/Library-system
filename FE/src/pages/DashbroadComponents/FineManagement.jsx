import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Button, message, Input, Space, Row, Col, Statistic } from 'antd';
import { ExportOutlined, DollarCircleOutlined, WarningOutlined, CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import { requestGetAllFines, requestPayFine } from '../../config/request';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

function exportToExcel(data) {
    const rows = data.map((r) => {
        const vb = r?.violationBook;
        const sach = vb
            ? [vb.title, vb.bookCode, (vb.copyBarcodes || []).join('; ')].filter(Boolean).join(' | ')
            : '';
        return {
            MSV: r?.user?.studentId || r?.user?.idStudent || r?.studentId || '—',
            'Họ tên': r?.user?.fullName || '—',
            'Sách vi phạm': sach || '—',
            'Số ngày trễ': r?.overdueDays || 0,
            'Tiền phạt (VNĐ)': r?.fineAmount || 0,
            'Lý do': r?.reason || '',
            'Trạng thái': r?.status === 'PAID' ? 'Đã nộp' : 'Chưa nộp',
            'Ngày tạo': r?.createdAt ? dayjs(r.createdAt).format('DD/MM/YYYY') : '',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Phiếu phạt');
    XLSX.writeFile(wb, 'danh_sach_phat.xlsx');
}

function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function openFineReceiptWindow(row, title) {
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) {
        message.error('Trình duyệt đã chặn cửa sổ mới — cho phép popup để in biên lai');
        return;
    }
    const msv = row?.user?.studentId || row?.user?.idStudent || row?.studentId || '—';
    const name = row?.user?.fullName || '—';
    const amt = Number(row?.fineAmount || 0).toLocaleString('vi-VN');
    const status = row?.status === 'PAID' ? 'Đã nộp' : 'Chưa nộp';
    const reason = String(row?.reason || '');
    const vb = row?.violationBook;
    const sachVp = vb
        ? [vb.title, vb.bookCode ? `Mã đầu sách: ${vb.bookCode}` : '', (vb.copyBarcodes || []).length ? `Bản sao: ${vb.copyBarcodes.join(', ')}` : '']
              .filter(Boolean)
              .join(' · ')
        : '—';
    const pid = row?.id || row?._id || '';
    const when = dayjs(row?.updatedAt || row?.createdAt).isValid()
        ? dayjs(row.updatedAt || row.createdAt).format('DD/MM/YYYY HH:mm')
        : dayjs().format('DD/MM/YYYY HH:mm');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;padding:28px;max-width:360px;margin:0 auto;}
h1{font-size:17px;margin:0 0 8px;} .muted{color:#64748b;font-size:12px;} table{width:100%;margin-top:14px;font-size:14px;}
td{padding:8px 0;vertical-align:top;border-bottom:1px solid #e2e8f0;} td:first-child{width:38%;color:#64748b;}
.sign{margin-top:36px;font-size:12px;color:#64748b;}</style></head><body>
<h1>${title}</h1>
<p class="muted">Thư viện PTIT · ${when}</p>
<table>
<tr><td>MSV / MSG</td><td><strong>${escHtml(msv)}</strong></td></tr>
<tr><td>Họ tên</td><td>${escHtml(name)}</td></tr>
<tr><td>Số tiền</td><td><strong>${escHtml(amt)} đ</strong></td></tr>
<tr><td>Trạng thái</td><td>${escHtml(status)}</td></tr>
<tr><td>Lý do</td><td>${escHtml(reason || '—')}</td></tr>
<tr><td>Sách vi phạm</td><td>${escHtml(sachVp)}</td></tr>
<tr><td>Mã phiếu</td><td style="font-family:monospace;font-size:12px;">${escHtml(pid)}</td></tr>
</table>
<p class="sign">Chữ ký thủ thư: _______________</p>
</body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
        w.print();
        w.close();
    }, 200);
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
            const msv = String(row?.user?.studentId || row?.user?.idStudent || row?.studentId || '').toLowerCase();
            const name = String(row?.user?.fullName || '').toLowerCase();
            const reason = String(row?.reason || '').toLowerCase();
            const vb = row?.violationBook;
            const vioStr = [vb?.title, vb?.bookCode, ...(vb?.copyBarcodes || [])].filter(Boolean).join(' ').toLowerCase();
            return msv.includes(q) || name.includes(q) || reason.includes(q) || vioStr.includes(q);
        });
    }, [data, searchText]);

    const violationBookColumn = {
        title: 'Sách vi phạm',
        key: 'violationBook',
        width: 260,
        ellipsis: true,
        render: (_, row) => {
            const vb = row?.violationBook;
            if (!vb || (!vb.title && !vb.bookCode && !(vb.copyBarcodes || []).length)) {
                return <span className="text-slate-400">—</span>;
            }
            return (
                <div className="max-w-[240px] text-sm">
                    {vb.title ? <div className="font-medium text-slate-800">{vb.title}</div> : null}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                        {vb.bookCode ? (
                            <Tag color="blue" className="!m-0 font-mono text-xs">
                                {vb.bookCode}
                            </Tag>
                        ) : null}
                    </div>
                    {(vb.copyBarcodes || []).length > 0 ? (
                        <div className="mt-1 text-xs text-slate-500">
                            Bản sao:{' '}
                            <span className="font-mono text-slate-700">{vb.copyBarcodes.join(', ')}</span>
                        </div>
                    ) : null}
                </div>
            );
        },
    };

    const columns = [
        {
            title: 'Mã MSV / MSG',
            key: 'msv',
            width: 140,
            render: (_, row) => row?.user?.studentId || row?.user?.idStudent || row?.studentId || '—',
        },
        {
            title: 'Tên độc giả',
            key: 'name',
            ellipsis: true,
            render: (_, row) => row?.user?.fullName || '—',
        },
        violationBookColumn,
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
            width: 220,
            fixed: 'right',
            render: (_, record) =>
                record.status === 'UNPAID' ? (
                    <Space size="small" wrap>
                        <Button type="primary" size="small" loading={payingId === (record.id || record._id)} onClick={() => handlePay(record)}>
                            Thu tiền
                        </Button>
                        <Button size="small" icon={<PrinterOutlined />} onClick={() => openFineReceiptWindow(record, 'Thông báo nợ phạt')}>
                            In phiếu
                        </Button>
                    </Space>
                ) : (
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => openFineReceiptWindow(record, 'Biên lai thu phạt')}>
                        In biên lai
                    </Button>
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
                            placeholder="Tìm MSV, tên, sách, mã bản sao, lý do..."
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
                    scroll={{ x: 1320 }}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    size="middle"
                    className="rounded-xl"
                />
            </Card>
        </div>
    );
};

export default FineManagement;
