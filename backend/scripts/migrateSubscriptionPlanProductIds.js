require('dotenv').config();
const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');

function normaliseBigcommerceProductIds(input) {
  const raw = Array.isArray(input)
    ? input
    : input === undefined || input === null
      ? []
      : [input];

  return [...new Set(
    raw
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const plans = await SubscriptionPlan.collection.find({}).toArray();
    let updatedCount = 0;

    for (const plan of plans) {
      const normalizedProductIds = normaliseBigcommerceProductIds(
        plan.bigcommerceProductIds?.length ? plan.bigcommerceProductIds : plan.bigcommerceProductId
      );

      if (normalizedProductIds.length === 0) {
        console.warn(`Skipping plan ${plan._id}: no valid product ids found`);
        continue;
      }

      await SubscriptionPlan.collection.updateOne(
        { _id: plan._id },
        {
          $set: { bigcommerceProductIds: normalizedProductIds },
          $unset: { bigcommerceProductId: '' },
        }
      );

      updatedCount += 1;
    }

    console.log(`Migration complete. Updated ${updatedCount} subscription plan document(s).`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
