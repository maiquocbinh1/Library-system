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
            readerType: 'SinhVien_ChinhQuy',
            studentId: '',
            staffId: '',
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
            readerType: 'SinhVien_ChinhQuy',
            studentId: '',
            staffId: '',
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
            const rt = values.readerType;
            const studentId = rt === 'GiangVien_CanBo' ? undefined : String(values.studentId || '').trim();
            const staffId = rt === 'GiangVien_CanBo' ? String(values.staffId || '').trim() : undefined;
            const patronCode = rt === 'GiangVien_CanBo' ? staffId : studentId;

            const created = await requestAdminCreateReader({
                fullName: String(values.fullName || '').trim(),
                email: String(values.email || '').trim(),
                phone: String(values.phone || '').trim(),
                address: String(values.address || '').trim(),
                readerType: rt,
                studentId,
                staffId,
            });
            const targetUserId = created?.metadata?.id || created?.metadata?.user?.id || created?.metadata?.user?._id;

            if (!targetUserId) {
                message.error('Không tạo được độc giả');
                return;
            }

            await requestIssueReaderCard({
                userId: targetUserId,
                planMonths: values.planMonths,
                readerCode: patronCode,
                readerType: rt,
                birthDate: values.birthDate ? values.birthDate.toISOString() : null,
                className: values.className,
                gender: values.gender,
                roleType: rt === 'GiangVien_CanBo' ? 'lecturer' : 'student',
                systemType: values.systemType,
                issuedAt: values.issuedAt ? values.issuedAt.toISOString() : null,
            });
            message.success('Đã đăng ký thẻ độc giả');
            handleResetForm();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Đăng ký thẻ thất bại');
        } finally {
            setLoading(false);
        }
    };

    const planOptions = useMemo(
        () => [
            { value: 3, label: 'Gói 3 tháng' },
            { value: 6, label: 'Gói 6 tháng' },
            { value: 12, label: 'Gói 1 năm' },
        ],
        [],
    );

    return (
        <div>
            <h2 className="text-2xl mb-4 font-bold">Đăng ký làm thẻ (Cấp độc giả)</h2>
            <Card className="mb-4 rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <Form
                    form={form}
                    onFinish={onCardFormFinish}
                    layout="vertical"
                    initialValues={{
                        planMonths: 3,
                        readerType: 'SinhVien_ChinhQuy',
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
                            label="Loại bạn đọc"
                            name="readerType"
                            rules={[{ required: true, message: 'Vui lòng chọn loại bạn đọc!' }]}
                        >
                            <Select
                                className="rounded-xl"
                                options={[
                                    { value: 'SinhVien_ChinhQuy', label: 'Sinh viên chính quy' },
                                    { value: 'HocVien_NCS', label: 'Học viên / NCS' },
                                    { value: 'GiangVien_CanBo', label: 'Giảng viên / Cán bộ' },
                                ]}
                            />
                        </Form.Item>

                        <Form.Item
                            noStyle
                            shouldUpdate={(prev, cur) => prev.readerType !== cur.readerType}
                        >
                            {({ getFieldValue }) => {
                                const rt = getFieldValue('readerType');
                                if (rt === 'GiangVien_CanBo') {
                                    return (
                                        <Form.Item
                                            label="MSG (mã giảng viên/cán bộ)"
                                            name="staffId"
                                            rules={[{ required: true, message: 'Vui lòng nhập MSG!' }]}
                                        >
                                            <Input className="rounded-xl" placeholder="MSG" />
                                        </Form.Item>
                                    );
                                }
                                return (
                                    <Form.Item
                                        label="MSV (mã sinh viên)"
                                        name="studentId"
                                        rules={[{ required: true, message: 'Vui lòng nhập MSV!' }]}
                                    >
                                        <Input className="rounded-xl" placeholder="MSV" />
                                    </Form.Item>
                                );
                            }}
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
                        <Form.Item label="Loại thẻ / Thời hạn" name="planMonths" rules={[{ required: true, message: 'Vui lòng chọn gói thẻ!' }]}>
                            <Select className="rounded-xl" options={planOptions} />
                        </Form.Item>

                        <Form.Item label="Ngày làm thẻ" name="issuedAt" rules={[{ required: true, message: 'Vui lòng chọn ngày làm thẻ!' }]}>
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item label="Ngày hết hạn thẻ" name="expiresAt">
                            <DatePicker className="w-full rounded-xl" format="DD/MM/YYYY" disabled />
                        </Form.Item>
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-2">
                        <Button onClick={handleResetForm} className="rounded-xl">
                            Làm lại
                        </Button>
                        <Button type="primary" onClick={handleSubmitForm} loading={loading} className="rounded-xl">
                            Đăng ký
                        </Button>
                    </div>
                </Form>
            </Card>
        </div>
    );
};

export default CardIssuanceManagement;
