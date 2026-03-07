const express = require("express");
const {
  listConversations,
  listConversationMessages,
  markConversationRead,
  sendConversationReply,
} = require("../controllers/replyController");

const router = express.Router();

router.get("/conversations", listConversations);
router.get("/conversations/:contactNumber/messages", listConversationMessages);
router.patch("/conversations/:contactNumber/read", markConversationRead);
router.post("/conversations/:contactNumber/reply", sendConversationReply);

module.exports = router;
