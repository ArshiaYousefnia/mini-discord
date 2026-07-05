import uuid

from django.contrib.auth.models import AbstractUser, Group, Permission, BaseUserManager
from django.core.files.storage import default_storage
from django.core.validators import MinLengthValidator, EmailValidator
from django.db import models
from persiantools.jdatetime import JalaliDate

from mini_discord import settings


class UserManager(BaseUserManager):
    """Custom user manager that handles UUID primary keys."""

    def create_user(self, username, email=None, password=None, **extra_fields):
        if not username:
            raise ValueError('The Username field must be set')

        if 'id' not in extra_fields:
            extra_fields.setdefault('id', uuid.uuid4())

        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True.')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(username, email, password, **extra_fields)

class User(AbstractUser):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    username = models.CharField(
        max_length=150,
        unique=True,
        validators=[MinLengthValidator(4)],
        error_messages={
            'unique': "This username is already taken.",
            'min_length': "Username must be at least 4 characters.",
        }
    )
    email = models.EmailField(
        unique=True,
        validators=[EmailValidator()],
        error_messages={
            'unique': "This email is already registered.",
            'invalid': "Please enter a valid email address.",
        }
    )
    birthday = models.DateField(null=True, blank=True)

    @property
    def jalali_birthday(self):
        """Get birthday in Jalali format."""
        if self.birthday:
            return str(JalaliDate.to_jalali(self.birthday))
        return None

    display_name = models.CharField(max_length=100, blank=False)
    bio = models.TextField(
        blank=True,
        default="Hello, I\'m new here!"
    )
    is_online = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    avatar = models.FileField(
        upload_to='',
        blank=True,
        null=True,
        default=None
    )

    @property
    def avatar_url(self):
        """
        Returns the full URL of the avatar if it exists,
        otherwise a default static avatar URL.
        """
        if self.avatar and self.avatar.name:
            return default_storage.url(self.avatar.name)
        return f"{settings.STATIC_URL}images/default_avatar.svg"

    USERNAME_FIELD = 'username'  # Use username as login identifier
    REQUIRED_FIELDS = ['email', 'display_name']  # Required for createsuperuser

    objects = UserManager()
    # Override groups and user_permissions to avoid clashes with auth.User
    groups = models.ManyToManyField(
        Group,
        verbose_name='groups',
        blank=True,
        help_text='The groups this user belongs to.',
        related_name='mini_discord_user_set',  # unique for your app
        related_query_name='user',
    )
    user_permissions = models.ManyToManyField(
        Permission,
        verbose_name='user permissions',
        blank=True,
        help_text='Specific permissions for this user.',
        related_name='mini_discord_user_set',  # unique for your app
        related_query_name='user',
    )

    def __str__(self):
        return self.username
    
