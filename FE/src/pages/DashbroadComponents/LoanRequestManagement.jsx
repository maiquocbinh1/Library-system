import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Table, Button, Tag, Card, Input, message, notification, Popconfirm,
    Space, List, Typography, Descriptions, Alert, Divider,
} from 'antd';
import {
    BarcodeOutlined, CheckCircleOutlined, CloseCircleOutlined,
    EnterOutlined, ScanOutlined, SwapOutlined,
} from '@ant-design/icons';
import {
    requestGetAllHistoryBook,
    requestUpdateStatusBook,
    requestNotifyPickup,
    requestReturnByBarcode,
} from '../../config/request';
import dayjs from 'dayjs';
import { isBorrowingActive, isPendingApproval, isReadyForPickup, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Search } = Input;
const { Text } = Typography;

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusTagConfig(status) {
    const k = normalizeLoanStatusKey(status);
    const map = {
        PENDING_APPROVAL: { color: 'orange', text: 'Chờ xác nhận yêu cầu' },
        READY_FOR_PICKUP: { color: 'cyan', text: 'Chờ đến quầy lấy sách' },
        BORROWING: { color: 'green', text: 'Đang mượn' },
        OVERDUE: { color: 'red', text: 'Quá hạn' },
        RETURNED: { color: 'default', text: 'Đã trả' },
        CANCELLED: { color: 'volcano', text: 'Đã hủy' },
    };
    return map[k] || { color: 'default', text: String(status || '—') };
}

function formatDate(v) {
    if (!v || !dayjs(v).isValid()) return '—';
    return dayjs(v).format('DD/MM/YYYY');
}

function uniqueTitlesFromCopies(bookCopies, product) {
    if (Array.isArray(bookCopies) && bookCopies.length > 0) {
        const titles = [...new Set(bookCopies.map((c) => String(c.title || '').trim()).filter(Boolean))];
        if (titles.length) return titles.join(' · ');
    }
    return product?.title || product?.nameProduct || '—';
}

// ─── BarcodeTag — hiển thị kết quả từng barcode ──────────────────────────────

