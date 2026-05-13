/**
 * Đồng bộ với FE `src/utils/loanTicketStatus.js` — đếm / lọc "chờ duyệt" giống giao diện.
 */

const LEGACY = {
    pending: 'PENDING_APPROVAL',
    success: 'BORROWING',
    cancel: 'CANCELLED',
};

function normalizeLoanStatusKey(status) {
    if (status == null || status === '') return '';
    const s = String(status).trim();
    const lower = s.toLowerCase();
    if (LEGACY[lower]) return LEGACY[lower];
    const folded = lower
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (folded === 'cho duyet') return 'PENDING_APPROVAL';
    return s.replace(/\s+/g, '_').toUpperCase();
}

function isPendingApprovalLoanStatus(status) {
    return normalizeLoanStatusKey(status) === 'PENDING_APPROVAL';
}

/** Điều kiện Mongo khớp `isPendingApprovalLoanStatus` (tránh quét toàn bộ collection). */
function mongoFilterPendingApproval() {
    return {
        $or: [
            { status: 'PENDING_APPROVAL' },
            { status: { $regex: /^pending$/i } },
            { status: { $regex: /^pending[\s_]+approval$/i } },
            /** Nhãn tiếng Việt (dữ liệu mẫu / import cũ) */
            { status: { $regex: /^ch[ơoờ]\s*duy[eệ]t$/i } },
        ],
    };
}

module.exports = {
    normalizeLoanStatusKey,
    isPendingApprovalLoanStatus,
    mongoFilterPendingApproval,
};
