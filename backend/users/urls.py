from django.urls import path
from .views import (
    UserRegistrationView,
    LoginView,
    LogoutView,
    UserProfileView,
    UserProfileUpdateView,
    UserSearchView,
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('users/<uuid:user_id>/profile/', UserProfileView.as_view(), name='user-profile'),
    path(
        'users/<uuid:user_id>/profile/update/',
        UserProfileUpdateView.as_view(),
        name='user-profile-update'
    ),
    path('users/search/', UserSearchView.as_view(), name='user-search'),
]