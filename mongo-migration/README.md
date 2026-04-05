# MySQL → MongoDB Atlas migration (books / library)

Node.js migration package: reads from MySQL (`mysql2`), writes to MongoDB Atlas (`mongoose`). Based on your `init.sql` dump (tables: `users`, `products`, `apiKeys`, `historyBooks`, `otps`).

---

## MySQL → MongoDB mapping

| MySQL table    | MongoDB collection | Notes |
|----------------|-------------------|--------|
| `users`        | `users`           | Plain fields; `mysqlId` = original UUID string. `_id` is new ObjectId. |
| `products`     | `products`        | `description` kept full length (TEXT → String, UTF-8). `mysqlId` = UUID. Field `covertType` kept as in SQL. |
| `apiKeys`      | `apiKeys`         | `userId` (FK) → `user` (ObjectId ref `User`) + `mysqlUserId` string for traceability. |
| `historyBooks` | `historyBooks`    | `userId` → `user` ref; `bookId` → `book` ref (`Product`). Denormalized `mysqlUserId`, `mysqlBookId`. |
| `otps`         | `otps`            | `mysqlId` = original INT PK. `email`, `otp` as strings. |

**References (not SQL joins):**

- `ApiKey.user` → `User._id`
- `HistoryBook.user` → `User._id`
- `HistoryBook.book` → `Product._id`

**Enums (Mongoose `enum` validation):**

- `users.role`: `admin` | `user`
- `users.typeLogin`: `google` | `email`
- `products.covertType`: `hard` | `soft`
- `historyBooks.status`: `pending` | `success` | `cancel`

**Dates:** `createdAt`, `updatedAt`, `borrowDate`, `returnDate` → JavaScript `Date` (BSON UTC).

**Idempotency:** Each collection uses unique `mysqlId` (string for UUID tables, number for `otps`). Re-running skips existing documents.

**Your dump snapshot:** `products` contains **11 INSERT rows** (long Vietnamese `description`). Other tables had **no rows** in the dump; migration still handles them when data appears.

---

## Folder structure

```
mongo-migration/
  package.json
  .env.example
  README.md
  migrate.js
  models/
    User.js
    Product.js
    ApiKey.js
    HistoryBook.js
    Otp.js
```

---

## Prerequisites

- Node.js 18+
- MySQL server with database imported (e.g. `books`) from your dump
- MongoDB Atlas cluster + connection string (Database Access user, Network Access IP allowlist)

---

## Setup

```bash
cd mongo-migration
cp .env.example .env
# Edit .env: MYSQL_* and MONGODB_URI
npm install
```

### Dry run (MySQL only — no Atlas needed)

Checks row counts and logs each product’s `description` length (proves long text is read; nothing written to MongoDB):

```bash
npm run migrate:dry
# or: node migrate.js --dry-run
```

### Full migration

```bash
npm run migrate
```

Ensure `MONGODB_URI` points to your Atlas cluster. First run creates collections and indexes (`mysqlId` unique).

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `MYSQL_HOST` | Default `127.0.0.1` |
| `MYSQL_PORT` | Default `3306` |
| `MYSQL_USER` | Default `root` |
| `MYSQL_PASSWORD` | MySQL password |
| `MYSQL_DATABASE` | Default `books` |
| `MONGODB_URI` | Atlas SRV URI (required for live migration) |
| `MONGODB_DB_NAME` | Optional; overrides DB name if set |

---

## Troubleshooting

- **Unicode:** Connection uses `utf8mb4`. Vietnamese text is preserved end-to-end.
- **Missing user for apiKey / historyBook:** Rows referencing unknown `userId` are skipped with a WARN log.
- **Atlas connection:** Verify user has `readWrite` on the target DB; IP allowlist includes your machine (or `0.0.0.0/0` for testing only).

---

## After migration

Point your future Node app to MongoDB using Mongoose models in `models/` (or align field names with your new API). This package does **not** modify your existing Express/Sequelize app — it is a **standalone** one-time (or repeatable) migration.
