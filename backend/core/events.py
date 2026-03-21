import asyncio
from typing import Dict, List, Any

class EventBus:
    def __init__(self):
        self.subscribers: Dict[str, List[asyncio.Queue]] = {}

    def subscribe(self, event_type: str) -> asyncio.Queue:
        """Returns an asyncio.Queue that listens to a specific event type."""
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        queue = asyncio.Queue()
        self.subscribers[event_type].append(queue)
        return queue

    async def publish(self, event_type: str, payload: Any):
        """Pushes data to all listening queues for the given event type."""
        if event_type in self.subscribers:
            for queue in self.subscribers[event_type]:
                await queue.put(payload)

# Singleton instance exported for use across the application
event_bus = EventBus()