File: library_mail_import_sample.csv
Collection MongoDB: library_mail

COT (header dong 1):
- mysqlId, type, title, contentHtml, senderEmail, senderName, senderStudentId, recipientUserId
- status: PENDING | RESOLVED (FORGOT_PASSWORD dang cho -> PENDING; da gui xong -> RESOLVED)
- resolvedAt, resolvedBy (ISO 8601 hoac de trong)
- deliveryStatus: success | failed | pending
- recipientCount: so nguyen
- createdAt, updatedAt: ISO 8601
- meta: JSON trong dau ngoac kep (de trong neu khong can)

Gia tri type hop le: SYSTEM | BORROW_CONFIRM | FORGOT_PASSWORD

MongoDB Compass:
1. Database -> collection library_mail -> Add Data -> Import JSON or CSV
2. Chon file CSV, map dung ten cot
3. Cot meta: neu Compass nhap lai string, sau import chay Update Pipeline hoac sua tay thanh object; hoac xoa cot meta va de app tu gan.

mongoimport (vi du):
  mongoimport --uri="YOUR_MONGODB_URI" --db=YOUR_DB --collection=library_mail --type=csv --headerline --file=library_mail_import_sample.csv

Luu y: mongoimport thuong nhap so/date dang string; co the can chuyen kieu trong Compass hoac script sau import.
