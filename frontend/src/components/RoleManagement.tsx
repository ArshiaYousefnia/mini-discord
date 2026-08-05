import { useEffect, useState } from "react";
import {
  getChannelMembers,
  updateChannelRole,
  deleteChannelRole,
  assignMemberRole,
  removeMemberRole,
} from "../services/channelService";
import type { ChannelRole, RolePermissions } from "../services/channelService";
import type { ChannelMembers, ChannelMember } from "../types/chat";

interface RoleManagementProps {
  channelId: string;
  roles: ChannelRole[];
  isOwner: boolean;
}

type RoleEditState = RolePermissions & {
  name: string;
};

const PERMISSION_LABELS: { key: keyof RolePermissions; label: string }[] = [
  { key: "can_send_messages", label: "Send Messages" },
  { key: "can_send_media", label: "Send Media" },
  { key: "can_delete_messages", label: "Delete Others' Messages" },
  { key: "can_manage_members", label: "Manage Members" },
  { key: "can_manage_roles", label: "Manage Roles" },
  { key: "can_view_invite_link", label: "View Invite Link" },
  { key: "can_edit_channel_info", label: "Edit Channel Info" },
  { key: "can_delete_channel", label: "Delete Channel" },
  { key: "can_create_topic", label: "Create Topics" },
  { key: "can_manage_others_topics", label: "Manage Others' Topics" },
];

