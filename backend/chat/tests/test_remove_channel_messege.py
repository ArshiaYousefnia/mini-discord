from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role, Message

User = get_user_model()

class MessageDeletionPermissionTests(APITestCase):
    def setUp(self):
        # ایجاد کاربران
        self.owner = User.objects.create_user(username='owner', email='owner@test.com', password='pass')
        self.moderator = User.objects.create_user(username='mod', email='mod@test.com', password='pass')
        self.normal_user = User.objects.create_user(username='normal', email='normal@test.com', password='pass')
        self.sender = User.objects.create_user(username='sender', email='sender@test.com', password='pass')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Moderation Test Channel",
            owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.conversation, is_private=False)

        self.mod_role = Role.objects.create(
            conversation=self.conversation, name="Moderator", can_delete_messages=True
        )
        self.normal_role = Role.objects.create(
            conversation=self.conversation, name="Member", can_delete_messages=False
        )

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        ConversationMember.objects.create(conversation=self.conversation, user=self.moderator, role=self.mod_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user, role=self.normal_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.sender, role=self.normal_role)

    def get_url(self, message_id):
        return reverse('conversation-message-detail', kwargs={
            'conversation_pk': self.conversation.id,
            'pk': message_id
        })

    def create_message(self):
        return Message.objects.create(
            conversation=self.conversation,
            sender=self.sender,
            content="This is a test message to be deleted."
        )

    def test_sender_can_delete_own_message(self):
        message = self.create_message()
        self.client.force_authenticate(user=self.sender)
        
        response = self.client.delete(self.get_url(message.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        message.refresh_from_db()
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.content, "")

    def test_owner_can_delete_others_message(self):
        message = self.create_message()
        self.client.force_authenticate(user=self.owner)
        
        response = self.client.delete(self.get_url(message.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_moderator_can_delete_others_message(self):
        message = self.create_message()
        self.client.force_authenticate(user=self.moderator)
        
        response = self.client.delete(self.get_url(message.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_normal_user_cannot_delete_others_message(self):
        message = self.create_message()
        self.client.force_authenticate(user=self.normal_user)
        
        response = self.client.delete(self.get_url(message.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        message.refresh_from_db()
        self.assertFalse(message.is_deleted)
        self.assertNotEqual(message.content, "")