from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User
from chat.models import (
    Conversation,
    ConversationMember,
    Message,
    Role,
    Topic
)


class DeleteGroupTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="Password123!",
            display_name="Owner",
        )

        self.member = User.objects.create_user(
            username="member",
            email="member@test.com",
            password="Password123!",
            display_name="Member",
        )

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Test Group",
            description="Test Description",
            owner=self.owner,
        )

        self.owner_role = Role.objects.create(
            conversation=self.group,
            name="Group Owner",
            can_send_messages=True,
            can_send_media=True,
            can_delete_messages=True,
            can_manage_members=True,
            can_manage_roles=True,
        )

        owner_member = ConversationMember.objects.create(
            conversation=self.group,
            user=self.owner
        )
        owner_member.roles.add(self.owner_role)

        ConversationMember.objects.create(
            conversation=self.group,
            user=self.member,
        )

        Message.objects.create(
            conversation=self.group,
            sender=self.owner,
            content="Hello",
        )

        Message.objects.create(
            conversation=self.group,
            sender=self.member,
            content="Hi",
        )

        self.url = reverse(
            "group-delete",
            kwargs={"conversation_id": self.group.id},
        )

    def test_owner_can_delete_group(self):
        self.client.force_authenticate(self.owner)

        response = self.client.delete(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
        )

        self.assertFalse(
            Conversation.objects.filter(id=self.group.id).exists()
        )

    def test_group_messages_are_deleted(self):
        self.client.force_authenticate(self.owner)

        self.client.delete(self.url)

        self.assertEqual(Message.objects.count(), 0)

    def test_group_members_are_deleted(self):
        self.client.force_authenticate(self.owner)

        self.client.delete(self.url)

        self.assertEqual(
            ConversationMember.objects.count(),
            0,
        )

    def test_group_roles_are_deleted(self):
        self.client.force_authenticate(self.owner)

        self.client.delete(self.url)

        self.assertEqual(Role.objects.count(), 0)

    def test_member_cannot_delete_group(self):
        self.client.force_authenticate(self.member)

        response = self.client.delete(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.assertTrue(
            Conversation.objects.filter(id=self.group.id).exists()
        )

    def test_delete_nonexistent_group(self):
        self.client.force_authenticate(self.owner)

        url = reverse(
            "group-delete",
            kwargs={
                "conversation_id": "11111111-1111-1111-1111-111111111111"
            },
        )

        response = self.client.delete(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )