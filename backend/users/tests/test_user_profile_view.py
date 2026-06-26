import uuid
import io
from django.test import override_settings
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

User = get_user_model()


class UserProfileTests(APITestCase):
    def setUp(self):
        # Main test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='Test@1234',
            display_name='Test User',
            bio='Hello world!',
            is_online=True
        )

        # Other user with default bio
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='Other@1234',
            display_name='Other User'
        )

        # User with empty bio
        self.empty_bio_user = User.objects.create_user(
            username='emptybio',
            email='empty@example.com',
            password='Empty@1234',
            display_name='Empty Bio',
            bio=''
        )

        self.profile_url = reverse('user-profile', kwargs={'user_id': self.other_user.id})

    def test_unauthenticated_access_returns_401(self):
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_view_other_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.other_user.id))
        self.assertEqual(response.data['username'], self.other_user.username)
        self.assertEqual(response.data['display_name'], 'Other User')
        self.assertEqual(response.data['bio'], "Hello, I'm new here!")  # default
        self.assertFalse(response.data['is_online'])
        # ✅ Use the model's property to get the expected avatar URL
        self.assertEqual(response.data['avatar_url'], self.other_user.avatar_url)

    def test_user_can_view_own_profile(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('user-profile', kwargs={'user_id': self.user.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['display_name'], 'Test User')
        self.assertEqual(response.data['bio'], 'Hello world!')
        self.assertTrue(response.data['is_online'])
        self.assertEqual(response.data['avatar_url'], self.user.avatar_url)

    def test_profile_with_default_bio(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('user-profile', kwargs={'user_id': self.other_user.id})
        response = self.client.get(url)
        self.assertEqual(response.data['bio'], "Hello, I'm new here!")

    def test_profile_with_empty_bio(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('user-profile', kwargs={'user_id': self.empty_bio_user.id})
        response = self.client.get(url)
        self.assertEqual(response.data['bio'], '')

    def test_avatar_url_default_when_no_avatar(self):
        """User without avatar returns the model's default avatar URL."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        # ✅ Compare with the model's property
        self.assertEqual(response.data['avatar_url'], self.other_user.avatar_url)

    @override_settings(DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage')
    def test_avatar_url_returns_uploaded_avatar(self):
        """User with uploaded avatar returns a URL pointing to the file."""
        # Create a dummy image
        image = Image.new('RGB', (100, 100), color='red')
        image_io = io.BytesIO()
        image.save(image_io, format='PNG')
        image_io.seek(0)

        avatar_file = SimpleUploadedFile(
            'avatar.png',
            image_io.getvalue(),
            content_type='image/png'
        )

        user_with_avatar = User.objects.create_user(
            username='avataruser',
            email='avatar@example.com',
            password='Avatar@1234',
            display_name='Avatar User',
            avatar=avatar_file
        )

        self.client.force_authenticate(user=self.user)
        url = reverse('user-profile', kwargs={'user_id': user_with_avatar.id})
        response = self.client.get(url)

        self.assertEqual(response.data['avatar_url'], user_with_avatar.avatar_url)
        self.assertNotEqual(response.data['avatar_url'], '/static/images/default_avatar.svg')

    def test_is_online_reflects_model_value(self):
        self.client.force_authenticate(user=self.user)

        self.other_user.is_online = True
        self.other_user.save(update_fields=['is_online'])
        response = self.client.get(self.profile_url)
        self.assertTrue(response.data['is_online'])

        self.other_user.is_online = False
        self.other_user.save(update_fields=['is_online'])
        response = self.client.get(self.profile_url)
        self.assertFalse(response.data['is_online'])

    def test_response_contains_all_expected_fields(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        expected_fields = {'id', 'username', 'display_name', 'bio', 'avatar_url', 'is_online'}
        self.assertEqual(set(response.data.keys()), expected_fields)

    def test_response_field_types(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertIsInstance(response.data['id'], str)
        self.assertIsInstance(response.data['username'], str)
        self.assertIsInstance(response.data['display_name'], str)
        self.assertIsInstance(response.data['bio'], str)
        self.assertIsInstance(response.data['avatar_url'], str)
        self.assertIsInstance(response.data['is_online'], bool)

    def test_nonexistent_user_returns_404(self):
        self.client.force_authenticate(user=self.user)
        non_existent_id = uuid.uuid4()
        url = reverse('user-profile', kwargs={'user_id': non_existent_id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_uuid_format_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/users/not-a-uuid/profile/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_view_profile_of_inactive_user(self):
        self.other_user.is_active = False
        self.other_user.save(update_fields=['is_active'])
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_profile_of_user_with_very_long_bio(self):
        long_bio = 'A' * 1000
        long_bio_user = User.objects.create_user(
            username='longbio',
            email='long@example.com',
            password='Long@1234',
            display_name='Long Bio',
            bio=long_bio
        )
        self.client.force_authenticate(user=self.user)
        url = reverse('user-profile', kwargs={'user_id': long_bio_user.id})
        response = self.client.get(url)
        self.assertEqual(len(response.data['bio']), 1000)
        self.assertEqual(response.data['bio'], long_bio)

    def test_username_and_display_name_distinct(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.data['username'], 'otheruser')
        self.assertEqual(response.data['display_name'], 'Other User')
        self.assertNotEqual(response.data['username'], response.data['display_name'])
