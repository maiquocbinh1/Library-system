/**
 * One-way migration: MySQL (books DB) → MongoDB Atlas.
 * Order: users → products → apiKeys → historyBooks → otps
 * Idempotent: skips rows when mysqlId already exists (safe re-run).
 */

const path = require('path');
// override: true — file .env ghi đè biến môi trường hệ thống (tránh MYSQL_USER=root từ OS)
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

const User = require('./models/User');
const Product = require('./models/Product');
const ApiKey = require('./models/ApiKey');
const HistoryBook = require('./models/HistoryBook');
const Otp = require('./models/Otp');

const DRY_RUN =
    process.env.DRY_RUN === 'true' ||
    process.argv.includes('--dry-run') ||
    process.argv.includes('--dry');

function log(section, msg, data) {
    const ts = new Date().toISOString();
    if (data !== undefined) {
        console.log(`[${ts}] [${section}] ${msg}`, data);
    } else {
        console.log(`[${ts}] [${section}] ${msg}`);
    }
}

function toDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

async function connectMysql() {
    const host = process.env.MYSQL_HOST || '127.0.0.1';
    const port = Number(process.env.MYSQL_PORT || 3306);
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD ?? '';
    const database = process.env.MYSQL_DATABASE || 'books';

    const pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 5,
        charset: 'utf8mb4',
        dateStrings: false,
    });

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    log('mysql', `Connected to MySQL ${host}:${port}/${database}`);
    return pool;
}

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required in .env (unless using --dry-run only)');
    }
    const dbName = process.env.MONGODB_DB_NAME;
    const opts = {};
    if (dbName) opts.dbName = dbName;

    await mongoose.connect(uri, opts);
    log('mongo', `Connected to MongoDB: ${mongoose.connection.name}`);
}

/** MySQL-only inspection: no MongoDB required. Verifies row counts and UTF-8 text lengths. */
async function dryRunMysqlOnly(pool) {
    const tables = ['users', 'products', 'apiKeys', 'historyBooks', 'otps'];
    for (const t of tables) {
        const [r] = await pool.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
        log('dry-run', `Table \`${t}\`: ${r[0].c} row(s)`);
    }

    const [prows] = await pool.query(
        'SELECT id, nameProduct, CHAR_LENGTH(description) AS len FROM products',
    );
    log('dry-run', `products: ${prows.length} row(s) with description length check (UTF-8 safe in MySQL)`);
    for (const p of prows) {
        log('dry-run', `  id=${p.id} name="${String(p.nameProduct).slice(0, 50)}..." desc_len=${p.len}`);
    }

    log('dry-run', 'Done. No data written to MongoDB. Run without --dry-run to migrate.');
}

/**
 * @returns {Promise<Map<string, import('mongoose').Types.ObjectId>>}
 */
async function migrateUsers(pool) {
    const map = new Map();
    const [rows] = await pool.query(
        'SELECT id, avatar, fullName, phone, address, email, password, role, typeLogin, idStudent, createdAt, updatedAt FROM users',
    );
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
        const mysqlId = String(row.id);
        const existing = await User.findOne({ mysqlId });
        if (existing) {
            map.set(mysqlId, existing._id);
            skipped += 1;
            continue;
        }

        const doc = {
            mysqlId,
            avatar: row.avatar ?? null,
            fullName: row.fullName,
            phone: row.phone ?? null,
            address: row.address ?? null,
            email: row.email,
            password: row.password ?? null,
            role: row.role,
            typeLogin: row.typeLogin,
            idStudent: row.idStudent ?? null,
        };

        const created = await User.create({
            ...doc,
            createdAt: toDate(row.createdAt),
            updatedAt: toDate(row.updatedAt),
        });
        map.set(mysqlId, created._id);
        inserted += 1;
    }

    log('migrate:users', `done — inserted=${inserted}, skipped(existing)=${skipped}, total_rows=${rows.length}`);
    return map;
}

/**
 * @returns {Promise<Map<string, import('mongoose').Types.ObjectId>>}
 */
async function migrateProducts(pool) {
    const map = new Map();
    const [rows] = await pool.query(
        'SELECT id, image, nameProduct, description, stock, covertType, publishYear, pages, language, publisher, publishingCompany, createdAt, updatedAt FROM products',
    );
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
        const mysqlId = String(row.id);
        const existing = await Product.findOne({ mysqlId });
        if (existing) {
            map.set(mysqlId, existing._id);
            skipped += 1;
            continue;
        }

        const description = row.description == null ? '' : String(row.description);

        const created = await Product.create({
            mysqlId,
            image: row.image,
            nameProduct: row.nameProduct,
            description,
            stock: Number(row.stock),
            covertType: row.covertType,
            publishYear: Number(row.publishYear),
            pages: Number(row.pages),
            language: row.language,
            publisher: row.publisher,
            publishingCompany: row.publishingCompany,
            createdAt: toDate(row.createdAt),
            updatedAt: toDate(row.updatedAt),
        });
        map.set(mysqlId, created._id);
        inserted += 1;
    }

    log(
        'migrate:products',
        `done — inserted=${inserted}, skipped(existing)=${skipped}, total_rows=${rows.length}`,
    );
    return map;
}

