import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

User = get_user_model()

class OnlineStatusConsumer(AsyncWebsocketConsumer):
    GROUP_NAME = 'online_status_updates'

    async def connect(self):
        self.user = self.scope['user']
        if self.user.is_anonymous:
            await self.close()
            return

        # NOTE: We accept the connection first before sending messages or 
        # joining groups. This ensures the WebSocket handshake is completed 
        # and avoids dropping the user's own broadcasted status event.
        await self.accept()

        # Join global status group
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)

        # Mark user online
        await self.set_user_online(True)

        # Broadcast to everyone
        await self.channel_layer.group_send(
            self.GROUP_NAME,
            {
                'type': 'user_status',
                'user_id': str(self.user.id),
                'is_online': True,
            }
        )

    async def disconnect(self, close_code):
        # NOTE: Using getattr checks if 'user' exists on the instance. This prevents 
        # an AttributeError if the connection fails early during the handshake phase.
        user = getattr(self, 'user', None)
        if user and not user.is_anonymous:
            await self.set_user_online(False)
            await self.channel_layer.group_send(
                self.GROUP_NAME,
                {
                    'type': 'user_status',
                    'user_id': str(self.user.id),
                    'is_online': False,
                }
            )
            await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def user_status(self, event):
        """Forward status update to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'user_status',
            'user_id': event['user_id'],
            'is_online': event['is_online'],
        }))

    @database_sync_to_async
    def set_user_online(self, online):
        User.objects.filter(pk=self.user.pk).update(is_online=online)
