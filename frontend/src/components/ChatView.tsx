import { useEffect, useRef, useState } from "react";
import { 
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  editMessage,
  deleteMessage
} from "../services/chatService";
import { 
  getGroupProfile, 
  getGroupMembers, 
  removeGroupMember,
  updateGroupProfile
} from "../services/groupService";
import { getUserProfile } from "../services/users";
import type { ChatListItem, Message, GroupProfile, GroupMembers } from "../types/chat";
import type { UserProfile } from "../types/user";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
}

export default function ChatView({ chat, isMobile, onBack }: Props) {
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);

  // We keep a local reference of the chat info for immediate header updates
  const [localChatInfo, setLocalChatInfo] = useState<{name: string; avatar: string} | null>(null);

  // Profile States (Group, Members & DM)
  const [showProfile, setShowProfile] = useState(false);
  const [profileViewType, setProfileViewType] = useState<"group" | "user" | null>(null);
  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMembers | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); 
  const [profileLoading, setProfileLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false); 
  const [memberToRemove, setMemberToRemove] = useState<any>(null);

  // Edit Group States
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupAvatar, setEditGroupAvatar] = useState<File | null>(null);
  const [editGroupLoading, setEditGroupLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = localStorage.getItem("Id");
  const currentUsername = localStorage.getItem("username");

  const isCurrentUserOwner = groupProfile?.owner_id === currentUserId;

  // Sync local chat info when chat prop changes
  useEffect(() => {
    if (chat) {
      setLocalChatInfo({ name: chat.name, avatar: chat.avatar });
    }
  }, [chat]);

  // Load Initial Messages
  useEffect(() => {
    if (!chat) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setShowProfile(false); 
    setProfileViewType(null);
    setIsEditingGroup(false);

    const loadMessages = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await getConversationMessages(chat.id);
        if (!isMounted) return;

        const sortedMessages = [...data]
          .filter((msg) => !msg.is_deleted)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "auto";
        setMessages(sortedMessages);

        const latest = sortedMessages[sortedMessages.length - 1];
        if (latest) {
          await markConversationRead(chat.id, latest.id);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load messages");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMessages();
    setActiveReplyTo(null);

    return () => {
      isMounted = false;
    };
  }, [chat]);

  // NEW: Background polling for Live Updates to the Group Profile
  useEffect(() => {
    // Only poll if there is an active chat and it's a group
    if (!chat || chat.type.toUpperCase() !== "GROUP") return;

    let isMounted = true;

    const pollGroupInfo = async () => {
      try {
        const [profileData, membersData] = await Promise.all([
          getGroupProfile(chat.id),
          getGroupMembers(chat.id)
        ]);

        if (!isMounted) return;

        // Update the profile and member list silently
        setGroupProfile(profileData);
        setGroupMembers(membersData);

        // Update the header visually
        setLocalChatInfo(prev => {
          const newName = profileData.name;
          const newAvatar = profileData.avatar_url || chat.avatar;
          
          // Only update if it actually changed to prevent unnecessary renders
          if (prev?.name !== newName || prev?.avatar !== newAvatar) {
            return { name: newName, avatar: newAvatar };
          }
          return prev;
        });

      } catch (error) {
        // Fail silently on background polls so we don't interrupt the user
        console.error("Failed to background refresh group data:", error);
      }
    };

    // Poll every 5 seconds
    const intervalId = setInterval(pollGroupInfo, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat]);

  // Handle scroll to bottom
  useEffect(() => {
    if (loading) return;
    if (!shouldScrollToBottomRef.current) return;

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: scrollBehaviorRef.current,
      });
      shouldScrollToBottomRef.current = false;
    });
  }, [messages.length, loading, chat?.id]);


  const handleSendMessage = async (text: string) => {
    if (!chat) return;
    try {
      const newMessage = await sendConversationMessage({
        conversation_id: chat.id,
        content: text,
        reply_to: activeReplyTo ? activeReplyTo.id : null,
        recipient_id: chat.other_user_id || (chat as any).otherUserId, 
      });
      
      shouldScrollToBottomRef.current = true;
      scrollBehaviorRef.current = "smooth";
      setMessages((prev) => [...prev, newMessage]);
      setActiveReplyTo(null);
      await markConversationRead(chat.id, newMessage.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!chat) return;
    const updatedMessage = await editMessage(chat.id, messageId, newText);
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? updatedMessage : msg)));
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;
    await deleteMessage(chat.id, messageId);
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const handleUserClick = async (userId: string) => {
    setShowProfile(true);
    setProfileViewType("user");
    setProfileLoading(true);
    try {
      const data = await getUserProfile(userId);
      setUserProfile(data);
    } catch (err) {
      console.error("Failed to load user profile", err);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleHeaderClick = async () => {
    if (!chat) return;
    const chatType = chat.type.toUpperCase();

    if (chatType === "GROUP") {
      setShowProfile(true);
      setProfileViewType("group");
      setIsEditingGroup(false); 
      
      if (!groupProfile || groupProfile.id !== chat.id) {
        setProfileLoading(true);
        try {
          const [profileData, membersData] = await Promise.all([
            getGroupProfile(chat.id),
            getGroupMembers(chat.id)
          ]);
          setGroupProfile(profileData);
          setGroupMembers(membersData);
        } catch (err) {
          console.error("Failed to load group details", err);
        } finally {
          setProfileLoading(false);
        }
      }
    } else if (chatType === "DM") { 
      const otherUserId = chat.other_user_id || (chat as any).otherUserId;
      if (otherUserId) {
        handleUserClick(otherUserId);
      }
    }
  };

  const handleCopyInviteLink = () => {
    if (groupProfile?.invite_token) {
      const inviteLink = `http://join/${groupProfile.invite_token}`;
      navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  const confirmRemoveMember = async () => {
    if (!chat || !memberToRemove) return;
    try {
      await removeGroupMember(chat.id, memberToRemove.user_id);
      setGroupMembers((prev) => prev ? prev.filter((m) => m.user_id !== memberToRemove.user_id) : null);
      setGroupProfile((prev) => prev ? { ...prev, member_count: Number(prev.member_count) - 1 } : null);
      setMemberToRemove(null);
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove group member.");
    }
  };

  const handleStartEdit = () => {
    if (!groupProfile) return;
    setEditGroupName(groupProfile.name);
    setEditGroupDescription(groupProfile.description || "");
    setEditGroupAvatar(null);
    setIsEditingGroup(true);
  };

  const handleSaveEdit = async () => {
    if (!chat || !groupProfile) return;
    if (!editGroupName.trim()) {
      alert("Group name cannot be empty.");
      return;
    }

    try {
      setEditGroupLoading(true);
      const updatedProfile = await updateGroupProfile(chat.id, {
        name: editGroupName,
        description: editGroupDescription,
        avatar: editGroupAvatar,
      });

      setGroupProfile(updatedProfile);
      setLocalChatInfo({
        name: updatedProfile.name,
        avatar: updatedProfile.avatar_url || chat.avatar
      });
      
      setIsEditingGroup(false);
    } catch (error) {
      console.error("Failed to update group:", error);
      alert("Failed to update group details.");
    } finally {
      setEditGroupLoading(false);
    }
  };

  if (!chat) {
    return (
      <div className="chat-placeholder" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>Select a chat to start messaging</div>
      </div>
    );
  }

  const chatType = chat.type.toUpperCase();

  return (
    <div className="chat-view" style={{ position: 'relative', overflow: 'hidden' }}>
      
      {/* Removal Confirmation Modal Overlay */}
      {memberToRemove && (
        <div className="remove-modal-overlay">
          <div className="remove-modal-box">
            <h3>Remove Member</h3>
            <p>Are you sure you want to remove <span>{memberToRemove.display_name}</span> from the group?</p>
            <div className="remove-modal-actions">
              <button onClick={() => setMemberToRemove(null)} className="cancel-btn">Cancel</button>
              <button onClick={confirmRemoveMember} className="confirm-btn">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="chat-view-header">
        {isMobile && (
          <button className="back-button" onClick={onBack} type="button">
            ← Back
          </button>
        )}

        <div 
          className={`chat-header-info ${chatType === "GROUP" || chatType === "DM" ? "clickable" : ""}`} 
          onClick={handleHeaderClick}
        >
          <img
            src={localChatInfo?.avatar || chat.avatar}
            alt={localChatInfo?.name || chat.name}
            className="chat-view-avatar"
          />
          <div className="chat-view-name">{localChatInfo?.name || chat.name}</div>
        </div>
      </div>

      {/* Profile Overlay */}
      {showProfile && (
        <div className="group-profile-overlay slideInRight">
          <div className="group-profile-header">
            {chatType === "GROUP" && profileViewType === "user" ? (
              <button className="back-to-group-btn back-button" onClick={() => setProfileViewType("group")} type="button">
                ← Back to Group
              </button>
            ) : (
              <button className="back-button" onClick={() => setShowProfile(false)} type="button">
                ← Close
              </button>
            )}
            <h3>{profileViewType === "group" ? "Group Profile" : "User Profile"}</h3>
            
            {/* Edit Button in Header */}
            {profileViewType === "group" && !isEditingGroup && groupProfile && (
              <button className="edit-group-btn" onClick={handleStartEdit}>
                Edit
              </button>
            )}
          </div>
          
          <div className="group-profile-content">
            {profileLoading ? (
              <div className="chat-placeholder">Loading profile...</div>
            ) : profileViewType === "group" && groupProfile ? (
              <div className="group-profile-card">
                
                {/* EDIT MODE */}
                {isEditingGroup ? (
                  <div className="edit-group-form">
                    <div className="edit-avatar-section">
                      <img 
                        src={editGroupAvatar ? URL.createObjectURL(editGroupAvatar) : (groupProfile.avatar_url || chat.avatar)} 
                        alt="Group Avatar" 
                        className="group-profile-avatar-large"
                      />
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef} 
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setEditGroupAvatar(e.target.files[0]);
                          }
                        }}
                      />
                      <button className="change-avatar-btn" onClick={() => fileInputRef.current?.click()}>
                        Change Avatar
                      </button>
                    </div>
                    
                    <div className="edit-field">
                      <label>Group Name <span style={{color: 'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        placeholder="Enter group name"
                        className="edit-input"
                      />
                    </div>

                    <div className="edit-field">
                      <label>Description</label>
                      <textarea 
                        value={editGroupDescription}
                        onChange={(e) => setEditGroupDescription(e.target.value)}
                        placeholder="Group description..."
                        className="edit-textarea"
                      />
                    </div>

                    <div className="edit-actions">
                      <button 
                        className="cancel-edit-btn" 
                        onClick={() => setIsEditingGroup(false)}
                        disabled={editGroupLoading}
                      >
                        Cancel
                      </button>
                      <button 
                        className="save-edit-btn" 
                        onClick={handleSaveEdit}
                        disabled={editGroupLoading || !editGroupName.trim()}
                      >
                        {editGroupLoading ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* VIEW MODE */
                  <>
                    <img 
                      src={groupProfile.avatar_url || chat.avatar} 
                      alt={groupProfile.name} 
                      className="group-profile-avatar-large"
                    />
                    <h2 className="group-profile-name">{groupProfile.name}</h2>
                    <div className="group-profile-member-count">
                      {Number(groupProfile.member_count)} Members
                    </div>
                    {groupProfile.description && (
                      <div className="group-profile-description">
                        {groupProfile.description}
                      </div>
                    )}
                    
                    <div className="group-profile-meta">
                      <p>Created by: {groupProfile.owner_display_name}</p>
                      <p>Created at: {new Date(groupProfile.created_at).toLocaleDateString()}</p>
                    </div>

                    {/* Invite Link Section */}
                    {groupProfile.invite_token && (
                      <div className="invite-link-section">
                        <h4>Invite Link</h4>
                        <div className="invite-input-wrapper">
                          <input 
                            type="text" 
                            readOnly 
                            value={`http://join/${groupProfile.invite_token}`} 
                            className="invite-input"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button onClick={handleCopyInviteLink} className={`copy-btn ${inviteCopied ? 'copied' : ''}`}>
                            {inviteCopied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Members List */}
                    {groupMembers && groupMembers.length > 0 && (
                      <div className="group-members-section">
                        <h4>Members</h4>
                        <div className="members-list">
                          {groupMembers.map((member) => (
                            <div 
                              key={member.user_id} 
                              className="member-row group" 
                              onClick={() => handleUserClick(member.user_id)}
                            >
                              <div className="member-avatar-wrapper">
                                <img 
                                  src={member.avatar_url || "/default-avatar.png"} 
                                  alt={member.display_name} 
                                />
                                {member.is_online && <span className="status-indicator online"></span>}
                              </div>
                              <span className="member-name flex-1">{member.display_name}</span>
                              {String(member.user_id) === String(groupProfile.owner_id) && (
                                <span className="badge owner-badge mr-2">Owner</span>
                              )}
                              {isCurrentUserOwner && String(member.user_id) !== String(currentUserId) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMemberToRemove(member);
                                  }}
                                  className="remove-member-btn"
                                  title="Remove from group"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : profileViewType === "user" && userProfile ? (
              <div className="group-profile-card">
                <img src={userProfile.avatar_url} alt={userProfile.display_name} className="group-profile-avatar-large" />
                <h2 className="group-profile-name">{userProfile.display_name}</h2>
                <p className="group-profile-meta">@{userProfile.username}</p>
                {userProfile.bio && <div className="group-profile-description">{userProfile.bio}</div>}
                <div className="group-profile-meta" style={{ color: userProfile.is_online ? '#4ade80' : '#9ca3af', marginTop: '8px' }}>
                  {userProfile.is_online ? 'Online' : 'Offline'}
                </div>
              </div>
            ) : (
              <div className="chat-placeholder">Failed to load profile.</div>
            )}
          </div>
        </div>
      )}

      {/* Body / Message History */}
      <div className="chat-view-body">
         {loading && <div className="chat-placeholder">Loading messages...</div>}
         {!loading && error && <div className="chat-placeholder">{error}</div>}
         {!loading && !error && messages.length === 0 && <div className="chat-placeholder">No messages yet.</div>}
         {!loading && !error && messages.length > 0 && (
          <div className="message-history">
            {messages.map((msg) => {
              const replyMsg = msg.reply_to ? messages.find((m) => m.id === msg.reply_to) : null;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={currentUserId}
                  currentUsername={currentUsername}
                  replyMessage={replyMsg}
                  onReply={(targetMsg) => setActiveReplyTo(targetMsg)}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
        disabled={loading}
      />
    </div>
  );
}
