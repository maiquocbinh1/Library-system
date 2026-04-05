function Footer() {
    return (
        <footer className="bg-gray-800 text-white mt-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                        <h3 className="text-lg font-semibold mb-4 flex items-center">
                            📚 Thư Viện
                        </h3>
                        <p className="text-gray-300 text-sm leading-relaxed">
                            Hệ thống quản lý thư viện hiện đại, cung cấp dịch vụ mượn sách trực tuyến 
                            và quản lý tài liệu hiệu quả.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-4">Liên kết nhanh</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <a href="#" className="text-gray-300 hover:text-white transition-colors">
                                    Trang chủ
                                </a>
                            </li>
                            <li>
                                <a href="#" className="text-gray-300 hover:text-white transition-colors">
                                    Danh mục sách
                                </a>
                            </li>
                            <li>
                                <a href="#" className="text-gray-300 hover:text-white transition-colors">
                                    Quy định mượn sách
                                </a>
                            </li>
                            <li>
                                <a href="#" className="text-gray-300 hover:text-white transition-colors">
                                    Liên hệ
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-4">Liên hệ</h3>
                        <div className="space-y-2 text-sm text-gray-300">
                            <p>📍 123 Đường ABC, Quận 1, TP.HCM</p>
                            <p>📞 (028) 1234 5678</p>
                            <p>✉️ info@thuvien.edu.vn</p>
                            <p>🕒 Thứ 2 - Chủ nhật: 8:00 - 20:00</p>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-700 mt-8 pt-6 text-center">
                    <p className="text-gray-400 text-sm">
                        © 2024 Hệ thống Quản lý Thư viện. Tất cả quyền được bảo lưu.
                    </p>
                </div>
            </div>
        </footer>
    );
}

export default Footer;
