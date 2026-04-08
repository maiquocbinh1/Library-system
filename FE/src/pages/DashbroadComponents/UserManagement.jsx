import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Input, Modal, Form, Select, message } from 'antd';
import { IdcardOutlined } from '@ant-design/icons';
import { requestDeleteUser, requestGetAllUsers, requestIssueReaderCard, requestUpdateUserAdmin } from '../../config/request';

const { Search } = Input;

const UserManagement = () => {
    const [data, setData] = useState([]);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isCardModalVisible, setIsCardModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deletingUser, setDeletingUser] = useState(null);
    const [selectedUserForCard, setSelectedUserForCard] = useState(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [cardForm] = Form.useForm();

    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id' },
        { title: 'Tên người dùng', dataIndex: 'fullName', key: 'fullName' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        { title: 'Vai trò', dataIndex: 'role', key: 'role' },
        {
            title: 'Hành động',
            key: 'action',
            render: (text, record) => (
                <span>
                    <Button
                        type="primary"
                        onClick={() => {
                            setEditingUser(record);
                            form.setFieldsValue(record);
                            setIsEditModalVisible(true);
                        }}
                    >
                        Sửa
                    </Button>
                    <Button
                        icon={<IdcardOutlined />}
                        onClick={() => {
                            setSelectedUserForCard(record);
                            cardForm.setFieldsValue({
                                fullName: record.fullName,
                                email: record.email,
                                planMonths: 3,
                                readerCode: '',
                            });
                            setIsCardModalVisible(true);
                        }}
                        style={{ marginLeft: 8 }}
                        className="rounded-xl"
                    >
                        Cấp thẻ
                    </Button>
                    <Button
                        type="primary"
                        danger
                        onClick={() => {
                            setDeletingUser(record);
                            setIsDeleteModalVisible(true);
                        }}
                        style={{ marginLeft: 8 }}
                    >
                        Xóa
                    </Button>
                </span>
            ),
        },
    ];

    const fetchData = async () => {
        const res = await requestGetAllUsers();
        const list = Array.isArray(res?.metadata) ? res.metadata : [];
        const normalized = list.map((item) => ({
            ...item,
            id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
        }));
        setData(normalized);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUpdateUser = async () => {
        try {
            setLoading(true);
            const data = {
                userId: editingUser.id,
                ...form.getFieldsValue(),
            };
            await requestUpdateUserAdmin(data);
            setIsEditModalVisible(false);
            fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật người dùng');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        try {
            setLoading(true);
            const data = {
                userId: deletingUser.id,
            };
            await requestDeleteUser(data);
            setIsDeleteModalVisible(false);
            fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể xóa người dùng');
        } finally {
            setLoading(false);
        }
    };

    const handleIssueCard = async () => {
        try {
            const values = await cardForm.validateFields();
            setLoading(true);
            await requestIssueReaderCard({
                userId: selectedUserForCard?.id,
                planMonths: values.planMonths,
                readerCode: String(values.readerCode || '').trim(),
            });
            message.success('Cấp thẻ độc giả thành công');
            setIsCardModalVisible(false);
            setSelectedUserForCard(null);
            cardForm.resetFields();
            fetchData();
        } catch (error) {
            if (error?.errorFields) return;
            message.error(error?.response?.data?.message || 'Không thể cấp thẻ');
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => data, [data]);

    return (
        <div>
            <div className="flex justify-between mb-4">
                <h2 className="text-2xl font-bold">Quản lý người dùng</h2>
            </div>
            <Search placeholder="Tìm kiếm người dùng" onSearch={() => {}} style={{ width: 300, marginBottom: 16 }} />
            <Table columns={columns} dataSource={filteredData} rowKey={(record) => record.id || record.email} />

            <Modal
                title="Sửa thông tin người dùng"
                open={isEditModalVisible}
                onOk={handleUpdateUser}
                onCancel={() => {
                    setIsEditModalVisible(false);
                }}
                okText="Lưu"
                cancelText="Hủy"
                confirmLoading={loading}
            >
                <Form form={form} layout="vertical" name="edit_user_form">
                    <Form.Item
                        name="fullName"
                        label="Tên người dùng"
                        rules={[{ required: true, message: 'Vui lòng nhập tên người dùng!' }]}
                    >
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Vui lòng nhập email!' }]}>
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label="Vai trò"
                        rules={[{ required: true, message: 'Vui lòng chọn vai trò!' }]}
                    >
                        <Select
                            options={[
                                { value: 'user', label: 'Người dùng' },
                                { value: 'admin', label: 'Quản trị viên' },
                            ]}
                            className="rounded-xl"
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Đăng ký thẻ độc giả"
                open={isCardModalVisible}
                onOk={handleIssueCard}
                onCancel={() => {
                    setIsCardModalVisible(false);
                    setSelectedUserForCard(null);
                }}
                okText="Đăng ký"
                cancelText="Hủy"
                confirmLoading={loading}
            >
                <Form form={cardForm} layout="vertical">
                    <Form.Item label="Họ tên" name="fullName">
                        <Input disabled className="rounded-xl" />
                    </Form.Item>
                    <Form.Item label="Gmail" name="email">
                        <Input disabled className="rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        label="Loại thẻ / Thời hạn"
                        name="planMonths"
                        rules={[{ required: true, message: 'Vui lòng chọn gói thẻ!' }]}
                    >
                        <Select
                            className="rounded-xl"
                            options={[
                                { value: 3, label: 'Gói 3 tháng' },
                                { value: 6, label: 'Gói 6 tháng' },
                                { value: 12, label: 'Gói 1 năm' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Mã thẻ"
                        name="readerCode"
                        rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã thẻ!' }]}
                    >
                        <Input
                            className="rounded-xl"
                            placeholder="Nhập mã thẻ (ví dụ DG0001)"
                            addonAfter={
                                <Button
                                    type="link"
                                    className="px-0"
                                    onClick={() => {
                                        const code = `DG${Math.floor(100000 + Math.random() * 900000)}`;
                                        cardForm.setFieldsValue({ readerCode: code });
                                    }}
                                >
                                    Tự sinh
                                </Button>
                            }
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Xóa người dùng"
                open={isDeleteModalVisible}
                onOk={handleDeleteUser}
                onCancel={() => {
                    setIsDeleteModalVisible(false);
                }}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                confirmLoading={loading}
            >
                <p>Bạn có chắc chắn muốn xóa người dùng "{deletingUser?.fullName}" không?</p>
            </Modal>
        </div>
    );
};

export default UserManagement;
