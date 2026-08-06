import io
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, ConversationMember, Message, Attachment

User = get_user_model()

class MultiFileMessageTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='user', email='user@test.com', password='pass', display_name='User'
        )
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.GROUP, name='Group', owner=self.user
        )
        ConversationMember.objects.create(conversation=self.conversation, user=self.user)
        self.send_url = reverse('conversation-messages', kwargs={'conversation_pk': self.conversation.id})

    def _create_file(self, name, content_type, content=b'test content'):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def test_send_single_image(self):
        self.client.force_authenticate(user=self.user)
        img = self._create_file('photo.jpg', 'image/jpeg')
        response = self.client.post(self.send_url, {
            'uploaded_files': [img]
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['attachments']), 1)
        self.assertEqual(response.data['attachments'][0]['original_filename'], 'photo.jpg')
        self.assertIsNotNone(response.data['attachments'][0]['file_url'])

    def test_send_multiple_files(self):
        self.client.force_authenticate(user=self.user)
        img = self._create_file('img.png', 'image/png')
        doc = self._create_file('doc.pdf', 'application/pdf')
        response = self.client.post(self.send_url, {
            'uploaded_files': [img, doc]
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['attachments']), 2)
        # Check Attachment records
        msg = Message.objects.get(id=response.data['id'])
        self.assertEqual(msg.attachments.count(), 2)

    def test_send_text_and_file(self):
        self.client.force_authenticate(user=self.user)
        img = self._create_file('img.jpg', 'image/jpeg')
        response = self.client.post(self.send_url, {
            'content': 'Check this!',
            'uploaded_files': [img]
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['content'], 'Check this!')
        self.assertEqual(len(response.data['attachments']), 1)

    def test_invalid_extension_rejected(self):
        self.client.force_authenticate(user=self.user)
        exe = self._create_file('virus.exe', 'application/octet-stream')
        response = self.client.post(self.send_url, {
            'uploaded_files': [exe]
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('uploaded_files', response.data)

    def test_oversized_file_rejected(self):
        self.client.force_authenticate(user=self.user)
        large = SimpleUploadedFile('big.mp4', b'0' * (11*1024*1024), content_type='video/mp4')
        response = self.client.post(self.send_url, {
            'uploaded_files': [large]
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_content_and_no_files_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.send_url, {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)