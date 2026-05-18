const express = require("express");
const fileUpload = require("express-fileupload");
const { requireAuth } = require("../middleware/requireAuth");
const mediaController = require("../controllers/mediaController");

const router = express.Router();

router.use(
  fileUpload({
    limits: { fileSize: 4 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false,
  }),
);

router.post("/upload", requireAuth, mediaController.ensureUploadsConfigured, mediaController.upload);

module.exports = router;
