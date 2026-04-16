// // const Airwallex = require('@airwallex/node-sdk');
// const { Airwallex } = require('@airwallex/node-sdk');

// const airwallex = new Airwallex({
//     apiKey: process.env.AIRWALLEX_API_KEY,
//     clientId: process.env.AIRWALLEX_CLIENT_ID,
//     environment: process.env.AIRWALLEX_ENV || 'sandbox',
// });

// module.exports = airwallex;


const axios = require('axios');

const AIRWALLEX_BASE_URL = 'https://api-demo.airwallex.com'; // sandbox
const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID;
const API_KEY = process.env.AIRWALLEX_API_KEY;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    const now = Date.now();

    if (cachedToken && now < tokenExpiry) {
        return cachedToken;
    }

    const res = await axios.post(
        `${AIRWALLEX_BASE_URL}/api/v1/authentication/login`,
        { 
            scope: ['billing'],
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': CLIENT_ID,
                'x-api-key': API_KEY,
            },
        }
    );

    cachedToken = res.data.token;
    tokenExpiry = now + res.data.expires_in * 1000;

    return cachedToken;
}

module.exports = {
    getAccessToken,
    AIRWALLEX_BASE_URL,
};
