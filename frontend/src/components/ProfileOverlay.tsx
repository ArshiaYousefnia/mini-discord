import { useRef, useState } from "react";
import type { GroupProfile, GroupMembers, ChannelProfile, ChannelPermissions, ChannelMembers } from "../types/chat";
import type { UserProfile } from "../types/user";
import { formatJoinLink } from "../utils/linkFormat";

interface ProfileOverlayProps {
  show: boolean;
  profileViewType: "group" | "user" | "channel" | null;
  profileSource: "CHAT" | "GROUP_PROFILE";
  profileLoading: boolean;
  groupProfile: GroupProfile | null;
  channelProfile?: ChannelProfile | null;
  channelPermissions?: ChannelPermissions | null;
  channelMembers?: ChannelMembers | null;
  channelRoles?: any[]; // <-- Added for Role Management
  groupMembers: GroupMembers | null;
  userProfile: UserProfile | null;
  chatAvatar: string;
  isCurrentUserOwner: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onBackToGroup: () => void;
  onSaveGroupEdit: (name: string, desc: string, avatar: File | null) => Promise<void>;
  onSaveChannelEdit?: (name: string, desc: string, avatar: File | null) => Promise<void>;
  onUserClick: (userId: string) => void;
  onRemoveMember: (member: any) => void;
  onRemoveChannelMember?: (member: any) => void;
  onCreateRole?: (name: string) => Promise<void>; // <-- Added for Role Management
  onLeaveGroupRequest: () => void;
  onDeleteGroupRequest: () => void;
  onLeaveChannelRequest?: () => void; 
  onDeleteChannelRequest?: () => void;
}

