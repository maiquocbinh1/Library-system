import { useEffect, useMemo, useState } from 'react';
import { Pagination } from 'antd';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BookCard from '../components/BookCard';
import { requestGetAllProduct } from '../config/request';

const PAGE_SIZE = 12;

function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return null;
    const id = product.id || product.mysqlId || (product._id ? String(product._id) : undefined);
    return id ? { ...product, id } : null;
}

/** Chỉ thể loại từ dữ liệu đầu sách (thư viện — không dùng tác giả/NXB làm “thể loại”). */
function getCategoryValues(item) {
    const c1 = String(item?.category_1 || '').trim();
    const c0 = String(item?.category || '').trim();
    const fromArray = Array.isArray(item?.categories)
        ? item.categories.map((cat) => String(cat || '').trim()).filter(Boolean)
        : [];
    const out = [];
    if (c1) out.push(c1);
    if (c0 && c0 !== c1) out.push(c0);
    for (const x of fromArray) {
        if (!out.includes(x)) out.push(x);
    }
    return out;
}

function filterByCategory(list, selectedCategory) {
    if (selectedCategory === 'Tất cả') return list;
    return list.filter((item) => getCategoryValues(item).includes(selectedCategory));
}

function filterBySearch(list, qRaw) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => {
        const title = String(item?.nameProduct || item?.title || '').toLowerCase();
        const author = String(item?.publisher || '').toLowerCase();
        const code = String(item?.bookCode || '').toLowerCase();
        return title.includes(q) || author.includes(q) || code.includes(q);
    });
}

function Categories() {
    const [searchParams] = useSearchParams();
    const searchQ = searchParams.get('q') || '';

    const [products, setProducts] = useState([]);
    const [categoryList, setCategoryList] = useState(['Tất cả']);
    const [selectedCategory, setSelectedCategory] = useState('Tất cả');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await requestGetAllProduct();
                const productList = Array.isArray(res?.metadata) ? res.metadata.map(normalizeProduct).filter(Boolean) : [];
                const uniqueCategories = [
                    ...new Set(
                        productList
                            .flatMap((item) => getCategoryValues(item))
                            .map((cat) => String(cat || '').trim())
                            .filter(Boolean),
                    ),
                ].sort((a, b) => a.localeCompare(b, 'vi'));
                setProducts(productList);
                setCategoryList(['Tất cả', ...uniqueCategories]);
            } catch {
                setProducts([]);
                setCategoryList(['Tất cả']);
            }
        };

        void fetchProducts();
    }, []);

    const filteredProducts = useMemo(() => {
        const byCat = filterByCategory(products, selectedCategory);
        return filterBySearch(byCat, searchQ);
    }, [products, selectedCategory, searchQ]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory, searchQ]);

    const handleSelectCategory = (category) => {
        setSelectedCategory(category);
    };

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const currentProducts = filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);

    return (
        <div className="min-h-screen bg-gray-50 pb-12 pt-24">
            <Header />

            <main className="w-full px-4 sm:px-6 lg:px-10">
                <section className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Danh mục đầu sách</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Tra cứu theo thể loại đã gán trên đầu sách{searchQ.trim() ? ' và từ khóa tìm kiếm' : ''}.
                    </p>
                </section>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <aside className="lg:col-span-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold text-gray-900">Thể loại</h2>
                            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                                {categoryList.map((category) => {
                                    const isActive = selectedCategory === category;
                                    return (
                                        <button
                                            key={category}
                                            type="button"
                                            onClick={() => handleSelectCategory(category)}
                                            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                                isActive
                                                    ? 'bg-blue-600 font-semibold text-white'
                                                    : 'bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                                            }`}
                                        >
                                            {category}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    <section className="lg:col-span-9">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="mb-4">
                                <p className="text-sm text-gray-600">
                                    Đang hiển thị <span className="font-semibold">{filteredProducts.length}</span> đầu sách
                                    {selectedCategory !== 'Tất cả' ? (
                                        <>
                                            {' '}
                                            — thể loại <span className="font-semibold">{selectedCategory}</span>
                                        </>
                                    ) : null}
                                    {searchQ.trim() ? (
                                        <>
                                            {' '}
                                            — tìm “<span className="font-semibold">{searchQ.trim()}</span>”
                                        </>
                                    ) : null}
                                    .
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 xl:grid-cols-4">
                                {currentProducts.map((book) => (
                                    <BookCard key={book.id || book._id} book={book} />
                                ))}
                            </div>

                            {currentProducts.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                                    Không có đầu sách phù hợp.
                                </div>
                            )}

                            <div className="mt-8 flex justify-center">
                                <Pagination
                                    pageSize={PAGE_SIZE}
                                    current={currentPage}
                                    total={filteredProducts.length}
                                    onChange={(page) => setCurrentPage(page)}
                                    showSizeChanger={false}
                                    hideOnSinglePage={false}
                                />
                            </div>
                        </div>
                    </section>
                </div>
            </main>
            <Footer />
        </div>
    );
}

export default Categories;
