const jwt = require('jsonwebtoken');

module.exports = function requireSession(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing token' });

    const token = auth.replace('Bearer ', '');

    try {
        req.session = jwt.verify(
            token,
            process.env.APP_SESSION_SECRET
        );
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid session' });
    }
};