export default function ProfileOverlay({
  show,
  profileViewType,
  profileSource,
  profileLoading,
  groupProfile,
  groupMembers,
  userProfile,
  chatAvatar,
  isCurrentUserOwner,
  currentUserId,
  onClose,
  onBackToGroup,
  onSaveGroupEdit,
  onSaveChannelEdit,
  onUserClick,
  onRemoveMember,
  onRemoveChannelMember,
  onCreateRole,
  onLeaveGroupRequest,
  onDeleteGroupRequest,
  onLeaveChannelRequest,
  onDeleteChannelRequest,
  channelProfile,
  channelPermissions,
  channelMembers,
  channelRoles,
}: ProfileOverlayProps) {
  // Group Edit State
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupAvatar, setEditGroupAvatar] = useState<File | null>(null);
  const [editGroupLoading, setEditGroupLoading] = useState(false);

  // Channel Edit State
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [editChannelName, setEditChannelName] = useState("");
  const [editChannelDescription, setEditChannelDescription] = useState("");
  const [editChannelAvatar, setEditChannelAvatar] = useState<File | null>(null);
  const [editChannelLoading, setEditChannelLoading] = useState(false);

  // Role Management State
  const [activeTab, setActiveTab] = useState<"info" | "roles">("info");
  const [newRoleName, setNewRoleName] = useState("");
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [inviteCopied, setInviteCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  // --- Group Edit Handlers ---
  const handleStartEdit = () => {
    if (!groupProfile) return;
    setEditGroupName(groupProfile.name);
    setEditGroupDescription(groupProfile.description || "");
    setEditGroupAvatar(null);
    setIsEditingGroup(true);
  };

  const handleSaveEdit = async () => {
    if (!editGroupName.trim()) return alert("Group name cannot be empty.");
    setEditGroupLoading(true);
    try {
      await onSaveGroupEdit(editGroupName, editGroupDescription, editGroupAvatar);
      setIsEditingGroup(false);
    } catch (error) {
      console.error("Failed to save group edit:", error);
    } finally {
      setEditGroupLoading(false);
    }
  };

  // --- Channel Edit Handlers ---
  const handleStartChannelEdit = () => {
    if (!channelProfile) return;
    setEditChannelName(channelProfile.name);
    setEditChannelDescription(channelProfile.description || "");
    setEditChannelAvatar(null);
    setIsEditingChannel(true);
  };

  const handleSaveChannelEdit = async () => {
    if (!editChannelName.trim()) return alert("Channel name cannot be empty.");
    if (!onSaveChannelEdit) return;
    
    setEditChannelLoading(true);
    try {
      await onSaveChannelEdit(editChannelName, editChannelDescription, editChannelAvatar);
      setIsEditingChannel(false);
    } catch (error) {
      console.error("Failed to save channel edit:", error);
    } finally {
      setEditChannelLoading(false); 
    }
  };

  // --- Role Management Handlers ---
  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !onCreateRole) return;
    setIsCreatingRole(true);
    try {
      await onCreateRole(newRoleName);
      setNewRoleName(""); // Clear input on success
    } catch (error) {
      console.error("Failed to create role:", error);
      alert("Failed to create role.");
    } finally {
      setIsCreatingRole(false);
    }
  };

  // Support both group and channel invite copying
  const handleCopyInviteLink = () => {
    let linkToCopy = "";
    if (profileViewType === "channel" && channelProfile?.invite_link) {
      linkToCopy = formatJoinLink(channelProfile.invite_link);
    } else if (profileViewType === "group" && groupProfile?.invite_token) {
      linkToCopy = `http://groups/join/${groupProfile.invite_token}`;
    }

    if (linkToCopy) {
      navigator.clipboard.writeText(linkToCopy);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  return (
    <div className="group-profile-overlay slideInRight">
      <div className="group-profile-header">
        {profileViewType === "user" && groupProfile ? (
          <button className="back-to-group-btn back-button" onClick={profileSource === "CHAT" ? onClose : onBackToGroup} type="button">
            {profileSource === "CHAT" ? "← Close" : "← Back to Group"}
          </button>
        ) : (
          <button className="back-button" onClick={onClose} type="button">← Close</button>
        )}
        
        <h3>
          {profileViewType === "group" ? "Group Profile" : profileViewType === "channel" ? "Channel Profile" : "User Profile"}
        </h3>
        
        {/* Group Edit Button */}
        {profileViewType === "group" && !isEditingGroup && groupProfile && (
          <button className="edit-group-btn" onClick={handleStartEdit}>Edit</button>
        )}

        {/* Channel Edit Button - Only show if on 'info' tab */}
        {profileViewType === "channel" && !isEditingChannel && activeTab === "info" && channelPermissions?.can_edit_channel_info && (
          <button className="edit-group-btn" onClick={handleStartChannelEdit}>Edit</button>
        )}
      </div>

      <div className="group-profile-content">
        {profileLoading ? (
          <div className="chat-placeholder">Loading profile...</div>
        ) : profileViewType === "channel" && channelProfile ? (
          <div className="group-profile-card">
            
            {/* Tabs for Channel Owner */}
            {isCurrentUserOwner && (
              <div className="profile-tabs">
                <button 
                  className={`profile-tab-btn ${activeTab === "info" ? "active" : ""}`}
                  onClick={() => setActiveTab("info")}
                >
                  Info
                </button>
                <button 
                  className={`profile-tab-btn ${activeTab === "roles" ? "active" : ""}`}
                  onClick={() => setActiveTab("roles")}
                >
                  Roles
                </button>
              </div>
            )}

            {activeTab === "info" ? (
              isEditingChannel ? (
                <div className="edit-group-form">
                  <div className="edit-avatar-section">
                    <img
                      src={editChannelAvatar ? URL.createObjectURL(editChannelAvatar) : (channelProfile.avatar_url || chatAvatar)}
                      alt="Channel Avatar"
                      className="group-profile-avatar-large"
                    />
                    <input
                      type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }}
                      onChange={(e) => { if (e.target.files?.[0]) setEditChannelAvatar(e.target.files[0]); }}
                    />
                    <button className="change-avatar-btn" onClick={() => fileInputRef.current?.click()}>Change Avatar</button>
                  </div>
                  <div className="edit-field">
                    <label>Channel Name <span style={{ color: "red" }}>*</span></label>
                    <input type="text" value={editChannelName} onChange={(e) => setEditChannelName(e.target.value)} className="edit-input" />
                  </div>
                  <div className="edit-field">
                    <label>Description</label>
                    <textarea value={editChannelDescription} onChange={(e) => setEditChannelDescription(e.target.value)} className="edit-textarea" />
                  </div>
                  <div className="edit-actions">
                    <button className="cancel-edit-btn" onClick={() => setIsEditingChannel(false)} disabled={editChannelLoading}>Cancel</button>
                    <button className="save-edit-btn" onClick={handleSaveChannelEdit} disabled={editChannelLoading || !editChannelName.trim()}>
                      {editChannelLoading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <img src={channelProfile.avatar_url || chatAvatar} alt={channelProfile.name} className="group-profile-avatar-large" />
                  
                  <div style={{ textAlign: "center", marginBottom: "16px" }}>
                    <h2 className="group-profile-name" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", margin: "0" }}>
                      {channelProfile.name}
                      {channelProfile.is_private ? (
                        <span style={{ fontSize: "10px", backgroundColor: "#374151", color: "#d1d5db", padding: "2px 8px", borderRadius: "9999px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                          Private
                        </span>
                      ) : (
                        <span style={{ fontSize: "10px", backgroundColor: "rgba(20, 83, 45, 0.5)", color: "#4ade80", padding: "2px 8px", borderRadius: "9999px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                          Public
                        </span>
                      )}
                    </h2>
                    
                    {!channelProfile.is_private && channelProfile.public_id && (
                      <p style={{ fontSize: "14px", color: "#9ca3af", marginTop: "4px", marginBottom: "0" }}>
                        {channelProfile.public_id}
                      </p>
                    )}
                  </div>

                  {channelProfile.description && <div className="group-profile-description">{channelProfile.description}</div>}

                  <div className="group-profile-meta">
                    <p>Created by: {channelProfile.owner_display_name}</p>
                    <p>Created at: {new Date(channelProfile.created_at).toLocaleDateString()}</p>
                  </div>

                  {channelProfile.invite_link && channelPermissions?.can_edit_channel_info && (
                    <div className="invite-link-section">
                      <h4>Invite Link</h4>
                      <div className="invite-input-wrapper">
                        <input type="text" readOnly value={formatJoinLink(channelProfile.invite_link)} className="invite-input" onClick={(e) => (e.target as HTMLInputElement).select()} />
                        <button onClick={handleCopyInviteLink} className={`copy-btn ${inviteCopied ? "copied" : ""}`}>{inviteCopied ? "Copied!" : "Copy"}</button>
                      </div>
                    </div>
                  )}

                  {channelMembers && channelMembers.length > 0 && (
                    <div className="group-members-section">
                      <h4>Members</h4>
                      <div className="members-list">
                        {channelMembers.map((member) => (
                          <div 
                            key={member.user_id} 
                            className="member-row group" 
                            onClick={() => onUserClick && onUserClick(member.user_id)}
                          >
                            <div className="member-avatar-wrapper">
                              <img src={member.avatar_url || "/default-avatar.svg"} alt={member.display_name} />
                            </div>
                            <span className="member-name flex-1">{member.display_name}</span>
                            <span className="badge mr-2" style={{ backgroundColor: "#374151", color: "#d1d5db", padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem" }}>
                              {member.role_name}
                            </span>
                            
                            {/* Channel Remove Member Button */}
                            {channelPermissions?.can_manage_members && String(member.user_id) !== String(currentUserId) && onRemoveChannelMember && (
                              <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  onRemoveChannelMember(member); 
                                }} 
                                className="remove-member-btn"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Updated Danger Zone for Channel */}
                  <div className="group-danger-zone" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 8 }}>
                    {!isCurrentUserOwner && onLeaveChannelRequest && (
                      <button type="button" onClick={onLeaveChannelRequest} className="leave-group-btn" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #dc2626", background: "transparent", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}>Leave Channel</button>
                    )}
                    {channelPermissions?.can_delete_channel && onDeleteChannelRequest && (
                      <button type="button" onClick={onDeleteChannelRequest} className="delete-group-btn" style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Delete Channel</button>
                    )}
                  </div>
                </>
              )
            ) : (
              /* --- NEW ROLES VIEW --- */
              <div className="roles-management-section">
                <h3 style={{ marginTop: 0 }}>Channel Roles</h3>
                
                <div className="create-role-wrapper">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="New Role Name"
                    className="edit-input"
                    disabled={isCreatingRole}
                  />
                  <button 
                    onClick={handleCreateRole} 
                    className="create-role-btn"
                    disabled={isCreatingRole || !newRoleName.trim()}
                  >
                    {isCreatingRole ? "Creating..." : "Create"}
                  </button>
                </div>

                <div className="roles-list">
                  {channelRoles && Array.isArray(channelRoles) &&channelRoles.length > 0 ? (
                    channelRoles.map((role) => (
                      <div key={role.id} className="role-row">
                        <span className="role-name">{role.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className="no-roles-msg">No custom roles created yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : profileViewType === "group" && groupProfile ? (
          <div className="group-profile-card">
            {isEditingGroup ? (
              <div className="edit-group-form">
                <div className="edit-avatar-section">
                  <img
                    src={editGroupAvatar ? URL.createObjectURL(editGroupAvatar) : (groupProfile.avatar_url || chatAvatar)}
                    alt="Group Avatar"
                    className="group-profile-avatar-large"
                  />
                  <input
                    type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files?.[0]) setEditGroupAvatar(e.target.files[0]); }}
                  />
                  <button className="change-avatar-btn" onClick={() => fileInputRef.current?.click()}>Change Avatar</button>
                </div>
                <div className="edit-field">
                  <label>Group Name <span style={{ color: "red" }}>*</span></label>
                  <input type="text" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="edit-input" />
                </div>
                <div className="edit-field">
                  <label>Description</label>
                  <textarea value={editGroupDescription} onChange={(e) => setEditGroupDescription(e.target.value)} className="edit-textarea" />
                </div>
                <div className="edit-actions">
                  <button className="cancel-edit-btn" onClick={() => setIsEditingGroup(false)} disabled={editGroupLoading}>Cancel</button>
                  <button className="save-edit-btn" onClick={handleSaveEdit} disabled={editGroupLoading || !editGroupName.trim()}>
                    {editGroupLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <img src={groupProfile.avatar_url || chatAvatar} alt={groupProfile.name} className="group-profile-avatar-large" />
                <h2 className="group-profile-name">{groupProfile.name}</h2>
                <div className="group-profile-member-count">{Number(groupProfile.member_count)} Members</div>
                {groupProfile.description && <div className="group-profile-description">{groupProfile.description}</div>}

                <div className="group-profile-meta">
                  <p>Created by: {groupProfile.owner_display_name}</p>
                  <p>Created at: {new Date(groupProfile.created_at).toLocaleDateString()}</p>
                </div>

                {groupProfile.invite_token && (
                  <div className="invite-link-section">
                    <h4>Invite Link</h4>
                    <div className="invite-input-wrapper">
                      <input type="text" readOnly value={`http://groups/join/${groupProfile.invite_token}`} className="invite-input" onClick={(e) => (e.target as HTMLInputElement).select()} />
                      <button onClick={handleCopyInviteLink} className={`copy-btn ${inviteCopied ? "copied" : ""}`}>{inviteCopied ? "Copied!" : "Copy"}</button>
                    </div>
                  </div>
                )}

                {groupMembers && groupMembers.length > 0 && (
                  <div className="group-members-section">
                    <h4>Members</h4>
                    <div className="members-list">
                      {groupMembers.map((member) => (
                        <div key={member.user_id} className="member-row group" onClick={() => onUserClick(member.user_id)}>
                          <div className="member-avatar-wrapper">
                            <img src={member.avatar_url || "/default-avatar.svg"} alt={member.display_name} />
                            {member.is_online && <span className="status-indicator online"></span>}
                          </div>
                          <span className="member-name flex-1">{member.display_name}</span>
                          {String(member.user_id) === String(groupProfile.owner_id) && <span className="badge owner-badge mr-2">Owner</span>}
                          {isCurrentUserOwner && String(member.user_id) !== String(currentUserId) && (
                            <button onClick={(e) => { e.stopPropagation(); onRemoveMember(member); }} className="remove-member-btn">Remove</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="group-danger-zone" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {!isCurrentUserOwner && (
                    <button type="button" onClick={onLeaveGroupRequest} className="leave-group-btn" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #dc2626", background: "transparent", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}>Leave Group</button>
                  )}
                  {isCurrentUserOwner && (
                    <button type="button" onClick={onDeleteGroupRequest} className="delete-group-btn" style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Delete Group</button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : profileViewType === "user" && userProfile ? (
          <div className="group-profile-card">
            <img src={userProfile.avatar_url} alt={userProfile.display_name} className="group-profile-avatar-large" />
            <h2 className="group-profile-name">{userProfile.display_name}</h2>
            <p className="group-profile-meta">@{userProfile.username}</p>
            {userProfile.bio && <div className="group-profile-description">{userProfile.bio}</div>}
            <div className="group-profile-meta" style={{ color: userProfile.is_online ? "#4ade80" : "#9ca3af", marginTop: "8px" }}>
              {userProfile.is_online ? "Online" : "Offline"}
            </div>
          </div>
        ) : (
          <div className="chat-placeholder">Failed to load profile.</div>
        )}
      </div>
    </div>
  );
}
