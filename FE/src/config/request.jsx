import axios from 'axios';

import { apiClient } from './axiosClient';

const request = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
});

const apiUser = '/api/user';

export const requestRegister = async (data) => {
    const res = await request.post(`${apiUser}/register`, data);
    return res;
};

export const requestLogin = async (data) => {
    const res = await request.post(`${apiUser}/login`, data);
    return res;
};

export const requestLoginGoogle = async (data) => {
    const res = await request.post(`${apiUser}/login-google`, data);
    return res;
};

export const requestAuth = async () => {
    const res = await apiClient.get(`${apiUser}/auth`);
    return res.data;
};

export const requestLogout = async () => {
    const res = await apiClient.get(`${apiUser}/logout`);
    return res.data;
};

export const requestRefreshToken = async () => {
    const res = await request.get(`${apiUser}/refresh-token`);
    return res.data;
};

export const requestUpdateUser = async (data) => {
    const res = await apiClient.post(`${apiUser}/update-user`, data);
    return res.data;
};

export const requestGetAllUser = async () => {
    const res = await apiClient.get(`${apiUser}/all`);
    return res.data;
};

export const requestUpdateUserAdmin = async (data) => {
    const res = await apiClient.post(`${apiUser}/update-user-admin`, data);
    return res.data;
};

export const requestForgotPassword = async (data) => {
    const res = await apiClient.post(`${apiUser}/forgot-password`, data);
    return res.data;
};

export const requestResetPassword = async (data) => {
    const res = await apiClient.post(`${apiUser}/reset-password`, data);
    return res.data;
};

export const requestIdStudent = async () => {
    const res = await apiClient.post(`${apiUser}/request-id-student`);
    return res.data;
};

export const requestUploadImage = async (data) => {
    const res = await apiClient.post(`${apiUser}/upload-image`, data);
    return res.data;
};

export const requestGetAllUsers = async () => {
    const res = await apiClient.get(`${apiUser}/get-users`);
    return res.data;
};

export const requestDeleteUser = async (data) => {
    const res = await apiClient.post(`${apiUser}/delete-user`, data);
    return res.data;
};

export const requestUpdatePassword = async (data) => {
    const res = await apiClient.post(`${apiUser}/update-password`, data);
    return res.data;
};

/** Đổi mật khẩu khi đã đăng nhập (mật khẩu cũ + mới). */
export const requestChangeOwnPassword = async (data) => {
    const res = await apiClient.post(`${apiUser}/change-own-password`, data);
    return res.data;
};

// ─── Notifications (in-app) ──────────────────────────────────────────────────
const apiNotifications = '/api/notifications';

export const requestGetMyNotifications = async (params = {}) => {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    const res = await apiClient.get(`${apiNotifications}/my${q ? `?${q}` : ''}`);
    return res.data;
};

export const requestMarkNotificationRead = async (notificationId) => {
    const res = await apiClient.post(`${apiNotifications}/mark-read`, { notificationId });
    return res.data;
};

export const requestMarkAllNotificationsRead = async () => {
    const res = await apiClient.post(`${apiNotifications}/mark-all-read`);
    return res.data;
};

/** Staff: gửi cảnh báo nội bộ cho 1 user */
export const requestSendWarningNotification = async (data) => {
    const res = await apiClient.post(`${apiNotifications}/send-warning`, data);
    return res.data;
};

/** Staff: gửi thông báo hàng loạt */
export const requestSendMassNotification = async (data) => {
    const res = await apiClient.post(`${apiNotifications}/send-mass`, data);
    return res.data;
};

export const requestGetRequestLoan = async () => {
    const res = await apiClient.get(`${apiUser}/get-request-loan`);
    return res.data;
};

export const requestConfirmIdStudent = async (data) => {
    const res = await apiClient.post(`${apiUser}/confirm-id-student`, data);
    return res.data;
};

export const requestIssueReaderCard = async (data) => {
    const res = await apiClient.post(`${apiUser}/issue-reader-card`, data);
    return res.data;
};

export const requestSetPatronLock = async (data) => {
    const res = await apiClient.post(`${apiUser}/set-patron-lock`, data);
    return res.data;
};

