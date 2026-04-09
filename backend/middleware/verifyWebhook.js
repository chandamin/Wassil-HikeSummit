// const crypto = require('crypto');

// module.exports = function verifyWebhook(req, res, next) {
//   const rawBody = req.rawBody;

//   if (!rawBody) {
//     return res.status(401).send('Missing raw body');
//   }

//   const body = JSON.parse(rawBody);

//   if (!body.hash) {
//     return res.status(401).send('Missing hash');
//   }

//   const receivedHash = body.hash;

//   /**
//    * IMPORTANT:
//    * Remove `"hash":"..."` from the RAW STRING
//    * including trailing comma handling
//    */
//   const rawWithoutHash = rawBody
//     .replace(/,\s*"hash"\s*:\s*"[^"]+"/, '')
//     .replace(/"hash"\s*:\s*"[^"]+",\s*/, '');

//   const expectedHash = crypto
//     .createHash('sha1')
//     .update(rawWithoutHash)
//     .digest('hex');

//   if (expectedHash !== receivedHash) {
//     console.error('Invalid webhook hash');
//     console.error('Expected:', expectedHash);
//     console.error('Received:', receivedHash);
//     return res.status(401).send('Invalid signature');
//   }

//   next();
// };

const crypto = require('crypto');

module.exports = function verifyWebhook(req, res, next) {
  const receivedSecret = req.get('X-Webhook-Secret');
  const expectedSecret = process.env.BC_WEBHOOK_SECRET;

  if (!receivedSecret || !expectedSecret) {
    return res.status(401).send('Missing webhook secret');
  }

  const valid =
    receivedSecret.length === expectedSecret.length &&
    crypto.timingSafeEqual(
      Buffer.from(receivedSecret, 'utf8'),
      Buffer.from(expectedSecret, 'utf8')
    );

  if (!valid) {
    return res.status(401).send('Invalid webhook secret');
  }

  next();
};