const express = require("express");
const {
  listContactCategories,
  createContactCategory,
  updateContactCategory,
  deleteContactCategory,
} = require("../controllers/contactCategoryController");

const router = express.Router();

router.get("/", listContactCategories);
router.post("/", createContactCategory);
router.patch("/:categoryId", updateContactCategory);
router.delete("/:categoryId", deleteContactCategory);

module.exports = router;
