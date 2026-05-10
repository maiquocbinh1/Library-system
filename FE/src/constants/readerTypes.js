export const READER_TYPE_OPTIONS = [
    { value: 'SinhVien_ChinhQuy', label: 'Sinh viên' },
];

export function readerTypeLabel(value) {
    if (value === 'SinhVien_ChinhQuy') return 'Sinh viên';
    return value || '';
}
