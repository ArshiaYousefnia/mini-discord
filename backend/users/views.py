from rest_framework import generics, status
from rest_framework.response import Response
from .serializers import UserProfileSerializer, UserProfileUpdateSerializer
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserRegistrationSerializer, LoginSerializer, UserSearchSerializer
from rest_framework.permissions import IsAuthenticated
from .models import User
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound

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
                "id": user.id,
                "display_name": user.display_name
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
    




class UserSearchView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSearchSerializer

    def get_object(self):
        username = self.request.query_params.get("username")

        user = User.objects.filter(
            username__iexact=username
        ).first()

        if user is None:
            raise NotFound("User not found.")

        return user