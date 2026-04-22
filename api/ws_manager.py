from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import List

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        stale_connections: List[WebSocket] = []

        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                # A dead socket should not block updates to healthy clients.
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect(connection)

manager = ConnectionManager()

@router.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        # Mobile network transitions can raise non-WebSocketDisconnect errors.
        # Treat them as disconnects so stale sockets don't linger.
        manager.disconnect(websocket)

# Usage: from other modules, import manager and call await manager.broadcast(json.dumps({...})) on relevant updates.
