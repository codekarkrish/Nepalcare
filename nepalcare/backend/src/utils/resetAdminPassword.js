
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const rl = readline.createInterface({ input, output });

try {
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'admin@nepalcare.com';

  const user = await User.findOne({ email });

  if (!user || user.role !== 'ADMIN') {
    throw new Error('Admin account not found.');
  }

  const password = await rl.question('Enter your new password: ');
  const confirmPassword = await rl.question('Confirm new password: ');

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  if (password !== confirmPassword) {
    throw new Error('Passwords do not match.');
  }

  user.password = await bcrypt.hash(password, 12);
  await user.save();

  console.log('Admin password reset successfully.');
} catch (error) {
  console.error('Password reset failed:', error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
