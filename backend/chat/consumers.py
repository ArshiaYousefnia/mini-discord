import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from .models import ConversationMember

User = get_user_model()


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or self.user.is_anonymous:
            await self.close()
            return

        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.group_name = f'conversation_{self.conversation_id}'
        self.user_group = f'user_{self.user.id}'

        # Verify membership
        if not await self.is_member():
            await self.close()
            return

        # Join conversation group
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Join user's personal group for notifications
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive(self, text_data):
        # Optional: handle typing indicators or other client events
        pass

    async def new_message(self, event):
        # Send new message to client
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'data': event['data']
        }))

    async def notification(self, event):
        # Send notification to client
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'data': event['data']
        }))

    async def conversation_update(self, event):
        # Handle the event so ChatConsumer doesn't crash
        await self.send(text_data=json.dumps({
            'type': 'conversation_update',
            'data': event['data']
        }))

    async def message_updated(self, event):
        # Fallback to event.get("data") if "message" isn't present
        payload = event.get("message") or event.get("data")

        await self.send(text_data=json.dumps({
            "type": "message_updated",
            "data": payload
        }))

    async def message_deleted(self, event):
        payload = event.get("message") or event.get("data")

        await self.send(text_data=json.dumps({
            "type": "message_deleted",
            "data": payload
        }))

    @database_sync_to_async
    def is_member(self):
        return ConversationMember.objects.filter(
            conversation_id=self.conversation_id,
            user=self.user
        ).exists()

    async def user_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_updated',
            'data': event['data']
        }))

    async def conversation_metadata_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'conversation_metadata_updated',
            'data': event['data']
        }))

class UserConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or self.user.is_anonymous:
            await self.close()
            return

        self.user_group = f'user_{self.user.id}'
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive(self, text_data):
        # Could handle ping or other client messages
        pass

    async def notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'data': event['data']
        }))

    async def conversation_update(self, event):
        # For sidebar updates (last message preview, unread count)
        await self.send(text_data=json.dumps({
            'type': 'conversation_update',
            'data': event['data']
        }))

    async def user_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_updated',
            'data': event['data']
        }))

