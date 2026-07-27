type Props = {
  src?: string | null;
  alt: string;
};

export default function UserAvatar({ src, alt }: Props) {
  const avatarSrc = src || "/default-avatar.svg";

  return (
    <img
      className="user-profile-avatar"
      src={avatarSrc}
      alt={alt}
    />
  );
}
