const express = require('express');
const app = express();
const port = 3000;

const { connectDB } = require('./config/connectDB');
const { connectMongo } = require('./config/connectMongo');
const sync = require('./models/sync');

const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const route = require('./routes/index.routes');
const path = require('path');

app.use(
    cors({
        origin: true,
        credentials: true,
    }),
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, '../src')));

async function bootstrap() {
    const mysqlOk = await connectDB();

    if (mysqlOk) {
        try {
            await sync();
        } catch (err) {
            console.warn('[MySQL] sync:', err.message);
        }
    }

    await connectMongo();

    route(app);

    app.use((err, req, res, next) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            message: err.message || 'Lỗi server',
        });
    });

    app.listen(port, () => {
        console.log(`Listening on :${port}`);
    });
}

bootstrap().catch((err) => {
    console.error('[Server] Bootstrap lỗi:', err);
    process.exit(1);
});
