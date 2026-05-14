import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Dropdown, Layout, Menu, Typography, message } from 'antd';
import {
    AuditOutlined,
    BarcodeOutlined,
    BookOutlined,
    ControlOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    DollarOutlined,
    DownOutlined,
    LogoutOutlined,
    MailOutlined,
    PieChartOutlined,
    SettingOutlined,
    ShopOutlined,
    InboxOutlined,
    SolutionOutlined,
    TagsOutlined,
    TeamOutlined,
    UserOutlined,
    UsergroupAddOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import Statistics from './DashbroadComponents/Statistics';
import BookManagement from './DashbroadComponents/BookManagement';
import BookCopyManagement from './DashbroadComponents/BookCopyManagement';
import UserManagement from './DashbroadComponents/UserManagement';
import CardIssuanceManagement from './DashbroadComponents/CardIssuanceManagement';
import FineManagement from './DashbroadComponents/FineManagement';
import PolicyManagement from './DashbroadComponents/PolicyManagement';
import EmailLogManagement from './DashbroadComponents/EmailLogManagement';
import CirculationDesk from './DashbroadComponents/CirculationDesk';
import LoanRequestManagement from './DashbroadComponents/LoanRequestManagement';
import CategoryManagement from './DashbroadComponents/CategoryManagement';
import PersonnelManagement from './DashbroadComponents/PersonnelManagement';
import FinancialReport from './DashbroadComponents/FinancialReport';
import { requestLogout } from '../config/request';
import { useStore } from '../hooks/useStore';
import './admin-layout.css';

const { Header, Content, Sider } = Layout;

const VIEW_COMPONENTS = {
    stats: <Statistics />,
    finance: <FinancialReport />,
    'borrow-return': <CirculationDesk />,
    'loan-requests': (
        <LoanRequestManagement presetFilter="approval" pageTitle="Duyệt yêu cầu mượn online" />
    ),
    fines: <FineManagement />,
    book: <BookManagement />,
    'book-copies': <BookCopyManagement />,
    'book-categories': <CategoryManagement />,
    'patron-profiles': <UserManagement />,
    'card-issue': <CardIssuanceManagement />,
    policy: <PolicyManagement />,
    'email-logs': <EmailLogManagement />,
    personnel: <PersonnelManagement />,
};

const ADMIN_VIEW_KEYS = new Set(Object.keys(VIEW_COMPONENTS));

/** Chỉ admin: quản lý nhân sự & chính sách (nhóm menu Hệ thống). Thủ thư / kho không được URL trực tiếp. */
const ADMIN_ONLY_VIEW_KEYS = new Set(['personnel', 'policy']);

/** Submenu cha (Ant Menu `openKeys`) — chỉ một nhóm mở để sidebar không phải kéo dài */
function getParentSubmenuKeyForLeaf(leafKey, isAdmin) {
    if (leafKey === 'stats') return 'overview';
    if (!isAdmin && leafKey === 'finance') return 'overview';
    if (['borrow-return', 'loan-requests', 'fines'].includes(leafKey)) return 'circulation';
    if (['book', 'book-copies', 'book-categories'].includes(leafKey)) return 'inventory';
    if (['email-logs', 'patron-profiles', 'card-issue'].includes(leafKey)) return 'patrons';
    if (isAdmin && ['personnel', 'policy', 'finance'].includes(leafKey)) return 'system';
    return 'overview';
}

function adminPathForKey(key) {
    if (key === 'stats') return '/admin';
    return `/admin/${key}`;
}

function adminKeyFromPathname(pathname) {
    const p = (pathname || '').replace(/\/+$/, '') || '/';
    if (p === '/admin') return 'stats';
    const prefix = '/admin/';
    if (!p.startsWith(prefix)) return 'stats';
    const seg = p.slice(prefix.length).split('/').filter(Boolean)[0];
    if (seg && ADMIN_VIEW_KEYS.has(seg)) return seg;
    return 'stats';
}

function findMenuLabel(items, key) {
    for (const item of items || []) {
        if (item?.key === key) {
            return typeof item.label === 'string' ? item.label : key;
        }
        if (Array.isArray(item?.children)) {
            const found = findMenuLabel(item.children, key);
            if (found) return found;
        }
    }
    return null;
}

const sectionLabel = (text) => ({
    type: 'group',
    label: <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{text}</span>,
});

function buildMenuItems(isAdmin) {
    const dashboardChildren = [
        { key: 'stats', icon: <DashboardOutlined />, label: 'Thống kê & phân tích' },
    ];
    if (!isAdmin) {
        dashboardChildren.push({ key: 'finance', icon: <DollarOutlined />, label: 'Tài chính' });
    }

    const items = [
        sectionLabel('I. Bảng điều khiển trung tâm'),
        {
            key: 'overview',
            icon: <PieChartOutlined />,
            label: 'Dashboard',
            children: dashboardChildren,
        },
        sectionLabel('II. Nghiệp vụ lưu thông'),
        {
            key: 'circulation',
            icon: <AuditOutlined />,
            label: 'Lưu thông (Circulation)',
            children: [
                { key: 'borrow-return', icon: <ShopOutlined />, label: 'Mượn trả sách' },
                { key: 'loan-requests', icon: <InboxOutlined />, label: 'Duyệt yêu cầu mượn online' },
                { key: 'fines', icon: <DollarOutlined />, label: 'Quản lý phí phạt' },
            ],
        },
        sectionLabel('III. Kho & tài sản (Inventory)'),
        {
            key: 'inventory',
            icon: <DatabaseOutlined />,
            label: 'Kho & danh mục',
            children: [
                { key: 'book', icon: <BookOutlined />, label: 'Đầu sách (Book catalog)' },
                { key: 'book-copies', icon: <BarcodeOutlined />, label: 'Quản lý tồn kho' },
                { key: 'book-categories', icon: <TagsOutlined />, label: 'Thể loại sách' },
            ],
        },
        sectionLabel('IV. Độc giả (Patrons)'),
        {
            key: 'patrons',
            icon: <UserOutlined />,
            label: 'Độc giả',
            children: [
                { key: 'email-logs', icon: <MailOutlined />, label: 'Nhật ký thư' },
                { key: 'patron-profiles', icon: <TeamOutlined />, label: 'Danh sách & tra cứu' },
                { key: 'card-issue', icon: <SolutionOutlined />, label: 'Kích hoạt thẻ độc giả' },
            ],
        },
    ];

    if (isAdmin) {
        items.push(sectionLabel('V. Hệ thống & cấu hình'));
        items.push({
            key: 'system',
            icon: <SettingOutlined />,
            label: 'Hệ thống',
            children: [
                { key: 'personnel', icon: <UsergroupAddOutlined />, label: 'Quản lý nhân sự' },
                { key: 'policy', icon: <ControlOutlined />, label: 'Cấu hình chính sách' },
                { key: 'finance', icon: <DollarOutlined />, label: 'Tài chính' },
            ],
        });
    }

    return items;
}

function Admin() {
    const location = useLocation();
    const initialLeaf = adminKeyFromPathname(window.location.pathname);
    const [selectedKey, setSelectedKey] = useState(() => initialLeaf);
    const [openKeys, setOpenKeys] = useState(() => ['overview']);
    const navigate = useNavigate();
    const { dataUser, refreshAuth } = useStore();

    const isAdmin = String(dataUser?.role || '').toLowerCase() === 'admin';

    const rootSubmenuKeys = useMemo(
        () => (isAdmin ? ['overview', 'circulation', 'inventory', 'patrons', 'system'] : ['overview', 'circulation', 'inventory', 'patrons']),
        [isAdmin],
    );

    const menuItems = useMemo(() => buildMenuItems(isAdmin), [isAdmin]);

    useEffect(() => {
        if (!dataUser?.id) return;
        const p = (location.pathname || '').replace(/\/+$/, '') || '/';
        const prefix = '/admin/';
        if (p.startsWith(prefix)) {
            const seg = p.slice(prefix.length).split('/').filter(Boolean)[0];
            if (seg && !ADMIN_VIEW_KEYS.has(seg)) {
                navigate('/admin', { replace: true });
                return;
            }
            if (!isAdmin && seg && ADMIN_ONLY_VIEW_KEYS.has(seg)) {
                navigate('/admin', { replace: true });
                return;
            }
        }
        const leaf = adminKeyFromPathname(location.pathname);
        const safeLeaf = !isAdmin && ADMIN_ONLY_VIEW_KEYS.has(leaf) ? 'stats' : leaf;
        setSelectedKey(safeLeaf);
        setOpenKeys([getParentSubmenuKeyForLeaf(safeLeaf, isAdmin)]);
    }, [location.pathname, navigate, isAdmin, dataUser?.id]);

    const currentTabTitle = useMemo(() => {
        return findMenuLabel(menuItems, selectedKey) || 'Dashboard';
    }, [menuItems, selectedKey]);

    const staffSubtitle = useMemo(() => {
        const r = String(dataUser?.role || '').toLowerCase();
        if (r === 'librarian') return 'Thủ thư';
        if (r === 'warehouse') return 'Nhân viên kho';
        if (r === 'admin') return 'Quản trị viên';
        return '';
    }, [dataUser?.role]);

    const handleLogout = async () => {
        try {
            await requestLogout();
            await refreshAuth();
            navigate('/');
        } catch (error) {
            message.error(error?.response?.data?.message || 'Đăng xuất thất bại');
        }
    };

    const dropdownItems = [
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Đăng xuất',
            danger: true,
            onClick: handleLogout,
        },
    ];

    const activePane = VIEW_COMPONENTS[selectedKey] || VIEW_COMPONENTS.stats;

    return (
        <Layout className="admin-layout-root" style={{ height: '100vh', overflow: 'hidden' }}>
            {/* Cột trái: Sidebar — không dùng position fixed để giữ đúng flex 2 cột của Ant Design */}
            <Sider
                width={260}
                theme="dark"
                breakpoint="lg"
                collapsedWidth={48}
                className="admin-sider-navy"
                style={{
                    background: '#1a3353',
                    overflow: 'auto',
                    height: '100vh',
                }}
            >
                <div
                    className="admin-layout-logo"
                    style={{
                        height: 64,
                        color: '#fff',
                        textAlign: 'center',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Typography.Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.75)' }}>
                        THƯ VIỆN
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 4 }}>Hệ thống quản lý</Typography.Text>
                </div>

                <Menu
                    theme="dark"
                    mode="inline"
                    style={{ background: '#1a3353', borderInlineEnd: 'none' }}
                    items={menuItems}
                    selectedKeys={[selectedKey]}
                    openKeys={openKeys}
                    onOpenChange={(keys) => {
                        const subs = keys.filter((k) => rootSubmenuKeys.includes(k));
                        if (subs.length <= 1) {
                            setOpenKeys(subs.length ? subs : [getParentSubmenuKeyForLeaf(selectedKey, isAdmin)]);
                            return;
                        }
                        const newlyOpened = subs.find((k) => !openKeys.includes(k));
                        setOpenKeys(newlyOpened ? [newlyOpened] : [subs[subs.length - 1]]);
                    }}
                    onClick={({ key }) => {
                        if (!isAdmin && ADMIN_ONLY_VIEW_KEYS.has(key)) return;
                        if (Object.prototype.hasOwnProperty.call(VIEW_COMPONENTS, key)) {
                            setSelectedKey(key);
                            setOpenKeys([getParentSubmenuKeyForLeaf(key, isAdmin)]);
                            navigate(adminPathForKey(key), { replace: false });
                        }
                    }}
                    className="admin-menu-navy"
                />
            </Sider>

            {/* Cột phải: Header + Content */}
            <Layout className="admin-layout-main">
                <Header
                    className="admin-header-bar"
                    style={{
                        background: '#fff',
                        padding: '0 20px',
                        height: 64,
                        lineHeight: '64px',
                        boxShadow: '0 1px 4px rgba(0,21,41,.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <Typography.Title level={4} className="admin-page-title !mb-0 !text-xl !font-bold lg:!text-2xl" style={{ margin: 0, lineHeight: 1.3 }}>
                        {currentTabTitle}
                    </Typography.Title>

                    <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={['click']}>
                        <button
                            type="button"
                            className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5"
                        >
                            <Avatar size={34} icon={<UserOutlined />} src={dataUser?.avatar || undefined} />
                            <div className="hidden text-left sm:block">
                                <p className="m-0 text-sm font-semibold text-slate-900">{dataUser?.fullName || 'Nhân viên'}</p>
                                <p className="m-0 text-xs text-slate-500">{staffSubtitle || dataUser?.email}</p>
                            </div>
                            <DownOutlined className="text-xs text-slate-500" />
                        </button>
                    </Dropdown>
                </Header>

                <Content
                    className="admin-content-area"
                    style={{
                        background: '#f0f2f5',
                        flex: 1,
                        overflow: 'auto',
                        padding: '24px 16px',
                    }}
                >
                    <div className="admin-content-inner" style={{ padding: 24, minHeight: '100%' }}>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={selectedKey}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.2 }}
                            >
                                {activePane}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
}

export default Admin;
