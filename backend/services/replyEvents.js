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

module.exports = {
  replyEvents,
  emitReplyMessage,
};
