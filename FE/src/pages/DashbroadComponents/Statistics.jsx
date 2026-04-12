import React, { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Statistic, Modal, Table, Input, Select, Tag } from 'antd';
import { Bar, Pie } from '@ant-design/charts';
import { UserOutlined, BookOutlined, SolutionOutlined, ReadOutlined, WarningOutlined, DollarCircleOutlined } from '@ant-design/icons';
import { requestGetAllHistoryBook, requestGetAllProduct, requestGetAllUsers, requestStatistics } from '../../config/request';
import dayjs from 'dayjs';
import { isPendingApproval } from '../../utils/loanTicketStatus';

const Statistics = () => {
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

    useEffect(() => {
        const fetchData = async () => {
            const res = await requestStatistics();
            const payload = res?.metadata ?? res ?? {};
            setData(payload);
        };
        fetchData();
    }, []);

    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const res = await requestGetAllUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list.map((item) => ({
                ...item,
                id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
            }));
            setUsers(normalized);
        } finally {
            setUsersLoading(false);
        }
    };

    const handleOpenUsersModal = async () => {
        setIsUsersModalOpen(true);
        if (users.length === 0) await fetchUsers();
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
                year: item?.year || item?.publishYear || item?.publicationYear || '',
            }));
            setBooks(normalized);
        } finally {
            setBooksLoading(false);
        }
    };

    const handleOpenBooksModal = async () => {
        setIsBooksModalOpen(true);
        if (books.length === 0) await fetchBooks();
    };

    const fetchPendingRequests = async () => {
        setPendingLoading(true);
        try {
            const res = await requestGetAllHistoryBook();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list
                .map((item) => ({
                    ...item,
                    id: item?._id ? String(item._id) : item?.id,
                    fullName: item?.fullName || item?.user?.fullName || '',
                    productName: item?.product?.nameProduct || item?.nameProduct || '',
                    quantity: Number(item?.quantity || item?.amount || 0),
                    status: item?.status || '',
                    borrowDate: item?.borrowDate || null,
                    returnDate: item?.returnDate || null,
                }))
                .filter((x) => isPendingApproval(x?.status));
            setPendingRequests(normalized);
        } finally {
            setPendingLoading(false);
        }
    };

    const handleOpenPendingModal = async () => {
        setIsPendingModalOpen(true);
        if (pendingRequests.length === 0) await fetchPendingRequests();
    };

    const loanStatusData = Array.isArray(data?.loanStatusData) ? data.loanStatusData : [];

    const statusColor = (raw) => {
        const s = String(raw || '').toLowerCase();
        if (s.includes('chờ') || s === 'pending' || s.includes('pending_approval')) return '#22c55e';
        if (s.includes('đã') || s === 'success' || s === 'borrowing') return '#3b82f6';
        if (s.includes('từ') || s === 'cancel' || s === 'cancelled') return '#f97316';
        if (s.includes('quá') || s === 'overdue') return '#ef4444';
        if (s.includes('trả') || s === 'returned') return '#10b981';
        return '#6366f1';
    };

    const pieConfig = {
        data: loanStatusData,
        angleField: 'count',
        colorField: 'status',
        radius: 1,
        innerRadius: 0.62,
        legend: { position: 'bottom' },
        color: (d) => statusColor(d?.status),
        label: false,
        tooltip: { formatter: (d) => ({ name: d?.status, value: d?.count }) },
        statistic: {
            title: false,
            content: {
                content: `Tổng\n${loanStatusData.reduce((s, x) => s + Number(x?.count || 0), 0)}`,
                style: { whiteSpace: 'pre-wrap', fontSize: 14, fontWeight: 700, color: '#0f172a' },
            },
        },
        interactions: [{ type: 'element-active' }],
    };

    const barConfig = {
        data: loanStatusData,
        xField: 'count',
        yField: 'status',
        seriesField: 'status',
        color: (d) => statusColor(d?.status),
        legend: false,
        tooltip: { formatter: (d) => ({ name: d?.status, value: d?.count }) },
        barStyle: { radius: [10, 10, 10, 10] },
        xAxis: { title: null, grid: { line: { style: { stroke: '#eef2ff' } } } },
        yAxis: { title: null },
        meta: { count: { alias: 'Số lượng' } },
    };

    const filteredUsers = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        return users.filter((u) => {
            if (roleFilter !== 'all' && String(u?.role || '').toLowerCase() !== roleFilter) return false;
            if (!q) return true;
            const name = String(u?.fullName || '').toLowerCase();
            const email = String(u?.email || '').toLowerCase();
            const id = String(u?.id || '').toLowerCase();
            return name.includes(q) || email.includes(q) || id.includes(q);
        });
    }, [users, searchText, roleFilter]);

    const filteredBooks = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return books;
        return books.filter((b) => {
            const code = String(b?.bookCode || '').toLowerCase();
            const name = String(b?.nameProduct || '').toLowerCase();
            const author = String(b?.publisher || '').toLowerCase();
            const category = String(b?.category_1 || '').toLowerCase();
            return code.includes(q) || name.includes(q) || author.includes(q) || category.includes(q);
        });
    }, [books, searchText]);

    const bookStats = useMemo(() => {
        const totalTitles = books.length;
        const totalQuantity = books.reduce((sum, b) => sum + Number(b?.stock || 0), 0);
        const titlesInStock = books.filter((b) => Number(b?.stock || 0) > 0).length;
        const titlesOutOfStock = books.filter((b) => Number(b?.stock || 0) <= 0).length;
        const lowStockTitles = books.filter((b) => {
            const s = Number(b?.stock || 0);
            return s > 0 && s <= 2;
        }).length;

        const categorySet = new Set(
            books
                .map((b) => String(b?.category_1 || '').trim())
                .filter((v) => v && v !== '-' && v.toLowerCase() !== 'undefined'),
        );
        const authorSet = new Set(
            books
                .map((b) => String(b?.publisher || '').trim())
                .filter((v) => v && v !== '-' && v.toLowerCase() !== 'undefined'),
        );

        return {
            totalTitles,
            totalQuantity,
            titlesInStock,
            titlesOutOfStock,
            lowStockTitles,
            totalCategories: categorySet.size,
            totalAuthors: authorSet.size,
        };
    }, [books]);

    const filteredPendingRequests = useMemo(() => {
        const q = String(pendingSearchText || '').trim().toLowerCase();
        if (!q) return pendingRequests;
        return pendingRequests.filter((x) => {
            const id = String(x?.id || '').toLowerCase();
            const borrower = String(x?.fullName || '').toLowerCase();
            const bookName = String(x?.productName || '').toLowerCase();
            return id.includes(q) || borrower.includes(q) || bookName.includes(q);
        });
    }, [pendingRequests, pendingSearchText]);

    const userColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 220, ellipsis: true },
        { title: 'Tên người dùng', dataIndex: 'fullName', key: 'fullName', width: 220, ellipsis: true },
        { title: 'Gmail', dataIndex: 'email', key: 'email', width: 260, ellipsis: true },
        {
            title: 'Chức vụ',
            dataIndex: 'role',
            key: 'role',
            width: 120,
            render: (role) => {
                const r = String(role || '').toLowerCase();
                const color = r === 'admin' ? 'purple' : 'blue';
                return <Tag color={color}>{r || '-'}</Tag>;
            },
        },
    ];

    const bookColumns = [
        { title: 'Mã sách', dataIndex: 'bookCode', key: 'bookCode', width: 130, ellipsis: true },
        { title: 'Tên sách', dataIndex: 'nameProduct', key: 'nameProduct', width: 260, ellipsis: true },
        {
            title: 'Thể loại',
            dataIndex: 'category_1',
            key: 'category_1',
            width: 160,
            ellipsis: true,
            render: (v) => <Tag color="blue">{String(v || '-').trim() || '-'}</Tag>,
        },
        { title: 'Tác giả', dataIndex: 'publisher', key: 'publisher', width: 200, ellipsis: true },
        { title: 'Năm XB', dataIndex: 'year', key: 'year', width: 110, ellipsis: true },
        { title: 'Số lượng', dataIndex: 'stock', key: 'stock', width: 110, ellipsis: true },
    ];

    const pendingColumns = [
        {
            title: 'ID yêu cầu',
            dataIndex: 'id',
            key: 'id',
            width: 140,
            render: (t) => <span>{String(t || '').slice(0, 10)}</span>,
        },
        { title: 'Người mượn', dataIndex: 'fullName', key: 'fullName', width: 220, ellipsis: true },
        { title: 'Tên sách', dataIndex: 'productName', key: 'productName', width: 320, ellipsis: true },
        { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity', width: 100 },
        {
            title: 'Ngày mượn',
            dataIndex: 'borrowDate',
            key: 'borrowDate',
            width: 120,
            render: (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-'),
        },
        {
            title: 'Ngày trả',
            dataIndex: 'returnDate',
            key: 'returnDate',
            width: 120,
            render: (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-'),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: () => <Tag color="green">Chờ duyệt</Tag>,
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-900">Thống kê tổng quan</h2>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <UserOutlined className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Chào mừng Admin</span>
                </div>
            </div>
            <Row gutter={16} className="mb-6">
                <Col span={8}>
                    <Card hoverable onClick={handleOpenUsersModal} className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Tổng số người dùng</span>}
                            value={data?.totalUsers || 0}
                            prefix={<UserOutlined className="text-blue-600" />}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card hoverable onClick={handleOpenBooksModal} className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Tổng số đầu sách</span>}
                            value={data?.totalBooks || 0}
                            prefix={<BookOutlined className="text-purple-600" />}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card hoverable onClick={handleOpenPendingModal} className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Yêu cầu chờ duyệt</span>}
                            value={data?.pendingRequests || 0}
                            prefix={<SolutionOutlined className="text-emerald-600" />}
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} className="mb-6">
                <Col xs={24} sm={12} lg={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Tổng sách đang cho mượn</span>}
                            value={data?.ticketsCurrentlyBorrowing ?? 0}
                            suffix="phiếu"
                            prefix={<ReadOutlined className="text-indigo-600" />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Sách quá hạn chưa trả</span>}
                            value={data?.ticketsOverdueNotReturned ?? 0}
                            suffix="phiếu"
                            prefix={<WarningOutlined className="text-amber-600" />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                        <Statistic
                            title={<span className="text-slate-500">Tổng tiền phạt chờ thu</span>}
                            value={data?.totalUnpaidFineAmount ?? 0}
                            formatter={(v) => `${Number(v).toLocaleString('vi-VN')} đ`}
                            prefix={<DollarCircleOutlined className="text-rose-600" />}
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={24}>
                <Col span={24}>
                    <Card
                        className="rounded-2xl shadow-sm"
                        bodyStyle={{ padding: 16 }}
                        title={
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-base font-semibold text-slate-900">Tình trạng mượn sách</div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        Đã duyệt
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-green-500" />
                                        Chờ duyệt
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                                        Từ chối
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-red-500" />
                                        Quá hạn
                                    </span>
                                </div>
                            </div>
                        }
                    >
                        {loanStatusData.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-5">
                                    <div className="mb-2 text-xs font-semibold text-slate-500">Tỷ lệ theo trạng thái</div>
                                    <Pie {...pieConfig} />
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-7">
                                    <div className="mb-2 text-xs font-semibold text-slate-500">Số lượng theo trạng thái</div>
                                    <Bar {...barConfig} />
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
                                Chưa có dữ liệu thống kê
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            <Modal
                title="Thống kê thông tin người dùng"
                open={isUsersModalOpen}
                onCancel={() => setIsUsersModalOpen(false)}
                footer={null}
                width={1100}
            >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">
                        Tổng tất cả tài khoản: <b>{users.length}</b>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            allowClear
                            placeholder="Tìm kiếm tên / gmail / id..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-64"
                        />
                        <Select
                            value={roleFilter}
                            onChange={setRoleFilter}
                            className="w-44"
                            options={[
                                { value: 'all', label: 'Quyền: Tất cả' },
                                { value: 'admin', label: 'Quyền: Admin' },
                                { value: 'user', label: 'Quyền: User' },
                            ]}
                        />
                    </div>
                </div>

                <Table
                    columns={userColumns}
                    dataSource={filteredUsers}
                    rowKey={(record) => record.id || record.email}
                    loading={usersLoading}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1100, y: 420 }}
                />
            </Modal>

            <Modal
                title="Thống kê thông tin sách"
                open={isBooksModalOpen}
                onCancel={() => setIsBooksModalOpen(false)}
                footer={null}
                width={1200}
            >
                <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng sách trong kho</div>
                                <div className="mt-1 text-lg font-bold text-slate-900">{bookStats.totalTitles}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng số lượng sách</div>
                                <div className="mt-1 text-lg font-bold text-slate-900">{bookStats.totalQuantity}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng số sách còn</div>
                                <div className="mt-1 text-lg font-bold text-slate-900">{bookStats.titlesInStock}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng số sách hết</div>
                                <div className="mt-1 text-lg font-bold text-slate-900">{bookStats.titlesOutOfStock}</div>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Sách sắp hết (≤ 2)</div>
                                <div className="mt-1 text-base font-semibold text-slate-900">{bookStats.lowStockTitles}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng thể loại</div>
                                <div className="mt-1 text-base font-semibold text-slate-900">{bookStats.totalCategories}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold text-slate-500">Tổng tác giả</div>
                                <div className="mt-1 text-base font-semibold text-slate-900">{bookStats.totalAuthors}</div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="mb-2 text-xs font-semibold text-slate-500">Tìm kiếm</div>
                            <Input
                                allowClear
                                placeholder="Mã sách / tên sách / tác giả / thể loại..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <Table
                    columns={bookColumns}
                    dataSource={filteredBooks}
                    rowKey={(record) => record.id || record.bookCode || record.nameProduct}
                    loading={booksLoading}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1200, y: 420 }}
                />
            </Modal>

            <Modal
                title="Danh sách yêu cầu chờ duyệt"
                open={isPendingModalOpen}
                onCancel={() => setIsPendingModalOpen(false)}
                footer={null}
                width={1200}
            >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">
                        Tổng yêu cầu chờ duyệt: <b>{pendingRequests.length}</b>
                    </div>
                    <Input
                        allowClear
                        placeholder="Tìm kiếm ID / người mượn / tên sách..."
                        value={pendingSearchText}
                        onChange={(e) => setPendingSearchText(e.target.value)}
                        className="w-96"
                    />
                </div>

                <Table
                    columns={pendingColumns}
                    dataSource={filteredPendingRequests}
                    rowKey={(record) => record.id || record.userId}
                    loading={pendingLoading}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1200, y: 420 }}
                />
            </Modal>
        </div>
    );
};

export default Statistics;
