import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.core.cache import cache

User = get_user_model()


class OnlineStatusConsumer(AsyncWebsocketConsumer):
    GROUP_NAME = "online_status_updates"

    async def connect(self):
        self.user = self.scope["user"]

        if self.user.is_anonymous:
            await self.close()
            return

        self.user_id = str(self.user.id)
        self.connection_key = f"online_connections:{self.user_id}"

        await self.accept()

        await self.channel_layer.group_add(
            self.GROUP_NAME,
            self.channel_name,
        )

        became_online = await self.add_connection()

        if became_online:
            await self.set_user_online(True)

            await self.channel_layer.group_send(
                self.GROUP_NAME,
                {
                    "type": "user_status",
                    "user_id": self.user_id,
                    "is_online": True,
                },
            )

    async def disconnect(self, close_code):
        user = getattr(self, "user", None)

        if not user or user.is_anonymous:
            return

        became_offline = await self.remove_connection()

        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

        if became_offline:
            await self.set_user_online(False)

            await self.channel_layer.group_send(
                self.GROUP_NAME,
                {
                    "type": "user_status",
                    "user_id": self.user_id,
                    "is_online": False,
                },
            )

    async def user_status(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "user_status",
                    "user_id": event["user_id"],
                    "is_online": event["is_online"],
                }
            )
        )

    @database_sync_to_async
    def add_connection(self):
        connections = cache.get(self.connection_key, set())

        was_offline = len(connections) == 0

        connections.add(self.channel_name)

        cache.set(
            self.connection_key,
            connections,
            timeout=60 * 60 * 24,
        )

        return was_offline

    @database_sync_to_async
    def remove_connection(self):
        connections = cache.get(self.connection_key, set())

        connections.discard(self.channel_name)

        if len(connections) == 0:
            cache.delete(self.connection_key)
            return True

        cache.set(
            self.connection_key,
            connections,
            timeout=60 * 60 * 24,
        )

        return False

    @database_sync_to_async
    def set_user_online(self, online):
        User.objects.filter(pk=self.user.pk).update(is_online=online)
