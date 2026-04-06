import React, { useMemo, useState } from 'react';
import { Avatar, Dropdown, Layout, Menu, Typography, message } from 'antd';
import {
    DashboardOutlined,
    BookOutlined,
    TeamOutlined,
    IdcardOutlined,
    HistoryOutlined,
    LogoutOutlined,
    UserOutlined,
    DownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import Statistics from './DashbroadComponents/Statistics';
import BookManagement from './DashbroadComponents/BookManagement';
import UserManagement from './DashbroadComponents/UserManagement';
import LoanRequestManagement from './DashbroadComponents/LoanRequestManagement';
import CardIssuanceManagement from './DashbroadComponents/CardIssuanceManagement';
import { requestLogout } from '../config/request';
import { useStore } from '../hooks/useStore';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const components = {
    stats: <Statistics />,
    user: <UserManagement />,
    loan: <LoanRequestManagement />,
    card: <CardIssuanceManagement />,
    book: <BookManagement />,
};

const menuItems = [
    { key: 'stats', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: 'book', icon: <BookOutlined />, label: 'Quản lý sách' },
    { key: 'loan', icon: <HistoryOutlined />, label: 'Yêu cầu mượn sách' },
    { key: 'card', icon: <IdcardOutlined />, label: 'Quản lý mã độc giả' },
    { key: 'user', icon: <TeamOutlined />, label: 'Quản lý người dùng' },
];

function Admin() {
    const [selectedKey, setSelectedKey] = useState('stats');
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const { dataUser, refreshAuth } = useStore();

    const currentTabTitle = useMemo(() => {
        const currentItem = menuItems.find((item) => item.key === selectedKey);
        return currentItem?.label || 'Dashboard';
    }, [selectedKey]);

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

    const siderWidth = collapsed ? 88 : 260;

    return (
        <Layout className="min-h-screen bg-[#f5f7fb]">
            <Sider
                theme="light"
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                breakpoint="lg"
                collapsedWidth={88}
                width={260}
                style={{
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    borderRight: '1px solid #5b43d6',
                    background: 'linear-gradient(180deg, #5b43d6 0%, #7b5cff 55%, #8b5cf6 100%)',
                    zIndex: 20,
                }}
            >
                <div className="mx-3 my-4 rounded-xl border border-white/30 bg-white/15 px-3 py-4 text-center shadow-sm backdrop-blur-sm">
                    <Text className="text-sm font-extrabold tracking-wide text-white">
                        LIBRARY
                    </Text>
                </div>

                <Menu
                    mode="inline"
                    items={menuItems}
                    selectedKeys={[selectedKey]}
                    onClick={(event) => setSelectedKey(event.key)}
                    className="admin-sider-menu border-e-0 px-2"
                />
            </Sider>

            <Layout style={{ marginLeft: siderWidth, transition: 'margin-left 0.2s ease' }}>
                <Header className="flex h-16 items-center justify-between bg-white px-8 shadow-sm">
                    <Typography.Title
                        level={4}
                        className={`!mb-0 ${selectedKey === 'stats' ? '!text-violet-700' : '!text-slate-800'}`}
                    >
                        {currentTabTitle}
                    </Typography.Title>

                    <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={['click']}>
                        <button
                            type="button"
                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition-colors hover:bg-slate-50"
                        >
                            <Avatar size={34} icon={<UserOutlined />} src={dataUser?.avatar || undefined} />
                            <div className="hidden text-left sm:block">
                                <p className="text-sm font-semibold text-slate-900">{dataUser?.fullName || 'Admin'}</p>
                                <p className="text-xs text-slate-500">{dataUser?.email || 'admin@ptit.edu.vn'}</p>
                            </div>
                            <DownOutlined className="text-xs text-slate-500" />
                        </button>
                    </Dropdown>
                </Header>

                <Content className="m-6">
                    <div className="min-h-[calc(100vh-112px)] rounded-2xl bg-white p-6 shadow-sm">{components[selectedKey]}</div>
                </Content>
            </Layout>

            <style>{`
                .admin-sider-menu {
                    background: transparent !important;
                }
                .admin-sider-menu .ant-menu-item {
                    border-radius: 10px;
                    margin-inline: 0 !important;
                    margin-block: 4px;
                    height: 44px;
                    line-height: 44px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.92);
                }
                .admin-sider-menu .ant-menu-item .ant-menu-item-icon {
                    color: rgba(255, 255, 255, 0.9);
                }
                .admin-sider-menu .ant-menu-item-selected {
                    background: rgba(255, 255, 255, 0.22) !important;
                    color: #ffffff !important;
                }
                .admin-sider-menu .ant-menu-item-selected .ant-menu-item-icon {
                    color: #ffffff !important;
                }
                .admin-sider-menu .ant-menu-item:hover {
                    background: rgba(255, 255, 255, 0.14) !important;
                    color: #ffffff !important;
                }
                .admin-sider-menu .ant-menu-item:hover .ant-menu-item-icon {
                    color: #ffffff !important;
                }
            `}</style>
        </Layout>
    );
}

export default Admin;
