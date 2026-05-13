function parseBookCode(codeRaw) {
    const s = String(codeRaw || '').trim().toUpperCase();
    if (!s) return { prefix: '', num: Number.POSITIVE_INFINITY, raw: '' };
    // Accept: B001, BO-001, BO-12, etc.
    const m = /^(BO-?|B)\s*0*(\d+)$/.exec(s.replace(/\s+/g, ''));
    if (m) return { prefix: 'B', num: Number.parseInt(m[2], 10), raw: s };
    return { prefix: s.replace(/[^A-Z]/g, '').slice(0, 4) || 'Z', num: Number.POSITIVE_INFINITY, raw: s };
}

/**
 * Sort books by bookCode ascending (B001 < B010 < B100).
 * Fallback to title/nameProduct for stable ordering.
 */
export function compareByBookCodeAsc(a, b) {
    const aa = parseBookCode(a?.bookCode);
    const bb = parseBookCode(b?.bookCode);
    if (aa.prefix !== bb.prefix) return aa.prefix.localeCompare(bb.prefix, 'vi');
    if (aa.num !== bb.num) return aa.num - bb.num;
    if (aa.raw !== bb.raw) return aa.raw.localeCompare(bb.raw, 'vi');

    const at = String(a?.title || a?.nameProduct || '').trim();
    const bt = String(b?.title || b?.nameProduct || '').trim();
    if (at !== bt) return at.localeCompare(bt, 'vi');

    const aid = String(a?.id || a?._id || a?.mysqlId || '');
    const bid = String(b?.id || b?._id || b?.mysqlId || '');
    return aid.localeCompare(bid, 'vi');
}

