import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore';
import { Badge, Dropdown, Avatar, Button, Drawer, Input, List, Typography, message, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, SearchOutlined, SafetyOutlined, BookOutlined, BellOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { requestGetMyNotifications, requestLogout, requestMarkAllNotificationsRead, requestMarkNotificationRead } from '../config/request';
import dayjs from 'dayjs';

function Header() {
    const { dataUser, refreshAuth } = useStore();
    const navigate = useNavigate();
    const [searchText, setSearchText] = useState('');
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifItems, setNotifItems] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const role = String(dataUser?.role || '').toLowerCase();
    const isLibraryStaff = role === 'admin' || role === 'librarian';
    const isPatron = Boolean(dataUser?.id) && !isLibraryStaff;

    const handleLogout = async () => {
        try {
            await requestLogout();
            await refreshAuth();
            navigate('/');
        } catch (error) {
            console.error('Failed to logout:', error);
        }
    };

    const loadNotifications = async () => {
        if (!isPatron) return;
        setNotifLoading(true);
        try {
            const res = await requestGetMyNotifications({ limit: 40 });
            const meta = res?.metadata || {};
            setUnreadCount(Number(meta.unreadCount || 0));
            setNotifItems(Array.isArray(meta.items) ? meta.items : []);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không tải được thông báo');
        } finally {
            setNotifLoading(false);
        }
    };

    useEffect(() => {
        // cập nhật badge khi login / refresh trang
        if (isPatron) {
            loadNotifications();
        } else {
            setNotifItems([]);
            setUnreadCount(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataUser?.id, role]);

    const displayNotifItems = useMemo(() => {
        // Chuẩn hoá theo luồng tự động: mỗi ngày 1 thông báo "Nhắc trả sách quá hạn".
        // Frontend-only: gộp các bản ghi trùng ngày (do dữ liệu demo cũ).
        // "Số lần đã nhắc" phải trùng với giao diện thống kê: tính theo số ngày trễ (earliest dueDate → hôm nay).
        const items = Array.isArray(notifItems) ? [...notifItems] : [];
        items.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));

        const calcDaysLate = (dueDate) => {
            if (!dueDate) return 0;
            const d0 = dayjs(dueDate);
            if (!d0.isValid()) return 0;
            const startDue = d0.startOf('day');
            const startNow = dayjs().startOf('day');
            const diff = startNow.diff(startDue, 'day');
            return Math.max(0, diff);
        };

        const earliestDueDateFromMeta = (it) => {
            const meta = it?.meta || null;
            const list = Array.isArray(meta?.overdueLoans) ? meta.overdueLoans : [];
            const dueDates = list.map((x) => x?.dueDate).filter(Boolean);
            if (meta?.dueDate) dueDates.push(meta.dueDate);
            if (dueDates.length === 0) return null;
            const valid = dueDates.map((d) => dayjs(d)).filter((d) => d.isValid());
            if (!valid.length) return null;
            valid.sort((a, b) => a.valueOf() - b.valueOf());
            return valid[0].toISOString();
        };

        const out = [];
        const byDay = new Map(); // day -> item
        for (const it of items) {
            const title = String(it?.title || '');
            const isAutoOverdue =
                title === 'Nhắc trả sách quá hạn' ||
                String(it?.dedupeKey || '').startsWith('AUTO_OVERDUE_USER:') ||
                (it?.type === 'WARNING' && title.toLowerCase().includes('quá hạn'));

            if (!isAutoOverdue) {
                out.push(it);
                continue;
            }

            const day = it?.createdAt && dayjs(it.createdAt).isValid()
                ? dayjs(it.createdAt).format('YYYY-MM-DD')
                : 'unknown';
            if (!byDay.has(day)) {
                const earliestDue = earliestDueDateFromMeta(it);
                const remindIndex = earliestDue ? calcDaysLate(earliestDue) : null;
                byDay.set(day, {
                    ...it,
                    __display: {
                        remindIndex,
                    },
                });
            }
        }

        const overdueDaily = [...byDay.entries()]
            .filter(([d]) => d !== 'unknown')
            .sort((a, b) => a[0].localeCompare(b[0], 'vi')) // oldest -> newest
            .map(([, it]) => it);

        // Nếu có item "unknown" thì giữ nguyên (không gắn index)
        const unknown = byDay.get('unknown') ? [byDay.get('unknown')] : [];

        return [...overdueDaily, ...unknown, ...out].sort(
            (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0),
        );
    }, [notifItems]);

    const unreadIds = useMemo(
        () => new Set(displayNotifItems.filter((x) => !x.readAt).map((x) => String(x.id || x._id))),
        [displayNotifItems],
    );

    // Badge phải khớp với danh sách đang hiển thị (đã gộp theo ngày).
    const badgeUnreadCount = useMemo(() => {
        return displayNotifItems.filter((x) => !x.readAt).length;
    }, [displayNotifItems]);

    const markRead = async (id) => {
        try {
            await requestMarkNotificationRead(id);
            setNotifItems((prev) => prev.map((n) => (String(n.id || n._id) === String(id) ? { ...n, readAt: new Date().toISOString() } : n)));
            setUnreadCount((c) => Math.max(0, Number(c || 0) - 1));
        } catch { /* ignore */ }
    };

    const markAllRead = async () => {
        try {
            await requestMarkAllNotificationsRead();
            setNotifItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
            setUnreadCount(0);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không cập nhật được');
        }
    };

    const patronNav =
        isPatron
            ? [
                  { label: 'Hồ sơ cá nhân', to: '/infoUser?tab=profile' },
                  { label: 'Lịch sử mượn', to: '/infoUser?tab=history' },
              ]
            : [];

    const navItems = [
        { label: 'Danh mục sách', to: '/', end: true },
        ...patronNav,
        { label: 'Quy định', to: '/rules' },
        { label: 'Liên hệ', to: '/contact' },
    ];

    const onSearch = () => {
        const keyword = searchText.trim();
        if (!keyword) return;
        navigate(`/?q=${encodeURIComponent(keyword)}`);
    };

    return (
        <header className="fixed top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
            <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
                <div className="flex shrink-0 items-center">
                    <Link to="/" className="text-2xl font-bold text-blue-600">
                        📚 Thư Viện
                    </Link>
                </div>

                <nav className="hidden min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:flex sm:gap-x-4 lg:gap-x-6">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={Boolean(item.end)}
                            className={({ isActive }) =>
                                `shrink-0 border-b-2 pb-1 text-xs font-medium transition-colors sm:text-sm ${
                                    isActive
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                }`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex items-center gap-2 sm:gap-3">
                    {isPatron && (
                        <div className="flex shrink-0 items-center gap-0.5 sm:hidden">
                            <Button type="link" size="small" className="!px-1 text-xs" onClick={() => navigate('/infoUser?tab=profile')}>
                                Hồ sơ
                            </Button>
                            <Button type="link" size="small" className="!px-1 text-xs" onClick={() => navigate('/infoUser?tab=history')}>
                                Lịch sử
                            </Button>
                        </div>
                    )}
                    <Input
                        size="small"
                        className="w-32 min-[400px]:w-40 sm:w-56"
                        placeholder="Tìm kiếm sách..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onPressEnter={onSearch}
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />

                    <div className="flex items-center gap-2">
                        {isPatron && (
                            <Badge count={badgeUnreadCount} size="small" overflowCount={99}>
                                <Button
                                    aria-label="Thông báo"
                                    icon={<BellOutlined />}
                                    onClick={() => {
                                        setNotifOpen(true);
                                        loadNotifications();
                                    }}
                                />
                            </Badge>
                        )}
                        {dataUser && dataUser.id ? (
                            <Dropdown
                                menu={{
                                    items: [
                                        ...(!isLibraryStaff
                                            ? [
                                                  {
                                                      key: 'current',
                                                      icon: <BookOutlined />,
                                                      label: 'Sách đang mượn',
                                                      onClick: () => navigate('/infoUser?tab=current'),
                                                  },
                                              ]
                                            : []),
                                        ...(isLibraryStaff
                                            ? [
                                                  {
                                                      key: 'admin',
                                                      icon: <SafetyOutlined />,
                                                      label: 'Trang quản trị',
                                                      onClick: () => navigate('/admin'),
                                                  },
                                              ]
                                            : []),
                                        { type: 'divider' },
                                        {
                                            key: 'logout',
                                            icon: <LogoutOutlined />,
                                            label: 'Đăng xuất',
                                            danger: true,
                                            onClick: () => handleLogout(),
                                        },
                                    ],
                                }}
                                placement="bottomRight"
                                arrow
                            >
                                <div className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50">
                                    <Avatar size={32} icon={<UserOutlined />} src={dataUser.avatar} className="bg-blue-600" />
                                    <div className="hidden text-left md:block">
                                        <p className="text-xs font-medium text-gray-900">{dataUser.fullName || 'Người dùng'}</p>
                                        <p className="text-[11px] text-gray-500">{dataUser.email}</p>
                                    </div>
                                </div>
                            </Dropdown>
                        ) : (
                            <Link to="/login">
                                <Button type="primary" size="small">
                                    Đăng nhập
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </div>
            <Drawer
                title={
                    <div className="flex items-center justify-between gap-2">
                        <span>Thông báo</span>
                        <Button size="small" onClick={markAllRead} disabled={badgeUnreadCount === 0}>
                            Đánh dấu đã đọc
                        </Button>
                    </div>
                }
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                width={420}
            >
                <List
                    loading={notifLoading}
                    dataSource={displayNotifItems}
                    locale={{ emptyText: 'Chưa có thông báo' }}
                    renderItem={(item) => {
                        const id = item?.id || item?._id;
                        const isUnread = id && unreadIds.has(String(id));
                        const when = item?.createdAt && dayjs(item.createdAt).isValid()
                            ? dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')
                            : '';
                        const remindIndex = item?.__display?.remindIndex;
                        const titleSuffix = remindIndex ? ` (lần nhắc #${remindIndex})` : '';
                        const isMassBroadcast = item?.type === 'SYSTEM' && item?.meta?.massBroadcast;
                        return (
                            <List.Item
                                onClick={() => id && markRead(id)}
                                className={isUnread ? 'cursor-pointer rounded-lg bg-violet-50 px-3 py-2' : 'cursor-pointer rounded-lg px-3 py-2'}
                            >
                                <List.Item.Meta
                                    title={
                                        <div className="flex items-start justify-between gap-2">
                                            <span className={isUnread ? 'font-semibold text-slate-900' : 'text-slate-800'}>
                                                {isMassBroadcast ? (
                                                    <Tag color="blue" className="mb-1 mr-1 align-middle">
                                                        Toàn hệ thống
                                                    </Tag>
                                                ) : null}
                                                {(item?.title || 'Thông báo')}{titleSuffix}
                                            </span>
                                            <span className="text-[11px] text-slate-400">{when}</span>
                                        </div>
                                    }
                                    description={
                                        <div className="text-sm text-slate-600">
                                            {remindIndex ? (
                                                <div className="mb-1 text-xs text-slate-500">
                                                    Tự động nhắc mỗi ngày 1 lần • Lần nhắc hôm nay: <b>1</b>
                                                </div>
                                            ) : null}
                                            {item?.contentHtml ? (
                                                <div dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
                                            ) : (
                                                <Typography.Text type="secondary">(Không có nội dung)</Typography.Text>
                                            )}
                                        </div>
                                    }
                                />
                            </List.Item>
                        );
                    }}
                />
            </Drawer>
        </header>
    );
}

export default Header;
