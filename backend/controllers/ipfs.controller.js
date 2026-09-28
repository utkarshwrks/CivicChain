/**
 * ipfs.controller.js — POST /api/ipfs/upload (pin an image to IPFS via Pinata)
 * The upload is validated by middleware/upload.js (type by magic bytes, size).
 */
import crypto from 'crypto';
import { uploadToIPFS } from '../services/ipfs.service.js';

export async function uploadImageController(req, res) {
  try {
    const { buffer, mimetype, originalname, size } = req.file;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const result = await uploadToIPFS(buffer, mimetype, originalname, { kind: 'upload', sha256 });
    return res.status(200).json({
      success: true, cid: result.cid, gatewayUrl: result.gatewayUrl, ipfsUrl: result.ipfsUrl,
      publicUrl: result.publicUrl, filename: originalname, sizeKb: Math.round(size / 1024),
    });
  } catch (err) {
    const code = err.code || 'IPFS_FAILED';
    const status = code === 'IPFS_AUTH_FAILED' || code === 'IPFS_QUOTA' ? 503 : 502;
    return res.status(status).json({ error: err.message || 'Failed to upload image to IPFS.', code });
  }
}
