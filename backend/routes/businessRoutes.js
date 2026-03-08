const express = require("express");
const {
  listContacts,
  createContact,
  deleteContact,
  bulkInsertContacts,
} = require("../controllers/businessController");

const router = express.Router();

router.get("/", listContacts);
router.post("/", createContact);
router.post("/bulk-json", bulkInsertContacts);
router.delete("/:contactId", deleteContact);

module.exports = router;
