/**
 * One-time script to create the initial admin user.
 * Usage: node scripts/createAdmin.js <username> <password>
 * Example: node scripts/createAdmin.js admin MySecurePass123
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const connectDB = require('../db/mongo');
const AdminUser = require('../models/AdminUser');

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('Usage: node scripts/createAdmin.js <username> <password>');
    process.exit(1);
  }

  await connectDB();

  const existing = await AdminUser.findOne({ username });
  if (existing) {
    console.log(`User "${username}" already exists.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await AdminUser.create({ username, passwordHash, role: 'admin' });
  console.log(`Admin user "${username}" created successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
