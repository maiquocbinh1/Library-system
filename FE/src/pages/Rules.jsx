import Header from '../components/Header';
import Footer from '../components/Footer';

function Rules() {
    return (
        <div className="min-h-screen bg-gray-50">
            <Header />
            <main className="w-full px-4 pb-12 pt-24 sm:px-6 lg:px-10">
                <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h1 className="text-3xl font-bold text-gray-900">Quy định sử dụng Thư viện</h1>

                    <div className="mt-6 space-y-6 text-gray-700 leading-relaxed">
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 1: Đối tượng & Thủ tục mượn sách</h2>
                            <p className="mt-2">
                                Sinh viên cần dùng thẻ sinh viên hoặc mã độc giả đã được xác thực để mượn sách. Mỗi lần mượn tối đa
                                3 cuốn.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 2: Thời hạn mượn & Gia hạn</h2>
                            <p className="mt-2">
                                Thời gian mượn tối đa là 14 ngày. Có thể gia hạn thêm 1 lần (7 ngày) nếu sách không có người xếp
                                hàng chờ.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 3: Xử lý vi phạm</h2>
                            <p className="mt-2">
                                Trả sách quá hạn sẽ bị khóa tài khoản mượn trong 1 tháng. Làm mất hoặc hỏng sách phải đền bù 200%
                                giá trị cuốn sách.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 4: Trách nhiệm của độc giả</h2>
                            <p className="mt-2">
                                Độc giả có trách nhiệm giữ gìn sách, không viết, vẽ hoặc làm rách trang sách. Khi phát hiện sách bị
                                lỗi trước khi mượn, cần báo ngay cho thủ thư để được xác nhận tình trạng.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 5: Quy định đặt chỗ sách</h2>
                            <p className="mt-2">
                                Với các đầu sách đang hết, độc giả có thể đăng ký xếp hàng chờ trên hệ thống. Thời gian giữ sách sau
                                khi có thông báo là 48 giờ, quá thời hạn hệ thống sẽ chuyển cho người kế tiếp.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 6: Nội quy không gian đọc</h2>
                            <p className="mt-2">
                                Giữ yên lặng trong khu vực đọc, không sử dụng thiết bị phát âm thanh lớn, không ăn uống trong phòng
                                đọc. Điện thoại cần để chế độ rung để không ảnh hưởng tới người xung quanh.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 7: Sử dụng tài khoản hệ thống</h2>
                            <p className="mt-2">
                                Tài khoản thư viện là tài sản cá nhân, không chia sẻ cho người khác mượn thay. Mọi giao dịch phát sinh
                                từ tài khoản sẽ được xem là do chủ tài khoản chịu trách nhiệm.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900">Điều 8: Hỗ trợ và khiếu nại</h2>
                            <p className="mt-2">
                                Mọi thắc mắc về lịch sử mượn trả, tình trạng sách hoặc các lỗi hệ thống vui lòng liên hệ bộ phận thư
                                viện trong giờ hành chính để được hỗ trợ và xử lý kịp thời.
                            </p>
                        </section>
                    </div>
                </article>
            </main>
            <Footer />
        </div>
    );
}

export default Rules;
