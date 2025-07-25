// Before the websocket handshaking step is completed, we use this:
pub const WebSocketHTTPClient = upgrade_client.NewHTTPUpgradeClient(false);
pub const WebSocketHTTPSClient = upgrade_client.NewHTTPUpgradeClient(true);

// After the websocket handshaking step is completed, we use this:
pub const WebSocketClient = websocket_client.NewWebSocketClient(false);
pub const WebSocketClientTLS = websocket_client.NewWebSocketClient(true);

const upgrade_client = @import("./websocket_client/WebSocketUpgradeClient.zig");
const websocket_client = @import("./websocket_client.zig");
