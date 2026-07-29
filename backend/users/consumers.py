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

        await self.accept()

        # Join global status group
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)

        # Mark user online
        await self.set_user_online(True)

        # Accept first, so the socket is fully established
        await self.accept()

        # Send current online users snapshot to this client only
        online_user_ids = await self.get_online_user_ids()
        await self.send(text_data=json.dumps({
            'type': 'online_users_snapshot',
            'user_ids': online_user_ids,
        }))

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
        await self.send(text_data=json.dumps({
            'type': 'user_status',
            'user_id': event['user_id'],
            'is_online': event['is_online'],
        }))

    @database_sync_to_async
    def set_user_online(self, online):
        User.objects.filter(pk=self.user.pk).update(is_online=online)

    @database_sync_to_async
    def get_online_user_ids(self):
        return [
            str(uid)
            for uid in User.objects.filter(is_online=True).values_list('id', flat=True)
        ]
