/** Ảnh mặc định khi không có hoặc lỗi tải (đặt trong `public/`). */
export const PLACEHOLDER_BOOK_COVER = '/placeholder-book.png';

/**
 * Ghép URL bìa sách từ giá trị backend (filename, path tương đối, `/path`, hoặc URL đầy đủ).
 */
export function resolveBookCoverUrl(raw) {
    const s = String(raw ?? '')
        .trim()
        .replace(/\\/g, '/');
    if (!s) return PLACEHOLDER_BOOK_COVER;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;

    const base = String(import.meta.env.VITE_API_URL_IMAGE || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    if (!base) return PLACEHOLDER_BOOK_COVER;

    if (s.startsWith('/')) {
        try {
            const u = new URL(base);
            return `${u.origin}${s}`;
        } catch {
            return `${base}${s}`;
        }
    }

    return `${base}/${s.replace(/^\/+/, '')}`;
}
