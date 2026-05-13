import { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Spin, Table, Tag, Typography } from 'antd';
import { Bar } from '@ant-design/charts';
import dayjs from 'dayjs';
import { requestGetAllFines } from '../../config/request';

const { Title, Text } = Typography;

/** Chưa có API kho chi / lương — giữ số minh họa báo cáo (đồng bộ giao diện mẫu). */
const DEMO_BOOK_SUPPLY_VND = 12_500_000;
const DEMO_PAYROLL_VND = 28_000_000;
const DEMO_EXPENSE_BOOK_ROW = {
    key: 'demo-expense-book',
    kind: 'chi',
    description: 'Nhập sách mới - CNTT (ước tính báo cáo)',
    amountVnd: -2_500_000,
    at: dayjs().subtract(3, 'day'),
};

function formatVnd(n) {
    return `${Number(n || 0).toLocaleString('vi-VN')}đ`;
}

function monthShortLabel(d) {
    return `T${dayjs(d).month() + 1}`;
}

function FinancialReport() {
    const [loading, setLoading] = useState(true);
    const [fines, setFines] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await requestGetAllFines();
                const list = Array.isArray(res?.metadata) ? res.metadata : [];
                if (!cancelled) setFines(list);
            } catch {
                if (!cancelled) setFines([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const { paidThisMonthVnd, debtVnd } = useMemo(() => {
        const now = dayjs();
        let paidThisMonth = 0;
        let debt = 0;
        for (const f of fines) {
            const amt = Number(f.fineAmount || 0);
            if (f.status === 'UNPAID') {
                debt += amt;
                continue;
            }
            if (f.status === 'PAID') {
                const t = dayjs(f.updatedAt || f.createdAt);
                if (t.isSame(now, 'month') && t.isSame(now, 'year')) paidThisMonth += amt;
            }
        }
        return { paidThisMonthVnd: paidThisMonth, debtVnd: debt };
    }, [fines]);

    const chartData = useMemo(() => {
        const points = [];
        for (let i = 5; i >= 0; i -= 1) {
            const m = dayjs().subtract(i, 'month').startOf('month');
            const mEnd = m.endOf('month');
            let sum = 0;
            for (const f of fines) {
                if (f.status !== 'PAID') continue;
                const t = dayjs(f.updatedAt || f.createdAt);
                if (t.isBefore(m.subtract(1, 'second')) || t.isAfter(mEnd.add(1, 'second'))) continue;
                sum += Number(f.fineAmount || 0);
            }
            points.push({ month: monthShortLabel(m), value: sum });
        }
        return points;
    }, [fines]);

    const barConfig = useMemo(
        () => ({
            data: chartData,
            xField: 'month',
            yField: 'value',
            color: '#16a34a',
            barStyle: { radius: [6, 6, 0, 0] },
            tooltip: {
                formatter: (d) => ({
                    name: 'Thu phạt',
                    value: `${Number(d?.value || 0).toLocaleString('vi-VN')} đ`,
                }),
            },
            xAxis: { title: null },
            yAxis: { label: { formatter: (v) => `${Number(v).toLocaleString('vi-VN')}` } },
        }),
        [chartData],
    );

    const transactionRows = useMemo(() => {
        const paidRows = fines
            .filter((f) => f.status === 'PAID')
            .map((f) => ({
                key: String(f._id || f.id || f.mysqlId),
                kind: 'thu',
                description: `Phạt quá hạn - ${String(f.studentId || f.user?.studentId || f.user?.email || 'độc giả').slice(0, 12)}…`,
                amountVnd: Number(f.fineAmount || 0),
                at: dayjs(f.updatedAt || f.createdAt),
            }))
            .sort((a, b) => b.at.valueOf() - a.at.valueOf());

        return [DEMO_EXPENSE_BOOK_ROW, ...paidRows].sort((a, b) => b.at.valueOf() - a.at.valueOf()).slice(0, 14);
    }, [fines]);

    const txColumns = useMemo(
        () => [
            {
                title: 'LOẠI',
                dataIndex: 'kind',
                key: 'kind',
                width: 100,
                render: (k) =>
                    k === 'thu' ? (
                        <Tag color="success">Thu</Tag>
                    ) : (
                        <Tag color="error">Chi</Tag>
                    ),
            },
            {
                title: 'MÔ TẢ',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
            },
            {
                title: 'SỐ TIỀN',
                dataIndex: 'amountVnd',
                key: 'amountVnd',
                width: 140,
                align: 'right',
                render: (v, row) => {
                    const n = Number(v || 0);
                    const pos = n >= 0;
                    return <span className={pos ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{pos ? '+' : ''}{formatVnd(n)}</span>;
                },
            },
        ],
        [],
    );

    return (
        <div className="financial-report max-w-[1400px] pb-6">
            <div className="mb-6">
                <Title level={3} className="!mb-1 !text-slate-900">
                    Tài chính
                </Title>
                <Text type="secondary" className="text-sm">
                    Thu phạt & nợ lấy từ dữ liệu phiếu phạt trong hệ thống; chi phí nhập sách & lương là chỉ số minh họa (chưa có module kế toán).
                </Text>
            </div>

            <Spin spinning={loading}>
                <Row gutter={[16, 16]} className="mb-6">
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tổng thu phạt (tháng)</div>
                            <div className="mt-2 text-2xl font-bold text-emerald-600">{formatVnd(paidThisMonthVnd)}</div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nợ đọng</div>
                            <div className="mt-2 text-2xl font-bold text-red-600">{formatVnd(debtVnd)}</div>
                            <Text type="secondary" className="mt-1 block text-xs">
                                Tổng phiếu phạt chưa thanh toán
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Chi phí nhập sách</div>
                            <div className="mt-2 text-2xl font-bold text-blue-600">{formatVnd(DEMO_BOOK_SUPPLY_VND)}</div>
                            <Text type="secondary" className="mt-1 block text-xs">
                                Ước tính báo cáo
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lương nhân viên</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">{formatVnd(DEMO_PAYROLL_VND)}</div>
                            <Text type="secondary" className="mt-1 block text-xs">
                                Ước tính báo cáo
                            </Text>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} lg={14}>
                        <Card title="Xu hướng thu phạt (6 tháng)" className="rounded-xl border border-slate-200 shadow-sm">
                            {chartData.some((d) => d.value > 0) ? (
                                <Bar {...barConfig} height={280} />
                            ) : (
                                <div className="flex h-[280px] items-center justify-center text-slate-400">Chưa có dữ liệu thu phạt trong 6 tháng gần đây</div>
                            )}
                        </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                        <Card title="Giao dịch gần đây" className="rounded-xl border border-slate-200 shadow-sm">
                            <Table
                                size="small"
                                rowKey="key"
                                columns={txColumns}
                                dataSource={transactionRows}
                                pagination={false}
                                locale={{ emptyText: 'Chưa có phiếu phạt' }}
                            />
                        </Card>
                    </Col>
                </Row>
            </Spin>
        </div>
    );
}

export default FinancialReport;