export const requestAdminCreateReader = async (data) => {
    const res = await apiClient.post(`${apiUser}/admin-create-reader`, data);
    return res.data;
};

export const requestStatistics = async () => {
    const res = await apiClient.get(`${apiUser}/statistics`);
    return res.data;
};

const apiFines = '/api/fines';
/** Danh sách lớn + join user/loan — backend đã batch nhưng vẫn cần timeout dài hơn mặc định 10s. */
const HEAVY_LIST_TIMEOUT_MS = 90000;

export const requestGetAllFines = async (params = {}) => {
    const { userId } = params || {};
    const sp = new URLSearchParams();
    if (userId) sp.set('userId', String(userId));
    const q = sp.toString();
    const res = await apiClient.get(`${apiFines}${q ? `?${q}` : ''}`, { timeout: HEAVY_LIST_TIMEOUT_MS });
    return res.data;
};

export const requestPayFine = async (fineId) => {
    const res = await apiClient.put(`${apiFines}/${encodeURIComponent(fineId)}/pay`);
    return res.data;
};

export const requestMyUnpaidFines = async () => {
    const res = await apiClient.get(`${apiFines}/my-unpaid`);
    return res.data;
};

const apiPolicy = '/api/policy';
export const requestGetPolicies = async () => {
    const res = await apiClient.get(apiPolicy);
    return res.data;
};

export const requestCreatePolicy = async (data) => {
    const res = await apiClient.post(apiPolicy, data);
    return res.data;
};

export const requestUpdatePolicy = async (id, data) => {
    const res = await apiClient.put(`${apiPolicy}/${encodeURIComponent(id)}`, data);
    return res.data;
};

export const requestDeletePolicy = async (id) => {
    const res = await apiClient.delete(`${apiPolicy}/${encodeURIComponent(id)}`);
    return res.data;
};

/** Admin: xóa phiếu/phạt độc giả mẫu quầy, trả bản sao về kho (MSV seed circulation). */
export const requestRefreshCirculationSample = async () => {
    const res = await apiClient.post(`${apiPolicy}/refresh-circulation-sample`);
    return res.data;
};

const apiProduct = '/api/product';
export const requestGetAllProduct = async () => {
    const res = await request.get(`${apiProduct}/get-all`);
    return res.data;
};

export const requestGetOneProduct = async (id) => {
    const res = await request.get(`${apiProduct}/get-one?id=${id}`);
    return res.data;
};

export const requestSearchProduct = async (keyword) => {
    const res = await request.get(`${apiProduct}/search?keyword=${keyword}`);
    return res.data;
};

export const requestUploadImageProduct = async (data) => {
    const res = await apiClient.post(`${apiProduct}/upload-image`, data);
    return res.data;
};

export const requestCreateProduct = async (data) => {
    const res = await apiClient.post(`${apiProduct}/create`, data);
    return res.data;
};

export const requestUpdateProduct = async (id, data) => {
    const res = await apiClient.post(`${apiProduct}/update?id=${id}`, data);
    return res.data;
};

export const requestDeleteProduct = async (id) => {
    const res = await apiClient.post(`${apiProduct}/delete`, { id });
    return res.data;
};

export const requestSyncBookCodes = async () => {
    const res = await apiClient.get(`${apiProduct}/sync-book-codes`);
    return res.data;
};

export const requestGetBookCopies = async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.bookId) qs.set('bookId', String(params.bookId));
    if (params.status) qs.set('status', String(params.status));
    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    const url = q ? `${apiProduct}/book-copies?${q}` : `${apiProduct}/book-copies`;
    const res = await apiClient.get(url);
    return res.data;
};

export const requestGetBookCopy = async (id) => {
    const res = await apiClient.get(`${apiProduct}/book-copy?id=${encodeURIComponent(id)}`);
    return res.data;
};

export const requestCreateBookCopy = async (data) => {
    const res = await apiClient.post(`${apiProduct}/book-copy`, data);
    return res.data;
};

export const requestUpdateBookCopy = async (data) => {
    const res = await apiClient.put(`${apiProduct}/book-copy`, data);
    return res.data;
};