async function migrateApiKeys(pool, userIdMap) {
    const [rows] = await pool.query(
        'SELECT id, userId, publicKey, privateKey, createdAt, updatedAt FROM apiKeys',
    );
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
        const mysqlId = String(row.id);
        const mysqlUserId = String(row.userId);

        const existing = await ApiKey.findOne({ mysqlId });
        if (existing) {
            skipped += 1;
            continue;
        }

        const userOid = userIdMap.get(mysqlUserId);
        if (!userOid) {
            log('migrate:apiKeys', `WARN: no User for mysqlUserId=${mysqlUserId}, skipping apiKey mysqlId=${mysqlId}`);
            failed += 1;
            continue;
        }

        await ApiKey.create({
            mysqlId,
            mysqlUserId,
            user: userOid,
            publicKey: String(row.publicKey),
            privateKey: String(row.privateKey),
            createdAt: toDate(row.createdAt),
            updatedAt: toDate(row.updatedAt),
        });
        inserted += 1;
    }

    log('migrate:apiKeys', `done — inserted=${inserted}, skipped=${skipped}, failed=${failed}, total_rows=${rows.length}`);
}

async function migrateHistoryBooks(pool, userIdMap, productIdMap) {
    const [rows] = await pool.query(
        'SELECT id, userId, fullName, phone, address, bookId, borrowDate, returnDate, status, quantity, createdAt, updatedAt FROM historyBooks',
    );
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
        const mysqlId = String(row.id);
        const mysqlUserId = String(row.userId);
        const mysqlBookId = String(row.bookId);

        const existing = await HistoryBook.findOne({ mysqlId });
        if (existing) {
            skipped += 1;
            continue;
        }

        const userOid = userIdMap.get(mysqlUserId);
        const bookOid = productIdMap.get(mysqlBookId);
        if (!userOid || !bookOid) {
            log(
                'migrate:historyBooks',
                `WARN: missing ref user=${Boolean(userOid)} book=${Boolean(bookOid)} mysqlId=${mysqlId}`,
            );
            failed += 1;
            continue;
        }

        await HistoryBook.create({
            mysqlId,
            mysqlUserId,
            mysqlBookId,
            user: userOid,
            book: bookOid,
            fullName: row.fullName,
            phone: row.phone ?? null,
            address: row.address ?? null,
            borrowDate: toDate(row.borrowDate),
            returnDate: toDate(row.returnDate),
            status: row.status,
            quantity: Number(row.quantity ?? 1),
            createdAt: toDate(row.createdAt),
            updatedAt: toDate(row.updatedAt),
        });
        inserted += 1;
    }

    log(
        'migrate:historyBooks',
        `done — inserted=${inserted}, skipped=${skipped}, failed=${failed}, total_rows=${rows.length}`,
    );
}

async function migrateOtps(pool) {
    const [rows] = await pool.query('SELECT id, email, otp, createdAt, updatedAt FROM otps');
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
        const mysqlId = Number(row.id);
        const existing = await Otp.findOne({ mysqlId });
        if (existing) {
            skipped += 1;
            continue;
        }

        await Otp.create({
            mysqlId,
            email: row.email,
            otp: row.otp,
            createdAt: toDate(row.createdAt),
            updatedAt: toDate(row.updatedAt),
        });
        inserted += 1;
    }

    log('migrate:otps', `done — inserted=${inserted}, skipped(existing)=${skipped}, total_rows=${rows.length}`);
}

async function main() {
    let pool;
    try {
        pool = await connectMysql();

        if (DRY_RUN) {
            await dryRunMysqlOnly(pool);
            return;
        }

        await connectMongo();

        const userIdMap = await migrateUsers(pool);
        const productIdMap = await migrateProducts(pool);
        await migrateApiKeys(pool, userIdMap);
        await migrateHistoryBooks(pool, userIdMap, productIdMap);
        await migrateOtps(pool);

        log('main', 'Migration finished successfully.');
    } catch (err) {
        console.error('[fatal]', err);
        process.exitCode = 1;
    } finally {
        if (pool) {
            await pool.end();
            log('mysql', 'Pool closed');
        }
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close().catch(() => {});
            log('mongo', 'Disconnected');
        }
    }
}

main();
