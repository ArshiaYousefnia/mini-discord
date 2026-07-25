import io
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from chat.models import (
    Conversation, ConversationMember, Message, Attachment
)

User = get_user_model()

class AttachmentDownloadTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner', email='owner@test.com', password='pass', display_name='Owner'
        )
        self.member = User.objects.create_user(
            username='member', email='member@test.com', password='pass', display_name='Member'
        )
        self.other = User.objects.create_user(
            username='other', email='other@test.com', password='pass', display_name='Other'
        )

        # Create a group conversation
        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP, name='Group', owner=self.owner
        )
        ConversationMember.objects.create(conversation=self.group, user=self.owner)
        ConversationMember.objects.create(conversation=self.group, user=self.member)

        # Create a message with an attachment
        self.message = Message.objects.create(
            conversation=self.group, sender=self.owner, content='File here'
        )
        self.file_content = b'Fake image bytes'
        self.test_file = SimpleUploadedFile(
            'test.jpg', self.file_content, content_type='image/jpeg'
        )
        self.attachment = Attachment.objects.create(
            message=self.message,
            file=self.test_file,
            original_filename='test.jpg',
            size=len(self.file_content),
        )

        self.download_url = reverse('attachment-download', kwargs={
            'attachment_id': self.attachment.id
        })

    def test_member_can_download(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Disposition'], 'attachment; filename="test.jpg"')
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertEqual(b''.join(response.streaming_content), self.file_content)

    def test_owner_can_download(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_member_denied(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_denied(self):
        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nonexistent_attachment_returns_404(self):
        self.client.force_authenticate(user=self.owner)
        bad_url = reverse('attachment-download', kwargs={
            'attachment_id': '00000000-0000-0000-0000-000000000000'
        })
        response = self.client.get(bad_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)