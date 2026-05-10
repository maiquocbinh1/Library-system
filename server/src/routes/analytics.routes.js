const express = require('express');
const router = express.Router();
const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');
const analyticsController = require('../controllers/analytics.controller');

router.get('/eis/kpis', authUser, libraryStaff, asyncHandler(analyticsController.getEisKpis));
router.get('/dss/category-trends', authUser, libraryStaff, asyncHandler(analyticsController.getCategoryTrends));
router.get('/dss/drilldown', authUser, libraryStaff, asyncHandler(analyticsController.getDrilldown));
router.post('/dss/what-if', authUser, libraryStaff, asyncHandler(analyticsController.postWhatIf));
router.get('/dss/high-risk-users', authUser, libraryStaff, asyncHandler(analyticsController.getHighRiskUsers));
router.get('/dss/unused-books', authUser, libraryStaff, asyncHandler(analyticsController.getUnusedBooks));
router.get('/dss/export/high-risk', authUser, libraryStaff, analyticsController.exportHighRisk);
router.get('/dss/export/unused-books', authUser, libraryStaff, analyticsController.exportUnusedBooks);

module.exports = router;
