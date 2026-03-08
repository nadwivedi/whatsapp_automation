const express = require("express");
const {
  listConversations,
  listConversationMessages,
  markConversationRead,
  sendConversationReply,
  deleteConversation,
} = require("../controllers/replyController");

const router = express.Router();

router.get("/conversations", listConversations);
router.get("/conversations/:contactNumber/messages", listConversationMessages);
router.patch("/conversations/:contactNumber/read", markConversationRead);
router.post("/conversations/:contactNumber/reply", sendConversationReply);
router.delete("/conversations/:contactNumber", deleteConversation);

module.exports = router;
