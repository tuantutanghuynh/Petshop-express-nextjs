import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../services/prisma';
import { signAccessToken } from '../services/jwt.service';
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from '../services/token.service';
import asyncHandler from '../utils/asyncHandler';
import ApiError from '../utils/ApiError';
import { sendSuccess } from '../utils/ApiResponse';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'Email này đã được đăng ký');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: 'customer' },
  });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  sendSuccess(res, {
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    accessToken,
    refreshToken,
  }, null, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  sendSuccess(res, {
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    accessToken,
    refreshToken,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Refresh token không được cung cấp');

  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ, bị thu hồi hoặc hết hạn');
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  sendSuccess(res, { accessToken, refreshToken: rotated.rawToken });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  // authenticate gán req.user = { id, role } chứ không giữ nguyên payload JWT, nên phải đọc
  // .id. Đọc .sub thì luôn nhận undefined và Prisma ném lỗi -> endpoint 500 với mọi token.
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
  sendSuccess(res, { id: user.id, email: user.email, fullName: user.fullName, role: user.role });
});

// One answer for every email, registered or not. Answering "check the logs" for known emails and
// something else for unknown ones let anyone test which addresses have an account here.
const RESET_REQUESTED_MESSAGE = 'Nếu email tồn tại, link reset sẽ được gửi.';

export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return sendSuccess(res, { message: RESET_REQUESTED_MESSAGE });
  }
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  // No email provider is wired up yet, so on a developer's machine the link is printed to the
  // console as the only way to get it. Everywhere else it must never be logged: the raw token is a
  // password-equivalent, and anyone who can read the hosting logs could take over every account
  // that asks for a reset. Until an email service exists, resets therefore only work locally.
  if (process.env.NODE_ENV === 'development') {
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    console.log(`[PASSWORD RESET] ${email}:\n${resetLink}`);
  }
  sendSuccess(res, { message: RESET_REQUESTED_MESSAGE });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, token, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(400, 'INVALID_REQUEST', 'Email không hợp lệ');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.userId !== user.id) {
    throw new ApiError(400, 'INVALID_TOKEN', 'Token reset không hợp lệ');
  }
  if (new Date() > resetToken.expiresAt) {
    throw new ApiError(400, 'EXPIRED_TOKEN', 'Token reset đã hết hạn');
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Spend the token and change the password in one transaction, and only if THIS request is the
  // one that deleted the token. The lookup above is a snapshot: five concurrent submits of the same
  // link all found the token, all changed the password, and all but one then crashed with a 500 on
  // `delete` because the row was already gone. A token is single-use, so losing the race is the
  // same as presenting an already-used token.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.passwordResetToken.deleteMany({ where: { id: resetToken.id } });
    if (count !== 1) throw new ApiError(400, 'INVALID_TOKEN', 'Token reset không hợp lệ');
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
  });

  sendSuccess(res, { message: 'Mật khẩu đã được đặt lại thành công' });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  sendSuccess(res, { message: 'Đăng xuất thành công' });
});

export default { register, login, refresh, logout, me, requestPasswordReset, resetPassword };
