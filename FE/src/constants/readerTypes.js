/**
 * Hiển thị trên form — backend vẫn dùng enum SinhVien_ChinhQuy / GiangVien_CanBo.
 * Không còn chọn Học viên / NCS trên UI.
 */
export const READER_TYPE_OPTIONS = [
    { value: 'SinhVien_ChinhQuy', label: 'Sinh viên' },
    { value: 'GiangVien_CanBo', label: 'Giảng viên' },
];

/** Nhãn cho bảng / tag (gồm loại cũ nếu DB còn). */
export function readerTypeLabel(value) {
    const map = {
        SinhVien_ChinhQuy: 'Sinh viên',
        GiangVien_CanBo: 'Giảng viên',
        HocVien_NCS: 'Học viên / NCS',
    };
    return map[value] || value || '';
}
