from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User
from chat.models import Conversation, ConversationMember


class ChannelProfileTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="pass1234",

        )

        self.member = User.objects.create_user(
            username="member",
            email="member@test.com",
            password="pass1234",

        )

        self.other = User.objects.create_user(
            username="other",
            email="other@test.com",
            password="pass1234",

        )

        self.channel = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Backend Channel",
            description="Backend discussions",
            owner=self.owner,
        )

        ConversationMember.objects.create(
            conversation=self.channel,
            user=self.owner,
        )

        ConversationMember.objects.create(
            conversation=self.channel,
            user=self.member,
        )

        self.url = reverse(
            "channel-profile",
            kwargs={"conversation_id": self.channel.id},
        )

    def test_member_can_view_channel_profile(self):
        self.client.force_authenticate(self.member)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Backend Channel")
        self.assertEqual(
            response.data["description"],
            "Backend discussions",
        )
        self.assertIn("avatar_url", response.data)

    def test_owner_can_view_channel_profile(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_member_cannot_view_channel_profile(self):
        self.client.force_authenticate(self.other)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_id_returns_404(self):
        self.client.force_authenticate(self.owner)

        group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Group",
        )

        url = reverse(
            "channel-profile",
            kwargs={"conversation_id": group.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)