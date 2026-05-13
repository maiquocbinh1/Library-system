import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Spin, Table, Tag, Typography } from 'antd';
import { Bar } from '@ant-design/charts';
import dayjs from 'dayjs';
import { requestGetAllFines, requestGetAllProduct, requestGetStaffList } from '../../config/request';
import { compareByBookCodeAsc } from '../../utils/bookCodeSort';

const { Title, Text } = Typography;

const SALARY_STORE_KEY = 'finance_staff_salary_v1';

function formatVnd(n) {
    return `${Number(n || 0).toLocaleString('vi-VN')}đ`;
}

function monthShortLabel(d) {
    return `T${dayjs(d).month() + 1}`;
}

function randInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randomSalaryVnd() {
    // 6tr - 20tr, step 100k
    const raw = randInt(6_000_000, 20_000_000);
    return Math.round(raw / 100_000) * 100_000;
}

function FinancialReport() {
    const [loading, setLoading] = useState(true);
    const [fines, setFines] = useState([]);
    const [books, setBooks] = useState([]);
    const [staff, setStaff] = useState([]);
    const [bookPriceModalOpen, setBookPriceModalOpen] = useState(false);
    const [payrollModalOpen, setPayrollModalOpen] = useState(false);
    const [bookPriceSearch, setBookPriceSearch] = useState('');
    const [salaryModal, setSalaryModal] = useState({ open: false, staffId: null });
    const [salaryForm] = Form.useForm();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [fineRes, bookRes, staffRes] = await Promise.all([
                    requestGetAllFines(),
                    requestGetAllProduct(),
                    requestGetStaffList(),
                ]);
                const finesList = Array.isArray(fineRes?.metadata) ? fineRes.metadata : [];
                const bookList = Array.isArray(bookRes?.metadata) ? bookRes.metadata : Array.isArray(bookRes?.data) ? bookRes.data : [];
                const staffList = Array.isArray(staffRes?.metadata) ? staffRes.metadata : [];
                if (!cancelled) {
                    setFines(finesList);
                    setBooks(bookList);
                    setStaff(staffList);
                }
            } catch {
                if (!cancelled) {
                    setFines([]);
                    setBooks([]);
                    setStaff([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const salaryById = useMemo(() => {
        try {
            const raw = localStorage.getItem(SALARY_STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }, []);

    const staffRows = useMemo(() => {
        const rows = staff.map((s) => {
            const sid = String(s?.id || s?._id || '');
            const current = salaryById[sid];
            return {
                key: sid,
                id: sid,
                fullName: s?.fullName || s?.name || '—',
                role: s?.role || s?.staffRole || 'staff',
                email: s?.email || '—',
                salaryVnd: Number(current || 0) > 0 ? Number(current) : null,
            };
        });

        // Nếu chưa có salary cho ai, auto-generate lần đầu (persist localStorage)
        const missing = rows.filter((r) => r.id && !salaryById[r.id]);
        if (missing.length > 0) {
            const next = { ...salaryById };
            for (const m of missing) {
                next[m.id] = randomSalaryVnd();
            }
            try {
                localStorage.setItem(SALARY_STORE_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return rows.map((r) => ({ ...r, salaryVnd: next[r.id] || r.salaryVnd }));
        }
        return rows.map((r) => ({ ...r, salaryVnd: r.salaryVnd ?? salaryById[r.id] ?? null }));
    }, [staff, salaryById]);

    const payrollTotalVnd = useMemo(() => {
        return staffRows.reduce((s, r) => s + Number(r.salaryVnd || 0), 0);
    }, [staffRows]);

    const bookPriceRows = useMemo(() => {
        const list = books
            .map((b) => {
                const title = b?.title || b?.nameProduct || '—';
                const bookCode = b?.bookCode || b?.mysqlId || '';
                const copies = Number(b?.totalCopies || 0);
                const importPriceVnd = Number(b?.importPriceVnd ?? b?.importPrice ?? b?.purchasePriceVnd ?? 0);
                const total = importPriceVnd > 0 ? importPriceVnd * (copies > 0 ? copies : 1) : 0;
                return {
                    key: String(b?.id || b?.mysqlId || b?._id || bookCode || title),
                    title,
                    bookCode,
                    totalCopies: copies,
                    importPriceVnd: importPriceVnd > 0 ? importPriceVnd : null,
                    totalImportVnd: total > 0 ? total : null,
                };
            })
            .sort(compareByBookCodeAsc);
        return list;
    }, [books]);

    const bookSupplyTotalVnd = useMemo(() => {
        return bookPriceRows.reduce((s, r) => s + Number(r.totalImportVnd || 0), 0);
    }, [bookPriceRows]);

    const filteredBookPriceRows = useMemo(() => {
        const q = String(bookPriceSearch || '').trim().toLowerCase();
        if (!q) return bookPriceRows;
        return bookPriceRows.filter((r) => String(r?.bookCode || '').toLowerCase().includes(q));
    }, [bookPriceRows, bookPriceSearch]);

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

        const expenseRow = bookSupplyTotalVnd > 0
            ? {
                  key: 'expense-books',
                  kind: 'chi',
                  description: 'Chi phí nhập sách (tổng hợp từ giá nhập × số bản)',
                  amountVnd: -bookSupplyTotalVnd,
                  // Để demo “thu/chi nhập sách” nằm trang cuối: đặt thời điểm rất cũ để luôn xuống cuối.
                  at: dayjs('2000-01-01'),
              }
            : null;

        return [...paidRows, ...(expenseRow ? [expenseRow] : [])];
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
        <div className="financial-report space-y-6 pb-6">
            <div className="mb-6">
                <Title level={3} className="!mb-1 !text-slate-900">
                    Tài chính
                </Title>
            </div>

            <Spin spinning={loading}>
                <Row gutter={[16, 16]} className="mb-6">
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="h-full rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tổng thu phạt (tháng)</div>
                            <div className="mt-2 text-2xl font-bold text-emerald-600">{formatVnd(paidThisMonthVnd)}</div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="h-full rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nợ đọng</div>
                            <div className="mt-2 text-2xl font-bold text-red-600">{formatVnd(debtVnd)}</div>
                            <Text type="secondary" className="mt-1 block text-xs">
                                Tổng phiếu phạt chưa thanh toán
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="h-full rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="flex h-full flex-col">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Chi phí nhập sách</div>
                                    <div className="mt-2 text-2xl font-bold text-blue-600">{formatVnd(bookSupplyTotalVnd)}</div>
                                </div>
                                <div className="mt-auto pt-3">
                                    <Button size="small" className="h-8 rounded-lg px-3" onClick={() => setBookPriceModalOpen(true)}>
                                        Xem danh sách
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                        <Card className="h-full rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                            <div className="flex h-full flex-col">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lương nhân viên</div>
                                    <div className="mt-2 text-2xl font-bold text-slate-900">{formatVnd(payrollTotalVnd)}</div>
                                </div>
                                <div className="mt-auto pt-3">
                                    <Button size="small" className="h-8 rounded-lg px-3" onClick={() => setPayrollModalOpen(true)}>
                                        Xem danh sách
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} align="stretch">
                    <Col xs={24} lg={14}>
                        <Card title="Xu hướng thu phạt (6 tháng)" className="h-full rounded-xl border border-slate-200 shadow-sm">
                            {chartData.some((d) => d.value > 0) ? (
                                <Bar {...barConfig} height={280} />
                            ) : (
                                <div className="flex h-[280px] items-center justify-center text-slate-400">Chưa có dữ liệu thu phạt trong 6 tháng gần đây</div>
                            )}
                        </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                        <Card title="Giao dịch gần đây" className="h-full rounded-xl border border-slate-200 shadow-sm">
                            <Table
                                size="small"
                                rowKey="key"
                                columns={txColumns}
                                dataSource={transactionRows}
                                pagination={{ pageSize: 10, showSizeChanger: true }}
                                locale={{ emptyText: 'Chưa có phiếu phạt' }}
                            />
                        </Card>
                    </Col>
                </Row>

                <Modal
                    title="Danh sách giá nhập sách"
                    open={bookPriceModalOpen}
                    onCancel={() => {
                        setBookPriceModalOpen(false);
                        setBookPriceSearch('');
                    }}
                    footer={[
                        <Button key="close" onClick={() => setBookPriceModalOpen(false)}>
                            Đóng
                        </Button>,
                    ]}
                    width={980}
                >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <Input.Search
                            allowClear
                            placeholder="Tìm theo mã sách (VD: B001, BO-010...)"
                            className="max-w-sm"
                            value={bookPriceSearch}
                            onChange={(e) => setBookPriceSearch(e.target.value)}
                        />
                        <Text type="secondary" className="text-xs">
                            {filteredBookPriceRows.length}/{bookPriceRows.length} kết quả
                        </Text>
                    </div>
                    <Table
                        size="small"
                        rowKey="key"
                        dataSource={filteredBookPriceRows}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 860 }}
                        columns={[
                            { title: 'Mã', dataIndex: 'bookCode', width: 120, render: (v) => <span className="font-mono text-xs">{v || '—'}</span> },
                            { title: 'Tên sách', dataIndex: 'title', ellipsis: true },
                            { title: 'Số bản', dataIndex: 'totalCopies', width: 90, align: 'right' },
                            {
                                title: 'Giá nhập/cuốn',
                                dataIndex: 'importPriceVnd',
                                width: 140,
                                align: 'right',
                                render: (v) => (v ? formatVnd(v) : <span className="text-slate-400">—</span>),
                            },
                            {
                                title: 'Tổng',
                                dataIndex: 'totalImportVnd',
                                width: 140,
                                align: 'right',
                                render: (v) => (v ? <b className="text-slate-900">{formatVnd(v)}</b> : <span className="text-slate-400">—</span>),
                            },
                        ]}
                        locale={{ emptyText: 'Không tìm thấy mã sách phù hợp.' }}
                    />
                </Modal>

                <Modal
                    title="Danh sách lương nhân viên"
                    open={payrollModalOpen}
                    onCancel={() => setPayrollModalOpen(false)}
                    footer={[
                        <Button key="close" onClick={() => setPayrollModalOpen(false)}>
                            Đóng
                        </Button>,
                    ]}
                    width={980}
                >
                    <div className="mb-2">
                        <Text type="secondary" className="text-xs">
                            Dataset lương lưu trên máy (localStorage). Bạn có thể chỉnh sửa từng nhân viên.
                        </Text>
                    </div>
                    <Table
                        size="small"
                        rowKey="key"
                        dataSource={staffRows}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 780 }}
                        columns={[
                            { title: 'Tên', dataIndex: 'fullName', ellipsis: true },
                            { title: 'Email', dataIndex: 'email', ellipsis: true },
                            { title: 'Vai trò', dataIndex: 'role', width: 110, render: (v) => <Tag color="blue">{String(v || 'staff')}</Tag> },
                            {
                                title: 'Lương',
                                dataIndex: 'salaryVnd',
                                width: 140,
                                align: 'right',
                                render: (v) => <span className="font-semibold text-slate-900">{formatVnd(v || 0)}</span>,
                            },
                            {
                                title: '',
                                key: 'edit',
                                width: 90,
                                render: (_, r) => (
                                    <Button
                                        size="small"
                                        className="h-8 rounded-lg px-3"
                                        onClick={() => {
                                            setSalaryModal({ open: true, staffId: r.id });
                                            salaryForm.setFieldsValue({ salaryVnd: Number(r.salaryVnd || 0) });
                                        }}
                                    >
                                        Sửa
                                    </Button>
                                ),
                            },
                        ]}
                        locale={{ emptyText: 'Chưa có danh sách nhân sự (cần quyền Admin).' }}
                    />
                </Modal>

                <Modal
                    title="Chỉnh sửa lương"
                    open={salaryModal.open}
                    onCancel={() => setSalaryModal({ open: false, staffId: null })}
                    onOk={() => {
                        salaryForm
                            .validateFields()
                            .then((values) => {
                                const sid = String(salaryModal.staffId || '').trim();
                                if (!sid) return;
                                let next = {};
                                try {
                                    next = JSON.parse(localStorage.getItem(SALARY_STORE_KEY) || '{}') || {};
                                } catch { next = {}; }
                                next[sid] = Number(values.salaryVnd || 0);
                                try {
                                    localStorage.setItem(SALARY_STORE_KEY, JSON.stringify(next));
                                } catch { /* ignore */ }
                                // refresh by triggering state update via staff set (cheap)
                                setStaff((prev) => [...prev]);
                                setSalaryModal({ open: false, staffId: null });
                            })
                            .catch(() => {});
                    }}
                    okText="Lưu"
                    cancelText="Hủy"
                >
                    <Form form={salaryForm} layout="vertical">
                        <Form.Item
                            name="salaryVnd"
                            label="Lương (VNĐ)"
                            rules={[{ required: true, message: 'Nhập lương' }]}
                        >
                            <InputNumber
                                className="w-full"
                                min={0}
                                step={100000}
                                formatter={(v) => `${String(v || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}đ`}
                                parser={(v) => String(v || '').replace(/[^\d]/g, '')}
                            />
                        </Form.Item>
                    </Form>
                </Modal>
            </Spin>
        </div>
    );
}

export default FinancialReport;
