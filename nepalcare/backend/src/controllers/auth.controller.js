

import { registerUser, loginUser, publicUser } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
export const register = asyncHandler(async (req, res) => res.status(201).json({ success: true, message: 'Account created.', data: await registerUser(req.body) }));
export const login = asyncHandler(async (req, res) => res.json({ success: true, message: 'Signed in.', data: await loginUser(req.body) }));
export const me = asyncHandler(async (req, res) => res.json({ success: true, data: { user: publicUser(req.user) } }));
export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name','phone'];
  for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = String(req.body[key]).trim();
  await req.user.save();
  res.json({ success: true, message: 'Profile updated.', data: { user: publicUser(req.user) } });
});
