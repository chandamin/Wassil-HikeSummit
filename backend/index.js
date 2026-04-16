require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Write all stdout/stderr to a log file so errors are visible on shared hosting
const logFile = fs.createWriteStream(path.join(__dirname, 'app.log'), { flags: 'a' });
const logWithTime = (msg) => logFile.write(`[${new Date().toISOString()}] ${msg}\n`);
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => { const m = args.join(' '); _origLog(m); logWithTime(m); };
console.error = (...args) => { const m = args.join(' '); _origErr(m); logWithTime('ERROR: ' + m); };
process.on('uncaughtException', (err) => { logWithTime('UNCAUGHT: ' + err.stack); process.exit(1); });
process.on('unhandledRejection', (err) => { logWithTime('UNHANDLED: ' + (err?.stack || err)); });

const express = require('express');
const cors = require('cors');
const connectDB = require('./db/mongo');

const app = express();
app.set('trust proxy', 1);

// const cors = require('cors');

const allowedOrigins = [
  process.env.FRONTEND_URL?.replace(/\/$/, ''),
  process.env.BACKEND_URL?.replace(/\/$/, ''),
  'https://airwall.kaswebtechsolutions.com',
  'https://nomade-horizon.com/',
  'https://nomade-horizon.com',
  'http://localhost:5173',
  'http://192.168.29.30:5173',
  'http://checkout.nomade-horizon.com',
  'https://checkout.nomade-horizon.com',
  'http://apicheckout.nomade-horizon.com',
  'https://apicheckout.nomade-horizon.com',
  'https://nomade-horizon.com',
  'https://kasweb-c4.mybigcommerce.com',
  'https://checkout.hike-summit.com',
  'http://api.hike-summit.com',
  /https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

app.use(cors(corsOptions));
app.options('/{*any}', cors(corsOptions));

// app.use(cors({
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps, curl, Postman)
//     if (!origin) return callback(null, true);
    
//     const allowedOrigins = [
//       process.env.FRONTEND_URL?.replace(/\/$/, ''), // remove trailing slash
//       process.env.BACKEND_URL?.replace(/\/$/, ''),
//       'https://airwall.kaswebtechsolutions.com',
//       'http://localhost:5173',
//       'http://192.168.29.30:5173',
//       'https://airwall.kaswebtechsolutions.com',
//       'http://checkout.nomade-horizon.com',
//       'https://checkout.nomade-horizon.com',
//       'http://apicheckout.nomade-horizon.com',
//       // Add ngrok pattern - allows any ngrok-free.dev subdomain
//       /https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/,
//     ].filter(Boolean); // remove undefined/null values

//     if (allowedOrigins.some(pattern => 
//       typeof pattern === 'string' 
//         ? origin === pattern 
//         : pattern.test(origin)
//     )) {
//       callback(null, true);
//     } else {
//       console.warn('🚫 CORS blocked origin:', origin);
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
//   exposedHeaders: ['Content-Range', 'X-Content-Range'],
// }));

// app.options('*', cors(corsOptions));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

// app.use(cors({
//   origin: [
//     process.env.FRONTEND_URL,
//     process.env.BACKEND_URL,
//     'https://airwall.kaswebtechsolutions.com',
//     'http://localhost:5173',
//     'http://192.168.29.30:5173/',
//     'checkout.nomade-horizon.com',
//   ],
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
// }));


/**
 * ---------------------------------------
 * Routes
 * ---------------------------------------
 */
const requireSession = require('./middleware/requireSession');

// Public routes (no auth required)
app.use('/api/admin-auth', require('./routes/adminAuth'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/bigcommerceRoutes'));

// Airwallex plan/checkout routes — partial auth (plan CRUD protected inside each router)
app.use('/api/selling-plans', require('./routes/airwallexLivePlan'));
app.use('/api/subscription-plans', require('./routes/airwallexTestPlan'));

// Admin-only routes — all endpoints require valid JWT
app.use('/api/admin', requireSession, require('./routes/admin'));
app.use('/api/dashboard', requireSession, require('./routes/dashboard'));
app.use('/api/subscriptions', requireSession, require('./routes/subscriptions'));
app.use('/api/sync-orders', requireSession, require('./routes/syncOrders'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

connectDB()
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });
