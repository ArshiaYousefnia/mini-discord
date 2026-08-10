from rest_framework import generics, status
from rest_framework.response import Response

from chat.views.views_realtime_utils import broadcast_user_profile_update
from .serializers import UserProfileSerializer, UserProfileUpdateSerializer
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserRegistrationSerializer, LoginSerializer, UserSearchSerializer
from rest_framework.permissions import IsAuthenticated
from .models import User
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound
from django.contrib.auth import get_user_model
from chat.models import Channel
from chat.channels_serializers import ChannelDetailSerializer

from .serializers import UserSearchSerializer


User = get_user_model()



class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            {
                "message": "User registered successfully.",
                "username": user.username,
                "email": user.email,
                "birthday": serializer.data.get('birthday')
            },
            status=status.HTTP_201_CREATED

        )
    

class LoginView(APIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(username=username, password=password)

        if user is None:
            return Response(
                {"error": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "username": user.username,
                "email": user.email,
                "avatar_url": user.avatar_url,
                "id": user.id,
                "display_name":user.display_name
            },
            status=status.HTTP_200_OK
        )
    

class LogoutView(APIView):

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response(
                    {"error": "Refresh token is required."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(
                {"message": "Successfully logged out."},
                status=status.HTTP_205_RESET_CONTENT
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class UserProfileView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer
    queryset = User.objects.all()
    lookup_field = 'id'
    lookup_url_kwarg = 'user_id'


class UserProfileUpdateView(generics.RetrieveUpdateAPIView):        #needed in order to retrieve data
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserProfileUpdateSerializer
    lookup_field = "id"
    lookup_url_kwarg = "user_id"

    def get_queryset(self):
        # ensure users can only update themselves
        return User.objects.filter(id=self.request.user.id)

    def perform_update(self, serializer):
        user = serializer.save()
        # Broadcast user profile update to all conversations the user is in
        broadcast_user_profile_update(user)
    





class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("username", "").strip()
        
        if not query:
            return Response(
                {"detail": "Search parameter is required."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.filter(username__iexact=query).first()
        if user:
            serializer = UserSearchSerializer(user, context={"request": request})
            data = serializer.data


            data["type"] = "user" 

            return Response(data, status=status.HTTP_200_OK)

        channel = Channel.objects.filter(
            public_id__iexact=query, 
            is_private=False
        ).select_related('conversation').first()
        
        if channel:
            serializer = ChannelDetailSerializer(channel.conversation, context={"request": request})
            data = serializer.data

            data["type"] = "channel" 
            return Response(data, status=status.HTTP_200_OK)

        return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
