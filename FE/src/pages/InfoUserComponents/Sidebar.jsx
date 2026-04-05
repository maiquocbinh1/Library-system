import React from 'react';
import { Menu } from 'antd';
import { UserOutlined, HistoryOutlined, LogoutOutlined } from '@ant-design/icons';

const Sidebar = ({ setActiveComponent, activeComponent }) => {
    const handleLogout = () => {};

    const items = [
        {
            key: 'info',
            icon: <UserOutlined />,
            label: 'Thông tin cá nhân',
            onClick: () => setActiveComponent('info'),
        },
        {
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'Lịch sử mượn sách',
            onClick: () => setActiveComponent('history'),
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Đăng xuất',
            onClick: handleLogout,
            danger: true,
        },
    ];

    return (
        <Menu
            className="h-full"
            selectedKeys={[activeComponent]}
            mode="inline"
            items={items}
        />
    );
};

export default Sidebar;

