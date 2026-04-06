import { useEffect, useState } from 'react';
import { Collapse, Pagination } from 'antd';
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

function getCategoryValues(item) {
    const normalizedCategory = String(item?.category || '').trim();
    const normalizedCategories = Array.isArray(item?.categories)
        ? item.categories.map((cat) => String(cat || '').trim()).filter(Boolean)
        : [];
    const normalizedPublisher = String(item?.publisher || '').trim();

    if (normalizedCategory) return [normalizedCategory];
    if (normalizedCategories.length) return normalizedCategories;
    if (normalizedPublisher) return [normalizedPublisher];
    return [];
}

function filterByCategory(list, selectedCategory) {
    if (selectedCategory === 'Tất cả') return list;
    return list.filter((item) => getCategoryValues(item).includes(selectedCategory));
}

function Categories() {
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
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
                ];
                setProducts(productList);
                setFilteredProducts(productList);
                setCategoryList(['Tất cả', ...uniqueCategories]);
            } catch {
                setProducts([]);
                setFilteredProducts([]);
                setCategoryList(['Tất cả']);
            }
        };

        fetchProducts();
    }, []);

    const handleSelectCategory = (category) => {
        setSelectedCategory(category);
        setFilteredProducts(filterByCategory(products, category));
        setCurrentPage(1);
    };

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const currentProducts = filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);

    return (
        <div className="pt-24 pb-12 bg-gray-50 min-h-screen">
            <Header />

            <main className="w-full px-4 sm:px-6 lg:px-10">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <aside className="lg:col-span-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold text-gray-900">Thể loại sách</h2>
                            <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => handleSelectCategory('Tất cả')}
                                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                        selectedCategory === 'Tất cả'
                                            ? 'bg-blue-600 font-semibold text-white'
                                            : 'bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                                    }`}
                                >
                                    Tất cả
                                </button>

                                <Collapse
                                    defaultActiveKey={['author-publisher']}
                                    items={[
                                        {
                                            key: 'author-publisher',
                                            label: 'Lọc theo Tác giả / NXB',
                                            children: (
                                                <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                                    {categoryList
                                                        .filter((category) => category !== 'Tất cả')
                                                        .map((category) => {
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
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    </aside>

                    <section className="lg:col-span-9">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="mb-4">
                                <h1 className="text-2xl font-bold text-gray-900">Danh mục sách</h1>
                                <p className="mt-1 text-sm text-gray-600">
                                    Đang hiển thị <span className="font-semibold">{filteredProducts.length}</span> sách thuộc thể loại{' '}
                                    <span className="font-semibold">{selectedCategory}</span>.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 xl:grid-cols-4">
                                {currentProducts.map((book) => (
                                    <BookCard key={book.id || book._id} book={book} />
                                ))}
                            </div>

                            {currentProducts.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                                    Không có sách phù hợp với thể loại này.
                                </div>
                            )}

                            <div className="mt-8 flex justify-center">
                                <Pagination
                                    pageSize={12}
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
