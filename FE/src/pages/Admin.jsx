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
import ReaderCodeManagement from './DashbroadComponents/ReaderCodeManagement';
import { requestLogout } from '../config/request';
import { useStore } from '../hooks/useStore';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const components = {
    stats: <Statistics />,
    user: <UserManagement />,
    loan: <LoanRequestManagement />,
    'card-codes': <ReaderCodeManagement />,
    'card-issue': <CardIssuanceManagement />,
    book: <BookManagement />,
};

const menuItems = [
    { key: 'stats', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: 'book', icon: <BookOutlined />, label: 'Quản lý sách' },
    { key: 'loan', icon: <HistoryOutlined />, label: 'Yêu cầu mượn sách' },
    {
        key: 'cardGroup',
        icon: <IdcardOutlined />,
        label: 'Quản lý mã độc giả',
        children: [
            { key: 'card-codes', label: 'Danh sách mã độc giả' },
            { key: 'card-issue', label: 'Đăng ký làm thẻ' },
        ],
    },
    { key: 'user', icon: <TeamOutlined />, label: 'Quản lý người dùng' },
];

function findMenuLabel(items, key) {
    for (const item of items) {
        if (item?.key === key) return item?.label;
        if (Array.isArray(item?.children)) {
            const found = findMenuLabel(item.children, key);
            if (found) return found;
        }
    }
    return null;
}

function Admin() {
    const [selectedKey, setSelectedKey] = useState('stats');
    const navigate = useNavigate();
    const { dataUser, refreshAuth } = useStore();

    const currentTabTitle = useMemo(() => {
        return findMenuLabel(menuItems, selectedKey) || 'Dashboard';
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

    return (
        <Layout className="min-h-screen bg-[#f5f7fb]">
            <Sider
                theme="light"
                breakpoint="lg"
                width={260}
                style={{
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    height: '100vh',
                    overflow: 'auto',
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
                    defaultOpenKeys={['cardGroup']}
                    onClick={(event) => setSelectedKey(event.key)}
                    className="admin-sider-menu border-e-0 px-2"
                />
            </Sider>

            <Layout style={{ marginLeft: 260 }}>
                <Header className="flex h-16 w-full items-center justify-between bg-white px-8 shadow-sm">
                    <Typography.Title level={4} className="!mb-0 !text-2xl !font-bold !text-purple-700">
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
                    <div className="min-h-[calc(100vh-112px)] rounded-2xl bg-white p-6 shadow-sm">
                        {components[selectedKey] || components['card-codes']}
                    </div>
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
