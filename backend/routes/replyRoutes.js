const express = require("express");
const {
  listConversations,
  listConversationMessages,
  markConversationRead,
  sendConversationReply,
  deleteConversation,
  clearAll,
  clearUnreplied,
} = require("../controllers/replyController");

const router = express.Router();

router.get("/conversations", listConversations);
router.get("/conversations/:contactNumber/messages", listConversationMessages);
router.patch("/conversations/:contactNumber/read", markConversationRead);
router.post("/conversations/:contactNumber/reply", sendConversationReply);
router.delete("/conversations/:contactNumber", deleteConversation);
router.delete("/conversations/clear/all", clearAll);
router.delete("/conversations/clear/unreplied", clearUnreplied);

module.exports = router;
