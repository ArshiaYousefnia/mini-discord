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


# ==========================================
# 1. Delete Group Message Tests
# ==========================================
class DeleteGroupMessageTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="Password123!",
            display_name="Owner",
        )
        self.member1 = User.objects.create_user(
            username="member1",
            email="member1@test.com",
            password="Password123!",
            display_name="Member1",
        )
        self.member2 = User.objects.create_user(
            username="member2",
            email="member2@test.com",
            password="Password123!",
            display_name="Member2",
        )

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Test Group",
            owner=self.owner,
        )

        self.owner_role = Role.objects.create(
            conversation=self.group,
            name="Owner",
            can_manage_members=True,
            can_manage_roles=True,
            can_delete_messages=True,
        )
        self.member_role = Role.objects.create(
            conversation=self.group,
            name="Member",
            can_delete_messages=False,
        )

        ConversationMember.objects.create(
            conversation=self.group,
            user=self.owner,
            role=self.owner_role,
        )
        ConversationMember.objects.create(
            conversation=self.group,
            user=self.member1,
            role=self.member_role,
        )
        ConversationMember.objects.create(
            conversation=self.group,
            user=self.member2,
            role=self.member_role,
        )

        self.message = Message.objects.create(
            conversation=self.group,
            sender=self.member1,
            content="hello everyone",
        )

        self.url = reverse(
            "conversation-message-detail",
            kwargs={
                "conversation_pk": self.group.id,
                "pk": self.message.id,
            },
        )

    def test_owner_can_delete_other_member_message(self):
        self.client.force_authenticate(self.owner)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.message.refresh_from_db()
        self.assertTrue(self.message.is_deleted)
        self.assertEqual(self.message.content, "")

    def test_sender_can_delete_own_message(self):
        self.client.force_authenticate(self.member1)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.message.refresh_from_db()
        self.assertTrue(self.message.is_deleted)

    def test_member_cannot_delete_other_member_message(self):
        self.client.force_authenticate(self.member2)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.message.refresh_from_db()
        self.assertFalse(self.message.is_deleted)

    def test_deleted_message_not_returned_in_list(self):
        self.client.force_authenticate(self.owner)
        self.client.delete(self.url)

        list_url = reverse(
            "conversation-messages",
            kwargs={"conversation_pk": self.group.id},
        )

        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = [item["id"] for item in response.data]
        self.assertNotIn(str(self.message.id), ids)