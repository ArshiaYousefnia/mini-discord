from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, Role, ConversationMember
from chat.serializers import RoleSerializer
from chat.views.views_realtime_utils import broadcast_role_metadata_update, broadcast_role_deleted, \
    broadcast_user_permissions


class ChannelRolesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != request.user:
            return Response(
                {"detail": "Only the channel owner can manage roles."},
                status=status.HTTP_403_FORBIDDEN,
            )
        default_roles = ['Member', 'Owner']
        roles = Role.objects.filter(conversation=conversation).exclude(name__in=default_roles)

        serializer = RoleSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != request.user:
            return Response(
                {"detail": "Only the channel owner can manage roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        name = request.data.get('name')
        if not name or not name.strip():
            return Response(
                {"name": "Role name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean_name = name.strip()

        if len(clean_name) > 100:
            return Response(
                {"name": "Role name cannot exceed 100 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Role.objects.filter(conversation=conversation, name__iexact=clean_name).exists():
            return Response(
                {"name": "A role with this name already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = Role.objects.create(conversation=conversation, name=clean_name)
        serializer = RoleSerializer(role)

        broadcast_role_metadata_update(role)


        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ChannelRoleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    PROTECTED_ROLES = ['Member', 'Channel Member', 'Owner', 'Channel Owner', 'Group Owner']

    def get_role(self, conversation_id, role_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != self.request.user:
            raise PermissionDenied("Only the channel owner can manage roles.")

        role = get_object_or_404(Role, id=role_id, conversation=conversation)
        return role

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        PROTECTED_ROLES = ['Member', 'Owner', 'Channel Owner']

        roles = Role.objects.filter(conversation=conversation).exclude(name__in=PROTECTED_ROLES)

        serializer = RoleSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, conversation_id, role_id):
        role = self.get_role(conversation_id, role_id)

        if role.name in self.PROTECTED_ROLES:
            return Response(
                {"detail": "Cannot edit the Channel Owner role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RoleSerializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_role = serializer.save()

        # Broadcast role metadata to all members
        broadcast_role_metadata_update(updated_role)

        # Broadcast permissions update to all users who have this role
        users_with_role = ConversationMember.objects.filter(
            roles=updated_role
        ).values_list('user', flat=True).distinct()
        conversation = updated_role.conversation
        for user_id in users_with_role:
            user = get_user_model().objects.get(id=user_id)
            broadcast_user_permissions(user, conversation)

        return Response(serializer.data)

    def delete(self, request, conversation_id, role_id):
        role = self.get_role(conversation_id, role_id)
        if role.name in self.PROTECTED_ROLES:
            return Response(
                {"detail": "Cannot delete the Channel Owner role."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get users with this role before deletion
        users_with_role = ConversationMember.objects.filter(
            roles=role
        ).values_list('user', flat=True).distinct()
        conversation = role.conversation

        # Broadcast role deletion to all members
        broadcast_role_deleted(role)

        # Broadcast permissions update to users who had this role
        for user_id in users_with_role:
            user = get_user_model().objects.get(id=user_id)
            broadcast_user_permissions(user, conversation)

        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