export default function RoleManagement({ channelId, roles, isOwner }: RoleManagementProps) {
  const [members, setMembers] = useState<ChannelMembers>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [roleEdits, setRoleEdits] = useState<Record<string, RoleEditState>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  // Filter out the built-in roles so they don't appear in lists, chips, or assignments
  const customRoles = roles.filter(
    (r) => r.name !== "Channel Owner" && r.name !== "Channel Member"
  );

  const loadMembers = async () => {
    try {
      setMembersLoading(true);
      const data = await getChannelMembers(channelId);
      setMembers(data);
    } catch (err) {
      console.error("Failed to load channel members:", err);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, isOwner]);

  if (!isOwner) {
    return <div className="chat-placeholder">Only the channel owner can manage roles.</div>;
  }

  const getAssignedRoles = (member: ChannelMember): ChannelRole[] =>
    customRoles.filter((r) => member.roles?.includes(r.name));

  const getUnassignedRoles = (member: ChannelMember): ChannelRole[] => {
    const assignedNames = new Set(member.roles || []);
    return customRoles.filter((r) => !assignedNames.has(r.name));
  };

  const handleToggleRoleEditor = (role: ChannelRole) => {
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null);
      return;
    }

    setExpandedRoleId(role.id);
    setRoleEdits((prev) => ({
      ...prev,
      [role.id]: {
        name: role.name,
        can_send_messages: role.can_send_messages,
        can_send_media: role.can_send_media,
        can_delete_messages: role.can_delete_messages,
        can_manage_members: role.can_manage_members,
        can_manage_roles: role.can_manage_roles,
        can_view_invite_link: role.can_view_invite_link,
        can_edit_channel_info: role.can_edit_channel_info,
        can_delete_channel: role.can_delete_channel,
        can_create_topic: role.can_create_topic,
        can_manage_others_topics: role.can_manage_others_topics,
      },
    }));
  };

  const handleRoleNameChange = (roleId: string, name: string) => {
    setRoleEdits((prev) => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        name,
      },
    }));
  };

  const handlePermissionToggle = (roleId: string, key: keyof RolePermissions) => {
    setRoleEdits((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], [key]: !prev[roleId][key] },
    }));
  };

  const handleSaveRole = async (roleId: string) => {
    const role = customRoles.find((r) => r.id === roleId);
    if (!role) return;

    const edits = roleEdits[roleId];
    if (!edits) return;

    if (!edits.name.trim()) {
      alert("Role name cannot be empty.");
      return;
    }

    try {
      setSavingRoleId(roleId);

      await updateChannelRole(channelId, roleId, {
        ...edits,
        name: edits.name.trim(),
      });

      setExpandedRoleId(null);
    } catch (err) {
      console.error("Failed to update role:", err);
      alert("Failed to update role.");
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleDeleteRole = async (role: ChannelRole) => {
    if (!window.confirm(`Delete the "${role.name}" role? Members with this role will lose it.`)) return;
    try {
      await deleteChannelRole(channelId, role.id);
      await loadMembers();
    } catch (err) {
      console.error("Failed to delete role:", err);
      alert("Failed to delete role.");
    }
  };

  const handleAssignRole = async (member: ChannelMember) => {
    const roleId = assignSelection[member.user_id];
    if (!roleId) return;
    try {
      setBusyMemberId(member.user_id);
      await assignMemberRole(channelId, member.user_id, roleId);
      setAssignSelection((prev) => ({ ...prev, [member.user_id]: "" }));
      await loadMembers();
    } catch (err) {
      console.error("Failed to assign role:", err);
      alert("Failed to assign role to member.");
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemoveRole = async (member: ChannelMember, role: ChannelRole) => {
    try {
      setBusyMemberId(member.user_id);
      await removeMemberRole(channelId, member.user_id, role.id);
      await loadMembers();
    } catch (err) {
      console.error("Failed to remove role:", err);
      alert("Failed to remove role from member.");
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="role-management-wrapper" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h4 style={{ marginBottom: 8 }}>Existing Roles</h4>
        {customRoles.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>No custom roles yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {customRoles.map((role) => (
            <div key={role.id} className="role-card">
              <div className="role-card-header">
                <span className="role-name">{role.name}</span>
                <div className="role-card-actions">
                  <button type="button" className="edit-group-btn" onClick={() => handleToggleRoleEditor(role)}>
                    {expandedRoleId === role.id ? "Close" : "Edit"}
                  </button>
                  <button type="button" className="remove-member-btn" onClick={() => handleDeleteRole(role)}>
                    Delete
                  </button>
                </div>
              </div>

              {expandedRoleId === role.id && roleEdits[role.id] && (
                <div className="role-edit-form">
                  <label className="role-edit-name-label">
                    Role Name
                    <input
                      type="text"
                      className="edit-input"
                      value={roleEdits[role.id].name}
                      onChange={(e) => handleRoleNameChange(role.id, e.target.value)}
                    />
                  </label>

                  {PERMISSION_LABELS.map(({ key, label }) => (
                    <label key={key} className="role-permission-label">
                      <input
                        type="checkbox"
                        checked={!!roleEdits[role.id][key]}
                        onChange={() => handlePermissionToggle(role.id, key)}
                      />
                      {label}
                    </label>
                  ))}

                  <button
                    type="button"
                    className="save-edit-btn"
                    onClick={() => handleSaveRole(role.id)}
                    disabled={savingRoleId === role.id}
                    style={{ alignSelf: "flex-start", marginTop: 6 }}
                  >
                    {savingRoleId === role.id ? "Saving..." : "Save Role"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ marginBottom: 8 }}>Assign Roles to Members</h4>
        {membersLoading && <div style={{ opacity: 0.7, fontSize: 14 }}>Loading members...</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map((member) => {
            const assigned = getAssignedRoles(member);
            const unassigned = getUnassignedRoles(member);
            const isOwnerRow = member.roles?.includes("Channel Owner");
            
            return (
              <div
                key={member.user_id}
                style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img
                    src={member.avatar_url || "/default-avatar.svg"}
                    alt={member.display_name}
                    style={{ width: 28, height: 28, borderRadius: "50%" }}
                  />
                  <span style={{ fontWeight: 600 }}>{member.display_name}</span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {assigned.length === 0 && <span style={{ fontSize: 12, opacity: 0.6 }}>No custom roles</span>}
                  {assigned.map((role) => (
                    <span
                      key={role.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#374151",
                        color: "#d1d5db",
                        borderRadius: 12,
                        padding: "2px 8px",
                        fontSize: 12,
                      }}
                    >
                      {role.name}
                      {!isOwnerRow && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRole(member, role)}
                          disabled={busyMemberId === member.user_id}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 12,
                            lineHeight: 1,
                          }}
                          aria-label={`Remove ${role.name}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {!isOwnerRow && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <select
                      value={assignSelection[member.user_id] || ""}
                      onChange={(e) =>
                        setAssignSelection((prev) => ({ ...prev, [member.user_id]: e.target.value }))
                      }
                      className="edit-input"
                      style={{ flex: 1 }}
                      disabled={unassigned.length === 0 || busyMemberId === member.user_id}
                    >
                      <option value="">
                        {unassigned.length === 0 ? "No more roles to assign" : "Select a role..."}
                      </option>
                      {unassigned.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="create-role-btn"
                      onClick={() => handleAssignRole(member)}
                      disabled={!assignSelection[member.user_id] || busyMemberId === member.user_id}
                    >
                      {busyMemberId === member.user_id ? "..." : "Assign"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
