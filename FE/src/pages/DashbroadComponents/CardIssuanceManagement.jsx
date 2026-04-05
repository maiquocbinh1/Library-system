import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, message } from 'antd';
import { requestGetAllUsers, requestConfirmReaderCode, requestDeleteUser } from '../../config/request';

const CardIssuanceManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isCodeModalVisible, setIsCodeModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [selectedReader, setSelectedReader] = useState(null);
    const [form] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await requestGetAllUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list
                .map((item) => ({
                    ...item,
                    id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
                    readerCode: item?.readerCode || item?.idStudent || null,
                }))
                .filter((item) => item?.role !== 'admin')
                .filter((item) => item?.readerCode !== null && item?.readerCode !== undefined);
            setData(normalized);
        } catch (error) {
            message.error('Không thể tải danh sách độc giả');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const showCodeModal = (reader) => {
        setSelectedReader(reader);
        form.setFieldsValue({
            readerCode: reader?.readerCode && reader.readerCode !== '0' ? reader.readerCode : undefined,
        });
        setIsCodeModalVisible(true);
    };

    const handleCodeCancel = () => {
        setIsCodeModalVisible(false);
        form.resetFields();
        setSelectedReader(null);
    };

    const handleCodeOk = () => {
        form.submit();
    };

    const onCodeFormFinish = async (values) => {
        setLoading(true);
        try {
            if (!selectedReader?.id) {
                message.error('Không tìm thấy độc giả hợp lệ');
                return;
            }
            const payload = {
                userId: selectedReader.id,
                idStudent: values.readerCode,
                readerCode: values.readerCode,
            };
            await requestConfirmReaderCode(payload);
            const isEdit = selectedReader?.readerCode && selectedReader.readerCode !== '0';
            message.success(isEdit ? `Đã cập nhật mã độc giả cho ${selectedReader.fullName}` : `Đã cấp mã độc giả cho ${selectedReader.fullName}`);
            handleCodeCancel();
            fetchData();
        } catch (error) {
            message.error('Cấp mã độc giả thất bại');
        } finally {
            setLoading(false);
        }
    };

    const showDeleteModal = (reader) => {
        setSelectedReader(reader);
        setIsDeleteModalVisible(true);
    };

    const handleDeleteCancel = () => {
        setIsDeleteModalVisible(false);
        setSelectedReader(null);
    };

    const handleDeleteOk = async () => {
        setLoading(true);
        try {
            if (!selectedReader?.id) {
                message.error('Không tìm thấy độc giả hợp lệ');
                return;
            }
            await requestDeleteUser({ userId: selectedReader.id });
            message.success(`Đã xóa độc giả ${selectedReader.fullName}`);
            handleDeleteCancel();
            fetchData();
        } catch (error) {
            message.error('Xóa độc giả thất bại');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            render: (text) => <span>{String(text || '').slice(0, 10) || '-'}</span>,
        },
        {
            title: 'Ảnh đại diện',
            dataIndex: 'avatar',
            key: 'avatar',
            render: (text) => (
                <img
                    style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover' }}
                    src={text ? `${import.meta.env.VITE_API_URL_IMAGE}/${text}` : '/placeholder-avatar.png'}
                    alt="avatar"
                />
            ),
        },
        { title: 'Họ và tên', dataIndex: 'fullName', key: 'fullName' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        { title: 'Số điện thoại', dataIndex: 'phone', key: 'phone' },
        {
            title: 'Trạng thái',
            dataIndex: 'readerCode',
            key: 'readerCode',
            render: (readerCode) => (
                <Tag color={readerCode === '0' ? 'blue' : 'green'}>{readerCode === '0' ? 'Chờ cấp mã' : 'Đã cấp mã'}</Tag>
            ),
        },
        {
            title: 'Mã độc giả',
            dataIndex: 'readerCode',
            key: 'readerCodeDisplay',
            render: (readerCode) => <span>{readerCode && readerCode !== '0' ? readerCode : '-'}</span>,
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (text, record) => (
                <div className="flex gap-2">
                    <Button type="primary" onClick={() => showCodeModal(record)}>
                        {record.readerCode === '0' ? 'Cấp mã' : 'Sửa mã'}
                    </Button>
                    <Button type="primary" danger onClick={() => showDeleteModal(record)}>
                        Xóa độc giả
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <h2 className="text-2xl mb-4 font-bold">Quản lý cấp mã độc giả</h2>
            <Table columns={columns} dataSource={data} rowKey={(record) => record.id || record.email} loading={loading} />

            <Modal
                title={`${selectedReader?.readerCode && selectedReader?.readerCode !== '0' ? 'Sửa mã độc giả' : 'Cấp mã độc giả'} cho: ${selectedReader?.fullName}`}
                open={isCodeModalVisible}
                onOk={handleCodeOk}
                onCancel={handleCodeCancel}
                confirmLoading={loading}
                okText={selectedReader?.readerCode && selectedReader?.readerCode !== '0' ? 'Lưu' : 'Cấp mã'}
                cancelText="Hủy"
            >
                <Form form={form} onFinish={onCodeFormFinish} layout="vertical">
                    <Form.Item
                        name="readerCode"
                        label="Mã độc giả"
                        rules={[{ required: true, message: 'Vui lòng nhập mã độc giả!' }]}
                    >
                        <Input placeholder="Nhập mã độc giả" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Xác nhận xóa độc giả"
                open={isDeleteModalVisible}
                onOk={handleDeleteOk}
                onCancel={handleDeleteCancel}
                confirmLoading={loading}
                okText="Xóa độc giả"
                cancelText="Không"
                okButtonProps={{ danger: true }}
            >
                <p>
                    Bạn có chắc chắn muốn xóa độc giả <b>{selectedReader?.fullName}</b> không?
                </p>
            </Modal>
        </div>
    );
};

export default CardIssuanceManagement;
