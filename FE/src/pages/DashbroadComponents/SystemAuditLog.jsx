import React from 'react';
import { Alert, Card, Table, Tag, Typography } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

const mockRows = [];

/** Giữ chỗ: khi backend có collection audit, map vào đây. */
const SystemAuditLog = () => (
    <div className="flex flex-col gap-4">
        <Alert
            type="warning"
            showIcon
            icon={<FileSearchOutlined />}
            message="Nhật ký hệ thống (Audit)"
            description="Hiện chưa có API ghi nhật ký thao tác (thêm sách, thu phạt, sửa hồ sơ). Khung trang đã sẵn sàng để nối dữ liệu sau."
        />
        <Card className="rounded-2xl shadow-sm" title="Lịch sử thao tác" bodyStyle={{ padding: 16 }}>
            <Paragraph type="secondary" className="!mb-4 text-sm">
                Khi bật tính năng, bảng sẽ hiển thị: thời gian, nhân viên, hành động, đối tượng (sách / độc giả / phiếu phạt).
            </Paragraph>
            <Table
                rowKey="id"
                dataSource={mockRows}
                locale={{ emptyText: 'Chưa có bản ghi' }}
                columns={[
                    { title: 'Thời gian', dataIndex: 'at', key: 'at', width: 170 },
                    { title: 'Người thực hiện', dataIndex: 'actor', key: 'actor', width: 160 },
                    { title: 'Hành động', dataIndex: 'action', key: 'action', width: 140, render: (a) => <Tag>{a || '—'}</Tag> },
                    { title: 'Chi tiết', dataIndex: 'detail', key: 'detail', ellipsis: true },
                ]}
                pagination={false}
            />
        </Card>
    </div>
);

export default SystemAuditLog;
