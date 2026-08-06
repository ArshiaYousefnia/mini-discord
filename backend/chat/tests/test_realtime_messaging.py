from unittest import mock
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from chat.models import Conversation, ConversationMember, Message, Channel, ChannelMessage, Role

User = get_user_model()

class RealtimeMessagingTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='alice',
            email='alice@example.com',
            password='pass'
        )
        self.user2 = User.objects.create_user(
            username='bob',
            email='bob@example.com',
            password='pass'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user1)
        self.conv = Conversation.objects.create(type=Conversation.Type.DM)
        ConversationMember.objects.create(conversation=self.conv, user=self.user1)
        ConversationMember.objects.create(conversation=self.conv, user=self.user2)

    @mock.patch('chat.views.views.broadcast_new_message')
    def test_message_creation_triggers_broadcast(self, mock_broadcast):
        url = '/api/chat/dm/'
        data = {
            'recipient_id': str(self.user2.id),
            'content': 'Hello, Bob!'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(mock_broadcast.call_count, 1)
        message = Message.objects.first()
        mock_broadcast.assert_called_with(message)

    @mock.patch('chat.views.views.broadcast_new_message')
    def test_channel_message_triggers_broadcast(self, mock_broadcast):
        channel_conv = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='General',
            owner=self.user1
        )
        Channel.objects.create(conversation=channel_conv, is_private=False, public_id='general')
        ConversationMember.objects.create(conversation=channel_conv, user=self.user1)
        role = Role.objects.create(
            conversation=channel_conv,
            name='Member',
            can_send_messages=True
        )
        member = ConversationMember.objects.get(conversation=channel_conv, user=self.user1)
        member.roles.add(role)

        url = f'/api/chat/conversations/{channel_conv.id}/messages/'
        data = {'content': 'Channel message'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(mock_broadcast.call_count, 1)
        message = ChannelMessage.objects.first()
        mock_broadcast.assert_called_with(message)

    def test_websocket_consumer_group_join(self):
        from chat.consumers import ChatConsumer
        consumer = ChatConsumer()
        consumer.scope = {'user': self.user1, 'url_route': {'kwargs': {'conversation_id': str(self.conv.id)}}}
        consumer.channel_layer = get_channel_layer()
        consumer.channel_name = 'test_channel'

        with mock.patch.object(consumer.channel_layer, 'group_add', return_value=mock.AsyncMock()) as mock_group_add:
            with mock.patch.object(consumer, 'accept', return_value=mock.AsyncMock()):
                with mock.patch.object(consumer, 'is_member', return_value=mock.AsyncMock(return_value=True)):
                    async_to_sync(consumer.connect)()
                    expected_calls = [
                        mock.call(consumer.group_name, consumer.channel_name),
                        mock.call(consumer.user_group, consumer.channel_name)
                    ]
                    mock_group_add.assert_has_calls(expected_calls, any_order=False)
                    self.assertEqual(mock_group_add.call_count, 2)