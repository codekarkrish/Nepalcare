import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  adminLevel: user.adminLevel,
  permissions: user.permissions || [],
  isVerified: user.isVerified,
  isActive: user.isActive,
  createdAt: user.createdAt
});
function tokenFor(user) { return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }); }
export async function registerUser(input) {
  const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '');
  if (name.length < 2) throw new HttpError(400, 'Name must contain at least 2 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must contain at least 8 characters.');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');
  const role = input.role === 'NGO' ? 'NGO' : 'CITIZEN';
  const user = await User.create({ name, email, phone: String(input.phone || '').trim(), password: await bcrypt.hash(password, 12), role });
  return { user: publicUser(user), token: tokenFor(user) };
}
export async function loginUser(input) {
  const email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '');
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) throw new HttpError(401, 'Email or password is incorrect.');
  if (!user.isActive) throw new HttpError(403, 'This account is inactive. Contact support.');
  return { user: publicUser(user), token: tokenFor(user) };
}
export { publicUser };
