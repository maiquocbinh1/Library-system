import { useEffect, useMemo, useState } from 'react';
import { Pagination, Tabs } from 'antd';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BookCard from '../components/BookCard';
import { requestGetAllHistoryBook, requestGetAllProduct } from '../config/request';
import { normalizeLoanStatusKey } from '../utils/loanTicketStatus';

const PAGE_SIZE = 12;

function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return null;
    const id = product.id || product.mysqlId || (product._id ? String(product._id) : undefined);
    return id ? { ...product, id } : null;
}

function paginate(items, page, pageSize) {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

function Home() {
    const [products, setProducts] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [activeTab, setActiveTab] = useState('discover');
    const [pageByTab, setPageByTab] = useState({
        discover: 1,
        trending: 1,
        newest: 1,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [productRes, historyRes] = await Promise.all([requestGetAllProduct(), requestGetAllHistoryBook()]);
                const productList = Array.isArray(productRes?.metadata) ? productRes.metadata.map(normalizeProduct).filter(Boolean) : [];
                const historyList = Array.isArray(historyRes?.metadata) ? historyRes.metadata : [];
                setProducts(productList);
                setHistoryItems(historyList);
            } catch (error) {
                setProducts([]);
                setHistoryItems([]);
            }
        };
        fetchData();
    }, []);

    const discoverBooks = useMemo(() => {
        const cloned = [...products];
        cloned.sort(() => Math.random() - 0.5);
        return cloned;
    }, [products]);

    const trendingBooks = useMemo(() => {
        if (!historyItems.length || !products.length) return [];
        const borrowCountByBookId = historyItems.reduce((acc, item) => {
            if (normalizeLoanStatusKey(item?.status) === 'CANCELLED') return acc;
            const bookId = String(item?.bookId || item?.product?.id || '');
            if (!bookId) return acc;
            acc[bookId] = (acc[bookId] || 0) + 1;
            return acc;
        }, {});

        const byId = new Map();
        products.forEach((item) => {
            byId.set(String(item.id), item);
            byId.set(String(item._id || ''), item);
        });

        return Object.entries(borrowCountByBookId)
            .map(([bookId, count]) => ({
                book: byId.get(String(bookId)),
                count,
            }))
            .filter((item) => item.book)
            .sort((a, b) => b.count - a.count)
            .map((item) => item.book);
    }, [historyItems, products]);

    const newestBooks = useMemo(() => {
        const cloned = [...products];
        cloned.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return cloned;
    }, [products]);

    const tabData = {
        discover: discoverBooks,
        trending: trendingBooks,
        newest: newestBooks,
    };

    const currentList = tabData[activeTab] || [];
    const currentPage = pageByTab[activeTab] || 1;
    const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const visibleBooks = paginate(currentList, safePage, PAGE_SIZE);

    useEffect(() => {
        if (currentPage > totalPages) {
            setPageByTab((prev) => ({
                ...prev,
                [activeTab]: 1,
            }));
        }
    }, [activeTab, currentPage, totalPages]);

    const onPageChange = (page) => {
        setPageByTab((prev) => ({
            ...prev,
            [activeTab]: page,
        }));
    };

    const tabItems = [
        {
            key: 'discover',
            label: 'Khám phá',
            children: null,
        },
        {
            key: 'trending',
            label: 'Phổ biến',
            children: null,
        },
        {
            key: 'newest',
            label: 'Mới nhất',
            children: null,
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <Header />

            <main className="w-full px-4 pb-12 pt-24 sm:px-6 lg:px-10">
                <section className="mb-6">
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Không gian đọc sách cho độc giả</h1>
                    <p className="mt-2 text-sm text-gray-600">Khám phá, theo dõi sách phổ biến và cập nhật đầu sách mới nhất.</p>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <Tabs
                        items={tabItems}
                        activeKey={activeTab}
                        onChange={(key) => {
                            setActiveTab(key);
                            setPageByTab((prev) => ({
                                ...prev,
                                [key]: 1,
                            }));
                        }}
                        className="books-tabs"
                    />

                    <div className="mt-2 grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleBooks.map((item) => (
                            <BookCard key={item.id || item._id} book={item} />
                        ))}
                    </div>

                    <div className="mt-8 flex justify-center">
                        <Pagination
                            key={activeTab}
                            current={safePage}
                            pageSize={PAGE_SIZE}
                            total={currentList.length}
                            onChange={onPageChange}
                            showSizeChanger={false}
                            hideOnSinglePage={false}
                            style={{ marginTop: 20, textAlign: 'center' }}
                        />
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}

export default Home;
