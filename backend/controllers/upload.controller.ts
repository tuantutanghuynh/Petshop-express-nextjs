import type { Request, Response } from 'express';
import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import config from '../config/env';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';

// Handles image uploads for blog cover photos and gallery items. Files arrive from the
// upload middleware as buffers in memory and are streamed directly to Cloudinary without
// touching disk, so the ephemeral server storage on Render is not filled.

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

// Converts Cloudinary's callback-based upload_stream into a Promise so the controller can
// await it. The buffer is piped to the upload stream which sends it to Cloudinary, where it
// is stored, resized, and made available at a signed HTTPS URL. The stream-based approach
// avoids buffering the entire file into a second place; it flows straight from `req.file.buffer`
// → Cloudinary without occupying more RAM than needed.
function uploadBufferToCloudinary(buffer: Buffer): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_FOLDER || 'miniecom-petshop' },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) return reject(error);
        resolve(result as UploadApiResponse);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// Receives an image file from the upload middleware (already validated by MIME type and size),
// streams it to Cloudinary, and answers 201 with the permanent HTTPS URL. The response carries
// only the URL, not the full Cloudinary metadata, to keep the payload small. `req.file` is
// guaranteed to exist because the upload middleware filtered it; this function only needs to
// reject if the file somehow got lost between middleware and here, which would signal a serious
// pipeline break.
export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(422, 'FILE_REQUIRED', 'Thiếu file ảnh');

  const result = await uploadBufferToCloudinary(req.file.buffer);
  sendSuccess(res, { url: result.secure_url }, null, 201);
});

export default { uploadImage };
