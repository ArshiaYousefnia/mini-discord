import io
from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, ConversationMember

class GroupCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='creator',
            email='creator@test.com',
            password='testpass123',
            display_name='Creator',
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse('group-create')  # adjust if your URL name differs

    def test_create_group_success_minimal(self):
        data = {'name': 'My Group'}
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Check conversation exists
        conv = Conversation.objects.get(id=response.data['id'])
        self.assertEqual(conv.type, Conversation.Type.GROUP)
        self.assertEqual(conv.name, 'My Group')
        self.assertEqual(conv.owner, self.user)

        # Check role created
        role = conv.roles.get(name='Group Owner')
        self.assertTrue(role.can_send_messages)
        self.assertTrue(role.can_manage_members)

        # Check membership
        member = ConversationMember.objects.get(conversation=conv, user=self.user)
        self.assertEqual(member.roles.first(), role)

    def test_create_group_with_all_fields(self):
        avatar = SimpleUploadedFile(
            name='avatar.jpg',
            content=io.BytesIO(b'fakeimagecontent').read(),
            content_type='image/jpeg'
        )
        data = {
            'name': 'Full Group',
            'description': 'A fancy description',
            'avatar': avatar,
        }
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Full Group')
        self.assertEqual(response.data['description'], 'A fancy description')
        self.assertIsNotNone(response.data['avatar_url'])
        self.assertEqual(response.data['owner_id'], str(self.user.id))

    def test_empty_name_rejected(self):
        response = self.client.post(self.url, {'name': ''}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_unauthenticated_denied(self):
        self.client.logout()
        response = self.client.post(self.url, {'name': 'x'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)