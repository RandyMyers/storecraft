const express = require("express");
const templatesController = require("../controllers/templatesController");

const router = express.Router();

router.get("/", templatesController.list);

module.exports = router;
