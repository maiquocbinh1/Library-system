import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faUser, faCalendar, faLanguage, faBuilding } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';

import ModalBorrowBook from '../components/ModalBorrowBook';
import { useState } from 'react';

function CardBody({ data }) {
    const publishYear = data?.publishYear ?? data?.year ?? data?.publicationYear ?? '';
    const pages = data?.pages ?? data?.pageCount ?? data?.totalPages ?? '';
    const covertType = data?.covertType ?? data?.coverType ?? data?.cover_type;
    const [visible, setVisible] = useState(false);
    const [bookData, setBookData] = useState({});

    const showModal = async (data) => {
        setBookData(data);
        setVisible(true);
    };

    const onCancel = () => {
        setVisible(false);
    };

    const imageSrc = (() => {
        const raw = String(data?.image || '').trim();
        if (!raw) return '/placeholder-book.png';
        if (raw.startsWith('http')) return raw;
        return `${import.meta.env.VITE_API_URL_IMAGE}/${raw}`;
    })();

    return (
        <div className="h-full bg-gradient-to-br from-white to-blue-50/30 rounded-xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-300 hover:from-blue-50/50 hover:to-purple-50/30 transition-all duration-300 overflow-hidden group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            <Link to={`/product/${data.id}`}>
                <div className="relative overflow-hidden">
                    <img
                        src={imageSrc}
                        className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                        alt={data.nameProduct}
                        onError={(e) => {
                            e.currentTarget.src = '/placeholder-book.png';
                        }}
                    />
                    <div className="absolute top-3 right-3">
                        <span
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm ${
                                data.stock > 0
                                    ? 'bg-gradient-to-r from-emerald-400 to-green-500 text-white border border-emerald-300/50'
                                    : 'bg-gradient-to-r from-red-400 to-pink-500 text-white border border-red-300/50'
                            }`}
                        >
                            {data.stock > 0 ? `✨ Còn ${data.stock} quyển` : '❌ Hết hàng'}
                        </span>
                    </div>
                    <div className="absolute top-3 left-3">
                        <span
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm ${
                                covertType === 'hard'
                                    ? 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white border border-blue-300/50'
                                    : 'bg-gradient-to-r from-orange-400 to-amber-500 text-white border border-orange-300/50'
                            }`}
                        >
                            {covertType === 'hard' ? '📘 Bìa cứng' : '📙 Bìa mềm'}
                        </span>
                    </div>
                </div>
            </Link>

            <div className="p-4 flex flex-col h-[calc(100%-14rem)] relative z-10">
                <Link to={`/product/${data.id}`}>
                    <h6 className="text-gray-800 font-bold mb-3 text-sm leading-tight hover:text-transparent hover:bg-gradient-to-r hover:from-blue-600 hover:to-purple-600 hover:bg-clip-text transition-all duration-300 line-clamp-2">
                        {data.nameProduct}
                    </h6>
                </Link>

                <div className="space-y-2.5 mb-4 flex-grow">
                    <div className="flex items-center text-xs text-gray-600 bg-gradient-to-r from-blue-50 to-indigo-50 p-2 rounded-lg border border-blue-100/50">
                        <FontAwesomeIcon icon={faUser} className="mr-2 w-3 text-blue-500" />
                        <span className="truncate font-medium">{data.publisher}</span>
                    </div>

                    {data.publishingCompany && (
                        <div className="flex items-center text-xs text-gray-600 bg-gradient-to-r from-purple-50 to-pink-50 p-2 rounded-lg border border-purple-100/50">
                            <FontAwesomeIcon icon={faBuilding} className="mr-2 w-3 text-purple-500" />
                            <span className="truncate font-medium">{data.publishingCompany}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center bg-gradient-to-r from-green-50 to-emerald-50 px-2 py-1.5 rounded-lg border border-green-100/50">
                            <FontAwesomeIcon icon={faBookOpen} className="mr-1 w-3 text-green-500" />
                            <span className="text-gray-600 font-medium">
                                {Number.isFinite(Number(pages)) ? `${Number(pages)} trang` : '-'}
                            </span>
                        </div>
                        <div className="flex items-center bg-gradient-to-r from-orange-50 to-amber-50 px-2 py-1.5 rounded-lg border border-orange-100/50">
                            <FontAwesomeIcon icon={faCalendar} className="mr-1 w-3 text-orange-500" />
                            <span className="text-gray-600 font-medium">
                                {Number.isFinite(Number(publishYear)) ? String(publishYear) : '-'}
                            </span>
                        </div>
                    </div>

                    {data.language && (
                        <div className="flex items-center text-xs text-gray-600 bg-gradient-to-r from-teal-50 to-cyan-50 p-2 rounded-lg border border-teal-100/50">
                            <FontAwesomeIcon icon={faLanguage} className="mr-2 w-3 text-teal-500" />
                            <span className="font-medium">{data.language}</span>
                        </div>
                    )}
                </div>

                <div className="mt-auto">
                    <button
                        onClick={() => showModal(data)}
                        disabled={data.stock <= 0}
                        className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 active:scale-95 ${
                            data.stock > 0
                                ? 'bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl border border-blue-400/30'
                                : 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-600 cursor-not-allowed shadow-sm'
                        }`}
                    >
                        {data.stock > 0 ? '📚 Mượn ngay' : '❌ Hết hàng'}
                    </button>
                </div>
            </div>
            <ModalBorrowBook visible={visible} onCancel={onCancel} bookData={bookData} />
        </div>
    );
}

export default CardBody;
