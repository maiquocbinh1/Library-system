import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, Input, Table, Typography, message } from 'antd';
import {
    UserOutlined,
    PlusOutlined,
    FileAddOutlined,
    RollbackOutlined,
    FieldTimeOutlined,
    ShoppingCartOutlined,
    BarcodeOutlined,
    BookOutlined,
    StopOutlined,
    WarningOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    requestCheckBarcode,
    requestFindPatrons,
    requestGetAllFines,
    requestGetAllHistoryBook,
    requestGetBookCopies,
    requestGetPolicies,
    requestRenewLoan,
    requestReturnByBarcode,
    requestGetReturnsToday,
    requestStaffDeskIssue,
} from '../../config/request';
import { CIRCULATION_SAMPLE_STUDENT_IDS } from '../../constants/circulationSamplePatrons';
import { isBorrowingActive } from '../../utils/loanTicketStatus';

const { Text, Title } = Typography;

const ACCENT = ['bg-indigo-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];

const SAMPLE_STUDENT_ID_SET = new Set(CIRCULATION_SAMPLE_STUDENT_IDS.map((s) => String(s).trim()));

function patronIdSet(p) {
    return new Set([String(p?.id || ''), String(p?._id || ''), String(p?.mysqlId || '')].filter(Boolean));
}

function countActiveBorrowCopies(patron, tickets) {
    const ids = patronIdSet(patron);
    let n = 0;
    for (const t of tickets || []) {
        if (!ids.has(String(t.userId))) continue;
        if (isBorrowingActive(t.status)) n += Array.isArray(t.bookCopyIds) ? t.bookCopyIds.length : 0;
    }
    return n;
}

function formatVnd(n) {
    const x = Number(n) || 0;
    return `${x.toLocaleString('vi-VN')}đ`;
}

function isCalendarOverdue(dueDate) {
    if (!dueDate) return false;
    return dayjs(dueDate).startOf('day').isBefore(dayjs().startOf('day'));
}

/** Số cuốn tối đa thêm một lần từ kho (đúng barcode AVAILABLE trong DB). */
const CART_QUICK_FILL_MAX = 3;

const CirculationDesk = () => {
    const [searchParams] = useSearchParams();
    /** Dev, hoặc ?prefillCart=1 / ?gio=1 — hiện nút “Thêm nhanh từ kho” + tự điền giỏ khi chọn độc giả. */
    const showCartQuickFill =
        import.meta.env.DEV ||
        ['1', 'true'].includes(String(searchParams.get('prefillCart') || '').trim().toLowerCase()) ||
        ['1', 'true'].includes(String(searchParams.get('gio') || '').trim().toLowerCase());

    const [mainTab, setMainTab] = useState('lap');
    const [tickets, setTickets] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [fines, setFines] = useState([]);

    const [patronQuery, setPatronQuery] = useState('');
    const [patron, setPatron] = useState(null);
    const [deskPatronSuggest, setDeskPatronSuggest] = useState([]);
    const [cart, setCart] = useState([]);
    const [bookInput, setBookInput] = useState('');

    const [returnInput, setReturnInput] = useState('');
    const [returnBusy, setReturnBusy] = useState(false);
    const [returnSession, setReturnSession] = useState([]);

    const [renewQuery, setRenewQuery] = useState('');
    const [renewPatron, setRenewPatron] = useState(null);
    const [renewSuggest, setRenewSuggest] = useState([]);
    const [renewBusyId, setRenewBusyId] = useState(null);

    const [issueBusy, setIssueBusy] = useState(false);
    const [cartQuickFillBusy, setCartQuickFillBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showSuggest, setShowSuggest] = useState(false);
    const [showRenewSuggest, setShowRenewSuggest] = useState(false);

    const bookRef = useRef(null);
    const returnRef = useRef(null);
    const autoStockCartPatronRef = useRef(new Set());

    const loadBase = useCallback(async () => {
        setLoading(true);
        try {
            const [hRes, pRes, fRes] = await Promise.all([
                requestGetAllHistoryBook(),
                requestGetPolicies().catch(() => ({ metadata: [] })),
                requestGetAllFines().catch(() => ({ metadata: [] })),
            ]);
            const hList = Array.isArray(hRes?.metadata) ? hRes.metadata : [];
            setTickets(
                hList.map((item) => ({
                    ...item,
                    id: item?.id || item?.mysqlId || (item?._id ? String(item._id) : undefined),
                    renewalCount: item?.renewalCount ?? 0,
                })),
            );
            const plist = Array.isArray(pRes?.metadata) ? pRes.metadata : [];
            setPolicies(plist);
            const flist = Array.isArray(fRes?.metadata) ? fRes.metadata : [];
            setFines(flist);
        } catch {
            message.error('Không tải được dữ liệu');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBase();
    }, [loadBase]);

    const loadReturnsToday = useCallback(async () => {
        try {
            const res = await requestGetReturnsToday();
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            setReturnSession(
                list.map((r) => ({
                    key: r.key || String(r.id || r._id || `${r.barcode}-${r.returnedAt}`),
                    bookTitle: r.bookTitle || '—',
                    barcode: r.barcode || '',
                    borrowerStudentId: r.borrowerStudentId || '',
                    timeLabel:
                        r.returnedAt && dayjs(r.returnedAt).isValid()
                            ? dayjs(r.returnedAt).format('HH:mm')
                            : '—',
                    fineAmount: Number(r.fineAmount) || 0,
                    onTime: Boolean(r.onTime),
                })),
            );
        } catch {
            /* giữ nguyên nếu lỗi mạng */
        }
    }, []);

    useEffect(() => {
        if (mainTab === 'tra') {
            void loadReturnsToday();
        }
    }, [mainTab, loadReturnsToday]);

    useEffect(() => {
        if (mainTab !== 'lap' || patron) {
            setDeskPatronSuggest([]);
            return;
        }
        const q = String(patronQuery || '').trim();
        if (q.length < 2) {
            setDeskPatronSuggest([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const res = await requestFindPatrons(q);
                setDeskPatronSuggest(Array.isArray(res?.metadata) ? res.metadata : []);
            } catch {
                setDeskPatronSuggest([]);
            }
        }, 320);
        return () => clearTimeout(t);
    }, [patronQuery, mainTab, patron]);

    useEffect(() => {
        if (mainTab !== 'han' || renewPatron) {
            setRenewSuggest([]);
            return;
        }
        const q = String(renewQuery || '').trim();
        if (q.length < 2) {
            setRenewSuggest([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const res = await requestFindPatrons(q);
                setRenewSuggest(Array.isArray(res?.metadata) ? res.metadata : []);
            } catch {
                setRenewSuggest([]);
            }
        }, 320);
        return () => clearTimeout(t);
    }, [renewQuery, mainTab, renewPatron]);

    const policyForPatron = useMemo(() => {
        const rt = patron?.readerType || 'SinhVien_ChinhQuy';
        const row = policies.find((p) => p.readerType === rt) || policies[0];
        return {
            maxBooks: Number(row?.maxBooks ?? 5),
            loanDays: Number(row?.loanDays ?? 14),
            overdueFinePerDay: Number(row?.overdueFinePerDay ?? 1000),
        };
    }, [patron, policies]);

    const policyForRenewPatron = useMemo(() => {
        const rt = renewPatron?.readerType || 'SinhVien_ChinhQuy';
        const row = policies.find((p) => p.readerType === rt) || policies[0];
        return {
            loanDays: Number(row?.loanDays ?? 14),
            renewExtensionDays: 7,
            overdueFinePerDay: Number(row?.overdueFinePerDay ?? 1000),
        };
    }, [renewPatron, policies]);

    const borrowingCount = useMemo(() => (patron ? countActiveBorrowCopies(patron, tickets) : 0), [patron, tickets]);

    const renewPatronHasUnpaidFine = useMemo(() => {
        if (!renewPatron) return false;
        const ids = patronIdSet(renewPatron);
        return fines.some((f) => f.status === 'UNPAID' && ids.has(String(f.userId)));
    }, [renewPatron, fines]);

    const renewTickets = useMemo(() => {
        if (!renewPatron) return [];
        const ids = patronIdSet(renewPatron);
        return tickets.filter(
            (t) => ids.has(String(t.userId)) && ['BORROWING', 'OVERDUE'].includes(String(t.status || '')),
        );
    }, [renewPatron, tickets]);

    const returnSummary = useMemo(() => {
        const ok = returnSession.filter((r) => r.onTime).length;
        const totalFine = returnSession.reduce((s, r) => s + (Number(r.fineAmount) || 0), 0);
        return { ok, total: returnSession.length, totalFine };
    }, [returnSession]);

    const cartQuickFillRoom = useMemo(() => {
        if (!patron) return 0;
        return Math.max(0, policyForPatron.maxBooks - borrowingCount - cart.length);
    }, [patron, policyForPatron.maxBooks, borrowingCount, cart.length]);

    const fillCartFromStock = useCallback(
        async (opts = {}) => {
            const silent = Boolean(opts.silent);
            if (!patron) {
                if (!silent) message.warning('Chọn độc giả trước');
                return;
            }
            if (patron.libraryCardBlocked) {
                if (!silent) message.error('Thẻ độc giả đang khóa');
                return;
            }

            setCartQuickFillBusy(true);
            try {
                const res = await requestGetBookCopies({ status: 'AVAILABLE', limit: 48 });
                const rows = Array.isArray(res?.metadata) ? res.metadata : [];

                let addedCount = 0;
                setCart((prev) => {
                    const room = Math.max(0, policyForPatron.maxBooks - borrowingCount - prev.length);
                    const take = Math.min(CART_QUICK_FILL_MAX, room);
                    if (take <= 0) return prev;

                    const existingBc = new Set(prev.map((c) => String(c.barcode || '').toUpperCase()));
                    const chosen = [];
                    const usedBookIds = new Set();

                    const pushRow = (r) => {
                        const bc = String(r?.barcode || '').trim().toUpperCase();
                        if (!bc || existingBc.has(bc)) return;
                        const bid = r?.bookId ? String(r.bookId) : '';
                        chosen.push({
                            key: `${bc}-${Date.now()}-${chosen.length}`,
                            barcode: bc,
                            title: String(r?.title || r?.nameProduct || '—').trim() || '—',
                            bookId: bid,
                            accent: ACCENT[(prev.length + chosen.length) % ACCENT.length],
                        });
                        existingBc.add(bc);
                        if (bid) usedBookIds.add(bid);
                    };

                    for (const r of rows) {
                        if (chosen.length >= take) break;
                        const bid = r?.bookId ? String(r.bookId) : '';
                        if (bid && usedBookIds.has(bid)) continue;
                        pushRow(r);
                    }
                    for (const r of rows) {
                        if (chosen.length >= take) break;
                        pushRow(r);
                    }

                    addedCount = chosen.length;
                    if (!chosen.length) return prev;
                    return [...prev, ...chosen];
                });

                if (!silent) {
                    if (addedCount > 0) {
                        message.success(`Đã thêm ${addedCount} cuốn từ danh mục kho`);
                    } else if (cartQuickFillRoom <= 0) {
                        message.warning('Đã đủ số ấn phẩm cho phép trên phiếu');
                    } else {
                        message.info('Chưa có bản sách ở trạng thái sẵn sàng — kiểm tra kho hoặc nhập mã thủ công');
                    }
                }
            } catch (e) {
                if (!silent) message.error(e?.response?.data?.message || 'Không lấy được danh sách kho');
            } finally {
                setCartQuickFillBusy(false);
            }
        },
        [patron, policyForPatron.maxBooks, borrowingCount, cartQuickFillRoom],
    );

    /**
     * Tự thêm tối đa 3 bản AVAILABLE từ kho vào giỏ sau khi chọn độc giả:
     * - Môi trường dev, hoặc URL ?gio=1 / ?prefillCart=1: mọi độc giả.
     * - Production không tham số: chỉ các MSV trùng bộ seed (đồng bộ constants).
     */
    useEffect(() => {
        if (!patron) {
            autoStockCartPatronRef.current.clear();
            return;
        }
        if (mainTab !== 'lap') return;

        const uid = String(patron.id);
        if (autoStockCartPatronRef.current.has(uid)) return;

        const sid = String(patron.studentId || '').trim();
        const gioOn =
            import.meta.env.DEV ||
            ['1', 'true'].includes(String(searchParams.get('gio') || '').trim().toLowerCase()) ||
            ['1', 'true'].includes(String(searchParams.get('prefillCart') || '').trim().toLowerCase());
        const isSamplePatron = SAMPLE_STUDENT_ID_SET.has(sid);
        if (!gioOn && !isSamplePatron) return;

        autoStockCartPatronRef.current.add(uid);
        const tid = setTimeout(() => {
            void fillCartFromStock({ silent: true });
        }, 450);
        return () => clearTimeout(tid);
    }, [patron, patron?.id, patron?.studentId, mainTab, searchParams, fillCartFromStock]);

    const resolvePatron = async () => {
        const q = String(patronQuery || '').trim();
        if (q.length < 2) {
            message.warning('Nhập ít nhất 2 ký tự (MSV hoặc tên)');
            return;
        }
        try {
            const res = await requestFindPatrons(q);
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const low = q.toLowerCase();
            const exact = list.find((u) => String(u.studentId || '').toLowerCase() === low);
            const p = exact || list[0];
            if (!p) {
                message.warning('Không tìm thấy độc giả — thử MSV hoặc tên');
                return;
            }
            if (p.libraryCardBlocked) {
                message.error('Thẻ độc giả đang khóa');
                return;
            }
            setPatron(p);
            setShowSuggest(false);
            message.success('Đã chọn độc giả');
            setTimeout(() => bookRef.current?.focus(), 0);
        } catch {
            message.error('Không tra cứu được độc giả');
        }
    };

    const resolveRenewPatron = async () => {
        const q = String(renewQuery || '').trim();
        if (q.length < 2) {
            message.warning('Nhập ít nhất 2 ký tự');
            return;
        }
        try {
            const res = await requestFindPatrons(q);
            const list = Array.isArray(res?.metadata) ? res.metadata : [];
            const low = q.toLowerCase();
            const exact = list.find((u) => String(u.studentId || '').toLowerCase() === low);
            const p = exact || list[0];
            if (!p) {
                message.warning('Không tìm thấy độc giả');
                return;
            }
            setRenewPatron(p);
            setShowRenewSuggest(false);
            message.success('Đã chọn độc giả');
        } catch {
            message.error('Không tra cứu được độc giả');
        }
    };

    const addBookFromInput = async () => {
        const bc = String(bookInput || '').trim().toUpperCase();
        if (!bc) return;
        if (!patron) {
            message.warning('Chọn độc giả trước');
            return;
        }
        if (patron.libraryCardBlocked) {
            message.error('Thẻ độc giả đang khóa');
            return;
        }
        if (cart.some((c) => c.barcode === bc)) {
            message.warning('Mã này đã có trong danh sách');
            setBookInput('');
            return;
        }
        try {
            const chk = await requestCheckBarcode(bc);
            const meta = chk?.metadata || {};
            if (String(meta.status || '').toUpperCase() !== 'AVAILABLE') {
                message.warning(`Bản sao không sẵn sàng mượn (trạng thái: ${meta.status || '—'})`);
                return;
            }
            const title = meta.title || '—';
            const bookId = meta.bookId ? String(meta.bookId) : '';
            setCart((prev) => [
                ...prev,
                {
                    key: `${bc}-${Date.now()}`,
                    barcode: bc,
                    title,
                    bookId,
                    accent: ACCENT[prev.length % ACCENT.length],
                },
            ]);
            setBookInput('');
            setTimeout(() => bookRef.current?.focus(), 0);
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không kiểm tra được mã bản sao');
        }
    };

    const removeCart = (key) => {
        setCart((prev) => prev.filter((c) => c.key !== key));
    };

    const submitLoan = async () => {
        if (!patron || !cart.length) return;
        if (borrowingCount + cart.length > policyForPatron.maxBooks) {
            message.error(
                `Vượt giới hạn: tối đa ${policyForPatron.maxBooks} ấn phẩm (đang mượn ${borrowingCount}, thêm ${cart.length})`,
            );
            return;
        }
        setIssueBusy(true);
        try {
            const res = await requestStaffDeskIssue({
                userId: patron.id,
                barcodes: cart.map((c) => c.barcode),
            });
            const tickets = res?.metadata?.tickets || [];
            const loanDays = res?.metadata?.loanDays ?? 14;
            if (tickets.length > 1) {
                message.success(
                    `Đã tạo ${tickets.length} phiếu mượn (${cart.length} cuốn). Hạn trả: ${loanDays} ngày. Email xác nhận đã gửi.`,
                    5,
                );
            } else {
                message.success('Đã tạo phiếu mượn, xuất kho và gửi email xác nhận.');
            }
            setCart([]);
            await loadBase();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không tạo được phiếu');
        } finally {
            setIssueBusy(false);
        }
    };

    const doReturn = async () => {
        const bc = String(returnInput || '').trim().toUpperCase();
        if (!bc) {
            message.warning('Nhập mã bản sao');
            return;
        }
        setReturnBusy(true);
        try {
            const res = await requestReturnByBarcode({ barcodes: [bc] });
            const results = Array.isArray(res?.metadata) ? res.metadata : [];
            const r0 = results[0] || {};
            if (r0.success) {
                message.success(r0.message || 'Đã nhận trả');
                await loadReturnsToday();
            } else message.error(r0.message || 'Không trả được');
            setReturnInput('');
            setTimeout(() => returnRef.current?.focus(), 0);
            await loadBase();
        } catch (e) {
            message.error(e?.response?.data?.message || 'Lỗi trả sách');
        } finally {
            setReturnBusy(false);
        }
    };

    const renewOne = async (loanTicketId) => {
        setRenewBusyId(loanTicketId);
        try {
            await requestRenewLoan({ loanTicketId });
            message.success('Gia hạn thành công');
            await loadBase();
            if (renewPatron) {
                setRenewPatron((prev) => ({ ...prev }));
            }
        } catch (e) {
            message.error(e?.response?.data?.message || 'Không gia hạn được');
        } finally {
            setRenewBusyId(null);
        }
    };

    const canSubmitLoan =
        patron &&
        cart.length > 0 &&
        borrowingCount + cart.length <= policyForPatron.maxBooks &&
        !patron.libraryCardBlocked;

    const cartColumns = [
        {
            title: 'Tên sách',
            dataIndex: 'title',
            key: 'title',
            ellipsis: true,
            render: (t) => <span className="font-medium text-slate-800">{t}</span>,
        },
        {
            title: 'Mã bản sao',
            dataIndex: 'barcode',
            key: 'barcode',
            width: 140,
            render: (b) => <span className="font-mono text-xs text-slate-700">{b}</span>,
        },
        {
            title: '',
            key: 'act',
            width: 72,
            render: (_, row) => (
                <Button type="link" danger size="small" onClick={() => removeCart(row.key)}>
                    Xóa
                </Button>
            ),
        },
    ];

    const tabBig = (id, icon, label) => (
        <button
            type="button"
            key={id}
            onClick={() => setMainTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition sm:px-4 sm:text-[15px] ${
                mainTab === id
                    ? 'bg-slate-800 text-white shadow-md ring-1 ring-slate-900/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
        >
            {icon}
            <span className="whitespace-nowrap">{label}</span>
        </button>
    );

    const suggestSource = mainTab === 'lap' ? deskPatronSuggest : [];
    const renewSuggestSrc = renewSuggest;

    const borrowDateLabel = patron && dayjs().isValid() ? dayjs().format('DD/MM/YYYY') : '—';

    return (
        <div className="flex flex-col gap-5 font-sans text-slate-800">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Title level={3} className="!mb-1 !font-bold tracking-tight text-slate-900">
                        Nghiệp vụ Lưu thông (TPS)
                    </Title>
                    <Text type="secondary" className="text-sm">
                        Quầy mượn — trả — gia hạn
                    </Text>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                        Hệ thống sẵn sàng
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <Card
                    className="rounded-2xl border border-slate-200/90 bg-white shadow-sm xl:col-span-5"
                    bodyStyle={{ padding: 20 }}
                    loading={loading}
                >
                    <div className="mb-6 flex flex-col gap-2 sm:flex-row">
                        {tabBig('lap', <FileAddOutlined className="text-lg" />, 'Lập phiếu mượn')}
                        {tabBig('tra', <RollbackOutlined className="text-lg" />, 'Nhận trả sách')}
                        {tabBig('han', <FieldTimeOutlined className="text-lg" />, 'Gia hạn')}
                    </div>

                    {mainTab === 'lap' && (
                        <div className="flex flex-col gap-6">
                            <div>
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                        1
                                    </span>
                                    <Text strong className="text-slate-800">
                                        Thông tin người mượn
                                    </Text>
                                </div>
                                <div className="relative flex flex-col gap-2 sm:flex-row">
                                    <Input
                                        size="large"
                                        className="rounded-xl border-slate-700 bg-slate-900 font-medium text-white placeholder:text-slate-400"
                                        placeholder="Nhập MSV hoặc Tên độc giả."
                                        value={patronQuery}
                                        onChange={(e) => {
                                            setPatronQuery(e.target.value);
                                            setShowSuggest(true);
                                        }}
                                        onFocus={() => setShowSuggest(true)}
                                        onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
                                        onPressEnter={resolvePatron}
                                    />
                                    <Button
                                        type="primary"
                                        className="rounded-xl border-0 bg-indigo-600 px-6 font-semibold shadow-sm hover:bg-indigo-500"
                                        onClick={resolvePatron}
                                    >
                                        Tìm
                                    </Button>
                                    {showSuggest && suggestSource.length > 0 && (
                                        <ul className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                            {suggestSource.map((u) => (
                                                <li key={u.id}>
                                                    <button
                                                        type="button"
                                                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-indigo-50"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            if (u.libraryCardBlocked) {
                                                                message.error('Thẻ độc giả đang khóa');
                                                                return;
                                                            }
                                                            setPatronQuery(u.studentId || u.fullName || '');
                                                            setPatron(u);
                                                            setShowSuggest(false);
                                                            message.success('Đã chọn độc giả');
                                                            setTimeout(() => bookRef.current?.focus(), 0);
                                                        }}
                                                    >
                                                        <span className="font-medium text-slate-900">{u.fullName}</span>
                                                        <span className="text-slate-500"> ({u.studentId || '—'})</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                {patron && (
                                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/[0.08] to-transparent py-3 pl-4 pr-2 shadow-sm ring-1 ring-indigo-100/80">
                                        <Avatar
                                            size={48}
                                            icon={<UserOutlined />}
                                            src={patron.avatar || undefined}
                                            className="shrink-0 bg-indigo-100 text-indigo-600"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-semibold text-indigo-700">{patron.fullName || '—'}</div>
                                            <Text className="text-xs text-slate-600">
                                                {patron.studentId || '—'} | Đang mượn: {borrowingCount}/{policyForPatron.maxBooks}
                                            </Text>
                                        </div>
                                        <Button
                                            size="small"
                                            type="link"
                                            className="text-indigo-600"
                                            onClick={() => {
                                                setPatron(null);
                                                setPatronQuery('');
                                                setCart([]);
                                            }}
                                        >
                                            Đổi
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                        2
                                    </span>
                                    <Text strong className="text-slate-800">
                                        Thêm sách vào giỏ
                                    </Text>
                                </div>
                                <div className="mb-2 flex gap-2">
                                    <Input
                                        ref={bookRef}
                                        size="large"
                                        className="rounded-xl border-slate-700 bg-slate-900 font-mono text-white placeholder:text-slate-400"
                                        placeholder="Nhập mã bản sao"
                                        value={bookInput}
                                        disabled={!patron}
                                        onChange={(e) => setBookInput(e.target.value.toUpperCase())}
                                        onPressEnter={addBookFromInput}
                                    />
                                    <Button
                                        type="primary"
                                        className="rounded-xl border-0 bg-emerald-500 px-4 shadow-sm hover:bg-emerald-600"
                                        icon={<PlusOutlined />}
                                        disabled={!patron}
                                        onClick={addBookFromInput}
                                    >
                                        Thêm
                                    </Button>
                                </div>
                                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                                    <BarcodeOutlined className="mt-0.5 text-lg text-slate-400" />
                                    <span>
                                        Gõ mã bản sao vào ô trên, nhấn <strong>Enter</strong> hoặc bấm <strong>Thêm</strong>.
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4 ring-1 ring-slate-100/80">
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                        3
                                    </span>
                                    <Text strong className="text-slate-800">
                                        Xác nhận &amp; Tạo phiếu
                                    </Text>
                                </div>
                                <div className="mb-4 space-y-1 text-sm text-slate-600">
                                    <div>
                                        Hạn trả mặc định:{' '}
                                        <span className="font-semibold text-slate-900">{policyForPatron.loanDays} ngày</span>
                                    </div>
                                    <div>
                                        Phí phạt:{' '}
                                        <span className="font-semibold text-slate-900">
                                            {formatVnd(policyForPatron.overdueFinePerDay)}/ngày
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    type="primary"
                                    size="large"
                                    block
                                    className="h-12 rounded-xl border-0 bg-indigo-600 font-semibold shadow-md hover:bg-indigo-500 disabled:opacity-40"
                                    loading={issueBusy}
                                    disabled={!canSubmitLoan}
                                    onClick={submitLoan}
                                >
                                    Tạo phiếu mượn &amp; Gửi email xác nhận
                                </Button>
                            </div>
                        </div>
                    )}

                    {mainTab === 'tra' && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <Text strong className="mb-3 flex items-center gap-2 text-slate-800">
                                    <BarcodeOutlined /> Nhập mã bản sao trả sách
                                </Text>
                                <Input
                                    ref={returnRef}
                                    size="large"
                                    className="mb-2 rounded-xl border-slate-700 bg-slate-900 font-mono text-white placeholder:text-slate-400"
                                    placeholder="Nhập mã bản sao (ví dụ BC-00142)"
                                    value={returnInput}
                                    onChange={(e) => setReturnInput(e.target.value.toUpperCase())}
                                    onPressEnter={doReturn}
                                />
                                <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                                    <BarcodeOutlined className="mt-0.5 text-lg text-slate-400" />
                                    <span>
                                        Nhập đúng mã in trên nhãn bản sao, nhấn <strong>Enter</strong> hoặc bấm <strong>Xác nhận trả</strong>.
                                    </span>
                                </div>
                                <Button
                                    type="primary"
                                    className="mt-3 w-full rounded-xl border-0 bg-indigo-600 font-semibold"
                                    loading={returnBusy}
                                    onClick={doReturn}
                                >
                                    Xác nhận trả
                                </Button>
                            </div>
                        </div>
                    )}

                    {mainTab === 'han' && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                                        1
                                    </span>
                                    <Text strong className="text-slate-800">
                                        Tìm độc giả cần gia hạn
                                    </Text>
                                </div>
                                <div className="relative flex flex-col gap-2 sm:flex-row">
                                    <Input
                                        size="large"
                                        className="rounded-xl border-slate-700 bg-slate-900 text-white placeholder:text-slate-400"
                                        placeholder="Nhập MSV hoặc Tên..."
                                        value={renewQuery}
                                        onChange={(e) => {
                                            setRenewQuery(e.target.value);
                                            setShowRenewSuggest(true);
                                        }}
                                        onFocus={() => setShowRenewSuggest(true)}
                                        onBlur={() => setTimeout(() => setShowRenewSuggest(false), 200)}
                                        onPressEnter={resolveRenewPatron}
                                    />
                                    <Button type="primary" className="rounded-xl bg-blue-600 font-semibold" onClick={resolveRenewPatron}>
                                        Tìm
                                    </Button>
                                    {showRenewSuggest && renewSuggestSrc.length > 0 && (
                                        <ul className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                            {renewSuggestSrc.map((u) => (
                                                <li key={u.id}>
                                                    <button
                                                        type="button"
                                                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            setRenewQuery(u.studentId || u.fullName || '');
                                                            setRenewPatron(u);
                                                            setShowRenewSuggest(false);
                                                            message.success('Đã chọn độc giả');
                                                        }}
                                                    >
                                                        <span className="font-medium">{u.fullName}</span>
                                                        <span className="text-slate-500"> ({u.studentId || '—'})</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                {renewPatron && (
                                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-500/[0.07] to-transparent py-3 pl-4 pr-2 ring-1 ring-blue-100/80">
                                        <Avatar size={44} icon={<UserOutlined />} className="shrink-0 bg-blue-100 text-blue-600" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-semibold text-blue-900">{renewPatron.fullName || '—'}</div>
                                            <Text className="text-xs text-slate-600">{renewPatron.studentId || '—'}</Text>
                                        </div>
                                        <Button
                                            size="small"
                                            type="link"
                                            className="text-blue-700"
                                            onClick={() => {
                                                setRenewPatron(null);
                                                setRenewQuery('');
                                            }}
                                        >
                                            Đổi
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl border-2 border-amber-300/90 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-200/60">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-amber-950">
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs text-white">
                                        i
                                    </span>
                                    Quy tắc gia hạn
                                </div>
                                <ul className="mb-0 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-950/90">
                                    <li>
                                        Mỗi phiếu mượn được gia hạn tối đa <strong>1 lần</strong>.
                                    </li>
                                    <li>
                                        Sách không được gia hạn khi đã <strong>quá hạn</strong>.
                                    </li>
                                    <li>
                                        Gia hạn thêm <strong>7 ngày (1 tuần)</strong> kể từ ngày hạn cũ (theo chính sách).
                                    </li>
                                    <li>Không gia hạn nếu độc giả còn nợ phạt.</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </Card>

                <Card
                    className="rounded-2xl border border-slate-200/90 bg-white shadow-sm xl:col-span-7"
                    bodyStyle={{ padding: 20 }}
                    title={
                        mainTab === 'lap' ? (
                            <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                                <ShoppingCartOutlined />
                                Giỏ sách chờ tạo phiếu
                                <Badge count={cart.length} showZero style={{ backgroundColor: '#4f46e5' }} />
                                <span className="text-sm font-normal text-slate-500">{cart.length} cuốn</span>
                            </span>
                        ) : mainTab === 'tra' ? (
                            <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                                <FieldTimeOutlined />
                                Đã nhận trả hôm nay
                                <Badge count={returnSession.length} showZero style={{ backgroundColor: '#059669' }} />
                                <span className="text-sm font-normal text-slate-500">{returnSession.length} lượt</span>
                            </span>
                        ) : (
                            <span className="font-bold text-slate-900">
                                {renewPatron
                                    ? `Sách đang mượn của ${renewPatron.fullName || 'độc giả'}`
                                    : 'Sách đang mượn'}
                                {renewPatron ? (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                                        {renewTickets.length} cuốn
                                    </span>
                                ) : null}
                            </span>
                        )
                    }
                >
                    {mainTab === 'lap' && (
                        <>
                            {showCartQuickFill && patron ? (
                                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                                    <Button
                                        type="default"
                                        size="small"
                                        loading={cartQuickFillBusy}
                                        disabled={cartQuickFillRoom <= 0}
                                        onClick={() => fillCartFromStock({ silent: false })}
                                    >
                                        Thêm nhanh từ kho (tối đa {Math.min(CART_QUICK_FILL_MAX, cartQuickFillRoom)}{' '}
                                        cuốn)
                                    </Button>
                                    <Text type="secondary" className="max-w-md text-right text-xs">
                                        Sau khi chọn độc giả, có thể tự thêm tối đa 3 cuốn đang sẵn sàng từ kho
                                        {import.meta.env.DEV ? ' (localhost)' : ''}
                                        {!import.meta.env.DEV &&
                                        (['1', 'true'].includes(String(searchParams.get('gio') || '').trim().toLowerCase()) ||
                                            ['1', 'true'].includes(
                                                String(searchParams.get('prefillCart') || '').trim().toLowerCase(),
                                            ))
                                            ? ' — đang bật qua tham số URL.'
                                            : '.'}
                                    </Text>
                                </div>
                            ) : null}
                            {cart.length === 0 ? (
                                <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm text-slate-400">
                                    <span>Chưa có sách trong giỏ</span>
                                    {!patron ? (
                                        <span className="text-xs text-slate-500">
                                            Chọn độc giả ở bước 1 — nếu kho có sách sẵn sàng, giỏ có thể được lấp
                                            tự động (localhost hoặc thêm{' '}
                                            <code className="rounded bg-slate-200/80 px-1">?gio=1</code> vào URL).
                                        </span>
                                    ) : null}
                                </div>
                            ) : (
                                <Table
                                    size="small"
                                    pagination={false}
                                    rowKey="key"
                                    columns={cartColumns}
                                    dataSource={cart}
                                    className="circ-cart-table"
                                />
                            )}
                            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                                <div>
                                    <span className="font-semibold text-slate-700">Người mượn:</span>{' '}
                                    <span className="text-slate-600">{patron?.fullName || '—'}</span>
                                </div>
                                <div>
                                    <span className="font-semibold text-slate-700">Ngày mượn:</span>{' '}
                                    <span className="text-slate-600">{borrowDateLabel}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {mainTab === 'tra' && (
                        <div className="flex flex-col gap-4">
                            {returnSession.length === 0 ? (
                                <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                                    Chưa có lượt trả trong phiên làm việc này
                                </div>
                            ) : (
                                <ul className="max-h-[420px] space-y-3 overflow-auto pr-1">
                                    {returnSession.map((r, i) => (
                                        <li
                                            key={r.key}
                                            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100/80"
                                        >
                                            <div className={`h-11 w-11 shrink-0 rounded-lg ${ACCENT[i % ACCENT.length]}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-semibold text-slate-900">{r.bookTitle}</div>
                                                <div className="truncate text-xs text-slate-500">
                                                    {r.barcode} • {r.borrowerStudentId || '—'} • {r.timeLabel}
                                                </div>
                                            </div>
                                            {r.onTime ? (
                                                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                                    Đúng hạn
                                                </span>
                                            ) : (
                                                <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                                    Phạt {formatVnd(r.fineAmount)}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
                                <div>
                                    <span className="text-slate-600">Tổng phiếu phạt phát sinh:</span>{' '}
                                    <span className="font-semibold text-rose-600">{formatVnd(returnSummary.totalFine)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-600">Số sách nhận trả đúng hạn:</span>{' '}
                                    <span className="font-semibold text-emerald-600">
                                        {returnSummary.ok} / {returnSummary.total || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {mainTab === 'han' && (
                        <div className="flex flex-col gap-4">
                            {!renewPatron ? (
                                <Text type="secondary">Tìm và chọn độc giả để xem sách đang mượn.</Text>
                            ) : renewTickets.length === 0 ? (
                                <Text type="secondary">Không có phiếu đang mượn hoặc quá hạn.</Text>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                        <Text className="text-base text-slate-800">
                                            Sách đang mượn của <strong>{renewPatron.fullName || '—'}</strong>
                                        </Text>
                                        <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                                            {renewTickets.length} cuốn
                                        </span>
                                    </div>
                                    <ul className="max-h-[480px] space-y-4 overflow-auto pr-1">
                                        {renewTickets.map((t, idx) => {
                                            const copies = Array.isArray(t.bookCopies) ? t.bookCopies : [];
                                            const title =
                                                t.product?.title ||
                                                t.product?.nameProduct ||
                                                copies[0]?.title ||
                                                '—';
                                            const rawBarcode = copies[0]?.barcode || '';
                                            const copyLabel =
                                                rawBarcode && /^BC-/i.test(String(rawBarcode).trim())
                                                    ? rawBarcode
                                                    : rawBarcode
                                                      ? `BC-${rawBarcode}`
                                                      : '—';
                                            const authorLine =
                                                t.product?.author ||
                                                (Array.isArray(t.product?.authors) ? t.product.authors.join(', ') : null) ||
                                                t.product?.publisher ||
                                                t.product?.publishingCompany ||
                                                copies[0]?.author ||
                                                '—';
                                            const overdue =
                                                t.status === 'OVERDUE' || isCalendarOverdue(t.dueDate || t.returnDate);
                                            const blocked =
                                                renewPatronHasUnpaidFine ||
                                                overdue ||
                                                (t.renewalCount || 0) >= 1 ||
                                                t.status !== 'BORROWING';
                                            const newDue = t.dueDate || t.returnDate
                                                ? dayjs(t.dueDate || t.returnDate)
                                                      .add(policyForRenewPatron.renewExtensionDays, 'day')
                                                      .format('DD/MM/YYYY')
                                                : '—';
                                            const borrowLabel =
                                                t.borrowDate && dayjs(t.borrowDate).isValid()
                                                    ? dayjs(t.borrowDate).format('DD/MM/YYYY')
                                                    : '—';
                                            const dueLabel =
                                                t.dueDate || t.returnDate
                                                    ? dayjs(t.dueDate || t.returnDate).format('DD/MM/YYYY')
                                                    : '—';
                                            return (
                                                <li
                                                    key={t.id || idx}
                                                    className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm ring-1 sm:flex-row ${
                                                        overdue
                                                            ? 'border-rose-200/80 bg-rose-50/90 ring-rose-100/80'
                                                            : 'border-slate-100 bg-white ring-slate-100/80'
                                                    }`}
                                                >
                                                    <div
                                                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl text-white ${
                                                            overdue ? 'bg-rose-500' : 'bg-violet-500'
                                                        }`}
                                                    >
                                                        <BookOutlined />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-slate-900">{title}</div>
                                                                <div className="font-mono text-xs text-slate-500">{copyLabel}</div>
                                                                <div className="truncate text-xs text-slate-600">{authorLine}</div>
                                                            </div>
                                                            <span
                                                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                                    overdue
                                                                        ? 'bg-rose-100 text-rose-800'
                                                                        : 'bg-sky-100 text-sky-800'
                                                                }`}
                                                            >
                                                                {overdue && <WarningOutlined />}
                                                                {overdue ? 'Quá hạn' : 'Đang mượn'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                                            <span className="text-slate-400">
                                                                Ngày mượn: <span className="text-slate-400">{borrowLabel}</span>
                                                            </span>
                                                            <span
                                                                className={
                                                                    overdue ? 'font-semibold text-rose-600' : 'font-medium text-amber-600'
                                                                }
                                                            >
                                                                Hạn trả: {dueLabel}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex w-full shrink-0 flex-col justify-center sm:w-36 sm:max-w-[9.5rem]">
                                                        {blocked ? (
                                                            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-rose-200/90 bg-rose-50 px-2 py-4 text-center text-xs font-semibold leading-snug text-rose-700">
                                                                <StopOutlined className="text-lg" />
                                                                Không thể gia hạn
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={renewBusyId === t.id}
                                                                className="flex min-h-[4.5rem] w-full flex-col items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-2 py-3 text-center text-xs font-semibold leading-snug text-sky-900 transition hover:bg-sky-100 disabled:opacity-60"
                                                                onClick={() => renewOne(t.id)}
                                                            >
                                                                {renewBusyId === t.id ? (
                                                                    <span>Đang xử lý…</span>
                                                                ) : (
                                                                    <span className="px-1 text-sm font-bold leading-tight text-sky-900">
                                                                        Hạn mới: {newDue}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    <div className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
                                        <InfoCircleOutlined className="text-slate-400" />
                                        <span>Chọn sách hợp lệ ở trên để thực hiện gia hạn</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default CirculationDesk;
