import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    requestGetAllProduct,
    requestGetBookCopies,
    requestUpdateProduct,
} from '../../config/request';
import { compareByBookCodeAsc } from '../../utils/bookCodeSort';

const { Text } = Typography;

const COPY_STATUS_MAP = {
    AVAILABLE: { color: 'success', text: 'Có sẵn' },
    RESERVED: { color: 'processing', text: 'Giữ chỗ' },
    BORROWED: { color: 'warning', text: 'Đang mượn' },
    MAINTENANCE: { color: 'default', text: 'Bảo trì' },
    LOST: { color: 'error', text: 'Mất' },
};

const FALLBACK_COVER = '/placeholder-book.png';
const IMAGE_BASE = import.meta.env.VITE_API_URL_IMAGE || '';

function resolveImageSrc(image) {
    if (!image) return FALLBACK_COVER;
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    if (image.startsWith('/')) return image;
    return `${IMAGE_BASE}/${image}`;
}

function getBookId(b) {
    return String(b?._id || b?.id || b?.mysqlId || '').trim();
}

const InventoryManagement = () => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [tablePagination, setTablePagination] = useState({ current: 1, pageSize: 10 });

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailBook, setDetailBook] = useState(null);
    const [detailCopies, setDetailCopies] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [editForm] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const fetchBooks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestGetAllProduct();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const normalized = list.map((b) => ({
                    ...b,
                    id: getBookId(b),
                    stock: Number(b?.stock || 0),
                    totalCopies: Number(b?.totalCopies || 0),
                }));
            setBooks([...normalized].sort(compareByBookCodeAsc));
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không thể tải dữ liệu kho');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks]);

    const filtered = useMemo(() => {
        const q = String(searchText || '').trim().toLowerCase();
        if (!q) return books;
        return books.filter((b) => {
            const title = String(b?.title || b?.nameProduct || '').toLowerCase();
            const author = String(b?.publisher || '').toLowerCase();
            const code = String(b?.bookCode || '').toLowerCase();
            return title.includes(q) || author.includes(q) || code.includes(q);
        });
    }, [books, searchText]);

    const openDetail = async (book) => {
        setDetailBook(book);
        setDetailOpen(true);
        setDetailCopies([]);
        setDetailLoading(true);
        try {
            const res = await requestGetBookCopies({ bookId: book.id, limit: 5000 });
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            // Sắp xếp theo STT cuối barcode (B001-1, B001-2, ...)
            list.sort((a, b) => {
                const ra = /-(\d+)$/.exec(String(a?.barcode || ''));
                const rb = /-(\d+)$/.exec(String(b?.barcode || ''));
                const na = ra ? Number(ra[1]) : 0;
                const nb = rb ? Number(rb[1]) : 0;
                return na - nb;
            });
            setDetailCopies(list);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không tải được danh sách bản sao');
        } finally {
            setDetailLoading(false);
        }
    };

    const openEdit = (book) => {
        setEditing(book);
        editForm.setFieldsValue({ stock: Number(book?.totalCopies || 0) });
        setEditOpen(true);
    };

    const submitEdit = async () => {
        if (!editing?.id) return;
        try {
            const v = await editForm.validateFields();
            const newTotal = Number(v.stock);
            if (!Number.isFinite(newTotal) || newTotal < 0) {
                message.error('Số lượng không hợp lệ');
                return;
            }
            setSubmitting(true);
            const oldTotal = Number(editing.totalCopies || 0);
            await requestUpdateProduct(editing.id, { stock: newTotal });
            const delta = newTotal - oldTotal;
            if (delta > 0) {
                message.success(`Đã thêm ${delta} bản sao (${editing.bookCode || 'mã sách'}-STT) cho "${editing.title}"`);
            } else if (delta < 0) {
                message.success(`Đã giảm ${-delta} bản sao của "${editing.title}"`);
            } else {
                message.info('Số lượng không thay đổi');
            }
            setEditOpen(false);
            setEditing(null);
            await fetchBooks();
        } catch (e) {
            if (e?.errorFields) return;
            message.error(e?.response?.data?.message || 'Không cập nhật được');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'THÔNG TIN SÁCH',
            key: 'info',
            render: (_, row) => (
                <div className="flex items-center gap-3">
                    <img
                        src={resolveImageSrc(row.image)}
                        alt={row.title}
                        className="h-12 w-9 flex-shrink-0 rounded object-cover shadow-sm"
                        onError={(e) => {
                            e.currentTarget.src = FALLBACK_COVER;
                        }}
                    />
                    <div className="min-w-0">
                        <Text strong ellipsis={{ tooltip: row.title || row.nameProduct }} className="block">
                            {row.title || row.nameProduct || '—'}
                        </Text>
                        <Text type="secondary" className="text-xs">
                            {row.publisher || '—'}
                        </Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'ISBN',
            dataIndex: 'bookCode',
            key: 'bookCode',
            width: 140,
            render: (code) =>
                code ? (
                    <span className="font-mono text-slate-700">{code}</span>
                ) : (
                    <Text type="secondary" italic>
                        Chưa cấp mã
                    </Text>
                ),
        },
        {
            title: 'TỒN KHO',
            key: 'stock',
            width: 110,
            align: 'center',
            render: (_, row) => {
                const available = Number(row.stock || 0);
                const total = Number(row.totalCopies || 0);
                const color = available === 0 ? 'text-red-500' : available < 5 ? 'text-amber-600' : 'text-emerald-700';
                return (
                    <span className={`font-semibold ${color}`}>
                        {available} / {total}
                    </span>
                );
            },
            sorter: (a, b) => Number(a.stock || 0) - Number(b.stock || 0),
        },
        {
            title: 'TRẠNG THÁI',
            key: 'state',
            width: 140,
            render: (_, row) => {
                const available = Number(row.stock || 0);
                if (available === 0) return <Tag color="error">Hết sách</Tag>;
                return <Tag color="success">Đang lưu hành</Tag>;
            },
            filters: [
                { text: 'Đang lưu hành', value: 'in' },
                { text: 'Hết sách', value: 'out' },
            ],
            onFilter: (val, row) => (val === 'out' ? Number(row.stock || 0) === 0 : Number(row.stock || 0) > 0),
        },
        {
            title: 'THAO TÁC',
            key: 'actions',
            width: 230,
            fixed: 'right',
            render: (_, row) => (
                <Space size="small">
                    <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => openDetail(row)}
                    >
                        Xem chi tiết
                    </Button>
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEdit(row)}
                    >
                        Chỉnh sửa
                    </Button>
                </Space>
            ),
        },
    ];

    const copyColumns = [
        {
            title: 'STT',
            key: 'index',
            width: 60,
            align: 'center',
            render: (_, __, idx) => idx + 1,
        },
        {
            title: 'Mã bản sao (Barcode)',
            dataIndex: 'barcode',
            key: 'barcode',
            render: (v) => <span className="font-mono">{v || '—'}</span>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (s) => {
                const m = COPY_STATUS_MAP[s] || { color: 'default', text: s || '—' };
                return <Tag color={m.color}>{m.text}</Tag>;
            },
        },
        {
            title: 'Tình trạng bản',
            dataIndex: 'condition',
            key: 'condition',
            width: 130,
            render: (c) => c || '—',
        },
        {
            title: 'Tạo lúc',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 150,
            render: (d) => (d && dayjs(d).isValid() ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'),
        },
    ];

    const detailAvailable = useMemo(
        () => detailCopies.filter((c) => c.status === 'AVAILABLE').length,
        [detailCopies],
    );

    return (
        <div className="flex flex-col gap-4 p-3">
            <Card className="rounded-2xl shadow-sm" bodyStyle={{ padding: 16 }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Quản lý tồn kho</h2>
                        <p className="text-sm text-slate-500">
                            Theo dõi số lượng bản sao của từng đầu sách. Bấm “Xem chi tiết” để xem danh sách barcode hoặc “Chỉnh sửa” để thay đổi số lượng.
                        </p>
                    </div>
                    <Input.Search
                        allowClear
                        placeholder="Tìm theo tên sách, tác giả, ISBN..."
                        className="max-w-sm"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
                <Table
                    rowKey={(r) => r.id}
                    columns={columns}
                    dataSource={filtered}
                    loading={loading}
                    size="middle"
                    scroll={{ x: 900 }}
                    onChange={(p) =>
                        setTablePagination({
                            current: p?.current || 1,
                            pageSize: p?.pageSize || 10,
                        })
                    }
                    pagination={{
                        current: tablePagination.current,
                        pageSize: tablePagination.pageSize,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        position: ['bottomCenter'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} đầu sách`,
                    }}
                />
            </Card>

            <Modal
                title={
                    <div>
                        <div className="text-base font-semibold">
                            Danh sách bản sao — {detailBook?.title || detailBook?.nameProduct || ''}
                        </div>
                        <div className="text-xs font-normal text-slate-500">
                            ISBN: {detailBook?.bookCode || '—'} · Sẵn sàng: {detailAvailable} / {detailCopies.length || 0}
                        </div>
                    </div>
                }
                open={detailOpen}
                onCancel={() => {
                    setDetailOpen(false);
                    setDetailBook(null);
                    setDetailCopies([]);
                }}
                footer={
                    <Button onClick={() => setDetailOpen(false)}>Đóng</Button>
                }
                width={780}
                destroyOnHidden
            >
                <Table
                    rowKey={(r) => r._id || r.id}
                    columns={copyColumns}
                    dataSource={detailCopies}
                    loading={detailLoading}
                    size="small"
                    pagination={{ pageSize: 10, showSizeChanger: true, position: ['bottomCenter'] }}
                />
            </Modal>

            <Modal
                title={
                    <div>
                        <div className="text-base font-semibold">Chỉnh sửa số lượng</div>
                        <div className="text-xs font-normal text-slate-500">
                            {editing?.title || editing?.nameProduct || ''} — ISBN: {editing?.bookCode || '—'}
                        </div>
                    </div>
                }
                open={editOpen}
                onOk={submitEdit}
                onCancel={() => {
                    setEditOpen(false);
                    setEditing(null);
                }}
                okText="Lưu thay đổi"
                cancelText="Hủy"
                confirmLoading={submitting}
                destroyOnHidden
                width={460}
            >
                {editing && (
                    <Form form={editForm} layout="vertical">
                        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
                            <div>
                                Tổng số sách hiện tại:{' '}
                                <span className="font-semibold">{Number(editing.totalCopies || 0)}</span>
                            </div>
                            <div>
                                Trong đó đang sẵn sàng:{' '}
                                <span className="font-semibold text-emerald-700">{Number(editing.stock || 0)}</span>
                                <span className="text-slate-500"> / đang mượn: {Number(editing.totalCopies || 0) - Number(editing.stock || 0)}</span>
                            </div>
                        </div>
                        <Form.Item
                            name="stock"
                            label={
                                <Tooltip title="Tổng số sách (bản vật lý) của đầu sách. Tăng → tự tạo bản mới theo định dạng {ISBN}-STT. Giảm → xóa bớt bản đang sẵn sàng (không xóa được bản đang mượn).">
                                    <span>Tổng số sách</span>
                                </Tooltip>
                            }
                            rules={[{ required: true, message: 'Nhập tổng số sách' }, { type: 'number', min: 0 }]}
                        >
                            <InputNumber
                                className="w-full rounded-xl"
                                min={0}
                                max={9999}
                                autoFocus
                            />
                        </Form.Item>
                        <p className="text-xs italic text-slate-500">
                            Lưu ý: Mã barcode tự sinh, không chỉnh sửa thủ công. Không thể giảm xuống thấp hơn số bản đang được mượn.
                        </p>
                    </Form>
                )}
            </Modal>
        </div>
    );
};

export default InventoryManagement;