function BarcodeResultTag({ result }) {
    if (!result) return null;
    return (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {result.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            <span className="font-mono font-semibold">{result.barcode}</span>
            <span className="text-xs">{result.message}</span>
            {result.fine?.fineAmount > 0 && (
                <Tag color="red" className="ml-auto">Phạt: {Number(result.fine.fineAmount).toLocaleString('vi-VN')}đ</Tag>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LoanRequestManagement = ({ presetFilter, pageTitle }) => {
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');

    const [notifyPickupLoading, setNotifyPickupLoading] = useState(false);

    // ── Return-by-barcode state (tab trả sách) ────────────────────────────────
    const [returnInput, setReturnInput] = useState('');
    const [returnResults, setReturnResults] = useState([]);
    const [returnLoading, setReturnLoading] = useState(false);

    const returnInputRef = useRef(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await requestGetAllHistoryBook();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setRows(list.map((item) => ({
                ...item,
                id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
            })));
        } catch {
            message.error('Không thể tải danh sách phiếu mượn');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    /** Bước 1: gán bản RESERVED + thông báo SV đến quầy (chưa xuất kho). */
    const handleNotifyPickupRequest = async () => {
        if (!selected) { message.error('Chưa chọn phiếu'); return; }
        if (!isPendingApproval(selected.status)) {
            message.warning('Chỉ dùng cho phiếu đang chờ xác nhận yêu cầu.');
            return;
        }
        try {
            setNotifyPickupLoading(true);
            const res = await requestNotifyPickup({ loanTicketId: selected.id });
            notification.success({
                message: 'Đã xử lý yêu cầu',
                description: res?.message || 'Đã gán bản sao và gửi thông báo cho sinh viên.',
                placement: 'topRight',
                duration: 6,
            });
            setSelected(null);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Không thể gán sách / gửi thông báo');
        } finally {
            setNotifyPickupLoading(false);
        }
    };

    const handleRejectBorrow = async () => {
        if (!selected) return;
        try {
            setLoading(true);
            await requestUpdateStatusBook({ idHistory: selected.id, status: 'cancel', userId: selected.userId });
            message.success('Đã từ chối phiếu mượn');
            setSelected(null);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Không thể từ chối');
        } finally {
            setLoading(false);
        }
    };

    // ── Return by barcode ─────────────────────────────────────────────────────

    const handleReturnByBarcode = async () => {
        const bc = returnInput.trim().toUpperCase();
        if (!bc) { message.warning('Vui lòng nhập mã sách'); return; }

        setReturnLoading(true);
        try {
            const res = await requestReturnByBarcode({ barcodes: [bc] });
            const results = Array.isArray(res?.metadata) ? res.metadata : [];
            setReturnResults((prev) => [...results.reverse(), ...prev].slice(0, 20));
            setReturnInput('');
            setTimeout(() => returnInputRef.current?.focus(), 0);
            // Reload list để cập nhật trạng thái
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Lỗi xử lý trả sách');
        } finally {
            setReturnLoading(false);
        }
    };

    const handleReturnKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleReturnByBarcode(); }
    };

    /** Trả toàn bộ cuốn trên phiếu — dùng API mới return-by-barcode (POST /return-books đã 410). */
    const handleReturnBooks = async (record) => {
        const copies = Array.isArray(record?.bookCopies) ? record.bookCopies : [];
        const barcodes = [...new Set(copies.map((c) => String(c.barcode || '').trim()).filter(Boolean))];
        if (!barcodes.length) {
            message.warning('Phiếu không có mã bản sao để trả');
            return;
        }
        try {
            setLoading(true);
            const res = await requestReturnByBarcode({ barcodes });
            const results = Array.isArray(res?.metadata) ? res.metadata : [];
            const ok = results.filter((r) => r.success);
            const fail = results.filter((r) => !r.success);
            if (!results.length) {
                message.error('Không nhận được kết quả trả sách từ máy chủ');
                return;
            }
            if (fail.length === 0) {
                const fines = ok.filter((r) => Number(r?.fineAmount ?? r?.fine?.fineAmount ?? 0) > 0);
                if (fines.length) {
                    notification.warning({
                        message: 'Trả sách hoàn tất',
                        description: `${ok.length} cuốn đã nhận trả; có ${fines.length} cuốn phát sinh phạt quá hạn (xem chi tiết trong Quản lý phạt).`,
                        duration: 10,
                        placement: 'topRight',
                    });
                } else {
                    notification.success({
                        message: 'Trả sách thành công',
                        description: `Đã nhận trả ${ok.length} cuốn về thư viện.`,
                        placement: 'topRight',
                    });
                }
                setSelected(null);
            } else if (ok.length) {
                notification.warning({
                    message: 'Trả sách một phần',
                    description: `${ok.length} cuốn thành công, ${fail.length} cuốn lỗi. ${fail[0]?.message || ''}`.trim(),
                    duration: 12,
                    placement: 'topRight',
                });
            } else {
                message.error(fail[0]?.message || 'Không thể nhận trả sách');
            }
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Không thể xác nhận trả sách');
        } finally {
            setLoading(false);
        }
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const dataByPreset = useMemo(() => {
        if (presetFilter === 'approval') {
            return rows.filter((item) => isPendingApproval(item.status) || isReadyForPickup(item.status));
        }
        if (presetFilter === 'returns') return rows.filter((item) => isBorrowingActive(item.status));
        return rows;
    }, [rows, presetFilter]);

    const filteredData = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return dataByPreset;
        return dataByPreset.filter((item) => {
            const id = String(item?.id || '').toLowerCase();
            const borrower = String(item?.fullName || '').toLowerCase();
            const msv = String(item?.borrowerStudentId || '').toLowerCase();
            const title = uniqueTitlesFromCopies(item.bookCopies, item.product).toLowerCase();
            const barcodes = (item.bookCopies || []).map((c) => String(c.barcode || '').toLowerCase()).join(' ');
            return id.includes(q) || borrower.includes(q) || msv.includes(q) || title.includes(q) || barcodes.includes(q);
        });
    }, [dataByPreset, searchText]);

    const isApprovalTab = presetFilter === 'approval';
    const isReturnsTab = presetFilter === 'returns';
    const heading = pageTitle || 'Quản lý phiếu mượn';

    const columns = [
        {
            title: 'Mã phiếu', dataIndex: 'id', key: 'id', width: 120, ellipsis: true,
            render: (text) => <span className="font-mono text-xs">{String(text || '').slice(0, 12)}</span>,
        },
        {
            title: 'Người mượn', key: 'borrower', width: 190,
            render: (_, record) => (
                <div>
                    <div className="font-medium text-slate-900">{record.fullName || '—'}</div>
                    <Text type="secondary" className="text-xs">
                        {record.borrowerStudentId ? `MSV: ${record.borrowerStudentId}` : `ID: ${String(record.userId || '').slice(0, 8)}…`}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Đầu sách', key: 'titles', ellipsis: true,
            render: (_, record) => {
                const title = uniqueTitlesFromCopies(record.bookCopies, record.product);
                return (
                    <div>
                        <span className="text-sm text-slate-800">{title}</span>
                        <div className="text-xs text-slate-400">SL: {record.quantity || record.requestedQuantity || 0} cuốn</div>
                    </div>
                );
            },
        },
        {
            title: 'Ngày gửi', dataIndex: 'borrowDate', key: 'borrowDate', width: 110,
            render: (text) => formatDate(text),
        },
        {
            title: 'Hạn trả', key: 'dueDate', width: 110,
            render: (_, record) => {
                const raw = record?.dueDate ?? record?.returnDate;
                return formatDate(raw);
            },
        },
        {
            title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130,
            render: (status) => { const { color, text } = statusTagConfig(status); return <Tag color={color}>{text}</Tag>; },
        },
        {
            title: 'Thao tác', key: 'action', width: 130, fixed: 'right',
            render: (_, record) => (
                <Space size="small" wrap onClick={(e) => e.stopPropagation()}>
                    {(isPendingApproval(record.status) || isReadyForPickup(record.status)) && (
                        <Button type="primary" size="small" onClick={() => setSelected(record)}>
                            {isPendingApproval(record.status) ? 'Xử lý yêu cầu' : 'Chi tiết'}
                        </Button>
                    )}
                    {isBorrowingActive(record.status) && (
                        <Button size="small" type="primary" ghost className="border-emerald-600 text-emerald-700" onClick={() => setSelected(record)}>
                            Trả sách
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    const reqQty = selected?.requestedQuantity || selected?.quantity || 0;

    return (
        <div className="flex flex-col gap-4">

            {/* ── PANEL TRÊN: Xử lý phiếu / Trả bằng barcode ────────────── */}
            <Card className="rounded-xl border-slate-200 shadow-sm" styles={{ body: { padding: 16 } }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="!mb-0 text-xl font-bold text-slate-900">{heading}</h2>
                    <Search
                        allowClear
                        placeholder="Mã phiếu, tên, MSV, tên sách..."
                        className="max-w-md"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>

                {/* ── Tab TRẢ SÁCH: barcode input ở đầu ────────────────────── */}
                {isReturnsTab && (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <ScanOutlined className="text-lg text-emerald-600" />
                            <span className="font-semibold text-slate-700">Nhận trả sách — gõ mã vạch</span>
                            <Text type="secondary" className="text-xs">(nhìn bìa sách gõ mã rồi Enter)</Text>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                ref={returnInputRef}
                                value={returnInput}
                                onChange={(e) => setReturnInput(e.target.value.toUpperCase())}
                                onKeyDown={handleReturnKeyDown}
                                placeholder="VD: DNT-01"
                                className="max-w-xs rounded-xl font-mono text-base"
                                prefix={<BarcodeOutlined className="text-slate-400" />}
                                suffix={<EnterOutlined className="text-slate-300" />}
                                autoFocus={isReturnsTab}
                            />
                            <Button
                                type="primary"
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                                loading={returnLoading}
                                onClick={handleReturnByBarcode}
                                icon={<SwapOutlined />}
                            >
                                Nhận trả
                            </Button>
                        </div>

                        {/* Kết quả trả sách */}
                        {returnResults.length > 0 && (
                            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                                {returnResults.map((r, i) => <BarcodeResultTag key={i} result={r} />)}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Chi tiết phiếu đã chọn ───────────────────────────────── */}
                {selected ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="font-semibold text-slate-800">
                                Chi tiết phiếu — <Tag color={statusTagConfig(selected.status).color}>{statusTagConfig(selected.status).text}</Tag>
                            </span>
                            <Button size="small" onClick={() => setSelected(null)}>Bỏ chọn</Button>
                        </div>

                        <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} className="mb-4">
                            <Descriptions.Item label="Mã phiếu">{selected.id}</Descriptions.Item>
                            <Descriptions.Item label="Người mượn">
                                {selected.fullName || '—'}
                                {selected.borrowerStudentId && <Text type="secondary" className="ml-2">(MSV: {selected.borrowerStudentId})</Text>}
                            </Descriptions.Item>
                            <Descriptions.Item label="Ngày gửi phiếu">{formatDate(selected.borrowDate)}</Descriptions.Item>
                            <Descriptions.Item label="Hạn trả">{formatDate(selected.dueDate ?? selected.returnDate)}</Descriptions.Item>
                            <Descriptions.Item label="Đầu sách" span={2}>
                                <b>{uniqueTitlesFromCopies(selected.bookCopies, selected.product)}</b>
                                {reqQty > 0 && <Tag className="ml-2" color="blue">{reqQty} cuốn</Tag>}
                            </Descriptions.Item>
                        </Descriptions>

                        {(isPendingApproval(selected.status) || isReadyForPickup(selected.status)) && (
                            <div>
                                {isPendingApproval(selected.status) && (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            className="mb-3"
                                            message="Xác nhận yêu cầu mượn (chưa xuất kho)"
                                            description={
                                                <>
                                                    Bấm nút bên dưới để hệ thống <strong>gán đúng số bản sao</strong> theo yêu cầu và{' '}
                                                    <strong>gửi thông báo</strong> cho sinh viên đến thư viện lấy sách. Chưa tính là đã mượn —
                                                    bước xuất kho thực hiện tại quầy <strong>Mượn — trả sách</strong>.
                                                </>
                                            }
                                        />
                                        <Space wrap className="mt-2">
                                            <Popconfirm
                                                title={`Gán ${reqQty} bản sao và gửi thông báo cho ${selected.fullName}?`}
                                                okText="Đồng ý"
                                                cancelText="Hủy"
                                                onConfirm={handleNotifyPickupRequest}
                                            >
                                                <Button type="primary" loading={notifyPickupLoading} className="rounded-xl">
                                                    Gửi thông báo &amp; gán bản sách
                                                </Button>
                                            </Popconfirm>
                                            <Popconfirm
                                                title="Từ chối yêu cầu mượn này?"
                                                okText="Từ chối"
                                                cancelText="Hủy"
                                                okButtonProps={{ danger: true }}
                                                onConfirm={handleRejectBorrow}
                                            >
                                                <Button danger loading={loading} className="rounded-xl">
                                                    Từ chối yêu cầu
                                                </Button>
                                            </Popconfirm>
                                        </Space>
                                    </>
                                )}
                                {isReadyForPickup(selected.status) && (
                                    <>
                                        <List
                                            size="small"
                                            bordered
                                            className="mb-3 rounded-xl"
                                            dataSource={(selected.bookCopies || []).filter((c) => c.barcode)}
                                            locale={{ emptyText: '—' }}
                                            renderItem={(item) => (
                                                <List.Item>
                                                    <Tag color="cyan" className="font-mono">{item.barcode}</Tag>
                                                    <Text type="secondary" className="text-xs">{item.status}</Text>
                                                </List.Item>
                                            )}
                                        />
                                        <Space wrap className="mt-2">
                                            <Popconfirm
                                                title="Hủy phiếu và trả các bản đang giữ chỗ về kho?"
                                                okText="Hủy phiếu"
                                                cancelText="Không"
                                                okButtonProps={{ danger: true }}
                                                onConfirm={handleRejectBorrow}
                                            >
                                                <Button danger loading={loading} className="rounded-xl">
                                                    Hủy phiếu / trả chỗ
                                                </Button>
                                            </Popconfirm>
                                        </Space>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Trả sách (BORROWING/OVERDUE): dùng barcode panel ở trên ── */}
                        {isBorrowingActive(selected.status) && (
                            <div>
                                <Divider className="my-3" />
                                <Text strong className="mb-2 block">Danh sách bản sao đang mượn:</Text>
                                <List
                                    size="small"
                                    bordered
                                    className="mb-3 rounded-xl"
                                    dataSource={selected.bookCopies || []}
                                    locale={{ emptyText: 'Không có bản sao' }}
                                    renderItem={(item) => (
                                        <List.Item>
                                            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium">{item.title || '—'}</span>
                                                <Tag color="processing" className="font-mono">{item.barcode || '—'}</Tag>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Để trả sách: gõ mã vạch từng cuốn vào ô 'Nhận trả sách' ở trên và nhấn Enter."
                                    action={
                                        <Popconfirm
                                            title="Trả toàn bộ phiếu (không cần barcode)?"
                                            okText="Trả hết"
                                            cancelText="Hủy"
                                            onConfirm={() => handleReturnBooks(selected)}
                                        >
                                            <Button size="small" danger>Trả hết phiếu</Button>
                                        </Popconfirm>
                                    }
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    !isReturnsTab && (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-500">
                            {isApprovalTab
                                ? 'Chọn phiếu «chờ xác nhận yêu cầu» hoặc «chờ đến quầy» để xử lý.'
                                : 'Chọn một phiếu đang mượn để xem chi tiết.'}
                        </div>
                    )
                )}
            </Card>

            {/* ── BẢNG DANH SÁCH PHIẾU ──────────────────────────────────────── */}
            <Card className="rounded-xl shadow-sm" styles={{ body: { padding: 12 } }}>
                <Table
                    rowKey={(record) => record.id || record.userId}
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    scroll={{ x: 950, y: 400 }}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    size="middle"
                    onRow={(record) => ({
                        onClick: () => setSelected(record),
                        style: { cursor: 'pointer' },
                    })}
                    rowClassName={(record) => String(record?.id) === String(selected?.id) ? 'bg-[#e6f7ff]' : ''}
                />
            </Card>
        </div>
    );
};

export default LoanRequestManagement;
