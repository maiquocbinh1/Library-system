import { useEffect, useState } from 'react';
import { Card, Empty, Spin, Tabs, message } from 'antd';
import CardBody from '../../components/Cardbody';
import { requestGetBookshelf } from '../../config/request';

function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return null;
    const id = product.id || product.mysqlId || (product._id ? String(product._id) : undefined);
    return id ? { ...product, id } : null;
}

function BookGrid({ books }) {
    if (!Array.isArray(books) || books.length === 0) {
        return <Empty description="Chưa có sách trong mục này" />;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {books.map((book) => (
                <CardBody key={book.id} data={book} />
            ))}
        </div>
    );
}

function MyBookshelf() {
    const [loading, setLoading] = useState(false);
    const [bookshelf, setBookshelf] = useState({
        readingBooks: [],
        favoriteBooks: [],
        readLaterBooks: [],
    });

    const fetchBookshelf = async () => {
        setLoading(true);
        try {
            const res = await requestGetBookshelf();
            const data = res?.metadata || {};
            setBookshelf({
                readingBooks: (data.readingBooks || []).map(normalizeProduct).filter(Boolean),
                favoriteBooks: (data.favoriteBooks || []).map(normalizeProduct).filter(Boolean),
                readLaterBooks: (data.readLaterBooks || []).map(normalizeProduct).filter(Boolean),
            });
        } catch (error) {
            message.error(error?.response?.data?.message || 'Không thể tải tủ sách cá nhân');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookshelf();
    }, []);

    const items = [
        {
            key: 'reading',
            label: 'Đang đọc',
            children: <BookGrid books={bookshelf.readingBooks} />,
        },
        {
            key: 'favorite',
            label: 'Yêu thích',
            children: <BookGrid books={bookshelf.favoriteBooks} />,
        },
        {
            key: 'read-later',
            label: 'Đọc sau',
            children: <BookGrid books={bookshelf.readLaterBooks} />,
        },
    ];

    return (
        <Card title="Tủ sách của tôi" bordered={false}>
            {loading ? (
                <div className="flex justify-center py-12">
                    <Spin size="large" />
                </div>
            ) : (
                <Tabs defaultActiveKey="reading" items={items} />
            )}
        </Card>
    );
}

export default MyBookshelf;
