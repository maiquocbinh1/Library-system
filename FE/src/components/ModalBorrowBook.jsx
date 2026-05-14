import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Form,
    Image,
    Input,
    InputNumber,
    Modal,
    Row,
    Space,
    Typography,
} from 'antd';
import { BookOutlined, CalendarOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../hooks/useStore';
import { requestCreateHistoryBook, requestGetHistoryUser } from '../config/request';
import { toast } from 'react-toastify';
import { normalizeLoanStatusKey } from '../utils/loanTicketStatus';

const { Title, Text } = Typography;

const DEFAULT_LOAN_DAYS_FALLBACK = 30;
const PATRON_TOTAL_BOOKS_SYSTEM_CAP = 8;
const DEFAULT_MAX_COPIES_PER_TITLE = 2;

async function fetchPolicyForReaderType(readerType) {
    if (!readerType) {
        return {
            loanDays: DEFAULT_LOAN_DAYS_FALLBACK,
            maxBooks: PATRON_TOTAL_BOOKS_SYSTEM_CAP,
            maxCopiesPerTitle: DEFAULT_MAX_COPIES_PER_TITLE,
        };
    }
    try {
        const { data } = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/policy/reader-type/${encodeURIComponent(readerType)}`,
        );
        const md = data?.metadata;
        const days = Number(md?.loanDays);
        const maxB = Number(md?.maxBooks);
        const perTitle = Number(md?.maxCopiesPerTitle);
        return {
            loanDays: Number.isFinite(days) ? days : DEFAULT_LOAN_DAYS_FALLBACK,
            maxBooks: Number.isFinite(maxB) && maxB > 0 ? maxB : PATRON_TOTAL_BOOKS_SYSTEM_CAP,
            maxCopiesPerTitle:
                Number.isFinite(perTitle) && perTitle >= 1 ? perTitle : DEFAULT_MAX_COPIES_PER_TITLE,
        };
    } catch {
        return {
            loanDays: DEFAULT_LOAN_DAYS_FALLBACK,
            maxBooks: PATRON_TOTAL_BOOKS_SYSTEM_CAP,
            maxCopiesPerTitle: DEFAULT_MAX_COPIES_PER_TITLE,
        };
    }
}

function sumActiveBorrowUnits(loans) {
    let s = 0;
    for (const L of loans || []) {
        const k = normalizeLoanStatusKey(L?.status);
        if (k === 'PENDING_APPROVAL' || k === 'BORROWING' || k === 'OVERDUE') {
            s += Number(L.quantity) || 0;
        }
    }
    return s;
}

function effectiveBorrowCapFromPolicyMax(policyMaxBooks) {
    const p = Number(policyMaxBooks);
    const policyCap = Number.isFinite(p) && p > 0 ? p : PATRON_TOTAL_BOOKS_SYSTEM_CAP;
    return Math.min(PATRON_TOTAL_BOOKS_SYSTEM_CAP, policyCap);
}

function effectiveMaxCopiesPerTitleFromPolicy(policyMaxCopiesPerTitle) {
    const n = Number(policyMaxCopiesPerTitle);
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_COPIES_PER_TITLE;
}

function loanBookIdKey(L) {
    const b = L?.bookId ?? L?.product?.id ?? L?.product?._id;
    return b != null ? String(b) : '';
}

function sumActiveBorrowUnitsForBook(loans, bookIdStr) {
    const bid = String(bookIdStr || '');
    if (!bid) return 0;
    let s = 0;
    for (const L of loans || []) {
        if (loanBookIdKey(L) !== bid) continue;
        const k = normalizeLoanStatusKey(L?.status);
        if (k === 'PENDING_APPROVAL' || k === 'BORROWING' || k === 'OVERDUE') {
            s += Number(L.quantity) || 0;
        }
    }
    return s;
}

function profileMsv(u) {
    const stu = String(u?.studentId ?? '').trim();
    if (stu && stu !== '0') return stu;
    const leg = String(u?.idStudent ?? '').trim();
    if (leg && leg !== '0') return leg;
    const rc = String(u?.readerCode ?? '').trim();
    if (rc && rc !== '0') return rc;
    return '';
}

function profilePhone(u) {
    return String(u?.phone ?? u?.phoneNumber ?? '').trim();
}

function profileComplete(u) {
    if (!u) return false;
    const name = String(u.fullName || '').trim();
    return Boolean(name && profileMsv(u));
}

function ModalBorrowBook({ visible, onCancel, bookData }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [loanDaysMax, setLoanDaysMax] = useState(DEFAULT_LOAN_DAYS_FALLBACK);
    const [policyMaxBooks, setPolicyMaxBooks] = useState(PATRON_TOTAL_BOOKS_SYSTEM_CAP);
    const [policyMaxCopiesPerTitle, setPolicyMaxCopiesPerTitle] = useState(DEFAULT_MAX_COPIES_PER_TITLE);
    const [activeBorrowQty, setActiveBorrowQty] = useState(0);
    const [userLoans, setUserLoans] = useState([]);
    const { dataUser } = useStore();

    const today = useMemo(() => dayjs(), []);

    const minReturnDate = useMemo(() => today.add(1, 'day'), [today]);
    const maxReturnDate = useMemo(() => today.add(loanDaysMax, 'day'), [today, loanDaysMax]);

    const effectiveBorrowCap = useMemo(
        () => effectiveBorrowCapFromPolicyMax(policyMaxBooks),
        [policyMaxBooks],
    );
    const effectivePerTitleCap = useMemo(
        () => effectiveMaxCopiesPerTitleFromPolicy(policyMaxCopiesPerTitle),
        [policyMaxCopiesPerTitle],
    );
    const activeSameTitleQty = useMemo(
        () => sumActiveBorrowUnitsForBook(userLoans, bookData?.id),
        [userLoans, bookData?.id],
    );
    const remainingSlots = Math.max(0, effectiveBorrowCap - activeBorrowQty);
    const remainingForTitle = Math.max(0, effectivePerTitleCap - activeSameTitleQty);
    const maxQuantityThisRequest = Math.min(Number(bookData?.stock) || 0, remainingSlots, remainingForTitle);

    const bookImageSrc = bookData?.image?.startsWith('http')
        ? bookData.image
        : `${import.meta.env.VITE_API_URL_IMAGE}/${bookData?.image || ''}`;

    const loadPolicyAndBorrowCount = useCallback(async () => {
        const [pol, hist] = await Promise.all([
            fetchPolicyForReaderType(dataUser?.readerType),
            requestGetHistoryUser().catch(() => ({ metadata: [] })),
        ]);
        setLoanDaysMax(pol.loanDays);
        setPolicyMaxBooks(pol.maxBooks);
        setPolicyMaxCopiesPerTitle(pol.maxCopiesPerTitle);
        const list = Array.isArray(hist?.metadata) ? hist.metadata : [];
        setUserLoans(list);
        setActiveBorrowQty(sumActiveBorrowUnits(list));
    }, [dataUser?.readerType]);

    useEffect(() => {
        if (!visible) return;
        if (dataUser) {
            loadPolicyAndBorrowCount();
        } else {
            setLoanDaysMax(DEFAULT_LOAN_DAYS_FALLBACK);
            setPolicyMaxBooks(PATRON_TOTAL_BOOKS_SYSTEM_CAP);
            setPolicyMaxCopiesPerTitle(DEFAULT_MAX_COPIES_PER_TITLE);
            setActiveBorrowQty(0);
            setUserLoans([]);
        }
    }, [visible, dataUser, loadPolicyAndBorrowCount]);

    useEffect(() => {
        if (!visible || !dataUser) return;
        const qInit = maxQuantityThisRequest >= 1 ? Math.min(1, maxQuantityThisRequest) : 1;
        form.setFieldsValue({
            quantity: maxQuantityThisRequest >= 1 ? qInit : undefined,
            returnDate: minReturnDate,
        });
    }, [visible, dataUser, form, minReturnDate, maxQuantityThisRequest]);

    const handleSubmit = async (values) => {
        if (!dataUser) {
            toast.error('Bạn cần đăng nhập để đặt mượn sách.');
            return;
        }
        if (!profileComplete(dataUser)) {
            toast.warning('Bạn đã thiếu thông tin, vui lòng cập nhật.');
            return;
        }

        const q = Number(values.quantity);
        if (!Number.isFinite(q) || q < 1) {
            toast.error('Vui lòng nhập số lượng hợp lệ.');
            return;
        }
        if (activeBorrowQty + q > effectiveBorrowCap) {
            toast.error(
                `Không mượn được: bạn đang mượn/chờ duyệt ${activeBorrowQty} cuốn; tối đa ${effectiveBorrowCap} cuốn.`,
            );
            return;
        }
        if (activeSameTitleQty + q > effectivePerTitleCap) {
            toast.error(
                `Không mượn được: với đầu sách này bạn đang có ${activeSameTitleQty} cuốn; tối đa ${effectivePerTitleCap} cuốn cùng lúc.`,
            );
            return;
        }
        if (q > maxQuantityThisRequest) {
            toast.error('Số lượng vượt quá phần còn được phép mượn hoặc quá tồn kho.');
            return;
        }

        setLoading(true);
        try {
            const borrowData = {
                fullName: String(dataUser.fullName || '').trim(),
                address: String(dataUser.address || '').trim(),
                phoneNumber: profilePhone(dataUser) || '',
                quantity: values.quantity,
                bookId: bookData?.id,
                borrowDate: today.format('YYYY-MM-DD'),
            };

            await requestCreateHistoryBook(borrowData);
            toast.success(
                'Đã ghi nhận yêu cầu. Thư viện sẽ xem xét; khi được xác nhận bạn sẽ nhận thông báo kèm mã bản sao để đến quầy lấy sách.',
            );
            form.resetFields();
            onCancel();
        } catch (error) {
            console.error('Error submitting borrow request:', error);
            const msg = String(error?.response?.data?.message || '');
            if (/MSV|họ tên|hồ sơ|chưa có MSV/i.test(msg)) {
                toast.warning('Bạn đã thiếu thông tin, vui lòng cập nhật.');
            } else if (/Không mượn được|vượt quá.*cuốn|cùng lúc|mỗi đầu sách|đầu sách «/i.test(msg)) {
                toast.error(msg || 'Không mượn được: đã vượt quá số cuốn cho phép.');
            } else if (/phạt|nợ|thanh toán/i.test(msg)) {
                toast.warning(msg || 'Bạn phải thanh toán nợ phạt trước khi mượn sách mới.');
            } else {
                toast.error(msg || 'Đăng ký mượn sách thất bại.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    const validateReturnDate = (_, value) => {
        if (!value) {
            return Promise.reject(new Error('Vui lòng chọn ngày trả dự kiến!'));
        }
        if (value.isBefore(minReturnDate, 'day')) {
            return Promise.reject(new Error('Ngày trả phải sau ngày mượn ít nhất 1 ngày!'));
        }
        if (value.isAfter(maxReturnDate, 'day')) {
            return Promise.reject(new Error(`Theo nội quy, khoảng mượn tối đa ${loanDaysMax} ngày (từ hôm nay)!`));
        }
        return Promise.resolve();
    };

    const isSubmitDisabled =
        !bookData ||
        bookData.stock <= 0 ||
        loading ||
        !profileComplete(dataUser) ||
        maxQuantityThisRequest < 1;
    const bookTitle = bookData?.nameProduct || bookData?.title;
    const msv = profileMsv(dataUser) || '—';

    return (
        <Modal
            title={
                <div className="flex items-center space-x-2">
                    <BookOutlined className="text-blue-600" />
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Đăng ký mượn sách
                    </span>
                </div>
            }
            open={visible}
            onCancel={handleCancel}
            footer={null}
            width={800}
            className="borrow-book-modal"
            destroyOnHidden
        >
            <div className="space-y-6">
                {bookData && (
                    <Card className="border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <Title level={4} className="mb-4 text-gray-800">
                            📚 Thông tin sách
                        </Title>
                        <Row gutter={16} align="middle">
                            <Col xs={24} sm={8} className="flex justify-center">
                                <Image
                                    src={bookImageSrc}
                                    alt={bookTitle}
                                    width={120}
                                    height={160}
                                    className="rounded-lg object-cover shadow-md"
                                    preview={false}
                                    fallback="/placeholder-avatar.png"
                                />
                            </Col>
                            <Col xs={24} sm={16}>
                                <Space direction="vertical" size="small" className="w-full">
                                    <Title level={5} className="mb-2 text-gray-800">
                                        {bookTitle}
                                    </Title>
                                    <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                                        <span>
                                            Nhà xuất bản: <Text strong>{bookData.publisher}</Text>
                                        </span>
                                        <span>
                                            Số trang: <Text strong>{bookData.pages} trang</Text>
                                        </span>
                                        <span>
                                            Năm XB: <Text strong>{bookData.publishYear}</Text>
                                        </span>
                                        <span>
                                            Còn lại:{' '}
                                            <Text strong className="text-green-600">
                                                {bookData.stock} quyển
                                            </Text>
                                        </span>
                                    </div>
                                </Space>
                            </Col>
                        </Row>
                    </Card>
                )}

                <Divider className="my-6" />

                <Card className="border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <Title level={4} className="mb-2 text-gray-800">
                        👤 Thông tin người mượn
                    </Title>

                    {!profileComplete(dataUser) && (
                        <Alert
                            type="warning"
                            showIcon
                            className="mb-4"
                            message="Hồ sơ chưa đủ thông tin"
                            description={
                                <span>
                                    Vui lòng bổ sung <strong>họ tên</strong> và <strong>MSV</strong> (mã sinh viên) tại{' '}
                                    <Link to="/infoUser" className="font-semibold text-blue-700 underline">
                                        Trang cá nhân
                                    </Link>{' '}
                                    trước khi đặt mượn.
                                </span>
                            }
                        />
                    )}

                    {dataUser && profileComplete(dataUser) && (
                        <p className="mb-3 text-base text-slate-800">
                            <span className="font-semibold">{dataUser.fullName || '—'}</span>
                            <span className="mx-2 text-slate-400">;</span>
                            <span className="font-mono font-medium text-slate-700">{msv}</span>
                        </p>
                    )}

                    {profileComplete(dataUser) && maxQuantityThisRequest < 1 && remainingSlots < 1 && (
                        <Alert
                            type="warning"
                            showIcon
                            className="mb-4"
                            message="Không thể đặt mượn thêm"
                            description={`Bạn đang mượn/chờ duyệt ${activeBorrowQty} cuốn (tối đa ${effectiveBorrowCap} cuốn). Vui lòng trả sách hoặc chờ duyệt xong trước khi đặt thêm.`}
                        />
                    )}

                    {profileComplete(dataUser) &&
                        bookData &&
                        maxQuantityThisRequest < 1 &&
                        remainingSlots >= 1 &&
                        remainingForTitle < 1 && (
                            <Alert
                                type="warning"
                                showIcon
                                className="mb-4"
                                message="Đã đủ số cuốn của đầu sách này"
                                description={`Với đầu sách đang chọn, bạn đã mượn/chờ duyệt ${activeSameTitleQty} cuốn (tối đa ${effectivePerTitleCap} cuốn cùng lúc theo chính sách). Trả bản hoặc hủy phiếu chờ duyệt để đặt thêm.`}
                            />
                        )}

                    <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} preserve={false}>
                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="quantity"
                                    label={`Số lượng (tối đa ${Math.max(0, maxQuantityThisRequest)} cuốn — tồn ${bookData?.stock ?? 0}, chính sách tối đa ${effectivePerTitleCap} cuốn/đầu sách)`}
                                    rules={[{ required: true, message: 'Vui lòng nhập số lượng!' }]}
                                >
                                    <InputNumber
                                        min={maxQuantityThisRequest >= 1 ? 1 : 0}
                                        max={maxQuantityThisRequest >= 1 ? maxQuantityThisRequest : 0}
                                        disabled={maxQuantityThisRequest < 1}
                                        placeholder="Số lượng"
                                        addonBefore={<BookOutlined />}
                                        className="h-10 w-full [&_.ant-input-number-input]:!h-10"
                                    />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider className="my-4" />

                        <Title level={5} className="mb-4 text-gray-800">
                            📅 Thời gian (dự kiến)
                        </Title>

                        <Row gutter={16}>
                            <Col xs={24} sm={12}>
                                <Form.Item label="Ngày gửi yêu cầu">
                                    <Input
                                        value={today.format('DD/MM/YYYY')}
                                        disabled
                                        className="h-10 bg-gray-100"
                                        prefix={<CalendarOutlined />}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item
                                    name="returnDate"
                                    label={`Ngày trả dự kiến (tối đa ${loanDaysMax} ngày từ hôm nay)`}
                                    rules={[{ validator: validateReturnDate }]}
                                >
                                    <DatePicker
                                        className="h-10 w-full"
                                        placeholder="Chọn ngày trả dự kiến"
                                        format="DD/MM/YYYY"
                                        showToday={false}
                                        disabledDate={(current) =>
                                            current &&
                                            (current.isBefore(minReturnDate, 'day') ||
                                                current.isAfter(maxReturnDate, 'day'))
                                        }
                                    />
                                </Form.Item>
                            </Col>
                        </Row>

                        <div className="flex justify-end space-x-3 pt-4">
                            <Button onClick={handleCancel} className="h-10 px-6">
                                Hủy bỏ
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                className="h-10 border-none bg-gradient-to-r from-blue-500 to-indigo-600 px-6 hover:from-blue-600 hover:to-indigo-700"
                                disabled={isSubmitDisabled}
                            >
                                {loading ? 'Đang xử lý...' : '📚 Xác nhận mượn'}
                            </Button>
                        </div>
                    </Form>
                </Card>
            </div>
        </Modal>
    );
}

export default ModalBorrowBook;
