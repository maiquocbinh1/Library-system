import React, { useState } from 'react';
import { Avatar, Dropdown, Layout, Menu, message } from 'antd';
import {
    UserOutlined,
    SolutionOutlined,
    IdcardOutlined,
    BookOutlined,
    LineChartOutlined,
    LogoutOutlined,
    DownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import UserManagement from './UserManagement';
import LoanRequestManagement from './LoanRequestManagement';
import CardIssuanceManagement from './CardIssuanceManagement';
import BookManagement from './BookManagement';
import Statistics from './Statistics';
import { requestLogout } from '../../config/request';
import { useStore } from '../../hooks/useStore';

const { Header, Content, Sider } = Layout;

const components = {
    stats: <Statistics />,
    user: <UserManagement />,
    loan: <LoanRequestManagement />,
    card: <CardIssuanceManagement />,
    book: <BookManagement />,
};

const menuItems = [
    { key: 'stats', icon: <LineChartOutlined />, label: 'Thống kê' },
    { key: 'book', icon: <BookOutlined />, label: 'Quản lý sách' },
    { key: 'loan', icon: <SolutionOutlined />, label: 'Quản lý mượn sách' },
    { key: 'card', icon: <IdcardOutlined />, label: 'Quản lý mã độc giả' },
    { key: 'user', icon: <UserOutlined />, label: 'Quản lý người dùng' },
];

const IndexDashBroad = () => {
    const [selectedKey, setSelectedKey] = useState('stats');
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const { dataUser, refreshAuth } = useStore();

    const renderContent = () => {
        return components[selectedKey] || <div>Chọn một mục từ menu</div>;
    };

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
        <Layout className="min-h-screen">
            <Sider
                theme="dark"
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                breakpoint="lg"
                collapsedWidth={80}
            >
                <div className="mx-4 my-4 rounded-md border border-white/10 bg-white/5 px-2 py-3 text-center text-sm font-bold tracking-wide text-white">
                    {collapsed ? 'ADMIN' : 'ADMIN PANEL'}
                </div>
                <Menu
                    theme="dark"
                    mode="inline"
                    items={menuItems}
                    selectedKeys={[selectedKey]}
                    onClick={(e) => setSelectedKey(e.key)}
                />
            </Sider>
            <Layout className="bg-gray-50">
                <Header className="flex items-center justify-end bg-white px-6 shadow-sm">
                    <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={['click']}>
                        <button
                            type="button"
                            className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-gray-100"
                        >
                            <Avatar size={32} icon={<UserOutlined />} src={dataUser?.avatar || undefined} />
                            <div className="hidden text-left sm:block">
                                <p className="text-sm font-semibold text-gray-900">{dataUser?.fullName || 'Admin'}</p>
                                <p className="text-xs text-gray-500">{dataUser?.email || 'admin@library.local'}</p>
                            </div>
                            <DownOutlined className="text-xs text-gray-500" />
                        </button>
                    </Dropdown>
                </Header>
                <Content className="m-4">
                    <div className="min-h-[calc(100vh-96px)] rounded-lg bg-white p-6 shadow-sm">
                        {renderContent()}
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
};

export default IndexDashBroad;
