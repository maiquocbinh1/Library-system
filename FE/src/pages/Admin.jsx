import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Dropdown, Layout, Menu, Typography, message } from 'antd';
import {
    AuditOutlined,
    BarcodeOutlined,
    BookOutlined,
    CheckCircleOutlined,
    ControlOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    DollarOutlined,
    DownOutlined,
    ExportOutlined,
    LogoutOutlined,
    PieChartOutlined,
    SettingOutlined,
    SolutionOutlined,
    TeamOutlined,
    UserOutlined,
    UserSwitchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import Statistics from './DashbroadComponents/Statistics';
import BookManagement from './DashbroadComponents/BookManagement';
import BookCopyManagement from './DashbroadComponents/BookCopyManagement';
import UserManagement from './DashbroadComponents/UserManagement';
import LoanRequestManagement from './DashbroadComponents/LoanRequestManagement';
import CardIssuanceManagement from './DashbroadComponents/CardIssuanceManagement';
import FineManagement from './DashbroadComponents/FineManagement';
import PolicyManagement from './DashbroadComponents/PolicyManagement';
import { requestLogout } from '../config/request';
import { useStore } from '../hooks/useStore';
import './admin-layout.css';

const { Header, Content, Sider } = Layout;

const VIEW_COMPONENTS = {
    stats: <Statistics />,
    loan: <LoanRequestManagement presetFilter="approval" pageTitle="Phê duyệt mượn sách" />,
    returns: <LoanRequestManagement presetFilter="returns" pageTitle="Quản lý trả sách" />,
    fines: <FineManagement />,
    book: <BookManagement />,
    'book-copies': <BookCopyManagement />,
    'patron-profiles': <UserManagement />,
    'card-issue': <CardIssuanceManagement />,
    policy: <PolicyManagement />,
    user: <UserManagement />,
};

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

function buildMenuItems(isAdmin) {
    const items = [
        {
            key: 'overview',
            icon: <PieChartOutlined />,
            label: 'Tổng quan',
            children: [{ key: 'stats', icon: <DashboardOutlined />, label: 'Dashboard / Thống kê' }],
        },
        {
            key: 'circulation',
            icon: <AuditOutlined />,
            label: 'Quản lý Lưu thông',
            children: [
                { key: 'loan', icon: <CheckCircleOutlined />, label: 'Phê duyệt mượn' },
                { key: 'returns', icon: <ExportOutlined />, label: 'Quản lý Trả sách' },
                { key: 'fines', icon: <DollarOutlined />, label: 'Quản lý Phạt' },
            ],
        },
        {
            key: 'inventory',
            icon: <DatabaseOutlined />,
            label: 'Quản lý Kho',
            children: [
                { key: 'book', icon: <BookOutlined />, label: 'Danh mục đầu sách' },
                { key: 'book-copies', icon: <BarcodeOutlined />, label: 'Bản sao & Barcode' },
            ],
        },
        {
            key: 'patrons',
            icon: <UserOutlined />,
            label: 'Quản lý Độc giả',
            children: [
                { key: 'patron-profiles', icon: <TeamOutlined />, label: 'Hồ sơ Độc giả' },
                { key: 'card-issue', icon: <SolutionOutlined />, label: 'Kích hoạt Độc giả' },
            ],
        },
    ];

    if (isAdmin) {
        items.push({
            key: 'system',
            icon: <SettingOutlined />,
            label: 'Hệ thống',
            children: [
                { key: 'policy', icon: <ControlOutlined />, label: 'Cấu hình chính sách' },
                { key: 'user', icon: <UserSwitchOutlined />, label: 'Tài khoản thủ thư & phân quyền' },
            ],
        });
    }

    return items;
}

function Admin() {
    const [selectedKey, setSelectedKey] = useState('stats');
    const [openKeys, setOpenKeys] = useState([
        'overview',
        'circulation',
        'inventory',
        'patrons',
        'system',
    ]);
    const navigate = useNavigate();
    const { dataUser, refreshAuth } = useStore();

    const isAdmin = String(dataUser?.role || '').toLowerCase() === 'admin';

    const menuItems = useMemo(() => buildMenuItems(isAdmin), [isAdmin]);

    useEffect(() => {
        setOpenKeys(
            isAdmin
                ? ['overview', 'circulation', 'inventory', 'patrons', 'system']
                : ['overview', 'circulation', 'inventory', 'patrons'],
        );
    }, [isAdmin]);

    const currentTabTitle = useMemo(() => {
        return findMenuLabel(menuItems, selectedKey) || 'Dashboard';
    }, [menuItems, selectedKey]);

    const staffSubtitle = useMemo(() => {
        const r = String(dataUser?.role || '').toLowerCase();
        if (r === 'librarian') return 'Thủ thư';
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
        <Layout className="admin-layout-root" style={{ minHeight: '100vh' }}>
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
                        THƯ VIỆN PTIT
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
                    onOpenChange={setOpenKeys}
                    onClick={({ key }) => {
                        if (Object.prototype.hasOwnProperty.call(VIEW_COMPONENTS, key)) {
                            setSelectedKey(key);
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
                        margin: '24px 16px',
                        padding: 24,
                        background: '#f0f2f5',
                        flex: 1,
                        overflow: 'auto',
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
