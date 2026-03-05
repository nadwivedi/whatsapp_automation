const express = require("express");
const {
  listBusinesses,
  createBusiness,
  deleteBusiness,
  bulkInsertBusinesses,
} = require("../controllers/businessController");

const router = express.Router();

router.get("/", listBusinesses);
router.post("/", createBusiness);
router.post("/bulk-json", bulkInsertBusinesses);
router.delete("/:businessId", deleteBusiness);

module.exports = router;
