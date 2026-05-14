import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Row, Col, Card, Statistic, Modal, Table, Input, Select, Tag,
    Button, Slider, Progress, message, Tooltip, Form, Spin,
} from 'antd';
import { Bar } from '@ant-design/charts';
import {
    UserOutlined, BookOutlined, SolutionOutlined, ReadOutlined,
    WarningOutlined, DollarCircleOutlined, BarChartOutlined,
    ArrowUpOutlined, ArrowDownOutlined, ExportOutlined,
    BellOutlined,
} from '@ant-design/icons';
import {
    requestGetAllHistoryBook, requestGetAllProduct, requestGetAllUsers, requestStatistics,
    requestGetEisKpis, requestGetCategoryTrends, requestGetDrilldown, requestPostWhatIf,
    requestGetHighRiskUsers, requestGetUnusedBooks, requestExportHighRisk, requestExportUnusedBooks,
    requestSendMassNotification,
} from '../../config/request';
import dayjs from 'dayjs';
import { isPendingApproval, isReadyForPickup } from '../../utils/loanTicketStatus';
import { compareByBookCodeAsc } from '../../utils/bookCodeSort';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtVnd = (v) => Number(v || 0).toLocaleString('vi-VN') + ' đ';

// ─── EIS KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ title, subtitle, value, percent, progressColor, extra, pulse }) {
    return (
        <Card className="rounded-2xl shadow-sm h-full" bodyStyle={{ padding: 16 }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</div>
            {subtitle && <div className="text-[11px] text-slate-400 mb-2">{subtitle}</div>}
            <div className={`text-3xl font-bold mb-3 ${pulse ? 'animate-pulse text-red-500' : 'text-slate-800'}`}>
                {value}
            </div>
            {percent !== undefined && (
                <Progress percent={percent} strokeColor={progressColor} showInfo={false} size="small" />
            )}
            {extra && <div className="mt-2">{extra}</div>}
        </Card>
    );
}

