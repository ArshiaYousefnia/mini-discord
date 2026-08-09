from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, ConversationMember, Role
from chat.serializers import GroupCreateSerializer, GroupDetailSerializer, GroupMemberSerializer, GroupUpdateSerializer
from chat.views.views_realtime_utils import broadcast_conversation_update, broadcast_conversation_metadata_update, \
    broadcast_conversation_deleted, broadcast_unread_update_for_conversation, broadcast_member_joined_notification


class GroupCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = GroupCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        detail_serializer = GroupDetailSerializer(conversation)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class GroupJoinView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, invite_token):
        try:
            conversation = Conversation.objects.get(
                invite_token=invite_token,
                type=Conversation.Type.GROUP
            )
        except Conversation.DoesNotExist:
            return Response(
                {"detail": "This invite link is invalid or has expired."},
                status=status.HTTP_404_NOT_FOUND
            )

        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this group."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Member',
            defaults={
                'can_send_messages': True,
                'can_send_media': True,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':True,
                'can_edit_channel_info':True,
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        latest_message = conversation.messages.filter(is_deleted=False).order_by('-created_at').first()
        if latest_message:
            member.last_read_message = latest_message
            member.save(update_fields=['last_read_message'])

        broadcast_unread_update_for_conversation(conversation)

        serializer = GroupDetailSerializer(conversation, context={'request': request})

        # After adding member
        broadcast_conversation_update(
            conversation,
            'member_joined',
            {'user_id': str(user.id)}
        )

        broadcast_member_joined_notification(conversation, user)

        return Response(serializer.data, status=status.HTTP_200_OK)


class GroupProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
            members__user=request.user
        )

        serializer = GroupDetailSerializer(
            conversation,
            context={'request': request}
        )

        return Response(serializer.data)


class GroupMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP
        )

        # فقط اعضای گروه اجازه مشاهده دارند
        is_member = ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user
        ).exists()

        if not is_member:
            return Response(
                {"detail": "You are not a member of this group."},
                status=status.HTTP_403_FORBIDDEN
            )

        members = ConversationMember.objects.filter(
            conversation=conversation
        ).select_related(
            'user'
        )
        members.prefetch_related('roles')

        serializer = GroupMemberSerializer(
            members,
            many=True
        )

        return Response(serializer.data)


class GroupUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
        )

        if not ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user,
        ).exists():
            return Response(
                {"detail": "You are not a member of this group."},
                status=403,
            )

        serializer = GroupUpdateSerializer(
            conversation,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        broadcast_conversation_metadata_update(conversation)

        # Broadcast group info update to all members
        broadcast_conversation_update(
            conversation,
            'group_updated',
            {
                'name': conversation.name,
                'description': conversation.description,
                'avatar_url': conversation.avatar_url
            }
        )

        return Response(
            GroupDetailSerializer(conversation).data
        )


class GroupDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        group = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
        )

        # Check that the requesting user is a member of the group
        if not ConversationMember.objects.filter(
            conversation=group,
            user=request.user
        ).exists():
            return Response(
                {"detail": "You are not a member of this group."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Broadcast deletion to all members before deleting
        broadcast_conversation_deleted(group)

        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
