const express = require("express");
const {
  listBusinessCategories,
  createBusinessCategory,
  updateBusinessCategory,
  deleteBusinessCategory,
} = require("../controllers/businessCategoryController");

const router = express.Router();

router.get("/", listBusinessCategories);
router.post("/", createBusinessCategory);
router.patch("/:categoryId", updateBusinessCategory);
router.delete("/:categoryId", deleteBusinessCategory);

module.exports = router;
