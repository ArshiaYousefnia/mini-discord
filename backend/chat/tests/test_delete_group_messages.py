import uuid
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from chat.models import (
    Channel,
    ChannelMessage,
    Conversation,
    ConversationMember,
    Message,
    Role,
    Topic,
)

User = get_user_model()


class DeleteGroupMessageTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner',email='owner@test.com', password='password')
        self.member1 = User.objects.create_user(username='member1',email='member1@test.com', password='password')
        self.member2 = User.objects.create_user(username='member2',email='member2@test.com', password='password')

        self.group = Conversation.objects.create(name="Test Group", type=Conversation.Type.GROUP)
        
        self.owner_role = Role.objects.create(name="Owner", can_delete_messages=True)
        self.member_role = Role.objects.create(name="Member", can_delete_messages=False)

        # FIXED: Create members first, then add ManyToMany roles
        owner_member = ConversationMember.objects.create(conversation=self.group, user=self.owner)
        owner_member.roles.add(self.owner_role)

        member1_obj = ConversationMember.objects.create(conversation=self.group, user=self.member1)
        member1_obj.roles.add(self.member_role)

        member2_obj = ConversationMember.objects.create(conversation=self.group, user=self.member2)
        member2_obj.roles.add(self.member_role)

        self.message = Message.objects.create(
            conversation=self.group, 
            sender=self.member1, 
            content="Hello world"
        )
        self.url = f'/api/messages/{self.message.id}/'

    def test_owner_can_delete_any_message(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Message.objects.filter(id=self.message.id).exists())

    def test_sender_can_delete_own_message(self):
        self.client.force_authenticate(user=self.member1)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_member_cannot_delete_others_message(self):
        self.client.force_authenticate(user=self.member2)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_4_FORBIDDEN)