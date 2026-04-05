import { useEffect } from 'react';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { Link, useParams } from 'react-router-dom';
import { requestGetOneProduct } from '../config/request';
import { useState } from 'react';

import ModalBorrowBook from '../components/ModalBuyBook';
import { useStore } from '../hooks/useStore';

function DetailProduct() {
    const { id } = useParams();
    const [dataProduct, setDataProduct] = useState({});
    const [visible, setVisible] = useState(false);

    const { dataUser } = useStore();

    useEffect(() => {
        const fetchData = async () => {
            const res = await requestGetOneProduct(id);
            setDataProduct(res.metadata);
        };
        fetchData();
    }, [id]);

    const showModal = async () => {
        setVisible(true);
    };

    if (!dataUser) return <div>loading....</div>;

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <nav className="flex items-center space-x-2 text-sm text-gray-500">
                    <Link to={'/'}>Trang chủ</Link>
                    <span>/</span>
                    <Link to={'/product'}>Sách</Link>
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
                                    src={`${import.meta.env.VITE_API_URL_IMAGE}/${dataProduct.image}`}
                                    alt={dataProduct.nameProduct}
                                    className="w-full h-auto rounded-lg shadow-md"
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
                                        <span className="font-medium text-gray-800">{dataProduct.publisher}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Công ty phát hành:</span>
                                        <span className="font-medium text-gray-800">
                                            {dataProduct.publishingCompany}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Loại bìa:</span>
                                        <span className="font-medium text-gray-800">
                                            {dataProduct.coverType === 'hard' ? 'Bìa cứng' : 'Bìa mềm'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Số trang:</span>
                                        <span className="font-medium text-gray-800">{dataProduct.pages} trang</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Ngôn ngữ:</span>
                                        <span className="font-medium text-gray-800">{dataProduct.language}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Năm xuất bản:</span>
                                        <span className="font-medium text-gray-800">{dataProduct.publishYear}</span>
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
                            <p className="text-gray-700 leading-relaxed">{dataProduct.description}</p>
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
