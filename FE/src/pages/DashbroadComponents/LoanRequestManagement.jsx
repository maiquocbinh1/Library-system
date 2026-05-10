import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Table, Button, Tag, Card, Input, message, notification, Popconfirm,
    Space, List, Typography, Descriptions, Alert, Badge, Spin, Divider,
} from 'antd';
import {
    BarcodeOutlined, CheckCircleOutlined, CloseCircleOutlined,
    EnterOutlined, ScanOutlined, SwapOutlined,
} from '@ant-design/icons';
import {
    requestGetAllHistoryBook,
    requestReturnBooks,
    requestUpdateStatusBook,
    requestConfirmBorrow,
    requestReturnByBarcode,
    requestCheckBarcode,
} from '../../config/request';
import dayjs from 'dayjs';
import { isBorrowingActive, isPendingApproval, normalizeLoanStatusKey } from '../../utils/loanTicketStatus';

const { Search } = Input;
const { Text } = Typography;

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusTagConfig(status) {
    const k = normalizeLoanStatusKey(status);
    const map = {
        PENDING_APPROVAL: { color: 'orange', text: 'Chờ duyệt' },
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

// ─── BarcodeChecker — gõ một barcode để xem thông tin ───────────────────────

function BarcodeInfoPreview({ barcode }) {
    const [info, setInfo] = useState(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!barcode) { setInfo(null); return; }
        setChecking(true);
        requestCheckBarcode(barcode)
            .then((res) => setInfo(res?.metadata || null))
            .catch(() => setInfo({ error: true }))
            .finally(() => setChecking(false));
    }, [barcode]);

    if (!barcode) return null;
    return (
        <Spin spinning={checking} size="small">
            {info?.error ? (
                <Alert type="error" showIcon message={`"${barcode}" không tồn tại trong hệ thống`} />
            ) : info ? (
                <Alert
                    type={info.status === 'AVAILABLE' ? 'success' : info.status === 'BORROWED' ? 'warning' : 'info'}
                    showIcon
                    message={<span className="font-semibold">{info.title}</span>}
                    description={
                        <span>
                            Mã: <b className="font-mono">{info.bookCode}</b> &nbsp;|&nbsp;
                            Trạng thái: <Tag>{info.status}</Tag>
                        </span>
                    }
                />
            ) : null}
        </Spin>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LoanRequestManagement = ({ presetFilter, pageTitle }) => {
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');

    // ── Confirm-borrow state (tab phê duyệt) ──────────────────────────────────
    const [barcodeInput, setBarcodeInput] = useState('');
    const [barcodeList, setBarcodeList] = useState([]);
    const [previewBarcode, setPreviewBarcode] = useState('');
    const [confirmLoading, setConfirmLoading] = useState(false);

    // ── Return-by-barcode state (tab trả sách) ────────────────────────────────
    const [returnInput, setReturnInput] = useState('');
    const [returnResults, setReturnResults] = useState([]);
    const [returnLoading, setReturnLoading] = useState(false);

    const barcodeInputRef = useRef(null);
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

    // Reset khi đổi phiếu được chọn
    useEffect(() => {
        setBarcodeList([]);
        setBarcodeInput('');
        setPreviewBarcode('');
    }, [selected]);

    // ── Barcode input cho confirm-borrow ──────────────────────────────────────

    const handleAddBarcode = () => {
        const bc = barcodeInput.trim().toUpperCase();
        if (!bc) return;
        if (barcodeList.includes(bc)) { message.warning(`Mã "${bc}" đã được thêm`); setBarcodeInput(''); return; }
        setBarcodeList((prev) => [...prev, bc]);
        setBarcodeInput('');
        setPreviewBarcode('');
        setTimeout(() => barcodeInputRef.current?.focus(), 0);
    };

    const handleBarcodeKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleAddBarcode(); }
    };

    const handleRemoveBarcode = (bc) => {
        setBarcodeList((prev) => prev.filter((b) => b !== bc));
    };

    // ── Confirm borrow ────────────────────────────────────────────────────────

    const handleConfirmBorrow = async () => {
        if (!selected) { message.error('Chưa chọn phiếu mượn'); return; }
        if (!barcodeList.length) { message.error('Chưa nhập mã sách nào'); return; }
        const reqQty = selected.requestedQuantity || selected.quantity || 0;
        if (barcodeList.length !== reqQty) {
            message.error(`Cần đúng ${reqQty} mã sách, hiện có ${barcodeList.length}`);
            return;
        }
        try {
            setConfirmLoading(true);
            const res = await requestConfirmBorrow({ loanTicketId: selected.id, barcodes: barcodeList });
            notification.success({
                message: 'Xuất kho thành công',
                description: res?.message || 'Đã xác nhận cho mượn sách.',
                placement: 'topRight',
                duration: 6,
            });
            setBarcodeList([]);
            setSelected(null);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Không thể xác nhận xuất kho');
        } finally {
            setConfirmLoading(false);
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

    // ── Old return by ticket ID (giữ lại cho compat) ──────────────────────────
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
                    duration: 10, placement: 'topRight',
                });
            } else {
                notification.success({ message: 'Trả sách thành công', description: 'Đã xác nhận nhận sách về thư viện.', placement: 'topRight' });
            }
            setSelected(null);
            fetchData();
        } catch (err) {
            message.error(err?.response?.data?.message || 'Không thể xác nhận trả sách');
        } finally {
            setLoading(false);
        }
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const dataByPreset = useMemo(() => {
        if (presetFilter === 'approval') return rows.filter((item) => isPendingApproval(item.status));
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
                    {isPendingApproval(record.status) && (
                        <Button type="primary" size="small" onClick={() => setSelected(record)}>
                            Xuất kho
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
            <Card className="rounded-xl border-slate-200 shadow-sm" bodyStyle={{ padding: 16 }}>
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

                        {/* ── Phê duyệt + nhập barcode ─────────────────────── */}
                        {isPendingApproval(selected.status) && (
                            <div>
                                <Divider className="my-3" />
                                <div className="mb-2 flex items-center gap-2">
                                    <BarcodeOutlined className="text-indigo-600" />
                                    <span className="font-semibold text-slate-700">Nhập mã sách đang cầm trên tay</span>
                                    <Badge count={`${barcodeList.length}/${reqQty}`} color={barcodeList.length === reqQty ? 'green' : 'orange'} />
                                </div>
                                <p className="mb-2 text-xs text-slate-400">Nhìn mã dán trên bìa sách → gõ → Enter. Cần đúng {reqQty} cuốn.</p>

                                <div className="mb-3 flex items-center gap-2">
                                    <Input
                                        ref={barcodeInputRef}
                                        value={barcodeInput}
                                        onChange={(e) => {
                                            const v = e.target.value.toUpperCase();
                                            setBarcodeInput(v);
                                            setPreviewBarcode(v);
                                        }}
                                        onKeyDown={handleBarcodeKeyDown}
                                        placeholder="VD: DNT-01"
                                        className="max-w-xs rounded-xl font-mono"
                                        prefix={<BarcodeOutlined className="text-slate-400" />}
                                        suffix={<EnterOutlined className="text-slate-300" />}
                                        autoFocus
                                    />
                                    <Button onClick={handleAddBarcode} className="rounded-xl">Thêm</Button>
                                </div>

                                {/* Preview thông tin barcode vừa gõ */}
                                {previewBarcode && (
                                    <div className="mb-2">
                                        <BarcodeInfoPreview barcode={previewBarcode} onClear={() => setPreviewBarcode('')} />
                                    </div>
                                )}

                                {/* Danh sách barcode đã thêm */}
                                {barcodeList.length > 0 && (
                                    <List
                                        size="small"
                                        bordered
                                        className="mb-3 rounded-xl"
                                        dataSource={barcodeList}
                                        locale={{ emptyText: 'Chưa có mã sách nào' }}
                                        renderItem={(bc) => (
                                            <List.Item
                                                actions={[
                                                    <Button
                                                        type="link"
                                                        danger
                                                        size="small"
                                                        onClick={() => handleRemoveBarcode(bc)}
                                                    >
                                                        Xóa
                                                    </Button>,
                                                ]}
                                            >
                                                <Tag color="processing" className="font-mono">{bc}</Tag>
                                            </List.Item>
                                        )}
                                    />
                                )}

                                <Space wrap>
                                    <Popconfirm
                                        title={`Xác nhận xuất ${barcodeList.length} cuốn cho ${selected.fullName}?`}
                                        okText="Xuất kho"
                                        cancelText="Hủy"
                                        onConfirm={handleConfirmBorrow}
                                        disabled={barcodeList.length !== reqQty}
                                    >
                                        <Button
                                            type="primary"
                                            loading={confirmLoading}
                                            disabled={barcodeList.length !== reqQty}
                                            className="rounded-xl"
                                        >
                                            Xác nhận xuất kho ({barcodeList.length}/{reqQty})
                                        </Button>
                                    </Popconfirm>
                                    <Popconfirm
                                        title="Từ chối phiếu mượn này?"
                                        okText="Từ chối"
                                        cancelText="Hủy"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={handleRejectBorrow}
                                    >
                                        <Button danger loading={loading} className="rounded-xl">Từ chối</Button>
                                    </Popconfirm>
                                </Space>
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
                                ? 'Chọn một phiếu chờ duyệt để nhập mã sách và xuất kho.'
                                : 'Chọn một phiếu đang mượn để xem chi tiết.'}
                        </div>
                    )
                )}
            </Card>

            {/* ── BẢNG DANH SÁCH PHIẾU ──────────────────────────────────────── */}
            <Card className="rounded-xl shadow-sm" bodyStyle={{ padding: 12 }}>
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
