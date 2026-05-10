import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, message, Select, DatePicker, Radio, Card } from 'antd';
import dayjs from 'dayjs';
import { requestAdminCreateReader, requestIssueReaderCard } from '../../config/request';

const CardIssuanceManagement = () => {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        const issuedAt = dayjs();
        form.setFieldsValue({
            fullName: '',
            email: '',
            phone: '',
            address: '',
            studentId: '',
            planMonths: 3,
            birthDate: null,
            className: '',
            gender: 'male',
            systemType: 'civil',
            issuedAt,
            expiresAt: issuedAt.add(3, 'month'),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleResetForm = () => {
        const issuedAt = dayjs();
        form.setFieldsValue({
            fullName: '',
            email: '',
            phone: '',
            address: '',
            studentId: '',
            planMonths: 3,
            birthDate: null,
            className: '',
            gender: 'male',
            systemType: 'civil',
            issuedAt,
            expiresAt: issuedAt.add(3, 'month'),
        });
    };

    const handleSubmitForm = () => form.submit();

    const onCardFormFinish = async (values) => {
        setLoading(true);
        try {
            const studentId = String(values.studentId || '').trim();

            const created = await requestAdminCreateReader({
                fullName: String(values.fullName || '').trim(),
                email: String(values.email || '').trim(),
                phone: String(values.phone || '').trim(),
                address: String(values.address || '').trim(),
                readerType: 'SinhVien_ChinhQuy',
                studentId,
            });
            const targetUserId = created?.metadata?.id || created?.metadata?.user?.id || created?.metadata?.user?._id;

            if (!targetUserId) {
                message.error('Không tạo được độc giả');
                return;
            }

            await requestIssueReaderCard({
                userId: targetUserId,
                readerCode: studentId,
                readerType: 'SinhVien_ChinhQuy',
                planMonths: values.planMonths,
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                className: values.className,
                gender: values.gender,
                roleType: 'student',
                systemType: values.systemType,
                issuedAt: values.issuedAt ? values.issuedAt.toISOString() : null,
            });
            message.success('Đã kích hoạt tài khoản độc giả');
            handleResetForm();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Kích hoạt thất bại');
        } finally {
            setLoading(false);
        }
    };

    const planOptions = useMemo(
        () => [
            { value: 3, label: '3 tháng' },
            { value: 6, label: '6 tháng' },
            { value: 12, label: '12 tháng (1 năm)' },
        ],
        [],
    );

    return (
        <div>
            <h2 className="text-2xl mb-4 font-bold">Kích hoạt tài khoản Độc giả</h2>
            <Card className="mb-4 rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <Form
                    form={form}
                    onFinish={onCardFormFinish}
                    layout="vertical"
                    initialValues={{
                        planMonths: 3,
                        gender: 'male',
                        systemType: 'civil',
                        issuedAt: dayjs(),
                        expiresAt: dayjs().add(3, 'month'),
                    }}
                    onValuesChange={(changed, all) => {
                        if (changed.planMonths || changed.issuedAt) {
                            const issuedAt = all.issuedAt || dayjs();
                            const months = Number(all.planMonths || 3);
                            form.setFieldsValue({
                                expiresAt: dayjs(issuedAt).add(months, 'month'),
                            });
                        }
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Form.Item label="Họ tên" name="fullName" rules={[{ required: true, message: 'Vui lòng nhập họ tên!' }]}>
                            <Input className="rounded-xl" placeholder="Nguyễn Văn A" />
                        </Form.Item>
                        <Form.Item
                            label="MSV (mã sinh viên)"
                            name="studentId"
                            rules={[{ required: true, message: 'Vui lòng nhập MSV!' }]}
                        >
                            <Input className="rounded-xl" placeholder="VD: B21DCCN001" />
                        </Form.Item>

                        <Form.Item label="Gmail" name="email" rules={[{ required: true, message: 'Vui lòng nhập email!' }, { type: 'email', message: 'Email không hợp lệ' }]}>
                            <Input className="rounded-xl" placeholder="abc@gmail.com" />
                        </Form.Item>
                        <Form.Item label="Ngày sinh" name="birthDate">
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" />
                        </Form.Item>

                        <Form.Item label="Điện thoại" name="phone" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại!' }]}>
                            <Input className="rounded-xl" placeholder="09xxxxxxxx" />
                        </Form.Item>
                        <Form.Item label="Lớp" name="className">
                            <Input className="rounded-xl" placeholder="Ví dụ: D20CQCN01-B" />
                        </Form.Item>

                        <Form.Item label="Địa chỉ" name="address">
                            <Input className="rounded-xl" placeholder="(tuỳ chọn)" />
                        </Form.Item>
                        <div />

                        <Form.Item label="Giới tính" name="gender">
                            <Radio.Group>
                                <Radio value="male">Nam</Radio>
                                <Radio value="female">Nữ</Radio>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item label="Hệ" name="systemType">
                            <Radio.Group>
                                <Radio value="civil">Dân sự</Radio>
                                <Radio value="military">Quốc tế</Radio>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item
                            label="Thời hạn kích hoạt (tháng)"
                            name="planMonths"
                            rules={[{ required: true, message: 'Vui lòng chọn thời hạn kích hoạt!' }]}
                        >
                            <Select className="rounded-xl" options={planOptions} />
                        </Form.Item>

                        <Form.Item label="Ngày bắt đầu hiệu lực" name="issuedAt" rules={[{ required: true, message: 'Vui lòng chọn ngày!' }]}>
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item label="Ngày hết hạn hiệu lực" name="expiresAt">
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" disabled />
                        </Form.Item>
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-2">
                        <Button onClick={handleResetForm} className="rounded-xl">
                            Làm lại
                        </Button>
                        <Button type="primary" onClick={handleSubmitForm} loading={loading} className="rounded-xl">
                            Xác nhận Kích hoạt
                        </Button>
                    </div>
                </Form>
            </Card>
        </div>
    );
};

export default CardIssuanceManagement;
