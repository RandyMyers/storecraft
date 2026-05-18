const { cloudinary, cloudinaryEnabled, ensureCloudinaryConfigured } = require("../config/cloudinary");

const IMAGE_MIME = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/i;

exports.ensureUploadsConfigured = async (req, res, next) => {
  if (!cloudinaryEnabled()) {
    await ensureCloudinaryConfigured();
  }
  if (!cloudinaryEnabled()) {
    res.status(503).json({ error: "Image uploads are not configured on this server." });
    return;
  }
  next();
};

exports.upload = async (req, res) => {
  if (!req.files || !req.files.file) {
    res.status(400).json({ error: 'No file uploaded (use form field "file").' });
    return;
  }

  const uploaded = req.files.file;
  const mimetype = uploaded.mimetype;
  if (!IMAGE_MIME.test(mimetype || "")) {
    res.status(400).json({
      error: "Only image files are allowed (JPEG, PNG, GIF, WebP, SVG).",
    });
    return;
  }

  const buffer = uploaded.data;

  try {
    const folder = `nestpage-builder/${req.userId}`;
    const base64 = `data:${mimetype};base64,${buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: "image",
      use_filename: false,
      unique_filename: true,
    });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Cloudinary upload failed" });
  }
};
