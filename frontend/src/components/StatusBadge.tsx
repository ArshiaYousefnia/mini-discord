type Props = {
  isOnline: boolean;
};

export default function StatusBadge({ isOnline }: Props) {
  return (
    <span className={`user-status ${isOnline ? "online" : "offline"}`}>
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}
