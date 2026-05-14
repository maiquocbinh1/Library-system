import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { requestGetPolicies } from '../config/request';
import { readerTypeLabel } from '../constants/readerTypes';

const FALLBACK = {
    maxBooks: 8,
    maxCopiesPerTitle: 2,
    loanDays: 14,
    renewExtensionDays: 7,
    overdueFinePerDay: 1000,
};

function Rules() {
    const [policies, setPolicies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError(false);
            try {
                const res = await requestGetPolicies();
                const list = Array.isArray(res?.metadata) ? res.metadata : [];
                if (!cancelled) setPolicies(list);
            } catch {
                if (!cancelled) {
                    setPolicies([]);
                    setLoadError(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const primary = useMemo(() => {
        const p = policies.find((x) => x.readerType === 'SinhVien_ChinhQuy') || policies[0];
        if (!p) return { ...FALLBACK, readerType: 'SinhVien_ChinhQuy' };
        return {
            readerType: p.readerType || 'SinhVien_ChinhQuy',
            maxBooks: Number(p.maxBooks) > 0 ? Number(p.maxBooks) : FALLBACK.maxBooks,
            maxCopiesPerTitle: Number(p.maxCopiesPerTitle) >= 1 ? Number(p.maxCopiesPerTitle) : FALLBACK.maxCopiesPerTitle,
            loanDays: Number(p.loanDays) > 0 ? Number(p.loanDays) : FALLBACK.loanDays,
            renewExtensionDays: Number(p.renewExtensionDays) > 0 ? Number(p.renewExtensionDays) : FALLBACK.renewExtensionDays,
            overdueFinePerDay: Number(p.overdueFinePerDay) >= 0 ? Number(p.overdueFinePerDay) : FALLBACK.overdueFinePerDay,
        };
    }, [policies]);

    const fineStr = `${Number(primary.overdueFinePerDay).toLocaleString('vi-VN')} VNĐ`;

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />
            <main className="w-full px-4 pb-12 pt-24 sm:px-6 lg:px-10">
                <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h1 className="text-3xl font-bold text-gray-900">Quy định sử dụng Thư viện</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Nội dung mượn trả và mức phạt được căn cứ theo{' '}
                        <strong>chính sách đang cấu hình trên hệ thống</strong> (loại độc giả:{' '}
                        {readerTypeLabel(primary.readerType)}).
                    </p>

                    {loadError && (
                        <Alert
                            type="warning"
                            showIcon
                            className="mt-4"
                            message="Không tải được chính sách từ máy chủ"
                            description="Đang hiển thị mức mặc định thường dùng. Vui lòng thử lại sau hoặc hỏi thủ thư."
                        />
                    )}

                    {loading ? (
                        <div className="mt-10 flex justify-center py-12">
                            <Spin tip="Đang tải chính sách…" />
                        </div>
                    ) : (
                        <div className="mt-6 space-y-6 leading-relaxed text-gray-700">
                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 1: Đối tượng &amp; Giới hạn mượn</h2>
                                <p className="mt-2">
                                    Độc giả dùng tài khoản đã xác thực (MSV / mã thẻ độc giả theo hồ sơ). Tổng số ấn phẩm được phép
                                    <strong> đang mượn, chờ thư viện duyệt yêu cầu hoặc chờ đến quầy nhận sách (đặt online)</strong>{' '}
                                    không vượt quá <strong>{primary.maxBooks} cuốn</strong> cùng lúc (theo chính sách loại bạn đọc).
                                </p>
                                <p className="mt-2">
                                    Với <strong>cùng một đầu sách</strong>, tối đa <strong>{primary.maxCopiesPerTitle} cuốn</strong>{' '}
                                    trong các trạng thái trên; không vượt quá số bản sách còn trong kho.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 2: Thời hạn mượn &amp; Gia hạn</h2>
                                <p className="mt-2">
                                    Thời gian mượn một phiếu: <strong>{primary.loanDays} ngày</strong> kể từ ngày hệ thống ghi nhận
                                    xuất kho (mượn tại quầy hoặc hoàn tất nhận sách sau khi đặt mượn online).
                                </p>
                                <p className="mt-2">
                                    Mỗi phiếu được gia hạn <strong>tối đa 1 lần</strong>, thêm <strong>{primary.renewExtensionDays} ngày</strong>{' '}
                                    tính từ hạn trả hiện tại, khi chưa quá hạn và không còn nợ phạt chưa thanh toán (theo quy trình trên
                                    hệ thống).
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 3: Trễ hạn, phạt &amp; khóa mượn</h2>
                                <p className="mt-2">
                                    Sách trả sau ngày hạn ghi trên phiếu được tính phạt quá hạn:{' '}
                                    <strong>{fineStr} / ngày / cuốn</strong> (theo cấu hình hiện tại). Khi còn nợ phạt chưa thanh toán,
                                    hệ thống có thể từ chối mượn thêm cho đến khi hoàn tất.
                                </p>
                                <p className="mt-2">
                                    Làm mất hoặc hỏng sách: bồi thường theo quy định nội bộ thư viện và hướng dẫn của thủ thư (ngoài
                                    phạt trễ hạn tự động trên hệ thống).
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 4: Đặt mượn online</h2>
                                <p className="mt-2">
                                    Gửi yêu cầu mượn trên web: hệ thống tạo phiếu <strong>chờ thư viện xác nhận</strong>, chưa tính là
                                    đã mượn và chưa giữ bản sao cho đến khi thư viện xác nhận yêu cầu.
                                </p>
                                <p className="mt-2">
                                    Sau khi thư viện chấp nhận: bạn nhận thông báo, sách được gán mã bản sao và chuyển trạng thái{' '}
                                    <strong>chờ đến quầy lấy sách</strong>. Vui lòng đến <strong>quầy mượn — trả sách</strong> để hoàn
                                    tất lập phiếu và nhận sách; khi quầy xác nhận xong, phiếu chuyển sang <strong>đang mượn</strong> và
                                    áp dụng hạn trả như Điều 2.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 5: Trách nhiệm của độc giả</h2>
                                <p className="mt-2">
                                    Giữ gìn sách, không viết vẽ, không làm rách trang. Nếu phát hiện sách lỗi trước khi mượn, báo
                                    ngay thủ thư để ghi nhận tình trạng.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 6: Nội quy không gian đọc</h2>
                                <p className="mt-2">
                                    Giữ yên lặng trong khu vực đọc; không phát âm thanh lớn; không ăn uống trong phòng đọc. Điện
                                    thoại nên để chế độ rung để không ảnh hưởng người khác.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 7: Sử dụng tài khoản</h2>
                                <p className="mt-2">
                                    Tài khoản thư viện là tài sản cá nhân, không cho mượn thay. Mọi giao dịch từ tài khoản do chủ tài
                                    khoản chịu trách nhiệm.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold text-gray-900">Điều 8: Hỗ trợ &amp; khiếu nại</h2>
                                <p className="mt-2">
                                    Thắc mắc về lịch sử mượn trả, phạt hoặc lỗi hệ thống: liên hệ thư viện trong giờ hành chính để
                                    được hỗ trợ.
                                </p>
                            </section>

                            {policies.length > 1 && (
                                <section className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                                    <strong className="text-gray-800">Các loại chính sách trong hệ thống:</strong>
                                    <ul className="mt-2 list-disc space-y-1 pl-5">
                                        {policies.map((p) => (
                                            <li key={String(p.id || p._id || p.readerType)}>
                                                {readerTypeLabel(p.readerType)} — tối đa {Number(p.maxBooks) || '—'} cuốn, cùng đầu
                                                sách tối đa {Number(p.maxCopiesPerTitle) || '—'} cuốn, {Number(p.loanDays) || '—'} ngày
                                                mượn, phạt trễ {Number(p.overdueFinePerDay ?? 0).toLocaleString('vi-VN')} VNĐ/ngày/cuốn.
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </div>
                    )}
                </article>
            </main>
            <Footer />
        </div>
    );
}

export default Rules;
