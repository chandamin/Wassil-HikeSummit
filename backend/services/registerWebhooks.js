const axios = require('axios');
const Store = require('../models/Store');

module.exports = async function registerWebhooks({ storeHash, accessToken }) {
    const res = await axios.post(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/hooks`,
        {
            scope: 'store/order/created',
            destination: `${process.env.APP_URL}/api/webhooks/order-created`,
            is_active: true,
        },
        {
            headers: {
                'X-Auth-Token': accessToken,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }
    );

    const webhookSecret = res.data.data.secret;

    await Store.updateOne(
        { storeHash },
        { webhookSecret }
    );
};



// const axios = require('axios');

// async function registerWebhooks({ storeHash, accessToken }) {
//   const baseUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/hooks`;

//   const headers = {
//     'X-Auth-Token': accessToken,
//     'Content-Type': 'application/json',
//     'Accept': 'application/json',
//   };

//   // 1. Fetch existing hooks
//   const existing = await axios.get(baseUrl, { headers });

//   // 2. Delete hooks we manage
//   for (const hook of existing.data.data) {
//     if (
//       hook.scope === 'store/app/uninstalled' ||
//       hook.scope === 'store/order/created'
//     ) {
//       await axios.delete(`${baseUrl}/${hook.id}`, { headers });
//     }
//   }

//   // 3. Create hooks cleanly
//   const hooks = [
//     {
//       scope: 'store/app/uninstalled',
//       destination: `${process.env.BACKEND_URL}/api/webhooks/uninstall`,
//       is_active: true,
//     },
//     {
//       scope: 'store/order/created',
//       destination: `${process.env.BACKEND_URL}/api/webhooks/order-created`,
//       is_active: true,
//     },
//   ];

//   for (const hook of hooks) {
//     await axios.post(baseUrl, hook, { headers });
//   }
// }

// module.exports = registerWebhooks;
