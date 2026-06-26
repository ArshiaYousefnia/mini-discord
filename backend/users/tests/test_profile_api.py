from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from users.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
import io
from PIL import Image

class UserProfileAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='Password123!@#',
            display_name='Original Name'
        )
        self.url = reverse('profile')
        
        image_file = io.BytesIO()
        image = Image.new('RGB', (100, 100), color='red')
        image.save(image_file, 'JPEG')
        image_file.seek(0)
        self.valid_image = SimpleUploadedFile(
            name='test_avatar.jpg',
            content=image_file.read(),
            content_type='image/jpeg'
        )

    def test_unauthenticated_user_cannot_access_profile(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_profile_success(self):
        self.client.force_authenticate(user=self.user)
        data = {
            'display_name': 'New Name',
            'bio': 'This is a new bio.',
        }
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, 'New Name')
        self.assertEqual(self.user.bio, 'This is a new bio.')

    def test_username_is_read_only(self):
        self.client.force_authenticate(user=self.user)
        data = {
            'username': 'hacked_username',
            'display_name': 'Another Name'
        }
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'testuser')

    def test_bio_max_length(self):
        self.client.force_authenticate(user=self.user)
        long_bio = 'A' * 191
        data = {'bio': long_bio}
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bio', response.data)

    def test_display_name_max_length(self):
        self.client.force_authenticate(user=self.user)
        long_name = 'B' * 33
        data = {'display_name': long_name}
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('display_name', response.data)

    def test_upload_valid_avatar(self):
        self.client.force_authenticate(user=self.user)
        data = {'avatar': self.valid_image}
        response = self.client.patch(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar.name.startswith('avatars/test_avatar'))