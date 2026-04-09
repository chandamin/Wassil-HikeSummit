const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const Store = require('../models/Store');
const registerWebhooks = require('../services/registerWebhooks');

const router = express.Router();
const crypto = require('crypto');

/**
 * ---------------------------------------
 * AUTH + INSTALL
 * GET /api/auth
 * ---------------------------------------
 */
router.get('/auth', async (req, res) => {
    const { code, context, scope, client_id } = req.query;

    /**
     * Step 1: Initial install (no code)
     */
    if (!code || !context) {
        const installUrl =
            `https://login.bigcommerce.com/oauth2/authorize` +
            `?client_id=${client_id}` +
            `&scope=${scope}` +
            `&redirect_uri=${process.env.BIGCOMMERCE_REDIRECT_URI}` +
            `&response_type=code` +
            `&context=${context}`;

        return res.redirect(installUrl);
    }

    /**
     * Step 2: OAuth callback
     */
    try {
        const tokenResponse = await axios.post(
            'https://login.bigcommerce.com/oauth2/token',
            {
                client_id: process.env.BIGCOMMERCE_CLIENT_ID,
                client_secret: process.env.BIGCOMMERCE_CLIENT_SECRET,
                code,
                context,
                scope,
                grant_type: 'authorization_code',
                redirect_uri: process.env.BIGCOMMERCE_REDIRECT_URI,
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log('Redirect URI:', process.env.BIGCOMMERCE_REDIRECT_URI);
        const { access_token, context: storeContext } = tokenResponse.data;
        const storeHash = storeContext.split('/')[1];

        // Save store
        await Store.findOneAndUpdate(
            { storeHash },
            { storeHash, accessToken: access_token, scope },
            { upsert: true }
        );

        // Register webhooks ONCE per install
        await registerWebhooks({
            storeHash,
            accessToken: access_token,
        });

        return res.redirect(
            `${process.env.FRONTEND_URL}?store_hash=${storeHash}`
        );

    } catch (err) {
        console.error('OAuth failed:', err.response?.data || err.message);
        return res.status(500).json({ error: 'OAuth failed' });
    }
});

/**
 * ---------------------------------------
 * LOAD CALLBACK
 * GET /api/load
 * ---------------------------------------
 */
router.get('/load', (req, res) => {
    const { signed_payload_jwt } = req.query;

    if(!signed_payload_jwt){
        return res.status(400).send("Mising signed_payload_jwt");
    }

    console.log("LOAD", signed_payload_jwt);

    try {
        const decoded = jwt.verify(
            signed_payload_jwt,
            process.env.BIGCOMMERCE_CLIENT_SECRET,
            { algorithms: ['HS256'], clockTolerance: 300 }
        );

        // console.log("DECODE", decoded);

        return res.redirect(
            `${process.env.FRONTEND_URL}?store_hash=${decoded.store_hash}`
        );

    } catch (err){
        // console.log("JWT error", err.message)
        return res.status(401).send('Invalid signed payload');
    }
});

/**
 * ---------------------------------------
 * UNINSTALL CALLBACK
 * GET /api/uninstall
 * ---------------------------------------
 */
router.get('/uninstall', async (req, res) => {
    const { signed_payload_jwt } = req.query;

    try {
        const decoded = jwt.verify(
            signed_payload_jwt,
            process.env.BIGCOMMERCE_CLIENT_SECRET,
            { algorithms: ['HS256'] }
        );

        await Store.deleteOne({ storeHash: decoded.store_hash });

        return res.status(200).send('Uninstalled');
    } catch {
        return res.status(401).send('Invalid signed payload');
    }
});

module.exports = router;
