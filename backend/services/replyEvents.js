const { EventEmitter } = require("events");

const replyEvents = new EventEmitter();
replyEvents.setMaxListeners(200);

function emitReplyMessage(ownerId, message) {
  if (!ownerId || !message) {
    return;
  }

  replyEvents.emit("reply:message", {
    ownerId: String(ownerId),
    message,
  });
}

function emitSessionStatus(ownerId, accountId, status, details = {}) {
  if (!ownerId || !accountId || !status) {
    return;
  }

  replyEvents.emit("session:status", {
    ownerId: String(ownerId),
    accountId: String(accountId),
    status,
    ...details,
  });
}

module.exports = {
  replyEvents,
  emitReplyMessage,
  emitSessionStatus,
};
