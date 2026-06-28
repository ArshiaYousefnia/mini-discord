from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

User = get_user_model()

@override_settings(DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage')
class UserProfileAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='StrongPassword123!',
            display_name='Original Name'
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='StrongPassword123!',
            display_name='Other Name'
        )
        
        self.url = reverse('user-profile', kwargs={'user_id': self.user.id})
        self.other_url = reverse('user-profile', kwargs={'user_id': self.other_user.id})

    def test_get_profile_success(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'testuser')
        self.assertEqual(response.data['display_name'], 'Original Name')

    def test_update_profile_success(self):
        self.client.force_authenticate(user=self.user)
        data = {
            'display_name': 'New Display Name',
            'bio': 'This is my new bio.'
        }
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, 'New Display Name')
        self.assertEqual(self.user.bio, 'This is my new bio.')

    def test_cannot_update_other_user_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.other_url, {'display_name': 'Hacked Name'})
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_username_is_read_only(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url, {'username': 'new_hacked_username'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'testuser')

    def test_duplicate_email(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url, {'email': 'other@example.com'})
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_avatar_invalid_extension(self):
        self.client.force_authenticate(user=self.user)
        bad_file = SimpleUploadedFile("test.txt", b"this is a text file", content_type="text/plain")
        
        response = self.client.patch(self.url, {'avatar': bad_file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('avatar', response.data)