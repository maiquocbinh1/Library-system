const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { isAdmin } = require('../middlewares/admin.middleware');
const policyController = require('../controllers/policy.controller');

/** Đọc công khai — test Postman không cần token */
router.get('/', asyncHandler(policyController.getPolicies));

/** Theo loại bạn đọc: /api/policy/reader-type/SinhVien_ChinhQuy */
router.get('/reader-type/:readerType', asyncHandler(policyController.getPolicyByReaderType));

router.post('/', authUser, isAdmin, asyncHandler(policyController.createPolicy));
router.put('/:id', authUser, isAdmin, asyncHandler(policyController.updatePolicy));
router.delete('/:id', authUser, isAdmin, asyncHandler(policyController.deletePolicy));

module.exports = router;
