const { WebSocketServer } = require("ws");
const { replyEvents } = require("./replyEvents");
const { readAuthTokenFromRequest, verifyAuthToken } = require("../utils/auth");
const { User } = require("../models/User");

function toJson(value) {
  return JSON.stringify(value);
}

function canSend(socket) {
  return socket && socket.readyState === socket.OPEN;
}

function initializeReplySocketServer(server) {
  const ownerSockets = new Map();
  const socketOwners = new WeakMap();
  const wss = new WebSocketServer({ noServer: true });

  function addSocket(ownerId, socket) {
    if (!ownerSockets.has(ownerId)) {
      ownerSockets.set(ownerId, new Set());
    }
    ownerSockets.get(ownerId).add(socket);
    socketOwners.set(socket, ownerId);
  }

  function removeSocket(socket) {
    const ownerId = socketOwners.get(socket);
    if (!ownerId) {
      return;
    }

    const sockets = ownerSockets.get(ownerId);
    if (!sockets) {
      return;
    }

    sockets.delete(socket);
    if (!sockets.size) {
      ownerSockets.delete(ownerId);
    }
  }

  function sendToOwner(ownerId, payload) {
    const sockets = ownerSockets.get(String(ownerId));
    if (!sockets?.size) {
      return;
    }

    const body = toJson(payload);
    for (const socket of sockets) {
      if (!canSend(socket)) {
        removeSocket(socket);
        continue;
      }
      try {
        socket.send(body);
      } catch (_error) {
        removeSocket(socket);
      }
    }
  }

  async function authenticateSocket(request) {
    const token = readAuthTokenFromRequest({ headers: request.headers || {} });
    if (!token) {
      return null;
    }

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch (_error) {
      return null;
    }

    const user = await User.findById(payload.sub).select("_id isActive");
    if (!user || !user.isActive) {
      return null;
    }

    return String(user._id);
  }

  async function onConnection(socket, request) {
    const ownerId = await authenticateSocket(request);
    if (!ownerId) {
      socket.close(1008, "Unauthorized");
      return;
    }

    addSocket(ownerId, socket);
    socket.send(
      toJson({
        type: "reply:connected",
        at: new Date().toISOString(),
      }),
    );

    socket.on("close", () => {
      removeSocket(socket);
    });

    socket.on("error", () => {
      removeSocket(socket);
    });
  }

  function handleUpgrade(request, socket, head) {
    let pathname = "";
    try {
      const parsed = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      pathname = parsed.pathname;
    } catch (_error) {
      pathname = "";
    }

    if (pathname !== "/ws/replies") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (wsSocket) => {
      wss.emit("connection", wsSocket, request);
    });
  }

  server.on("upgrade", handleUpgrade);
  wss.on("connection", (socket, request) => {
    onConnection(socket, request).catch(() => {
      try {
        socket.close(1011, "Connection failed");
      } catch (_error) {
        // Ignore close errors.
      }
    });
  });

  const onReplyMessage = ({ ownerId, message }) => {
    sendToOwner(ownerId, {
      type: "reply:message",
      message,
      at: new Date().toISOString(),
    });
  };

  replyEvents.on("reply:message", onReplyMessage);

  async function close() {
    server.off("upgrade", handleUpgrade);
    replyEvents.off("reply:message", onReplyMessage);

    for (const sockets of ownerSockets.values()) {
      for (const socket of sockets) {
        try {
          socket.close(1001, "Server shutting down");
        } catch (_error) {
          // Ignore close errors during shutdown.
        }
      }
    }
    ownerSockets.clear();

    await new Promise((resolve) => {
      wss.close(() => resolve());
    });
  }

  return {
    close,
    sendToOwner,
  };
}

module.exports = {
  initializeReplySocketServer,
};