export const requestDeleteBookCopy = async (id) => {
    const res = await apiClient.delete(`${apiProduct}/book-copy?id=${encodeURIComponent(id)}`);
    return res.data;
};

const apiHistoryBook = '/api/history-book';
export const requestCreateHistoryBook = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/create`, data);
    return res.data;
};

export const requestGetHistoryUser = async () => {
    const res = await apiClient.get(`${apiHistoryBook}/get-history-user`);
    return res.data;
};

export const requestCancelBook = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/cancel-book`, data);
    return res.data;
};

export const requestGetAllHistoryBook = async (params = {}) => {
    const { userId, limit } = params || {};
    const sp = new URLSearchParams();
    if (userId) sp.set('userId', String(userId));
    if (limit != null && String(limit).trim() !== '') sp.set('limit', String(limit));
    const q = sp.toString();
    const res = await apiClient.get(`${apiHistoryBook}/get-all-history-book${q ? `?${q}` : ''}`, {
        timeout: HEAVY_LIST_TIMEOUT_MS,
    });
    return res.data;
};

export const requestUpdateStatusBook = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/update-status-book`, data);
    return res.data;
};

export const requestReturnBooks = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/return-books`, data);
    return res.data;
};

/** Thủ thư lập phiếu tại quầy (độc giả + barcode) */
export const requestStaffDeskIssue = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/staff-desk-issue`, data);
    return res.data;
};

/** Thủ thư xác nhận xuất kho bằng barcode (PENDING → BORROWING) */
export const requestConfirmBorrow = async (data) => {
    const res = await apiClient.put(`${apiHistoryBook}/confirm-borrow`, data);
    return res.data;
};

/** Thủ thư trả sách bằng barcode (danh sách hoặc một mã) */
export const requestReturnByBarcode = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/return-by-barcode`, data);
    return res.data;
};

