import React from 'react';
import { Card, Empty, List, Image, Typography, Space, Spin, Button } from 'antd';
import { requestCancelBook } from '../../config/request';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';
import {
    isPendingApproval,
    isReadyForPickup,
    loanStatusMeta,
    normalizeLoanStatusKey,
} from '../../utils/loanTicketStatus';
import { PLACEHOLDER_BOOK_COVER, resolveBookCoverUrl } from '../../utils/resolveBookCoverUrl';

const { Text, Title } = Typography;

function bookCoverUrl(item) {
    const raw = item?.product?.image ?? item?.product?.coverImage ?? item?.image;
    return resolveBookCoverUrl(raw);
}

const BorrowingHistory = ({ loans = [], loading, onRefresh }) => {
    const handleCancelBook = async (idHistory) => {
        try {
            await requestCancelBook({ idHistory });
            toast.success('Huỷ mượn sách thành công');
            onRefresh?.();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Không thể hủy mượn');
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <Title level={3} className="!mb-1 !text-slate-900">
                    Lịch sử mượn sách
                </Title>
                <Text type="secondary">Tất cả phiếu mượn của bạn</Text>
            </div>
            {loans.length > 0 ? (
                <List
                    itemLayout="vertical"
                    dataSource={loans}
                    renderItem={(item) => {
                        const statusInfo = loanStatusMeta(item.status);
                        const due = item.returnDate && dayjs(item.returnDate).isValid() ? dayjs(item.returnDate) : null;
                        const borrowOk = item.borrowDate && dayjs(item.borrowDate).isValid();
                        const showCountdown =
                            normalizeLoanStatusKey(item.status) === 'BORROWING' && due;
                        return (
                            <List.Item key={item.id} className="!p-0 mb-4">
                                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                                    <div className="flex flex-col gap-4 sm:flex-row">
                                        <Image
                                            width={100}
                                            className="self-center rounded-lg object-cover sm:self-start"
                                            src={bookCoverUrl(item)}
                                            fallback={PLACEHOLDER_BOOK_COVER}
                                            alt={item.product?.nameProduct || ''}
                                            preview={false}
                                        />
                                        <div className="min-w-0 flex-grow">
                                            <Title level={5} className="mb-1 !text-slate-900">
                                                {item.product?.nameProduct || '—'}
                                            </Title>
                                            <Space direction="vertical" size="small" className="w-full text-sm">
                                                <Text type="secondary">
                                                    Số cuốn:{' '}
                                                    {Number(item.quantity) ||
                                                        (Array.isArray(item.bookCopyIds) ? item.bookCopyIds.length : 0)}
                                                </Text>
                                                <Text type="secondary">
                                                    Ngày gửi phiếu:{' '}
                                                    {borrowOk ? dayjs(item.borrowDate).format('DD/MM/YYYY') : '—'}
                                                </Text>
                                                <Text type="secondary">
                                                    Hạn trả:{' '}
                                                    {isPendingApproval(item.status)
                                                        ? 'Sau khi thư viện xác nhận yêu cầu'
                                                        : isReadyForPickup(item.status)
                                                          ? 'Sau khi lập phiếu tại quầy'
                                                          : due
                                                            ? due.format('DD/MM/YYYY')
                                                            : '—'}
                                                </Text>
                                                {showCountdown && (
                                                    <p className="text-rose-600">
                                                        Số ngày còn lại: {due.diff(dayjs(), 'day')} ngày
                                                    </p>
                                                )}
                                            </Space>
                                        </div>
                                        <div className="flex flex-col items-start justify-between gap-2 sm:items-end">
                                            <span
                                                className={`inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${
                                                    statusInfo.color === 'blue'
                                                        ? 'bg-sky-100 text-sky-800'
                                                        : statusInfo.color === 'green'
                                                          ? 'bg-emerald-100 text-emerald-800'
                                                          : statusInfo.color === 'red'
                                                            ? 'bg-rose-100 text-rose-800'
                                                            : statusInfo.color === 'gold'
                                                              ? 'bg-amber-100 text-amber-900'
                                                              : statusInfo.color === 'cyan'
                                                                ? 'bg-cyan-100 text-cyan-900'
                                                                : 'bg-slate-100 text-slate-700'
                                                }`}
                                            >
                                                {statusInfo.text}
                                            </span>
                                            <Text type="secondary" className="text-xs">
                                                Mã mượn: {String(item.id || '').substring(0, 8)}
                                            </Text>
                                            {(isPendingApproval(item.status) || isReadyForPickup(item.status)) && (
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
                <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/80">
                    <Empty description="Bạn chưa mượn cuốn sách nào." />
                </Card>
            )}
        </div>
    );
};

export default BorrowingHistory;
