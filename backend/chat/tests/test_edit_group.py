from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from chat.models import Conversation, ConversationMember, Role

User = get_user_model()

class EditGroupTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="Password123!",
            display_name="Owner"
        )

        self.member = User.objects.create_user(
            username="member",
            email="member@test.com",
            password="Password123!",
            display_name="Member"
        )

        self.not_member = User.objects.create_user(
            username="outsider",
            email="outsider@test.com",
            password="Password123!",
            display_name="Outsider"
        )

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Old Group",
            description="Old Description",
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

        self.member_role = Role.objects.create(
            conversation=self.group,
            name="Member",
            can_send_messages=True,
            can_send_media=True,
        )

        owner_member = ConversationMember.objects.create(
            conversation=self.group,
            user=self.owner
        )
        owner_member.roles.add(self.owner_role)

        regular_member = ConversationMember.objects.create(
            conversation=self.group,
            user=self.member
        )
        regular_member.roles.add(self.member_role)

        self.url = reverse(
            "group-update",
            kwargs={"conversation_id": self.group.id},
        )

    def test_member_can_edit_group(self):
        self.client.force_authenticate(self.member)

        response = self.client.patch(
            self.url,
            {
                "name": "New Group Name",
                "description": "New Description",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.group.refresh_from_db()

        self.assertEqual(self.group.name, "New Group Name")
        self.assertEqual(self.group.description, "New Description")

    def test_owner_can_edit_group(self):
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            self.url,
            {
                "name": "Edited By Owner",
                "description": "Owner Description",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.group.refresh_from_db()

        self.assertEqual(self.group.name, "Edited By Owner")
        self.assertEqual(self.group.description, "Owner Description")

    def test_upload_new_avatar(self):
        self.client.force_authenticate(self.owner)

        avatar = SimpleUploadedFile(
            "avatar.png",
            b"filecontent",
            content_type="image/png",
        )

        response = self.client.patch(
            self.url,
            {
                "avatar": avatar,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.group.refresh_from_db()

        self.assertTrue(bool(self.group.avatar))

    def test_group_name_cannot_be_empty(self):
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            self.url,
            {
                "name": "",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_member_cannot_edit_group(self):
        self.client.force_authenticate(self.not_member)

        response = self.client.patch(
            self.url,
            {
                "name": "Hacked",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partial_update_only_description(self):
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            self.url,
            {
                "description": "Only Description Changed",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.group.refresh_from_db()

        self.assertEqual(self.group.name, "Old Group")
        self.assertEqual(
            self.group.description,
            "Only Description Changed",
        )