/** Thủ thư nhận trả đúng một barcode — body { barcode } */
export const requestReturnBook = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/return-book`, data);
    return res.data;
};

/** Nhật ký trả sách trong ngày (theo thủ thư đăng nhập) */
export const requestGetReturnsToday = async () => {
    const res = await apiClient.get(`${apiHistoryBook}/returns-today`);
    return res.data;
};

/** Gợi ý độc giả tại quầy */
export const requestFindPatrons = async (q) => {
    const res = await apiClient.get(`${apiHistoryBook}/find-patrons?q=${encodeURIComponent(q)}`);
    return res.data;
};

/** Gia hạn phiếu mượn */
export const requestRenewLoan = async (data) => {
    const res = await apiClient.post(`${apiHistoryBook}/renew-loan`, data);
    return res.data;
};

/** Kiểm tra thông tin barcode */
export const requestCheckBarcode = async (barcode) => {
    const res = await apiClient.get(`${apiHistoryBook}/check-barcode?barcode=${encodeURIComponent(barcode)}`);
    return res.data;
};

/** Thêm bản sao vào đầu sách bằng barcode thủ công */
export const requestAddCopiesByBarcode = async (data) => {
    const res = await apiClient.post(`${apiProduct}/add-copies-by-barcode`, data);
    return res.data;
};

// ─── Analytics / EIS / DSS ───────────────────────────────────────────────────
const apiAdmin = '/api/admin';

export const requestGetEisKpis = async () => {
    const res = await apiClient.get(`${apiAdmin}/eis/kpis`);
    return res.data;
};

export const requestGetCategoryTrends = async (period = 'all') => {
    const res = await apiClient.get(`${apiAdmin}/dss/category-trends?period=${period}`);
    return res.data;
};

export const requestGetDrilldown = async (category, period = 'all') => {
    const res = await apiClient.get(`${apiAdmin}/dss/drilldown?category=${encodeURIComponent(category)}&period=${period}`);
    return res.data;
};

export const requestPostWhatIf = async (data) => {
    const res = await apiClient.post(`${apiAdmin}/dss/what-if`, data);
    return res.data;
};

export const requestGetHighRiskUsers = async () => {
    const res = await apiClient.get(`${apiAdmin}/dss/high-risk-users`);
    return res.data;
};

export const requestGetUnusedBooks = async () => {
    const res = await apiClient.get(`${apiAdmin}/dss/unused-books`);
    return res.data;
};

export const requestExportHighRisk = async () => {
    const res = await apiClient.get(`${apiAdmin}/dss/export/high-risk`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'doc_gia_rui_ro.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const requestExportUnusedBooks = async () => {
    const res = await apiClient.get(`${apiAdmin}/dss/export/unused-books`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sach_it_tuong_tac.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ─── HR / Nhân sự & Audit (chỉ Admin) — `/api/admin/staff` ───────────────────
const apiStaff = `${apiAdmin}/staff`;

/** Danh sách tài khoản thủ thư (role librarian) */
export const requestGetStaffList = async () => {
    const res = await apiClient.get(apiStaff);
    return res.data;
};

/** Admin tạo thủ thư: { email, password, fullName, phone?, address? } */
export const requestCreateStaffUser = async (data) => {
    const res = await apiClient.post(apiStaff, data);
    return res.data;
};

/** Admin xóa thủ thư / kho — userId là Mongo _id */
export const requestDeleteStaffUser = async (userId) => {
    const res = await apiClient.delete(`${apiStaff}/${encodeURIComponent(userId)}`);
    return res.data;
};

/** Admin sửa thủ thư / kho — PATCH { fullName, email, staffRole?, phone?, address?, password? } */
export const requestUpdateStaffUser = async (userId, data) => {
    const res = await apiClient.patch(`${apiStaff}/${encodeURIComponent(userId)}`, data);
    return res.data;
};

/** Nhật ký kiểm toán — query: page, limit, action, adminId, targetType */
export const requestGetStaffAuditLogs = async (params = {}) => {
    const sp = new URLSearchParams();
    if (params.page != null) sp.set('page', String(params.page));
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.action) sp.set('action', String(params.action));
    if (params.adminId) sp.set('adminId', String(params.adminId));
    if (params.targetType) sp.set('targetType', String(params.targetType));
    const q = sp.toString();
    const res = await apiClient.get(`${apiStaff}/audit-logs${q ? `?${q}` : ''}`);
    return res.data;
};

// ─── OAS ─────────────────────────────────────────────────────────────────────
const apiOas = '/api/admin/oas';

export const requestSendWarningEmail = async (data) => {
    const res = await apiClient.post(`${apiOas}/send-warning-email`, data);
    return res.data;
};

export const requestSendMassEmail = async (data) => {
    const res = await apiClient.post(`${apiOas}/send-mass-email`, data);
    return res.data;
};

export const requestGetEmailLogs = async (type = 'all') => {
    const res = await apiClient.get(`${apiOas}/email-logs?type=${type}`);
    return res.data;
};

// ─── Library Mail (Mongo: `library_mail`) ─────────────────────────────────────
const apiLibraryMail = '/api/library-mail';

/** Staff: Nhật ký thư */
export const requestGetLibraryMail = async (params = {}) => {
    const sp = new URLSearchParams();
    if (params.type) sp.set('type', String(params.type));
    if (params.status) sp.set('status', String(params.status));
    if (params.deliveryStatus) sp.set('deliveryStatus', String(params.deliveryStatus));
    if (params.q) sp.set('q', String(params.q));
    if (params.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    const res = await apiClient.get(`${apiLibraryMail}${q ? `?${q}` : ''}`);
    return res.data;
};

/** Public: gửi yêu cầu quên mật khẩu (để thư viện reset) */
export const requestSendForgotPasswordMail = async (data) => {
    const res = await apiClient.post(`${apiLibraryMail}/forgot-password`, data);
    return res.data;
};

/** Public: tin nhắn trang Liên hệ -> nhật ký thư */
export const requestSendContactMessage = async (data) => {
    const res = await apiClient.post(`${apiLibraryMail}/contact-message`, data);
    return res.data;
};

/** Staff: duyệt yêu cầu quên mật khẩu -> reset 123 + notify */
export const requestResolveForgotPasswordMail = async (mailId) => {
    const res = await apiClient.post(`${apiLibraryMail}/resolve-forgot-password`, { mailId });
    return res.data;
};
