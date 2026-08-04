from unittest import mock
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.base import ContentFile
from rest_framework.test import APIClient
from chat.models import (
    Conversation, ConversationMember, Message, Channel,
    Topic, ScheduledMessage, ScheduledAttachment, Role
)

User = get_user_model()

def mock_broadcast_new_message(message):
    pass

class ScheduledMessageTests(TestCase):
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

        # Group
        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name='Test Group',
            owner=self.user1
        )
        ConversationMember.objects.create(conversation=self.group, user=self.user1)
        ConversationMember.objects.create(conversation=self.group, user=self.user2)

        # Channel with topic
        self.channel_conv = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.user1
        )
        self.channel = Channel.objects.create(
            conversation=self.channel_conv,
            is_private=False,
            public_id='test-channel'
        )
        ConversationMember.objects.create(conversation=self.channel_conv, user=self.user1)
        self.role = Role.objects.create(
            conversation=self.channel_conv,
            name='Member',
            can_send_messages=True
        )
        member = ConversationMember.objects.get(conversation=self.channel_conv, user=self.user1)
        member.roles.add(self.role)

        self.topic = Topic.objects.create(
            conversation=self.channel_conv,
            name='General',
            creator=self.user1
        )

    # ---- API tests ----

    def test_schedule_message_in_group(self):
        future = timezone.now() + timedelta(hours=1)
        url = f'/api/chat/conversations/{self.group.id}/schedule/'
        data = {
            'content': 'Scheduled group message',
            'scheduled_at': future.isoformat()
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        scheduled = ScheduledMessage.objects.get(id=response.data['id'])
        self.assertEqual(scheduled.sender, self.user1)
        self.assertEqual(scheduled.conversation, self.group)
        self.assertFalse(scheduled.sent)
        self.assertFalse(scheduled.failed)

    def test_schedule_message_in_channel_with_topic(self):
        future = timezone.now() + timedelta(hours=1)
        url = f'/api/chat/conversations/{self.channel_conv.id}/schedule/'
        data = {
            'content': 'Channel message with topic',
            'scheduled_at': future.isoformat(),
            'topic_id': str(self.topic.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        scheduled = ScheduledMessage.objects.get(id=response.data['id'])
        self.assertEqual(scheduled.topic, self.topic)

    def test_schedule_message_in_channel_without_topic(self):
        future = timezone.now() + timedelta(hours=1)
        url = f'/api/chat/conversations/{self.channel_conv.id}/schedule/'
        data = {
            'content': 'Channel message no topic',
            'scheduled_at': future.isoformat()
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        scheduled = ScheduledMessage.objects.get(id=response.data['id'])
        self.assertIsNone(scheduled.topic)

    def test_schedule_with_topic_in_group_fails(self):
        future = timezone.now() + timedelta(hours=1)
        url = f'/api/chat/conversations/{self.group.id}/schedule/'
        data = {
            'content': 'Group with topic',
            'scheduled_at': future.isoformat(),
            'topic_id': str(self.topic.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('topic_id', response.data)

    def test_schedule_in_past_fails(self):
        past = timezone.now() - timedelta(minutes=1)
        url = f'/api/chat/conversations/{self.group.id}/schedule/'
        data = {
            'content': 'Past message',
            'scheduled_at': past.isoformat()
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('scheduled_at', response.data)

    def test_list_scheduled_messages(self):
        ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='Later',
            scheduled_at=timezone.now() + timedelta(hours=2)
        )
        ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user2,
            content='Other',
            scheduled_at=timezone.now() + timedelta(hours=2)
        )
        response = self.client.get('/api/chat/scheduled-messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['content'], 'Later')

    def test_delete_scheduled_message(self):
        sm = ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='To be deleted',
            scheduled_at=timezone.now() + timedelta(hours=2)
        )
        url = f'/api/chat/scheduled-messages/{sm.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ScheduledMessage.objects.filter(id=sm.id).exists())

    # ---- Delivery and permission tests ----

    def test_scheduled_message_delivery_with_permissions(self):
        # Create with future time, then update to past
        sm = ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='Deliver me',
            scheduled_at=timezone.now() + timedelta(hours=1),
            sent=False
        )
        ScheduledMessage.objects.filter(id=sm.id).update(
            scheduled_at=timezone.now() - timedelta(minutes=5)
        )
        sm.refresh_from_db()

        with mock.patch('chat.management.commands.send_scheduled_messages.broadcast_new_message') as mock_broadcast:
            call_command('send_scheduled_messages')
            sm.refresh_from_db()
            self.assertTrue(sm.sent)
            msg = Message.objects.filter(conversation=self.group, content='Deliver me').first()
            self.assertIsNotNone(msg)
            self.assertEqual(msg.sender, self.user1)
            mock_broadcast.assert_called_once_with(msg)

    def test_scheduled_message_fails_if_user_loses_membership(self):
        sm = ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='Fail me',
            scheduled_at=timezone.now() + timedelta(hours=1),
            sent=False
        )
        ScheduledMessage.objects.filter(id=sm.id).update(
            scheduled_at=timezone.now() - timedelta(minutes=5)
        )
        sm.refresh_from_db()

        ConversationMember.objects.filter(conversation=self.group, user=self.user1).delete()
        with mock.patch('chat.management.commands.send_scheduled_messages.broadcast_new_message'):
            call_command('send_scheduled_messages')
            sm.refresh_from_db()
            self.assertFalse(sm.sent)
            self.assertTrue(sm.failed)
            self.assertIsNotNone(sm.failure_reason)
            self.assertIn('no longer a member', sm.failure_reason)

    def test_scheduled_message_fails_if_channel_permission_revoked(self):
        # Add user2 as a member with the same role
        ConversationMember.objects.create(conversation=self.channel_conv, user=self.user2)
        member2 = ConversationMember.objects.get(conversation=self.channel_conv, user=self.user2)
        member2.roles.add(self.role)  # same role as user1

        # Schedule a message for user2 (non-owner)
        sm = ScheduledMessage.objects.create(
            conversation=self.channel_conv,
            sender=self.user2,  # non-owner
            content='Channel fail',
            scheduled_at=timezone.now() + timedelta(hours=1),
            sent=False,
            topic=self.topic
        )
        ScheduledMessage.objects.filter(id=sm.id).update(
            scheduled_at=timezone.now() - timedelta(minutes=5)
        )
        sm.refresh_from_db()

        # Revoke send permission from the role
        self.role.can_send_messages = False
        self.role.save()

        with mock.patch('chat.management.commands.send_scheduled_messages.broadcast_new_message'):
            call_command('send_scheduled_messages')
            sm.refresh_from_db()
            self.assertFalse(sm.sent)
            self.assertTrue(sm.failed)
            self.assertIn('permission to send messages', sm.failure_reason)

    def test_scheduled_message_with_attachments(self):
        sm = ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='With attachment',
            scheduled_at=timezone.now() + timedelta(hours=1),
            sent=False
        )
        ScheduledMessage.objects.filter(id=sm.id).update(
            scheduled_at=timezone.now() - timedelta(minutes=5)
        )
        sm.refresh_from_db()

        file_content = b'fake file content'
        test_file = ContentFile(file_content, name='test.txt')
        ScheduledAttachment.objects.create(
            scheduled_message=sm,
            file=test_file,
            original_filename='test.txt',
            size=len(file_content)
        )

        with mock.patch('chat.management.commands.send_scheduled_messages.broadcast_new_message'):
            call_command('send_scheduled_messages')
            sm.refresh_from_db()
            self.assertTrue(sm.sent)
            msg = Message.objects.filter(conversation=self.group, content='With attachment').first()
            self.assertIsNotNone(msg)
            self.assertEqual(msg.attachments.count(), 1)
            att = msg.attachments.first()
            self.assertEqual(att.original_filename, 'test.txt')
            att.file.open()
            content = att.file.read()
            self.assertEqual(content, file_content)
            att.file.close()

    def test_schedule_retry_after_failure(self):
        sm = ScheduledMessage.objects.create(
            conversation=self.group,
            sender=self.user1,
            content='Retry me',
            scheduled_at=timezone.now() + timedelta(hours=1),
            sent=False,
            failed=True,
            failure_reason='Test failure'
        )
        ScheduledMessage.objects.filter(id=sm.id).update(
            scheduled_at=timezone.now() - timedelta(hours=1)
        )
        sm.refresh_from_db()

        url = f'/api/chat/scheduled-messages/{sm.id}/retry/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        sm.refresh_from_db()
        self.assertFalse(sm.failed)
        self.assertIsNone(sm.failure_reason)

        with mock.patch('chat.management.commands.send_scheduled_messages.broadcast_new_message'):
            call_command('send_scheduled_messages')
            sm.refresh_from_db()
            self.assertTrue(sm.sent)
            self.assertFalse(sm.failed)