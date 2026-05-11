const mongoose = require('mongoose');
const PolicyMongo = require('../models/policy.mongo.model');
const { READER_TYPES } = require('../models/policy.mongo.model');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const { resetCirculationSamplePatronsState } = require('../services/circulationSampleReset.service');

const RENEW_EXT_ALLOWED = new Set([7, 14]);

function normalizeRenewExtensionDays(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || !RENEW_EXT_ALLOWED.has(n)) return null;
    return n;
}

function toClientPolicy(doc) {
    const raw = doc.toObject ? doc.toObject() : doc;
    return {
        ...raw,
        id: raw._id ? String(raw._id) : undefined,
    };
}

class policyController {
    async getPolicies(req, res) {
        const list = await PolicyMongo.find({}).sort({ readerType: 1 }).lean();
        const metadata = list.map((p) => ({
            ...p,
            id: String(p._id),
        }));
        new OK({
            message: 'Lấy danh sách chính sách thành công',
            metadata,
        }).send(res);
    }

    /**
     * GET .../reader-type/:readerType
     * hoặc query ?readerType=...
     */
    async getPolicyByReaderType(req, res) {
        const type = String(req.params.readerType || req.query.readerType || '').trim();
        if (!type) {
            throw new BadRequestError('Thiếu readerType');
        }
        if (!READER_TYPES.includes(type)) {
            throw new BadRequestError('readerType không hợp lệ');
        }
        const policy = await PolicyMongo.findOne({ readerType: type }).lean();
        if (!policy) {
            throw new BadRequestError('Không có chính sách cho đối tượng này');
        }
        new OK({
            message: 'Lấy chính sách thành công',
            metadata: { ...policy, id: String(policy._id) },
        }).send(res);
    }

    async createPolicy(req, res) {
        const { readerType, maxBooks, loanDays, overdueFinePerDay, renewExtensionDays } = req.body;
        if (!readerType || !READER_TYPES.includes(String(readerType))) {
            throw new BadRequestError('readerType không hợp lệ');
        }
        const maxB = Number(maxBooks);
        const loanD = Number(loanDays);
        if (!Number.isFinite(maxB) || maxB < 1) {
            throw new BadRequestError('maxBooks không hợp lệ');
        }
        if (!Number.isFinite(loanD) || loanD < 1) {
            throw new BadRequestError('loanDays không hợp lệ');
        }
        const fine = overdueFinePerDay !== undefined ? Number(overdueFinePerDay) : 1000;
        if (!Number.isFinite(fine) || fine < 0) {
            throw new BadRequestError('overdueFinePerDay không hợp lệ');
        }
        const renewExt = normalizeRenewExtensionDays(renewExtensionDays);
        if (renewExtensionDays !== undefined && renewExtensionDays !== null && renewExt === null) {
            throw new BadRequestError('renewExtensionDays chỉ được phép là 7 (1 tuần) hoặc 14 (2 tuần)');
        }

        const existed = await PolicyMongo.findOne({ readerType }).lean();
        if (existed) {
            throw new BadRequestError('Đã tồn tại chính sách cho readerType này');
        }

        const doc = await PolicyMongo.create({
            readerType,
            maxBooks: maxB,
            loanDays: loanD,
            renewExtensionDays: renewExt ?? 14,
            overdueFinePerDay: fine,
        });

        new Created({
            message: 'Tạo chính sách thành công',
            metadata: toClientPolicy(doc),
        }).send(res);
    }

    async updatePolicy(req, res) {
        const { id } = req.params;
        if (!id || !mongoose.isValidObjectId(id)) {
            throw new BadRequestError('Thiếu hoặc sai id chính sách');
        }
        const policy = await PolicyMongo.findById(id);
        if (!policy) {
            throw new BadRequestError('Chính sách không tồn tại');
        }

        const { maxBooks, loanDays, overdueFinePerDay, readerType, renewExtensionDays } = req.body;

        if (readerType !== undefined) {
            const rt = String(readerType).trim();
            if (!READER_TYPES.includes(rt)) {
                throw new BadRequestError('readerType không hợp lệ');
            }
            const clash = await PolicyMongo.findOne({ readerType: rt, _id: { $ne: policy._id } }).lean();
            if (clash) {
                throw new BadRequestError('readerType đã được dùng cho bản ghi khác');
            }
            policy.readerType = rt;
        }

        if (maxBooks !== undefined) {
            const n = Number(maxBooks);
            if (!Number.isFinite(n) || n < 1) throw new BadRequestError('maxBooks không hợp lệ');
            policy.maxBooks = n;
        }
        if (loanDays !== undefined) {
            const n = Number(loanDays);
            if (!Number.isFinite(n) || n < 1) throw new BadRequestError('loanDays không hợp lệ');
            policy.loanDays = n;
        }
        if (renewExtensionDays !== undefined) {
            const r = normalizeRenewExtensionDays(renewExtensionDays);
            if (r === null) throw new BadRequestError('renewExtensionDays chỉ được phép là 7 (1 tuần) hoặc 14 (2 tuần)');
            policy.renewExtensionDays = r;
        }
        if (overdueFinePerDay !== undefined) {
            const n = Number(overdueFinePerDay);
            if (!Number.isFinite(n) || n < 0) throw new BadRequestError('overdueFinePerDay không hợp lệ');
            policy.overdueFinePerDay = n;
        }

        await policy.save();

        new OK({
            message: 'Cập nhật chính sách thành công',
            metadata: toClientPolicy(policy),
        }).send(res);
    }

    async deletePolicy(req, res) {
        const { id } = req.params;
        if (!id || !mongoose.isValidObjectId(id)) {
            throw new BadRequestError('Thiếu hoặc sai id chính sách');
        }
        const r = await PolicyMongo.deleteOne({ _id: id });
        if (r.deletedCount === 0) {
            throw new BadRequestError('Chính sách không tồn tại');
        }
        new OK({
            message: 'Xóa chính sách thành công',
            metadata: { deleted: true },
        }).send(res);
    }

    /**
     * Đặt lại phiếu mượn / phạt của độc giả mẫu quầy (MSV seed circulation) và trả bản sao về kho.
     * POST /api/policy/refresh-circulation-sample — chỉ admin.
     */
    async refreshCirculationSample(req, res) {
        const metadata = await resetCirculationSamplePatronsState();
        new OK({
            message:
                metadata.patronCount > 0
                    ? 'Đã làm mới trạng thái dữ liệu mẫu quầy (phiếu mượn, phạt, bản sao).'
                    : 'Không tìm thấy độc giả mẫu quầy trong CSDL.',
            metadata,
        }).send(res);
    }
}

module.exports = new policyController();
