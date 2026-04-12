import React, { useEffect, useMemo, useState } from 'react';
import {
    Table,
    Button,
    Tag,
    Card,
    Input,
    message,
    notification,
    Popconfirm,
    Space,
    List,
    Typography,
    Descriptions,
} from 'antd';
import { requestGetAllHistoryBook, requestReturnBooks, requestUpdateStatusBook } from '../../config/request';
import dayjs from 'dayjs';
import { isBorrowingActive, isPendingApproval, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Search } = Input;
const { Text } = Typography;

/** Màu Tag theo enum phiếu mượn (Admin) */
function statusTagConfig(status) {
    const k = normalizeLoanStatusKey(status);
    const map = {
        PENDING_APPROVAL: { color: 'orange', text: 'Chờ duyệt' },
        BORROWING: { color: 'green', text: 'Đang mượn' },
        OVERDUE: { color: 'red', text: 'Quá hạn' },
        RETURNED: { color: 'default', text: 'Đã trả' },
        CANCELLED: { color: 'volcano', text: 'Đã hủy' },
    };
    return map[k] || { color: 'default', text: status ? String(status) : '—' };
}

function formatDueDate(record) {
    const raw = record?.dueDate ?? record?.returnDate;
    if (!raw || !dayjs(raw).isValid()) return '—';
    return dayjs(raw).format('DD/MM/YYYY');
}

function uniqueTitlesFromCopies(bookCopies) {
    if (!Array.isArray(bookCopies) || !bookCopies.length) return '—';
    const titles = [...new Set(bookCopies.map((c) => String(c.title || '').trim()).filter(Boolean))];
    return titles.length ? titles.join(' · ') : '—';
}

function firstCoverImage(record) {
    const copies = record?.bookCopies;
    if (!Array.isArray(copies) || !copies.length) return null;
    const img = copies.find((c) => c?.image)?.image;
    return img || null;
}

