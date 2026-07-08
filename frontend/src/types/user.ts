export type BackendUserProfile = {
  id: string;
  username: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  is_online?: boolean;
};

export type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  bio?: string | null;
  avatar?: string | null;
  is_online: boolean;
};

export type UserEditProfile = {
  username: string;
  email: string;
  display_name: string;
  bio?: string | null;
  avatar: string | null;
};

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  is_online?: boolean;
}
