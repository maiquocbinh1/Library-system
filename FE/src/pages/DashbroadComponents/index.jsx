import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { UserOutlined, SolutionOutlined, IdcardOutlined, BookOutlined, LineChartOutlined } from '@ant-design/icons';

import UserManagement from './UserManagement';
import LoanRequestManagement from './LoanRequestManagement';
import CardIssuanceManagement from './CardIssuanceManagement';
import BookManagement from './BookManagement';
import Statistics from './Statistics';

const { Header, Content, Sider, Footer } = Layout;

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
    { key: 'card', icon: <IdcardOutlined />, label: 'Quản lý cấp thẻ' },
    { key: 'user', icon: <UserOutlined />, label: 'Quản lý người dùng' },
];

const IndexDashBroad = () => {
    const [selectedKey, setSelectedKey] = useState('stats');

    const renderContent = () => {
        return components[selectedKey] || <div>Chọn một mục từ menu</div>;
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider breakpoint="lg" collapsedWidth="0">
                <div className="h-8 m-4 bg-gray-700 text-white text-center leading-8">Logo</div>
                <Menu
                    theme="dark"
                    mode="inline"
                    items={menuItems}
                    selectedKeys={[selectedKey]}
                    onClick={(e) => setSelectedKey(e.key)}
                />
            </Sider>
            <Layout>
                <Header className="bg-white p-0" />
                <Content style={{ margin: '24px 16px 0' }}>
                    <div className="p-6 bg-white" style={{ minHeight: 360 }}>
                        {renderContent()}
                    </div>
                </Content>
                <Footer style={{ textAlign: 'center' }}>Library Management ©2024 Created by Cascade</Footer>
            </Layout>
        </Layout>
    );
};

export default IndexDashBroad;