// ─── Statistics component ─────────────────────────────────────────────────────
const Statistics = () => {
    // Basic stats
    const [data, setData] = useState({});
    const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [isBooksModalOpen, setIsBooksModalOpen] = useState(false);
    const [books, setBooks] = useState([]);
    const [booksLoading, setBooksLoading] = useState(false);
    const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingSearchText, setPendingSearchText] = useState('');
    const [searchText, setSearchText] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // EIS KPIs
    const [kpis, setKpis] = useState(null);
    const [kpisLoading, setKpisLoading] = useState(false);

    // DSS trends
    const [trendPeriod, setTrendPeriod] = useState('all');
    const [trendData, setTrendData] = useState({ labels: [], data: [] });
    const [trendLoading, setTrendLoading] = useState(false);
    const [drilldownModal, setDrilldownModal] = useState({ open: false, category: '', data: [], loading: false });

    // What-If
    const [whatIfMaxDays, setWhatIfMaxDays] = useState(14);
    const [whatIfFineRate, setWhatIfFineRate] = useState(1000);
    const [whatIfPeriod, setWhatIfPeriod] = useState('all');
    const [whatIfResult, setWhatIfResult] = useState(null);
    const [whatIfLoading, setWhatIfLoading] = useState(false);

    // Warning tables
    const [highRiskUsers, setHighRiskUsers] = useState([]);
    const [highRiskLoading, setHighRiskLoading] = useState(false);
    const [unusedBooks, setUnusedBooks] = useState([]);
    const [unusedLoading, setUnusedLoading] = useState(false);
    // const [sendingEmail, setSendingEmail] = useState(null);

    // Mass email modal
    const [massEmailOpen, setMassEmailOpen] = useState(false);
    const [massEmailLoading, setMassEmailLoading] = useState(false);
    const [massForm] = Form.useForm();

    // ── fetch basic ──────────────────────────────────────────────────────────
    useEffect(() => {
        requestStatistics().then((res) => setData(res?.metadata ?? res ?? {}));
    }, []);

    // ── fetch EIS KPIs ────────────────────────────────────────────────────────
    useEffect(() => {
        setKpisLoading(true);
        requestGetEisKpis()
            .then((res) => setKpis(res?.metadata || null))
            .catch(() => {})
            .finally(() => setKpisLoading(false));
    }, []);

    // ── fetch trend ───────────────────────────────────────────────────────────
    const fetchTrend = useCallback((period) => {
        setTrendLoading(true);
        requestGetCategoryTrends(period)
            .then((res) => setTrendData(res?.metadata || { labels: [], data: [] }))
            .catch(() => {})
            .finally(() => setTrendLoading(false));
    }, []);

    useEffect(() => { fetchTrend(trendPeriod); }, [trendPeriod, fetchTrend]);

    // ── fetch warning tables ──────────────────────────────────────────────────
    useEffect(() => {
        setHighRiskLoading(true);
        requestGetHighRiskUsers()
            .then((res) => setHighRiskUsers(Array.isArray(res?.metadata) ? res.metadata : []))
            .catch(() => {})
            .finally(() => setHighRiskLoading(false));
        setUnusedLoading(true);
        requestGetUnusedBooks()
            .then((res) => setUnusedBooks(Array.isArray(res?.metadata) ? res.metadata : []))
            .catch(() => {})
            .finally(() => setUnusedLoading(false));
    }, []);

    // ── fetch users / books / pending (modal) ─────────────────────────────────
    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const res = await requestGetAllUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setUsers(list.map((item) => ({ ...item, id: item?.id || item?.mysqlId || String(item?._id || '') })));
        } finally { setUsersLoading(false); }
    };
    const fetchBooks = async () => {
        setBooksLoading(true);
        try {
            const res = await requestGetAllProduct();
            const list = Array.isArray(res?.metadata) ? res.metadata : Array.isArray(res?.data) ? res.data : [];
            const normalized = list.map((item) => ({
                ...item,
                id: item?._id ? String(item._id) : item?.id,
                bookCode: item?.bookCode || '',
                nameProduct: item?.nameProduct || '',
                publisher: item?.publisher || '',
                category_1: item?.category_1 || item?.category || '',
                stock: Number(item?.stock || 0),
                year: item?.year || item?.publishYear || '',
            }));
            setBooks([...normalized].sort(compareByBookCodeAsc));
        } finally { setBooksLoading(false); }
    };
    const refreshPendingSection = useCallback(async () => {
        setPendingLoading(true);
        try {
            const [statRes, histRes] = await Promise.all([
                requestStatistics(),
                requestGetAllHistoryBook(),
            ]);
            setData(statRes?.metadata ?? statRes ?? {});
            const list = Array.isArray(histRes?.metadata) ? histRes.metadata : [];
            setPendingRequests(
                list
                    .map((item) => ({
                        ...item,
                        id: item?._id ? String(item._id) : item?.id,
                        fullName: item?.fullName || '',
                        productName: item?.product?.nameProduct || item?.nameProduct || '',
                        quantity: Number(item?.quantity || 0),
                        status: item?.status || '',
                        borrowDate: item?.borrowDate || null,
                        returnDate: item?.returnDate || null,
                    }))
                                                    .filter((x) => isPendingApproval(x?.status) || isReadyForPickup(x?.status)),
            );
        } finally {
            setPendingLoading(false);
        }
    }, []);

    // ── what-if ───────────────────────────────────────────────────────────────
    const runWhatIf = async () => {
        setWhatIfLoading(true);
        try {
            const res = await requestPostWhatIf({ max_days: whatIfMaxDays, fine_rate: whatIfFineRate, period: whatIfPeriod });
            setWhatIfResult(res?.metadata || null);
        } catch { message.error('Mô phỏng thất bại'); }
        finally { setWhatIfLoading(false); }
    };

    // ── drilldown ─────────────────────────────────────────────────────────────
    const openDrilldown = async (category) => {
        setDrilldownModal({ open: true, category, data: [], loading: true });
        try {
            const res = await requestGetDrilldown(category, trendPeriod);
            setDrilldownModal((prev) => ({ ...prev, data: Array.isArray(res?.metadata) ? res.metadata : [], loading: false }));
        } catch {
            setDrilldownModal((prev) => ({ ...prev, loading: false }));
        }
    };

    // Cảnh báo rủi ro cao: hệ thống tự nhắc theo lịch (job) — ở đây chỉ hiển thị số lần đã nhắc.

    // ── mass notification ────────────────────────────────────────────────────
    const handleMassEmail = async () => {
        try {
            const values = await massForm.validateFields();
            setMassEmailLoading(true);
            // gửi broadcast nội bộ: lấy danh sách tất cả độc giả (chỉ user) từ bảng users đã nạp trong modal (fallback: gọi requestGetAllUsers)
            const res = await requestGetAllUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const userIds = list.filter((u) => String(u?.role || '').toLowerCase() === 'user').map((u) => u.id || u.mysqlId || u._id).filter(Boolean);
            await requestSendMassNotification({ userIds, title: values.subject, contentHtml: `<div style="white-space:pre-wrap">${String(values.content || '')}</div>` });
            message.success('Đã gửi thông báo nội bộ thành công!');
            setMassEmailOpen(false);
            massForm.resetFields();
        } catch (e) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.message || 'Gửi thất bại');
        } finally { setMassEmailLoading(false); }
    };

    // ── memos ─────────────────────────────────────────────────────────────────
    const filteredUsers = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        return users.filter((u) => {
            if (roleFilter !== 'all' && String(u?.role || '').toLowerCase() !== roleFilter) return false;
            if (!q) return true;
            return [u?.fullName, u?.email, u?.id].some((v) => String(v || '').toLowerCase().includes(q));
        });
    }, [users, searchText, roleFilter]);

    const filteredBooks = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return books;
        return books.filter((b) =>
            [b?.bookCode, b?.nameProduct, b?.publisher, b?.category_1].some((v) =>
                String(v || '').toLowerCase().includes(q)
            )
        );
    }, [books, searchText]);

    const bookStats = useMemo(() => {
        const totalTitles = books.length;
        const totalQuantity = books.reduce((s, b) => s + Number(b?.stock || 0), 0);
        const titlesInStock = books.filter((b) => Number(b?.stock || 0) > 0).length;
        const titlesOutOfStock = books.filter((b) => Number(b?.stock || 0) <= 0).length;
        const lowStockTitles = books.filter((b) => { const s = Number(b?.stock || 0); return s > 0 && s <= 2; }).length;
        const categorySet = new Set(books.map((b) => String(b?.category_1 || '').trim()).filter((v) => v && v !== '-'));
        const authorSet = new Set(books.map((b) => String(b?.publisher || '').trim()).filter((v) => v && v !== '-'));
        return { totalTitles, totalQuantity, titlesInStock, titlesOutOfStock, lowStockTitles, totalCategories: categorySet.size, totalAuthors: authorSet.size };
    }, [books]);

    const filteredPendingRequests = useMemo(() => {
        const q = String(pendingSearchText || '').trim().toLowerCase();
        if (!q) return pendingRequests;
        return pendingRequests.filter((x) =>
            [x?.id, x?.fullName, x?.productName].some((v) => String(v || '').toLowerCase().includes(q))
        );
    }, [pendingRequests, pendingSearchText]);

    // ── trend chart config ────────────────────────────────────────────────────
    const trendChartData = (trendData.labels || []).map((label, i) => ({
        category: label,
        count: trendData.data[i] || 0,
    }));

    const trendBarConfig = {
        data: trendChartData,
        xField: 'category',
        yField: 'count',
        color: '#6366f1',
        label: { position: 'top', style: { fill: '#475569', fontSize: 11 } },
        xAxis: { title: null },
        yAxis: { title: { text: 'Lượt mượn' } },
        tooltip: { formatter: (d) => ({ name: d.category, value: d.count + ' lượt' }) },
        barStyle: { radius: [6, 6, 0, 0] },
        onReady: (plot) => {
            plot.on('element:click', (e) => {
                const cat = e?.data?.data?.category;
                if (cat) openDrilldown(cat);
            });
        },
    };

    // ── EIS overdue badge ─────────────────────────────────────────────────────
    const overdueRate = kpis?.overdue_rate ?? 0;
    const overdueBadge = overdueRate < 10
        ? { color: 'success', text: 'An toàn' }
        : overdueRate <= 20
            ? { color: 'warning', text: 'Cảnh báo' }
            : { color: 'error', text: 'Nguy hiểm' };

    // ── financial ─────────────────────────────────────────────────────────────
    const collected = kpis?.financial?.collected || 0;
    const outstanding = kpis?.financial?.outstanding || 0;
    const totalFin = collected + outstanding;
    const collectedPct = totalFin ? Math.round((collected / totalFin) * 100) : 0;

    // ── columns ───────────────────────────────────────────────────────────────
    const userColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 220, ellipsis: true },
        { title: 'Tên người dùng', dataIndex: 'fullName', key: 'fullName', width: 220, ellipsis: true },
        { title: 'Gmail', dataIndex: 'email', key: 'email', width: 260, ellipsis: true },
        { title: 'Chức vụ', dataIndex: 'role', key: 'role', width: 120, render: (role) => <Tag color={String(role || '').toLowerCase() === 'admin' ? 'purple' : 'blue'}>{role || '-'}</Tag> },
    ];
    const bookColumns = [
        { title: 'Mã sách', dataIndex: 'bookCode', key: 'bookCode', width: 130, ellipsis: true },
        { title: 'Tên sách', dataIndex: 'nameProduct', key: 'nameProduct', width: 260, ellipsis: true },
        { title: 'Thể loại', dataIndex: 'category_1', key: 'category_1', width: 160, render: (v) => <Tag color="blue">{String(v || '-').trim()}</Tag> },
        { title: 'Tác giả', dataIndex: 'publisher', key: 'publisher', width: 200, ellipsis: true },
        { title: 'Năm XB', dataIndex: 'year', key: 'year', width: 110 },
        { title: 'Số lượng', dataIndex: 'stock', key: 'stock', width: 110 },
    ];
    const pendingColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 140, render: (t) => <span>{String(t || '').slice(0, 10)}</span> },
        { title: 'Người mượn', dataIndex: 'fullName', key: 'fullName', width: 220, ellipsis: true },
        { title: 'Tên sách', dataIndex: 'productName', key: 'productName', width: 320, ellipsis: true },
        { title: 'Ngày mượn', dataIndex: 'borrowDate', key: 'borrowDate', width: 120, render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
        { title: 'Ngày trả', dataIndex: 'returnDate', key: 'returnDate', width: 120, render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
        { title: 'Trạng thái', key: 'status', width: 120, render: () => <Tag color="green">Chờ duyệt</Tag> },
    ];
    const highRiskColumns = [
        { title: 'MSV', dataIndex: 'studentId', key: 'studentId', width: 140 },
        { title: 'Họ tên', dataIndex: 'fullName', key: 'fullName', width: 200, ellipsis: true },
        { title: 'Tổng nợ phạt', dataIndex: 'totalFine', key: 'totalFine', width: 150, render: (v) => <span className="font-semibold text-red-600">{fmtVnd(v)}</span> },
        { title: 'Sách QH', dataIndex: 'overdueBooksCount', key: 'overdueBooksCount', width: 100 },
        { title: 'Số lần đã nhắc', dataIndex: 'warningCount', key: 'warningCount', width: 130 },
    ];
    const unusedBookColumns = [
        { title: 'ISBN', dataIndex: 'isbn', key: 'isbn', width: 160 },
        { title: 'Tên sách', dataIndex: 'title', key: 'title', ellipsis: true },
        { title: 'Thể loại', dataIndex: 'category', key: 'category', width: 150, render: (v) => <Tag color="orange">{v || '-'}</Tag> },
        { title: 'Tồn kho', dataIndex: 'stock', key: 'stock', width: 100 },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-900">Thống kê & Phân tích</h2>
                <Button type="primary" icon={<BellOutlined />} onClick={() => setMassEmailOpen(true)}>
                    Gửi thông báo toàn trường
                </Button>
            </div>

            {/* ── Basic stats ────────────────────────────────────────────────── */}
            <Row gutter={16}>
                <Col span={8}>
                    <Card hoverable onClick={() => { setIsUsersModalOpen(true); if (!users.length) fetchUsers(); }} className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic title={<span className="text-slate-500">Tổng người dùng</span>} value={data?.totalUsers || 0} prefix={<UserOutlined className="text-blue-600" />} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card hoverable onClick={() => { setIsBooksModalOpen(true); if (!books.length) fetchBooks(); }} className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic title={<span className="text-slate-500">Tổng đầu sách</span>} value={data?.totalBooks || 0} prefix={<BookOutlined className="text-purple-600" />} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card
                        hoverable
                        onClick={() => {
                            setIsPendingModalOpen(true);
                            refreshPendingSection();
                        }}
                        className="rounded-2xl shadow-sm"
                        bodyStyle={{ padding: 16 }}
                    >
                        <Statistic title={<span className="text-slate-500">Yêu cầu chờ duyệt</span>} value={data?.pendingRequests || 0} prefix={<SolutionOutlined className="text-emerald-600" />} />
                    </Card>
                </Col>
            </Row>

            {/* ── EIS KPIs section ────────────────────────────────────────────── */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <BarChartOutlined className="text-indigo-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">EIS / DSS — Chỉ số điều hành chiến lược</span>
                </div>
                <Spin spinning={kpisLoading}>
                    <Row gutter={16}>
                        {/* KPI 1: Khai thác kho */}
                        <Col xs={24} sm={12} xl={6}>
                            <KpiCard
                                title="Tỷ lệ khai thác kho sách"
                                subtitle="Phiếu đang mượn"
                                value={`${kpis?.utilization_rate ?? '—'}%`}
                                percent={kpis?.utilization_rate ?? 0}
                                progressColor="#6366f1"
                                extra={
                                    <div className="space-y-2 text-[11px]">
                                        <div className="flex justify-between text-slate-400">
                                            <span>Kho nhàn rỗi</span><span>Lưu thông</span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-slate-600">
                                            <span className="inline-flex items-center gap-1">
                                                <ReadOutlined className="text-indigo-500" />
                                                Đang mượn: <b className="text-slate-800">{data?.ticketsCurrentlyBorrowing ?? 0}</b> phiếu
                                            </span>
                                        </div>
                                    </div>
                                }
                            />
                        </Col>
                        {/* KPI 2: Độc giả tích cực */}
                        <Col xs={24} sm={12} xl={6}>
                            <KpiCard
                                title="Độc giả tích cực"
                                subtitle="Sinh viên có mượn sách (30 ngày)"
                                value={`${kpis?.active_user_rate ?? '—'}%`}
                                percent={kpis?.active_user_rate ?? 0}
                                progressColor="#0ea5e9"
                            />
                        </Col>
                        {/* KPI 3: Quá hạn */}
                        <Col xs={24} sm={12} xl={6}>
                            <KpiCard
                                title="Tỷ lệ quá hạn"
                                value={
                                    <span className="flex items-center gap-2">
                                        {`${kpis?.overdue_rate ?? '—'}%`}
                                        {kpis && <Tag color={overdueBadge.color}>{overdueBadge.text}</Tag>}
                                    </span>
                                }
                                percent={kpis?.overdue_rate ?? 0}
                                progressColor={overdueRate > 20 ? '#ef4444' : overdueRate > 10 ? '#f59e0b' : '#22c55e'}
                                pulse={overdueRate > 20}
                                extra={
                                    <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                                        <span className="inline-flex items-center gap-1">
                                            <WarningOutlined className="text-amber-500" />
                                            Phiếu quá hạn chưa trả:{' '}
                                            <b className="text-slate-800">{data?.ticketsOverdueNotReturned ?? 0}</b>
                                        </span>
                                    </div>
                                }
                            />
                        </Col>
                        {/* KPI 4: Thu hồi nợ */}
                        <Col xs={24} sm={12} xl={6}>
                            <KpiCard
                                title="Thu hồi nợ phạt"
                                value={
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1 text-base text-green-600">
                                            <ArrowDownOutlined /> {fmtVnd(collected)}
                                        </div>
                                        <div className="flex items-center gap-1 text-base text-red-500">
                                            <ArrowUpOutlined /> {fmtVnd(outstanding)}
                                        </div>
                                    </div>
                                }
                                percent={collectedPct}
                                progressColor={{ from: '#22c55e', to: '#16a34a' }}
                                extra={
                                    <div className="space-y-1 text-[11px] text-slate-400">
                                        <div>{collectedPct}% đã thu hồi</div>
                                        <div className="flex flex-wrap items-center gap-1 text-slate-500">
                                            <DollarCircleOutlined className="text-rose-500" />
                                            <span>Phạt chờ thu (tổng hợp):</span>
                                            <b className="text-slate-700">{fmtVnd(data?.totalUnpaidFineAmount ?? 0)}</b>
                                        </div>
                                    </div>
                                }
                            />
                        </Col>
                    </Row>
                </Spin>
            </div>

            {/* ── DSS: Biểu đồ xu hướng + What-If ─────────────────────────────── */}
            <Row gutter={16}>
                {/* Trend chart */}
                <Col xs={24} xl={16}>
                    <Card
                        className="rounded-2xl shadow-sm h-full"
                        bodyStyle={{ padding: 16 }}
                        title={
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">DSS — Xu hướng mượn theo thể loại</span>
                                <Select
                                    value={trendPeriod}
                                    onChange={setTrendPeriod}
                                    size="small"
                                    className="w-36"
                                    options={[
                                        { value: 'all', label: 'Tất cả' },
                                        { value: 'month', label: '30 ngày' },
                                        { value: 'quarter', label: 'Quý (90 ngày)' },
                                        { value: 'year', label: '1 năm' },
                                    ]}
                                />
                            </div>
                        }
                    >
                        <Spin spinning={trendLoading}>
                            {trendChartData.length > 0 ? (
                                <>
                                    <p className="mb-2 text-xs text-slate-400">Click vào cột để xem Top 5 sách của thể loại đó</p>
                                    <Bar {...trendBarConfig} height={260} />
                                </>
                            ) : (
                                <div className="flex h-64 items-center justify-center text-slate-400">Chưa có dữ liệu mượn</div>
                            )}
                        </Spin>
                    </Card>
                </Col>

                {/* What-If */}
                <Col xs={24} xl={8}>
                    <Card className="rounded-2xl shadow-sm h-full" bodyStyle={{ padding: 16 }} title={<span className="font-semibold">DSS — Mô phỏng chính sách (What-If)</span>}>
                        <div className="space-y-4">
                            <div>
                                <div className="mb-1 text-xs text-slate-500">Thời gian mượn tối đa (ngày): <b>{whatIfMaxDays}</b></div>
                                <Slider min={5} max={30} value={whatIfMaxDays} onChange={setWhatIfMaxDays} />
                            </div>
                            <div>
                                <div className="mb-1 text-xs text-slate-500">Phí phạt trễ hạn (VNĐ/ngày): <b>{whatIfFineRate.toLocaleString()}</b></div>
                                <Slider min={500} max={5000} step={500} value={whatIfFineRate} onChange={setWhatIfFineRate} />
                            </div>
                            <Select
                                value={whatIfPeriod}
                                onChange={setWhatIfPeriod}
                                className="w-full"
                                options={[
                                    { value: 'all', label: 'Tất cả thời gian' },
                                    { value: 'month', label: '30 ngày gần nhất' },
                                    { value: 'quarter', label: 'Quý gần nhất' },
                                    { value: 'year', label: '1 năm gần nhất' },
                                ]}
                            />
                            <Button type="primary" block loading={whatIfLoading} onClick={runWhatIf}>Chạy mô phỏng</Button>
                            {whatIfResult && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                                    <div>Dự phóng doanh thu: <b className="text-indigo-700">{fmtVnd(whatIfResult.projected_revenue)}</b></div>
                                    <div>Baseline: <span className="text-slate-600">{fmtVnd(whatIfResult.baseline_revenue)}</span></div>
                                    <div>
                                        So sánh:{' '}
                                        <Tag color={whatIfResult.diff_percent >= 0 ? 'green' : 'red'}>
                                            {whatIfResult.diff_percent >= 0 ? '+' : ''}{whatIfResult.diff_percent}%
                                        </Tag>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* ── Bảng cảnh báo: Độc giả rủi ro cao ───────────────────────────── */}
            <Card
                className="rounded-2xl shadow-sm"
                bodyStyle={{ padding: 16 }}
                title={
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-red-600">⚠ Cảnh báo — Độc giả rủi ro cao</span>
                        <Button size="small" icon={<ExportOutlined />} onClick={requestExportHighRisk}>Xuất Excel</Button>
                    </div>
                }
            >
                <Table
                    rowKey="id"
                    columns={highRiskColumns}
                    dataSource={highRiskUsers}
                    loading={highRiskLoading}
                    pagination={{ pageSize: 5, size: 'small' }}
                    size="small"
                    locale={{ emptyText: 'Không có độc giả rủi ro cao' }}
                />
            </Card>

            {/* ── Bảng: Sách ít tương tác ─────────────────────────────────────── */}
            <Card
                className="rounded-2xl shadow-sm"
                bodyStyle={{ padding: 16 }}
                title={
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-amber-600">📦 Gợi ý — Sách ít tương tác (0 lượt mượn trong 6 tháng)</span>
                        <Button size="small" icon={<ExportOutlined />} onClick={requestExportUnusedBooks}>Xuất Excel</Button>
                    </div>
                }
            >
                <Table
                    rowKey="isbn"
                    columns={unusedBookColumns}
                    dataSource={unusedBooks}
                    loading={unusedLoading}
                    pagination={{ pageSize: 5, size: 'small' }}
                    size="small"
                    locale={{ emptyText: 'Tất cả sách đều có lượt mượn trong 6 tháng qua' }}
                />
            </Card>

            {/* ══ Modals ════════════════════════════════════════════════════════ */}

            {/* Drilldown */}
            <Modal
                title={`Top 5 sách được mượn nhiều nhất — ${drilldownModal.category}`}
                open={drilldownModal.open}
                onCancel={() => setDrilldownModal((p) => ({ ...p, open: false }))}
                footer={null}
                width={560}
            >
                <Spin spinning={drilldownModal.loading}>
                    <Table
                        rowKey="title"
                        columns={[
                            { title: '#', key: 'rank', width: 50, render: (_, __, i) => i + 1 },
                            { title: 'Tên sách', dataIndex: 'title', key: 'title', ellipsis: true },
                            { title: 'Lượt mượn', dataIndex: 'count', key: 'count', width: 120, render: (v) => <Tag color="indigo">{v}</Tag> },
                        ]}
                        dataSource={drilldownModal.data}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: 'Không có dữ liệu' }}
                    />
                </Spin>
            </Modal>

            {/* Mass email */}
            <Modal
                title={<><BellOutlined className="mr-2 text-indigo-600" />Gửi thông báo toàn trường</>}
                open={massEmailOpen}
                onCancel={() => setMassEmailOpen(false)}
                onOk={handleMassEmail}
                okText="Gửi ngay"
                confirmLoading={massEmailLoading}
                width={560}
            >
                <p className="mb-3 text-xs text-slate-500">Email sẽ gửi BCC ẩn danh tới tất cả độc giả trong hệ thống.</p>
                <Form form={massForm} layout="vertical">
                    <Form.Item name="subject" label="Chủ đề (Subject)" rules={[{ required: true, message: 'Vui lòng nhập chủ đề' }]}>
                        <Input placeholder="VD: Thông báo lịch nghỉ thư viện" />
                    </Form.Item>
                    <Form.Item name="content" label="Nội dung thông báo" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}>
                        <Input.TextArea rows={5} placeholder="Nội dung email..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Users modal */}
            <Modal title="Thống kê người dùng" open={isUsersModalOpen} onCancel={() => setIsUsersModalOpen(false)} footer={null} width={1100}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">Tổng: <b>{users.length}</b></div>
                    <div className="flex flex-wrap gap-2">
                        <Input allowClear placeholder="Tìm kiếm..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-64" />
                        <Select value={roleFilter} onChange={setRoleFilter} className="w-44"
                            options={[{ value: 'all', label: 'Quyền: Tất cả' }, { value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }]} />
                    </div>
                </div>
                <Table columns={userColumns} dataSource={filteredUsers} rowKey={(r) => r.id || r.email} loading={usersLoading} pagination={false} size="small" scroll={{ x: 1100, y: 420 }} />
            </Modal>

            {/* Books modal */}
            <Modal title="Thống kê sách" open={isBooksModalOpen} onCancel={() => setIsBooksModalOpen(false)} footer={null} width={1200}>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[['Tổng đầu sách', bookStats.totalTitles], ['Tổng số lượng', bookStats.totalQuantity], ['Còn hàng', bookStats.titlesInStock], ['Hết hàng', bookStats.titlesOutOfStock]].map(([label, val]) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-xs font-semibold text-slate-500">{label}</div>
                            <div className="mt-1 text-lg font-bold text-slate-900">{val}</div>
                        </div>
                    ))}
                </div>
                <Input allowClear placeholder="Mã sách / tên sách / tác giả..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="mb-3 w-80" />
                <Table columns={bookColumns} dataSource={filteredBooks} rowKey={(r) => r.id || r.bookCode} loading={booksLoading} pagination={false} size="small" scroll={{ x: 1200, y: 420 }} />
            </Modal>

            {/* Pending modal */}
            <Modal title="Danh sách yêu cầu chờ duyệt" open={isPendingModalOpen} onCancel={() => setIsPendingModalOpen(false)} footer={null} width={1200}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">Tổng: <b>{pendingRequests.length}</b></div>
                    <Input allowClear placeholder="Tìm kiếm ID / người mượn / sách..." value={pendingSearchText} onChange={(e) => setPendingSearchText(e.target.value)} className="w-96" />
                </div>
                <Table columns={pendingColumns} dataSource={filteredPendingRequests} rowKey={(r) => r.id || r.userId} loading={pendingLoading} pagination={false} size="small" scroll={{ x: 1200, y: 420 }} />
            </Modal>
        </div>
    );
};

export default Statistics;
