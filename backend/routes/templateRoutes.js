const express = require("express");
const {
  listTemplates,
  createTemplate,
  updateTemplate,
  disableTemplate,
} = require("../controllers/templateController");

const router = express.Router();

router.get("/", listTemplates);
router.post("/", createTemplate);
router.patch("/:templateId", updateTemplate);
router.delete("/:templateId", disableTemplate);

module.exports = router;
