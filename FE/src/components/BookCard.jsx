import React from 'react';
import { Link } from 'react-router-dom';

function BookCard({ book }) {
    const imageSrc = book?.image?.startsWith('http') ? book.image : `http://localhost:3000/${book?.image || ''}`;
    const isInStock = Number(book?.stock) > 0;

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
            <div className="aspect-[2/3] overflow-hidden rounded-md bg-gray-100">
                <img src={imageSrc} alt={book?.nameProduct || 'Book cover'} className="h-full w-full object-cover" />
            </div>

            <div className="mt-3 space-y-2">
                <h3 className="line-clamp-2 min-h-[3rem] text-sm font-bold text-gray-900">{book?.nameProduct || 'Chưa có tên sách'}</h3>

                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-gray-600">{book?.publisher || 'Chưa có tác giả'}</p>
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isInStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                    >
                        {isInStock ? 'Con sach' : 'Het sach'}
                    </span>
                </div>

                <Link
                    to={`/product/${book?.id || book?._id || ''}`}
                    className="block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
                >
                    Xem chi tiet
                </Link>
            </div>
        </div>
    );
}

export default BookCard;
