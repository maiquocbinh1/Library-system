import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore';
import { Dropdown, Avatar, Button, Input } from 'antd';
import { UserOutlined, LogoutOutlined, HistoryOutlined, SearchOutlined, SafetyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { requestLogout } from '../config/request';

function Header() {
    const { dataUser, refreshAuth } = useStore();
    const navigate = useNavigate();
    const [searchText, setSearchText] = useState('');
    const role = String(dataUser?.role || '').toLowerCase();
    const isLibraryStaff = role === 'admin' || role === 'librarian';

    const handleLogout = async () => {
        try {
            await requestLogout();
            await refreshAuth();
            navigate('/');
        } catch (error) {
            console.error('Failed to logout:', error);
        }
    };

    const navItems = [
        { label: 'Trang chủ', to: '/' },
        { label: 'Danh mục sách', to: '/categories' },
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

                <nav className="hidden flex-1 items-center justify-center gap-6 lg:flex">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `border-b-2 pb-1 text-sm font-medium transition-colors ${
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

                <div className="flex items-center gap-3">
                    <Input
                        size="small"
                        className="w-40 sm:w-56"
                        placeholder="Tìm kiếm sách..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onPressEnter={onSearch}
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />

                    <div className="flex items-center">
                        {dataUser && dataUser.id ? (
                            <Dropdown
                                menu={{
                                    items: [
                                        {
                                            key: 'profile',
                                            icon: <UserOutlined />,
                                            label: 'Thông tin cá nhân',
                                            onClick: () => navigate('/infoUser?tab=info'),
                                        },
                                        ...(!isLibraryStaff
                                            ? [
                                                  {
                                                      key: 'settings',
                                                      icon: <HistoryOutlined />,
                                                      label: 'Lịch sử mượn',
                                                      onClick: () => navigate('/infoUser?tab=history'),
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
        </header>
    );
}

export default Header;
