const ExcelJS = require('exceljs');
const { OK } = require('../core/success.response');
const {
    getAllEisKpis,
    getCategoryTrends,
    getDrilldown,
    getWhatIfAnalysis,
    getHighRiskUsers,
    getUnusedBooks,
} = require('../utils/kpiCalculator');
const UserMongo = require('../models/user.mongo.model');

class AnalyticsController {
    /** EIS KPIs */
    async getEisKpis(req, res) {
        const data = await getAllEisKpis();
        new OK({ message: 'EIS KPIs', metadata: data }).send(res);
    }

    /** DSS: Xu hướng thể loại */
    async getCategoryTrends(req, res) {
        const period = req.query.period || 'all';
        const data = await getCategoryTrends(period);
        new OK({ message: 'Category trends', metadata: data }).send(res);
    }

    /** DSS: Drill-down */
    async getDrilldown(req, res) {
        const { category, period = 'all' } = req.query;
        if (!category) {
            return res.status(400).json({ message: 'Thiếu tham số category' });
        }
        const data = await getDrilldown(category, period);
        new OK({ message: 'Drilldown', metadata: data }).send(res);
    }

    /** DSS: What-If simulation */
    async postWhatIf(req, res) {
        const { max_days = 14, fine_rate = 1000, period = 'all' } = req.body;
        const data = await getWhatIfAnalysis(Number(max_days), Number(fine_rate), period);
        new OK({ message: 'What-If analysis', metadata: data }).send(res);
    }

    /** DSS: Độc giả rủi ro cao */
    async getHighRiskUsers(req, res) {
        const data = await getHighRiskUsers();
        new OK({ message: 'High risk users', metadata: data }).send(res);
    }

    /** DSS: Sách ít tương tác */
    async getUnusedBooks(req, res) {
        const data = await getUnusedBooks();
        new OK({ message: 'Unused books', metadata: data }).send(res);
    }

    /** Export Excel: Độc giả rủi ro */
    async exportHighRisk(req, res) {
        const data = await getHighRiskUsers();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Độc giả rủi ro cao');
        sheet.columns = [
            { header: 'MSV', key: 'studentId', width: 18 },
            { header: 'Họ và tên', key: 'fullName', width: 30 },
            { header: 'Email', key: 'email', width: 35 },
            { header: 'Tổng nợ phạt (VNĐ)', key: 'totalFine', width: 22 },
            { header: 'Số sách quá hạn', key: 'overdueBooksCount', width: 18 },
            { header: 'Số lần đã nhắc', key: 'warningCount', width: 16 },
        ];
        sheet.getRow(1).font = { bold: true };
        data.forEach((row) => sheet.addRow(row));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="doc_gia_rui_ro.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    }

    /** Export Excel: Sách ít tương tác */
    async exportUnusedBooks(req, res) {
        const data = await getUnusedBooks();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sách ít tương tác');
        sheet.columns = [
            { header: 'Mã ISBN', key: 'isbn', width: 20 },
            { header: 'Tên sách', key: 'title', width: 45 },
            { header: 'Thể loại', key: 'category', width: 20 },
            { header: 'Tồn kho', key: 'stock', width: 12 },
        ];
        sheet.getRow(1).font = { bold: true };
        data.forEach((row) => sheet.addRow(row));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="sach_it_tuong_tac.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    }
}

module.exports = new AnalyticsController();
