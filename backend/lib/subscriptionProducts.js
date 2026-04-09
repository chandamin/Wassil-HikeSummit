const SubscriptionPlan = require('../models/SubscriptionPlan');

async function getEnabledSubscriptionProductIds() {
  const plans = await SubscriptionPlan.find({ status: 'enabled' }).select('bigcommerceProductId');
  return [...new Set(
    plans
      .map((plan) => Number(plan.bigcommerceProductId))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
}

function findDistinctSubscriptionProducts(cart, subscriptionProductIds = []) {
  const physicalItems = cart?.lineItems?.physicalItems || [];
  const digitalItems = cart?.lineItems?.digitalItems || [];
  const allItems = [...physicalItems, ...digitalItems];
  const seen = new Set();

  return allItems.filter((item) => {
    const productId = Number(item.product_id);

    if (!subscriptionProductIds.includes(productId) || seen.has(productId)) {
      return false;
    }

    seen.add(productId);
    return true;
  });
}

module.exports = {
  findDistinctSubscriptionProducts,
  getEnabledSubscriptionProductIds,
};
