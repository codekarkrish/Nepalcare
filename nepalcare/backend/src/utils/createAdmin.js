import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const args = process.argv.slice(2);

const emailArg = args.find(
  (arg) => arg.includes('@') && !arg.startsWith('--')
);

if (!emailArg || emailArg.startsWith('--')) {
  console.error('Usage: npm run admin:create -- --email existing-user@example.com');
  process.exit(1);
}

if (
  !process.env.MONGO_URI ||
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  console.error('Configure MONGO_URI and a 32+ character JWT_SECRET first.');
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

try {
  await mongoose.connect(process.env.MONGO_URI);

  // Prevent creating another Main Admin
  const existingMainAdmin = await User.findOne({
    role: 'ADMIN',
    adminLevel: 'MAIN_ADMIN'
  });

  if (existingMainAdmin) {
    throw new Error('A Main Admin already exists. Promotion blocked.');
  }

  const user = await User.findOne({
    email: emailArg.toLowerCase()
  }).select('+password');

  if (!user) {
    throw new Error('No existing account found. Register the account first.');
  }

  const password = await rl.question(
    'Enter the existing account password to confirm promotion: '
  );

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    throw new Error('Password did not match. No changes made.');
  }

  user.role = 'ADMIN';
  user.adminLevel = 'MAIN_ADMIN';
  user.permissions = [];
  user.isVerified = true;

  await user.save();

  console.log(`Account ${user.email} is now the MAIN_ADMIN.`);
} catch (error) {
  console.error(`Main Admin setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}