const cron = require('node-cron');
const dayjs = require('dayjs');
const crypto = require('crypto');
const mongoose = require('mongoose');

const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const NotificationMongo = require('../models/notification.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');

function random36() {
    return crypto.randomUUID();
}

function startOverdueNotificationJob() {
    // Chạy mỗi ngày lúc 07:30 (giờ server)
    cron.schedule('30 7 * * *', async () => {
        if (mongoose.connection.readyState !== 1) return;
        try {
            await runOnce();
        } catch (e) {
            console.error('[overdueNotificationJob] error:', e?.message || e);
        }
    });
    console.log('[overdueNotificationJob] scheduled 07:30 daily');
}

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const u = await UserMongo.findById(id).lean();
        if (u) return u;
    }
    return UserMongo.findOne({ mysqlId: String(id) }).lean();
}

async function resolveBookTitleForLoan(loanLean) {
    if (!loanLean) return null;
    if (loanLean.bookId) {
        const b = await BookMongo.findById(loanLean.bookId).select('title nameProduct bookCode').lean();
        if (b) return { title: b.title || b.nameProduct || '', bookCode: b.bookCode || '' };
    }
    // fallback: copy đầu tiên
    const ids = loanLean.issuedBookCopyIds?.length ? loanLean.issuedBookCopyIds : loanLean.bookCopyIds || [];
    if (ids.length) {
        const first = await BookCopyMongo.findById(ids[0]).select('bookId').lean();
        if (first?.bookId) {
            const b = await BookMongo.findById(first.bookId).select('title nameProduct bookCode').lean();
            if (b) return { title: b.title || b.nameProduct || '', bookCode: b.bookCode || '' };
        }
    }
    return null;
}

function buildOverdueHtml({ fullName, overdueCount, examples }) {
    const ex = Array.isArray(examples) ? examples.slice(0, 4) : [];
    return `
    <div style="font-family:Segoe UI,system-ui,Arial,sans-serif">
      <p>Kính gửi <b>${fullName || 'bạn độc giả'}</b>,</p>
      <p>Thư viện ghi nhận bạn đang có <b>${Number(overdueCount || 0)}</b> phiếu mượn <b>quá hạn</b>.</p>
      ${ex.length ? `<div style="margin:10px 0 12px 0">
        <div style="font-size:12px;color:#64748b;margin-bottom:6px">Một số đầu sách:</div>
        <ul style="margin:0;padding-left:18px">
          ${ex
              .map((x) => {
                  const t = x?.title ? String(x.title) : '—';
                  const code = x?.bookCode ? `<span style="font-family:monospace">${String(x.bookCode)}</span>` : '—';
                  const due = x?.dueDate ? dayjs(x.dueDate).format('DD/MM/YYYY') : '—';
                  return `<li><b>${t}</b> (mã: ${code}, hạn trả: ${due})</li>`;
              })
              .join('')}
        </ul>
      </div>` : ''}
      <p>Vui lòng mang sách đến thư viện để trả trong thời gian sớm nhất.</p>
      <p style="color:#64748b;font-size:12px">Thông báo tự động từ hệ thống.</p>
    </div>`;
}

async function runOnce() {
    const now = new Date();
    const todayKey = dayjs(now).format('YYYY-MM-DD');

    const overdueLoans = await LoanTicketMongo.find({
        status: { $in: ['BORROWING', 'OVERDUE'] },
        dueDate: { $ne: null, $lt: now },
    })
        .sort({ dueDate: 1 })
        .limit(6000)
        .lean();

    if (!overdueLoans.length) return;

    // Group theo userId để mỗi sinh viên chỉ nhận 1 thông báo/ngày
    const byUser = new Map();
    for (const loan of overdueLoans) {
        const uid = String(loan.userId || '').trim();
        if (!uid) continue;
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid).push(loan);
    }

    let created = 0;
    for (const [rawUid, loans] of byUser.entries()) {
        const user = await findUserByAnyId(rawUid);
        if (!user) continue;
        const userId = String(user._id);
        const dedupeKey = `AUTO_OVERDUE_USER:${userId}:${todayKey}`;

        const existed = await NotificationMongo.findOne({ userId, dedupeKey }).select('_id').lean();
        if (existed) continue;

        const examples = [];
        for (const l of loans.slice(0, 4)) {
            const bookInfo = await resolveBookTitleForLoan(l);
            examples.push({ title: bookInfo?.title || null, bookCode: bookInfo?.bookCode || null, dueDate: l.dueDate || null });
        }

        const contentHtml = buildOverdueHtml({
            fullName: user.fullName,
            overdueCount: loans.length,
            examples,
        });

        await NotificationMongo.create({
            mysqlId: random36(),
            userId,
            type: 'WARNING',
            title: 'Nhắc trả sách quá hạn',
            contentHtml,
            dedupeKey,
            readAt: null,
            meta: {
                overdueLoans: loans.slice(0, 8).map((l) => ({ loanTicketId: String(l._id), dueDate: l.dueDate || null })),
            },
        });
        await UserMongo.updateOne({ _id: userId }, { $inc: { warningCount: 1 } }).catch(() => {});
        created += 1;
    }

    if (created > 0) {
        console.log(`[overdueNotificationJob] created ${created} notifications`);
    }
}

module.exports = { startOverdueNotificationJob, runOnceOverdueNotificationJob: runOnce };

