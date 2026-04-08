import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, message, Modal, Radio, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { requestDeleteUser, requestGetAllUsers, requestIssueReaderCard, requestUpdateUserAdmin } from '../../config/request';

const ReaderCodeManagement = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [selectedReaderForDetail, setSelectedReaderForDetail] = useState(null);
    const [selectedReader, setSelectedReader] = useState(null);
    const [editingReader, setEditingReader] = useState(null);
    const [editForm] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await requestGetAllUsers();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list
                .map((item) => ({
                    ...item,
                    id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
                    readerCode: item?.readerCard?.readerCode || item?.readerCode || item?.idStudent || null,
                    readerCard: item?.readerCard || null,
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

    const showEditModal = (reader) => {
        setEditingReader(reader);
        const readerCard = reader?.readerCard || null;
        editForm.setFieldsValue({
            fullName: reader?.fullName || '',
            email: reader?.email || '',
            phone: reader?.phone || '',
            address: reader?.address || '',
            readerCode: reader?.readerCode && reader.readerCode !== '0' ? reader.readerCode : '',
            birthDate: readerCard?.birthDate ? dayjs(readerCard.birthDate) : null,
            className: readerCard?.className || '',
            gender: readerCard?.gender || 'male',
            roleType: readerCard?.roleType || 'student',
            systemType: readerCard?.systemType || 'civil',
            planMonths: readerCard?.planMonths || 3,
            issuedAt: readerCard?.issuedAt ? dayjs(readerCard.issuedAt) : dayjs(),
            expiresAt: readerCard?.expiresAt ? dayjs(readerCard.expiresAt) : dayjs().add(Number(readerCard?.planMonths || 3), 'month'),
        });
        setIsEditModalVisible(true);
    };

    const handleEditCancel = () => {
        setIsEditModalVisible(false);
        setEditingReader(null);
        editForm.resetFields();
    };

    const handleEditOk = () => editForm.submit();

    const onEditFinish = async (values) => {
        setLoading(true);
        try {
            if (!editingReader?.id) {
                message.error('Không tìm thấy độc giả hợp lệ');
                return;
            }
            await requestUpdateUserAdmin({
                userId: editingReader.id,
                fullName: String(values.fullName || '').trim(),
                phone: String(values.phone || '').trim(),
                address: String(values.address || '').trim(),
            });

            await requestIssueReaderCard({
                userId: editingReader.id,
                planMonths: values.planMonths,
                readerCode: String(values.readerCode || '').trim(),
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                className: values.className,
                gender: values.gender,
                roleType: values.roleType,
                systemType: values.systemType,
                issuedAt: values.issuedAt ? values.issuedAt.toISOString() : null,
            });

            message.success('Cập nhật độc giả thành công');
            handleEditCancel();
            await fetchData();

            // Update detail block if it is the same user
            if (selectedReaderForDetail && String(selectedReaderForDetail?.id) === String(editingReader.id)) {
                setSelectedReaderForDetail((prev) => ({
                    ...(prev || {}),
                    fullName: String(values.fullName || '').trim(),
                    phone: String(values.phone || '').trim(),
                    address: String(values.address || '').trim(),
                    readerCode: String(values.readerCode || '').trim(),
                    readerCard: {
                        ...(prev?.readerCard || {}),
                        readerCode: String(values.readerCode || '').trim(),
                        birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                        className: values.className,
                        gender: values.gender,
                        roleType: values.roleType,
                        systemType: values.systemType,
                        planMonths: values.planMonths,
                        issuedAt: values.issuedAt ? values.issuedAt.toISOString() : null,
                        expiresAt: values.expiresAt ? values.expiresAt.toISOString?.() || values.expiresAt : prev?.readerCard?.expiresAt,
                    },
                }));
            }
        } catch (error) {
            message.error(error?.response?.data?.message || 'Cập nhật độc giả thất bại');
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
                    <Button onClick={() => showEditModal(record)}>Sửa</Button>
                    <Button type="primary" danger onClick={() => showDeleteModal(record)}>
                        Xóa độc giả
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                {!selectedReaderForDetail ? (
                    <div className="text-slate-500">Chọn một độc giả ở danh sách bên dưới để xem thông tin chi tiết.</div>
                ) : (
                    (() => {
                        const card = selectedReaderForDetail?.readerCard || null;
                        const issuedAtText = card?.issuedAt ? dayjs(card.issuedAt).format('DD/MM/YYYY') : '-';
                        const expiresAtText = card?.expiresAt ? dayjs(card.expiresAt).format('DD/MM/YYYY') : '-';
                        const birthDateText = card?.birthDate ? dayjs(card.birthDate).format('DD/MM/YYYY') : '-';

                        const genderText =
                            card?.gender === 'male' ? 'Nam' : card?.gender === 'female' ? 'Nữ' : card?.gender === 'other' ? 'Khác' : '-';
                        const roleText = card?.roleType === 'student' ? 'Sinh viên' : card?.roleType === 'lecturer' ? 'Học viên' : '-';
                        const systemText = card?.systemType === 'civil' ? 'Dân sự' : card?.systemType === 'military' ? 'Quốc tế' : '-';

                        return (
                    <div className="flex flex-col gap-4 md:flex-row md:items-start">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50 shadow-sm">
                            <img
                                src={
                                    selectedReaderForDetail?.avatar
                                        ? `${import.meta.env.VITE_API_URL_IMAGE}/${selectedReaderForDetail.avatar}`
                                        : '/placeholder-avatar.png'
                                }
                                alt="avatar"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.src = '/placeholder-avatar.png';
                                }}
                            />
                        </div>

                        <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate text-lg font-bold text-slate-900">{selectedReaderForDetail?.fullName || '-'}</div>
                                    <div className="truncate text-sm text-slate-500">{selectedReaderForDetail?.email || '-'}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tag color={selectedReaderForDetail?.readerCode === '0' ? 'blue' : 'green'}>
                                        {selectedReaderForDetail?.readerCode === '0' ? 'Chờ cấp mã' : 'Đã cấp mã'}
                                    </Tag>
                                    <Button onClick={() => setSelectedReaderForDetail(null)} className="rounded-xl">
                                        Đóng
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Số điện thoại</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{selectedReaderForDetail?.phone || '-'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Mã độc giả</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">
                                        {selectedReaderForDetail?.readerCode && selectedReaderForDetail.readerCode !== '0'
                                            ? selectedReaderForDetail.readerCode
                                            : '-'}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Ngày sinh</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{birthDateText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Lớp</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{card?.className || '-'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Giới tính</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{genderText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Chức vụ</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{roleText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Hệ</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{systemText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Loại thẻ / Thời hạn</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">
                                        {card?.planMonths ? `Gói ${card.planMonths} tháng` : '-'}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Ngày làm thẻ</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{issuedAtText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-500">Ngày hết hạn thẻ</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{expiresAtText}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                                    <div className="text-xs font-semibold text-slate-500">Địa chỉ</div>
                                    <div className="mt-1 text-sm font-medium text-slate-900">{selectedReaderForDetail?.address || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                        );
                    })()
                )}
            </Card>

            <Table
                columns={columns}
                dataSource={data}
                rowKey={(record) => record.id || record.email}
                loading={loading}
                onRow={(record) => ({
                    onClick: () => {
                        // Toggle off when clicking the currently selected row
                        if (String(record?.id) === String(selectedReaderForDetail?.id)) {
                            setSelectedReaderForDetail(null);
                            return;
                        }
                        setSelectedReaderForDetail(record);
                    },
                })}
                rowClassName={(record) =>
                    String(record?.id) === String(selectedReaderForDetail?.id) ? 'bg-blue-50 cursor-pointer' : 'cursor-pointer'
                }
            />

            <Modal
                title="Sửa thông tin độc giả"
                open={isEditModalVisible}
                onOk={handleEditOk}
                onCancel={handleEditCancel}
                confirmLoading={loading}
                okText="Lưu"
                cancelText="Hủy"
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={onEditFinish}
                    onValuesChange={(changed, all) => {
                        if (changed.planMonths || changed.issuedAt) {
                            const issuedAt = all.issuedAt || dayjs();
                            const months = Number(all.planMonths || 3);
                            editForm.setFieldsValue({
                                expiresAt: dayjs(issuedAt).add(months, 'month'),
                            });
                        }
                    }}
                >
                    <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}>
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item label="Email" name="email">
                        <Input disabled className="rounded-xl" />
                    </Form.Item>
                    <Form.Item label="Số điện thoại" name="phone" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}>
                        <Input className="rounded-xl" />
                    </Form.Item>
                    <Form.Item label="Địa chỉ" name="address">
                        <Input className="rounded-xl" />
                    </Form.Item>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Form.Item label="Mã độc giả" name="readerCode" rules={[{ required: true, message: 'Vui lòng nhập mã độc giả' }]}>
                            <Input className="rounded-xl" />
                        </Form.Item>
                        <Form.Item label="Ngày sinh" name="birthDate">
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" />
                        </Form.Item>

                        <Form.Item label="Lớp" name="className">
                            <Input className="rounded-xl" />
                        </Form.Item>
                        <Form.Item label="Giới tính" name="gender">
                            <Radio.Group>
                                <Radio value="male">Nam</Radio>
                                <Radio value="female">Nữ</Radio>
                                <Radio value="other">Khác</Radio>
                            </Radio.Group>
                        </Form.Item>

                        <Form.Item label="Chức vụ" name="roleType">
                            <Radio.Group>
                                <Radio value="student">Sinh viên</Radio>
                                <Radio value="lecturer">Học viên</Radio>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item label="Hệ" name="systemType">
                            <Radio.Group>
                                <Radio value="civil">Dân sự</Radio>
                                <Radio value="military">Quốc tế</Radio>
                            </Radio.Group>
                        </Form.Item>

                        <Form.Item label="Loại thẻ / Thời hạn" name="planMonths" rules={[{ required: true, message: 'Vui lòng chọn gói thẻ!' }]}>
                            <Select
                                className="rounded-xl"
                                options={[
                                    { value: 3, label: 'Gói 3 tháng' },
                                    { value: 6, label: 'Gói 6 tháng' },
                                    { value: 12, label: 'Gói 1 năm' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item label="Ngày làm thẻ" name="issuedAt" rules={[{ required: true, message: 'Vui lòng chọn ngày làm thẻ!' }]}>
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" />
                        </Form.Item>

                        <Form.Item label="Ngày hết hạn thẻ" name="expiresAt">
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" disabled />
                        </Form.Item>
                    </div>
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

export default ReaderCodeManagement;

