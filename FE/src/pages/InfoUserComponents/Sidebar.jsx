import React from 'react';
import { Menu } from 'antd';
import {
    BookOutlined,
    HistoryOutlined,
    LogoutOutlined,
    SearchOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { requestLogout } from '../../config/request';
import { useStore } from '../../hooks/useStore';

const Sidebar = ({ activeComponent, setActiveComponent }) => {
    const navigate = useNavigate();
    const { refreshAuth } = useStore();

    const handleLogout = async () => {
        try {
            await requestLogout();
            await refreshAuth();
            navigate('/');
        } catch {
            navigate('/');
        }
    };

    const items = [
        {
            key: 'nav-search',
            icon: <SearchOutlined />,
            label: <Link to="/">Tìm &amp; Mượn sách</Link>,
        },
        {
            key: 'current',
            icon: <BookOutlined />,
            label: 'Sách đang mượn',
            onClick: () => setActiveComponent('current'),
        },
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Hồ sơ cá nhân',
            onClick: () => setActiveComponent('profile'),
        },
        {
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'Lịch sử đầy đủ',
            onClick: () => setActiveComponent('history'),
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Đăng xuất',
            danger: true,
            onClick: handleLogout,
        },
    ];

    return (
        <>
            <style>
                {`
                .info-user-menu.ant-menu .ant-menu-item { border-radius: 12px; margin: 4px 0; height: auto; line-height: 1.35; padding: 10px 12px !important; }
                .info-user-menu.ant-menu .ant-menu-item-selected { background: linear-gradient(90deg, rgba(139,92,246,0.14), rgba(99,102,241,0.06)) !important; color: #5b21b6 !important; font-weight: 600; }
                .info-user-menu.ant-menu .ant-menu-item:hover { background: rgba(139,92,246,0.08) !important; }
                .info-user-menu.ant-menu .ant-menu-item-danger.ant-menu-item-selected { background: rgba(239,68,68,0.1) !important; color: #b91c1c !important; }
                `}
            </style>
            <div className="flex h-full flex-col bg-gradient-to-b from-slate-50 to-violet-50/40 px-2 py-4">
                <Link to="/" className="mb-6 flex items-center gap-2 px-3 no-underline">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-lg text-white shadow-md">
                        📚
                    </span>
                    <span className="text-lg font-bold tracking-tight text-slate-800">
                        Thư viện
                    </span>
                </Link>
                <Menu
                    className="info-user-menu flex-1 border-0 bg-transparent"
                    selectedKeys={[activeComponent]}
                    mode="inline"
                    items={items}
                    style={{ background: 'transparent' }}
                />
            </div>
        </>
    );
};

export default Sidebar;
