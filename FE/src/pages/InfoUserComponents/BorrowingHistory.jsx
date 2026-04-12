import React, { useEffect, useState } from 'react';
import { Card, Empty, List, Tag, Image, Typography, Space, Spin, Button } from 'antd';
import { requestCancelBook, requestGetHistoryUser } from '../../config/request';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';
import { isPendingApproval, loanStatusMeta, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Text, Title } = Typography;

function bookCoverUrl(item) {
    const raw = item?.product?.image;
    if (!raw) return '/placeholder-book.png';
    return `${import.meta.env.VITE_API_URL_IMAGE}/${raw}`;
}

const BorrowingHistory = () => {
    const [borrowedBooks, setBorrowedBooks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await requestGetHistoryUser();
                setBorrowedBooks(res.metadata);
            } catch (error) {
                toast.error(error.response.data.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spin size="large" />
            </div>
        );
    }

    const handleCancelBook = async (idHistory) => {
        try {
            await requestCancelBook({ idHistory });
            toast.success('Huỷ mượn sách thành công');
            const res = await requestGetHistoryUser();
            setBorrowedBooks(res.metadata || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không thể hủy mượn');
        }
    };

    return (
        <Card title="Lịch sử mượn sách" bordered={false}>
            {borrowedBooks.length > 0 ? (
                <List
                    itemLayout="vertical"
                    dataSource={borrowedBooks}
                    renderItem={(item) => {
                        const statusInfo = loanStatusMeta(item.status);
                        const due = item.returnDate && dayjs(item.returnDate).isValid() ? dayjs(item.returnDate) : null;
                        const borrowOk = item.borrowDate && dayjs(item.borrowDate).isValid();
                        const showCountdown =
                            normalizeLoanStatusKey(item.status) === 'BORROWING' && due;
                        return (
                            <List.Item key={item.id} className="!p-0 mb-4">
                                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-300">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <Image
                                            width={100}
                                            className="rounded object-cover self-center sm:self-start"
                                            src={bookCoverUrl(item)}
                                            alt={item.product?.nameProduct || ''}
                                            preview={false}
                                        />
                                        <div className="flex-grow">
                                            <Title level={5} className="mb-1">
                                                {item.product?.nameProduct || '—'}
                                            </Title>
                                            <Space direction="vertical" size="small" className="w-full text-sm">
                                                <Text type="secondary">
                                                    Số cuốn: {Number(item.quantity) || (Array.isArray(item.bookCopyIds) ? item.bookCopyIds.length : 0)}
                                                </Text>
                                                <Text type="secondary">
                                                    Ngày gửi phiếu:{' '}
                                                    {borrowOk ? dayjs(item.borrowDate).format('DD/MM/YYYY') : '—'}
                                                </Text>
                                                <Text type="secondary">
                                                    Hạn trả: {due ? due.format('DD/MM/YYYY') : 'Sau khi thư viện duyệt'}
                                                </Text>
                                                {showCountdown && (
                                                    <p className="text-red-500">
                                                        Số ngày còn lại: {due.diff(dayjs(), 'day')} ngày
                                                    </p>
                                                )}
                                            </Space>
                                        </div>
                                        <div className="flex flex-col items-start sm:items-end justify-between mt-2 sm:mt-0">
                                            <Tag color={statusInfo.color} className="mb-2">
                                                {statusInfo.text}
                                            </Tag>
                                            <Text type="secondary" className="text-xs">
                                                Mã mượn: {String(item.id || '').substring(0, 8)}
                                            </Text>
                                            {isPendingApproval(item.status) && (
                                                <Button danger type="primary" onClick={() => handleCancelBook(item.id)}>
                                                    Huỷ mượn
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </List.Item>
                        );
                    }}
                />
            ) : (
                <Empty description="Bạn chưa mượn cuốn sách nào." />
            )}
        </Card>
    );
};

export default BorrowingHistory;
