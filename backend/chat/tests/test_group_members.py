from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from django.contrib.auth import get_user_model

from chat.models import Conversation, ConversationMember, Role

User = get_user_model()

class GroupMembersAPITests(APITestCase):

    def setUp(self):

        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="password123",
            display_name="Owner"
        )

        self.member = User.objects.create_user(
            username="member",
            email="member@test.com",
            password="password123",
            display_name="Member",
        )

        self.member.is_online = True
        self.member.save()

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Test Group",
            description="Test Description",
            owner=self.owner
        )

        owner_role = Role.objects.create(
            conversation=self.group,
            name="Group Owner",
            can_manage_members=True
        )

        member_role = Role.objects.create(
            conversation=self.group,
            name="Member"
        )

        owner_member = ConversationMember.objects.create(
            conversation=self.group,
            user=self.owner
        )
        owner_member.roles.add(owner_role)

        regular_member = ConversationMember.objects.create(
            conversation=self.group,
            user=self.member
        )
        regular_member.roles.add(member_role)

        self.url = reverse(
            'group-members',
            kwargs={
                'conversation_id': self.group.id
            }
        )

    def test_member_can_view_group_members(self):

        self.client.force_authenticate(
            user=self.member
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        self.assertEqual(
            len(response.data),
            2
        )

        owner = response.data[0]

        self.assertIn(
            'role_name',
            owner
        )

    def test_non_member_cannot_view_members(self):

        outsider = User.objects.create_user(
            username="outsider",
            email="outsider@test.com",
            password="password123",
            display_name="Outsider"
        )

        self.client.force_authenticate(
            user=outsider
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN
        )