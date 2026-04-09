// routes/backfill-subscription-emails.js
require('dotenv').config(); // Load environment variables

const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const SubscriptionCustomer = require('../models/SubscriptionCustomer');

// 🔗 Connect to MongoDB
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nomade-subscription';

const connectDB = require('../db/mongo');

async function backfillEmails() {
  try {
    // 1️⃣ Connect first
    await connectDB();

    // 2️⃣ Find subscriptions missing customerEmail
    const subs = await Subscription.find({ 
      customerEmail: { $exists: false } 
    }).lean(); // lean() for faster read-only queries
    
    console.log(`🔍 Found ${subs.length} subscriptions to backfill`);

    if (subs.length === 0) {
      console.log('✨ Nothing to backfill. All subscriptions have customerEmail.');
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const sub of subs) {
      try {
        // 3️⃣ Find matching SubscriptionCustomer
        const sc = await SubscriptionCustomer.findOne({
          bigcommerceCustomerId: sub.bigcommerceCustomerId,
          subscriptionProductId: sub.productId,
        }).lean();
        
        if (sc) {
          // 4️⃣ Update with email + contact info
          await Subscription.findByIdAndUpdate(sub._id, {
            $set: {
              customerEmail: sc.bigcommerceEmail || sc.airwallexEmail,
              customerFirstName: sc.bigcommerceFirstName,
              customerLastName: sc.bigcommerceLastName,
              customerPhone: sc.bigcommercePhone || sc.airwallexPhoneNumber,
              lastSyncedAt: new Date(),
            }
          });
          
          console.log(` Updated ${sub._id} | Email: ${sc.bigcommerceEmail}`);
          updated++;
        } else {
          console.log(`⚠️ Skipped ${sub._id} | No matching SubscriptionCustomer`);
          skipped++;
        }
      } catch (err) {
        console.error(`❌ Error processing ${sub._id}:`, err.message);
      }
    }

    console.log('\n🎉 Backfill complete!');
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);

  } catch (err) {
    console.error('💥 Script failed:', err);
  } finally {
    // 5️⃣ Always close connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Run the script
backfillEmails();