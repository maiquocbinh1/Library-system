/** Đồng bộ enum backend với giá trị legacy FE cũ (pending / success / cancel). */

const LEGACY = {
    pending: 'PENDING_APPROVAL',
    success: 'BORROWING',
    cancel: 'CANCELLED',
};

export function normalizeLoanStatusKey(status) {
    if (status == null || status === '') return '';
    const s = String(status).trim();
    const lower = s.toLowerCase();
    if (LEGACY[lower]) return LEGACY[lower];
    const deaccent = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const folded = deaccent(lower).replace(/\s+/g, ' ').trim();
    if (folded === 'cho duyet') return 'PENDING_APPROVAL';
    return s.replace(/\s+/g, '_').toUpperCase();
}

export function isPendingApproval(status) {
    return normalizeLoanStatusKey(status) === 'PENDING_APPROVAL';
}

export function isReadyForPickup(status) {
    return normalizeLoanStatusKey(status) === 'READY_FOR_PICKUP';
}

export function isBorrowingActive(status) {
    const k = normalizeLoanStatusKey(status);
    return k === 'BORROWING' || k === 'OVERDUE';
}

export function loanStatusMeta(status) {
    const key = normalizeLoanStatusKey(status);
    const map = {
        PENDING_APPROVAL: { color: 'gold', text: 'Chờ thư viện xác nhận' },
        READY_FOR_PICKUP: { color: 'cyan', text: 'Đến quầy lấy sách' },
        BORROWING: { color: 'blue', text: 'Đang mượn' },
        RETURNED: { color: 'green', text: 'Đã trả' },
        OVERDUE: { color: 'red', text: 'Quá hạn' },
        CANCELLED: { color: 'default', text: 'Đã hủy' },
    };
    return map[key] || { color: 'default', text: status ? String(status) : '—' };
}
