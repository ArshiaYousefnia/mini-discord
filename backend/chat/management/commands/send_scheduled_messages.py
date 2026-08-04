from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.files import File
from chat.models import (
    ScheduledMessage, Message, ChannelMessage,
    Attachment, ConversationMember, Conversation
)
from chat.views import broadcast_new_message


class Command(BaseCommand):
    help = 'Send scheduled messages that are due'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='Maximum number of messages to send in one run'
        )

    def handle(self, *args, **options):
        now = timezone.now()
        limit = options.get('limit', 100)

        scheduled_messages = ScheduledMessage.objects.filter(
            scheduled_at__lte=now,
            sent=False,
            failed=False  # Only attempt to send pending, not already failed
        ).select_related('conversation', 'sender', 'topic')[:limit]

        count = 0
        failed_count = 0

        for sm in scheduled_messages:
            try:
                # ===== PERMISSION RE-VALIDATION =====
                conversation = sm.conversation
                user = sm.sender

                # Check if user is still a member
                try:
                    member = ConversationMember.objects.get(
                        conversation=conversation,
                        user=user
                    )
                except ConversationMember.DoesNotExist:
                    # User is no longer a member - fail the scheduled message
                    sm.failed = True
                    sm.failure_reason = "Sender is no longer a member of this conversation"
                    sm.save()
                    failed_count += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Scheduled message {sm.id} failed: User no longer member"
                        )
                    )
                    continue

                # For channels, check if user has send permission
                if conversation.type == Conversation.Type.CHANNEL:
                    # Check if the member has any role with can_send_messages=True
                    has_permission = member.roles.filter(can_send_messages=True).exists()
                    # Also, channel owner always has permission (already checked via roles)
                    if not has_permission and conversation.owner != user:
                        # Allow owner even if not in roles? Owner might not have a role with send perm,
                        # but owner should always be able to send.
                        # But owner is always a member and can have roles. We'll check explicitly.
                        # Actually, owner can be added with role; we already have owner check above.
                        # Let's just check if owner, or roles.
                        if conversation.owner != user:
                            sm.failed = True
                            sm.failure_reason = "User no longer has permission to send messages in this channel"
                            sm.save()
                            failed_count += 1
                            self.stdout.write(
                                self.style.WARNING(
                                    f"Scheduled message {sm.id} failed: User lost send permission"
                                )
                            )
                            continue
                        # else: owner has permission even without role

                # ===== DELIVERY =====
                # Create the actual message based on conversation type
                if conversation.type == Conversation.Type.CHANNEL:
                    message = ChannelMessage.objects.create(
                        conversation=conversation,
                        sender=user,
                        content=sm.content,
                        reply_to=sm.reply_to,
                        topic=sm.topic,
                    )
                else:
                    message = Message.objects.create(
                        conversation=conversation,
                        sender=user,
                        content=sm.content,
                        reply_to=sm.reply_to,
                    )

                # Copy attachments
                for sa in sm.attachments.all():
                    try:
                        with sa.file.open('rb') as f:
                            new_file = File(f, name=sa.file.name)
                            Attachment.objects.create(
                                message=message,
                                file=new_file,
                                original_filename=sa.original_filename,
                                size=sa.size,
                            )
                    except Exception as e:
                        self.stdout.write(
                            self.style.WARNING(
                                f"Failed to copy attachment {sa.id}: {str(e)}"
                            )
                        )
                        # Continue without attachment; we could mark partial failure

                # Mark scheduled message as sent
                sm.sent = True
                sm.save()

                # Broadcast the message
                broadcast_new_message(message)

                count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Sent scheduled message {sm.id}"
                    )
                )

            except Exception as e:
                # Unexpected error - mark as failed
                sm.failed = True
                sm.failure_reason = str(e)[:255]
                sm.save()
                failed_count += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"Failed to send scheduled message {sm.id}: {str(e)}"
                    )
                )
                continue

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully sent {count} scheduled messages, {failed_count} failed"
            )
        )