const LoanRequestManagement = ({ presetFilter, pageTitle }) => {
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await requestGetAllHistoryBook();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list.map((item) => ({
                ...item,
                id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
            }));
            setRows(normalized);
        } catch {
            message.error('Không thể tải danh sách phiếu mượn');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const productIdForApi = (record) => {
        const fromCopy = record?.bookCopies?.[0]?.bookId;
        if (fromCopy) return fromCopy;
        return record?.product?.id || record?.product?._id || undefined;
    };

    const handleUpdateStatus = async (record, legacyStatus) => {
        const id = record.id;
        if (!id) return;
        try {
            setLoading(true);
            await requestUpdateStatusBook({
                idHistory: id,
                status: legacyStatus,
                productId: productIdForApi(record),
                userId: record.userId,
            });
            message.success('Cập nhật trạng thái thành công');
            setSelected(null);
            await fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái');
        } finally {
            setLoading(false);
        }
    };

    const handleReturnBooks = async (record) => {
        try {
            setLoading(true);
            const res = await requestReturnBooks({ loanTicketId: record.id });
            const meta = res?.metadata;
            const fineAmt = Number(meta?.fine?.fineAmount ?? 0);
            if (fineAmt > 0) {
                notification.warning({
                    message: 'Trả sách thành công',
                    description: `Sinh viên trễ hạn ${meta.overdueDays} ngày, phát sinh phiếu phạt ${fineAmt.toLocaleString('vi-VN')} VNĐ.`,
                    duration: 10,
                    placement: 'topRight',
                });
            } else {
                notification.success({
                    message: 'Trả sách thành công',
                    description: 'Đã xác nhận nhận sách về thư viện.',
                    placement: 'topRight',
                });
            }
            setSelected(null);
            await fetchData();
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể xác nhận trả sách');
        } finally {
            setLoading(false);
        }
    };

    const dataByPreset = useMemo(() => {
        if (presetFilter === 'approval') {
            return rows.filter((item) => isPendingApproval(item.status));
        }
        if (presetFilter === 'returns') {
            return rows.filter((item) => isBorrowingActive(item.status));
        }
        return rows;
    }, [rows, presetFilter]);

    const filteredData = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return dataByPreset;
        return dataByPreset.filter((item) => {
            const id = String(item?.id || '').toLowerCase();
            const borrower = String(item?.fullName || '').toLowerCase();
            const msv = String(item?.borrowerStudentId || '').toLowerCase();
            const titles = uniqueTitlesFromCopies(item.bookCopies).toLowerCase();
            const barcodes = (item.bookCopies || []).map((c) => String(c.barcode || '').toLowerCase()).join(' ');
            const status = String(item?.status || '').toLowerCase();
            return (
                id.includes(q) ||
                borrower.includes(q) ||
                msv.includes(q) ||
                titles.includes(q) ||
                barcodes.includes(q) ||
                status.includes(q)
            );
        });
    }, [dataByPreset, searchText]);

    const heading = pageTitle || 'Quản lý phiếu mượn';

    const columns = [
        {
            title: 'Mã phiếu',
            dataIndex: 'id',
            key: 'id',
            width: 120,
            ellipsis: true,
            render: (text) => <span className="font-mono text-xs">{String(text || '').slice(0, 12)}</span>,
        },
        {
            title: 'Người mượn',
            key: 'borrower',
            width: 200,
            render: (_, record) => (
                <div>
                    <div className="font-medium text-slate-900">{record.fullName || '—'}</div>
                    <Text type="secondary" className="text-xs">
                        {record.borrowerStudentId ? (
                            <>MSV/MSG: {record.borrowerStudentId}</>
                        ) : (
                            <>Mã TK: {String(record.userId || '').slice(0, 10)}…</>
                        )}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Đầu sách (theo bản sao)',
            key: 'titles',
            ellipsis: true,
            render: (_, record) => (
                <span className="text-sm text-slate-800" title={uniqueTitlesFromCopies(record.bookCopies)}>
                    {uniqueTitlesFromCopies(record.bookCopies)}
                </span>
            ),
        },
        {
            title: 'Ngày gửi phiếu',
            dataIndex: 'borrowDate',
            key: 'borrowDate',
            width: 120,
            render: (text) => (text && dayjs(text).isValid() ? dayjs(text).format('DD/MM/YYYY') : '—'),
        },
        {
            title: 'Hạn trả',
            key: 'dueDate',
            width: 110,
            render: (_, record) => formatDueDate(record),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (status) => {
                const { color, text } = statusTagConfig(status);
                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 280,
            fixed: 'right',
            render: (_, record) => (
                <Space wrap size="small" onClick={(e) => e.stopPropagation()}>
                    {isPendingApproval(record.status) && (
                        <>
                            <Button type="primary" size="small" onClick={() => handleUpdateStatus(record, 'success')}>
                                Duyệt
                            </Button>
                            <Button type="primary" danger size="small" onClick={() => handleUpdateStatus(record, 'cancel')}>
                                Từ chối
                            </Button>
                        </>
                    )}
                    {isBorrowingActive(record.status) && (
                        <Popconfirm
                            title="Xác nhận đã nhận đủ sách vật lý từ độc giả?"
                            okText="Trả sách"
                            cancelText="Đóng"
                            onConfirm={() => handleReturnBooks(record)}
                        >
                            <Button size="small" type="primary" ghost className="border-emerald-600 text-emerald-700">
                                Xác nhận Trả sách
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const detailCover = firstCoverImage(selected);
    const selectedStatusCfg = selected ? statusTagConfig(selected.status) : null;

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-xl border-slate-200 shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="!mb-0 text-xl font-bold text-slate-900">{heading}</h2>
                        {selected && <Tag color={selectedStatusCfg?.color}>{selectedStatusCfg?.text}</Tag>}
                    </div>
                    <Search
                        allowClear
                        placeholder="Mã phiếu, tên, MSV/MSG, tên sách, barcode..."
                        className="max-w-md"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>

                <div className="flex flex-col gap-4 lg:flex-row">
                    <div className="w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:w-52">
                        {detailCover ? (
                            <img
                                src={`${import.meta.env.VITE_API_URL_IMAGE}/${detailCover}`}
                                alt=""
                                className="h-48 w-full rounded-lg object-cover shadow-sm"
                                onError={(e) => {
                                    e.currentTarget.src = '/placeholder-book.png';
                                }}
                            />
                        ) : (
                            <div className="flex h-48 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-400">
                                Chọn một phiếu để xem ảnh bìa (cuốn đầu tiên)
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        {selected ? (
                            <>
                                <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} className="mb-4">
                                    <Descriptions.Item label="Mã phiếu">{selected.id}</Descriptions.Item>
                                    <Descriptions.Item label="Người mượn">
                                        {selected.fullName || '—'}
                                        {selected.borrowerStudentId ? (
                                            <Text type="secondary" className="ml-2">
                                                (MSV/MSG: {selected.borrowerStudentId})
                                            </Text>
                                        ) : null}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Ngày gửi phiếu">
                                        {selected.borrowDate && dayjs(selected.borrowDate).isValid()
                                            ? dayjs(selected.borrowDate).format('DD/MM/YYYY')
                                            : '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Hạn trả (dueDate)">{formatDueDate(selected)}</Descriptions.Item>
                                </Descriptions>

                                <Text strong className="mb-2 block">
                                    Bản sao cần lấy — mã vạch (Barcode)
                                </Text>
                                <List
                                    size="small"
                                    bordered
                                    className="rounded-lg bg-white"
                                    dataSource={selected.bookCopies || []}
                                    locale={{ emptyText: 'Không có dữ liệu bản sao' }}
                                    renderItem={(item) => (
                                        <List.Item className="!px-3 !py-2">
                                            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium text-slate-800">{item.title || '—'}</span>
                                                <Tag color="processing" className="m-0 font-mono">
                                                    {item.barcode}
                                                </Tag>
                                            </div>
                                        </List.Item>
                                    )}
                                />

                                <Space wrap className="mt-4">
                                    {isPendingApproval(selected.status) && (
                                        <>
                                            <Button type="primary" loading={loading} onClick={() => handleUpdateStatus(selected, 'success')}>
                                                Duyệt
                                            </Button>
                                            <Button danger loading={loading} onClick={() => handleUpdateStatus(selected, 'cancel')}>
                                                Từ chối
                                            </Button>
                                        </>
                                    )}
                                    {isBorrowingActive(selected.status) && (
                                        <Popconfirm
                                            title="Xác nhận đã nhận đủ sách vật lý từ độc giả?"
                                            okText="Trả sách"
                                            cancelText="Đóng"
                                            onConfirm={() => handleReturnBooks(selected)}
                                        >
                                            <Button loading={loading} type="primary" ghost className="border-emerald-600 text-emerald-700">
                                                Xác nhận Trả sách
                                            </Button>
                                        </Popconfirm>
                                    )}
                                    <Button onClick={() => setSelected(null)}>Bỏ chọn</Button>
                                </Space>
                            </>
                        ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-500">
                                Chọn một dòng trong bảng bên dưới để xem chi tiết phiếu và danh sách mã vạch cần nhặt sách.
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Card className="rounded-xl shadow-sm" bodyStyle={{ padding: 12 }}>
                <Table
                    rowKey={(record) => record.id || record.userId}
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    scroll={{ x: 1100, y: 420 }}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    size="middle"
                    onRow={(record) => ({
                        onClick: () => setSelected(record),
                    })}
                    rowClassName={(record) => (String(record?.id) === String(selected?.id) ? 'bg-[#e6f7ff]' : '')}
                />
            </Card>
        </div>
    );
};

export default LoanRequestManagement;
