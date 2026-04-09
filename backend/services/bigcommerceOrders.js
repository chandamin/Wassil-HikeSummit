const axios = require('axios');
const Store = require('../models/Store');

async function fetchOrders(storeHash, customerEmail) {
    const store = await Store.findOne({ storeHash });
    if (!store) return [];

    const res = await axios.get(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
        {
            headers: {
                'X-Auth-Token': store.accessToken,
                'Accept': 'application/json',
            },
            params: {
                email: customerEmail,
            },
        }
    );

    return res.data.map(order => ({
        orderId: order.id,
        orderNumber: order.order_number,
        total: order.total_inc_tax,
        createdAt: order.date_created,
    }));
}

module.exports = fetchOrders;
