import { useEffect } from 'react';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { requestGetOneProduct } from '../config/request';
import { useState } from 'react';
import { message } from 'antd';

import ModalBorrowBook from '../components/ModalBuyBook';
import { useStore } from '../hooks/useStore';

function DetailProduct() {
    const { id } = useParams();
    const [dataProduct, setDataProduct] = useState({});
    const [visible, setVisible] = useState(false);
    const navigate = useNavigate();

    const { dataUser } = useStore();
    const productImageSrc = (() => {
        const raw = String(dataProduct?.image || '').trim();
        if (!raw) return '/placeholder-book.png';
        if (raw.startsWith('http')) return raw;
        return `${import.meta.env.VITE_API_URL_IMAGE}/${raw}`;
    })();

    const normalizeProduct = (product) => {
        if (!product || typeof product !== 'object') return {};
        const publishYear = product.publishYear ?? product.year ?? product.publicationYear ?? product.publish_year;
        const pages = product.pages ?? product.pageCount ?? product.totalPages ?? product.page_count;
        const language = product.language ?? product.lang ?? product.bookLanguage;
        const publishingCompany = product.publishingCompany ?? product.publishing_company ?? product.releaseCompany;
        const publisher = product.publisher ?? product.author ?? product.authors;
        const covertType = product.covertType ?? product.coverType ?? product.cover_type;

        return {
            ...product,
            id: product.id || product.mysqlId || (product._id ? String(product._id) : undefined),
            publishYear,
            pages,
            language,
            publishingCompany,
            publisher,
            covertType,
        };
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (!id) {
                    message.error('Không tìm thấy mã sách hợp lệ');
                    navigate('/categories');
                    return;
                }
                const res = await requestGetOneProduct(id);
                if (!res?.metadata) {
                    setDataProduct(null);
                    message.error('Sách không tồn tại hoặc đã bị xóa');
                    navigate('/categories');
                    return;
                }
                const product = normalizeProduct(res?.metadata);
                setDataProduct(product);
            } catch {
                message.error('Không thể tải chi tiết sách');
            }
        };
        fetchData();
    }, [id, navigate]);

    const showModal = async () => setVisible(true);

    if (!dataUser) return <div>loading....</div>;
    if (dataProduct === null) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20">
                <nav className="flex items-center space-x-2 text-sm text-gray-500">
                    <Link to={'/'}>Trang chủ</Link>
                    <span>/</span>
                    <Link to={'/categories'}>Sách</Link>
                    <span>/</span>
                    <span className="text-gray-700">Chi tiết sách</span>
                </nav>
            </div>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6">
                        <div className="flex justify-center">
                            <div className="w-full max-w-xs">
                                <img
                                    src={productImageSrc}
                                    alt={dataProduct.nameProduct}
                                    className="w-full h-auto rounded-lg shadow-md"
                                    onError={(e) => {
                                        e.currentTarget.src = '/placeholder-book.png';
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">{dataProduct.nameProduct}</h1>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="text-base font-semibold text-gray-800 mb-3">Thông tin chi tiết</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Nhà xuất bản:</span>
                                        <span className="font-medium text-gray-800">{String(dataProduct.publisher || '-')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Công ty phát hành:</span>
                                        <span className="font-medium text-gray-800">
                                            {String(dataProduct.publishingCompany || '-')}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Loại bìa:</span>
                                        <span className="font-medium text-gray-800">
                                            {dataProduct.covertType === 'hard' ? 'Bìa cứng' : 'Bìa mềm'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Số trang:</span>
                                        <span className="font-medium text-gray-800">
                                            {Number.isFinite(Number(dataProduct.pages)) ? `${Number(dataProduct.pages)} trang` : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Ngôn ngữ:</span>
                                        <span className="font-medium text-gray-800">{String(dataProduct.language || '-')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Năm xuất bản:</span>
                                        <span className="font-medium text-gray-800">
                                            {Number.isFinite(Number(dataProduct.publishYear)) ? String(dataProduct.publishYear) : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                <span className="text-gray-600 text-sm">Số lượng : </span>
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                    {dataProduct.stock} quyển
                                </span>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={showModal}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
                                >
                                    Mượn ngay
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Mô tả sách</h2>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                                {String(dataProduct.description || '').trim() || 'Chưa có mô tả.'}
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <footer>
                <Footer />
            </footer>
            <ModalBorrowBook visible={visible} onCancel={() => setVisible(false)} bookData={dataProduct} />
        </div>
    );
}

export default DetailProduct;
