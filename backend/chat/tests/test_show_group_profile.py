from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from django.contrib.auth import get_user_model

from chat.models import Conversation, ConversationMember

class GroupProfileAPITests(APITestCase):

    def setUp(self):
        User = get_user_model()

        self.user = User.objects.create_user(
            username="user1",
            email="user1@test.com",
            password="password123"
        )

        self.other_user = User.objects.create_user(
            username="user2",
            email="user2@test.com",
            password="password123"
        )

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Test Group",
            description="A test group description",
            owner=self.user
        )

        ConversationMember.objects.create(
            conversation=self.group,
            user=self.user
        )

        self.url = reverse(
            "group-profile",
            kwargs={"conversation_id": self.group.id}
        )


    def test_member_can_view_group_profile(self):
        self.client.force_authenticate(
            user=self.user
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        self.assertEqual(
            response.data["name"],
            "Test Group"
        )

        self.assertEqual(
            response.data["description"],
            "A test group description"
        )



    def test_non_member_cannot_view_group_profile(self):
        self.client.force_authenticate(
            user=self.other_user
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND
        )


    def test_group_profile_not_found(self):
        self.client.force_authenticate(
            user=self.user
        )

        import uuid

        url = reverse(
            "group-profile",
            kwargs={
                "conversation_id": uuid.uuid4()
            }
        )

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND
        )